// AI-citation monitor — IO entry point. Asks each configured AI engine the target
// questions and records whether gmaslist.com is CITED, appending one JSONL line per
// observation to a LOCAL log (never committed — like products.db, this is home-machine
// measurement state). Run locally / on a Scheduled Task; the served site is untouched.
//
//   Manual run:  cd server ; npx tsx scripts/aiCitationRun.ts
//   Dry run:     cd server ; npx tsx scripts/aiCitationRun.ts --dry   (no key/cost)
//
// Engines are PLUGGABLE (matches the "data source is a commodity" instinct). Today:
//   - anthropic : Claude + the server-side web_search tool, which returns cited sources.
//                 Needs ANTHROPIC_API_KEY (put it in the repo-root .env — gitignored).
//   - dry-run   : keyless placeholder so the whole pipeline runs at zero cost.
// Perplexity / OpenAI adapters can be added as more CitationEngine implementations.
//
// Env:
//   ANTHROPIC_API_KEY  - enables the anthropic engine (else it is skipped)
//   CITATION_MODEL     - Claude model id (default claude-haiku-4-5; if you set an Opus/Sonnet
//                        model, switch the web_search tool version accordingly — see ask())
//   CITATION_LOG_PATH  - JSONL log path (default ~/GmaS-data/citation-log.jsonl)
//
// See project_reach-launch-plan (Phase 0, item 1) and ADR-106.

import { config as loadEnv } from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import {
  checkCitation,
  summarize,
  type CitationCheck,
  type CitationEngine,
  type EngineAnswer,
  type TargetQuestion,
} from './citationMonitor.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The project's .env lives at the REPO ROOT (where EIA_API_KEY etc. already live), not in
// server/. This script runs with cwd=server/ (see ai-citation-local.ps1), so a bare
// `dotenv/config` (which reads ./.env) would miss it. Load the root .env by an absolute path
// resolved from this file's location, so ANTHROPIC_API_KEY is picked up regardless of cwd.
loadEnv({ path: path.resolve(__dirname, '../../.env') })

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
// Haiku 4.5, not Opus: this task is "search the web and list which sources were cited" —
// pure retrieval + extraction, no deep reasoning — so the cheapest capable model wins
// (~5x cheaper tokens than Opus). Override with CITATION_MODEL if you ever want a heavier
// model, but note the web_search tool version below must match the model's support.
const DEFAULT_MODEL = 'claude-haiku-4-5'
const REQUEST_GAP_MS = 1500 // gentle pacing between calls to avoid rate limits

// ---- config loading (pure-ish) ----

interface QuestionsFile {
  questions: TargetQuestion[]
}

function loadQuestions(): TargetQuestion[] {
  const p = path.join(__dirname, 'citation-questions.json')
  const parsed = JSON.parse(fs.readFileSync(p, 'utf8')) as QuestionsFile
  if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
    throw new Error(`No questions found in ${p}`)
  }
  return parsed.questions
}

function logPath(): string {
  return (
    process.env.CITATION_LOG_PATH ??
    path.join(os.homedir(), 'GmaS-data', 'citation-log.jsonl')
  )
}

// ---- engines ----

// Keyless placeholder: runs the whole pipeline with zero cost. Never "cited".
const dryRunEngine: CitationEngine = {
  name: 'dry-run',
  available: () => true,
  async ask(question: string): Promise<EngineAnswer> {
    return {
      answerText: `[dry-run] Would ask an AI engine: "${question}". No live call made.`,
      citedUrls: [],
      citationCount: 0,
    }
  },
}

// Minimal shapes for the bits of the Anthropic Messages response we read.
interface AnthropicCitation {
  url?: string
}
interface AnthropicBlock {
  type: string
  text?: string
  citations?: AnthropicCitation[]
  content?: Array<{ type: string; url?: string }>
}
interface AnthropicResponse {
  content: AnthropicBlock[]
  stop_reason: string
}

const CITATION_MODEL = process.env.CITATION_MODEL || DEFAULT_MODEL

// Claude with the server-side web_search tool. The tool returns web_search_result blocks
// (the sources it consulted) and text blocks may carry per-claim citations — we collect
// URLs from both, so "cited" reflects whatever the grounded answer actually leaned on.
const anthropicEngine: CitationEngine = {
  name: 'anthropic',
  available: () => Boolean(process.env.ANTHROPIC_API_KEY),
  async ask(question: string): Promise<EngineAnswer> {
    const key = process.env.ANTHROPIC_API_KEY
    if (!key) throw new Error('ANTHROPIC_API_KEY not set')

    const tools = [
      {
        // Basic web_search variant: supported by Haiku 4.5 (the default model). The newer
        // web_search_20260209 (dynamic filtering) is Opus-4.6+/Sonnet-only and would 400 on
        // Haiku. Result-block shape (web_search_tool_result -> web_search_result.url) is
        // identical, so citation extraction below is unchanged. If you override CITATION_MODEL
        // to an Opus/Sonnet model you may switch this back to web_search_20260209.
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 5,
        user_location: {
          type: 'approximate',
          country: 'US',
          region: 'Washington',
          timezone: 'America/Los_Angeles',
        },
      },
    ]

    // Server runs its own search loop; it may return stop_reason "pause_turn" to be
    // resumed. Re-send the accumulated messages until it settles (cap to avoid loops).
    const messages: Array<{ role: string; content: unknown }> = [
      { role: 'user', content: question },
    ]
    const citedUrls: string[] = []
    let answerText = ''
    let citationCount = 0

    for (let i = 0; i < 4; i++) {
      const res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model: CITATION_MODEL, max_tokens: 1024, tools, messages }),
      })
      if (!res.ok) {
        throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`)
      }
      const data = (await res.json()) as AnthropicResponse

      for (const block of data.content) {
        if (block.type === 'text') {
          answerText += block.text ?? ''
          for (const c of block.citations ?? []) {
            citationCount++
            if (c.url) citedUrls.push(c.url)
          }
        } else if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
          for (const r of block.content) {
            if (r.type === 'web_search_result' && r.url) citedUrls.push(r.url)
          }
        }
      }

      if (data.stop_reason === 'refusal') throw new Error('model refused the request')
      messages.push({ role: 'assistant', content: data.content })
      if (data.stop_reason === 'pause_turn') continue // resume the server search loop
      break
    }

    return { answerText, citedUrls, citationCount }
  },
}

function selectEngines(forceDry: boolean): CitationEngine[] {
  if (forceDry) return [dryRunEngine]
  const real = [anthropicEngine].filter((e) => e.available())
  return real.length > 0 ? real : [dryRunEngine]
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ---- main ----

async function main(): Promise<void> {
  const forceDry = process.argv.includes('--dry')
  const questions = loadQuestions()
  const engines = selectEngines(forceDry)
  const outPath = logPath()
  fs.mkdirSync(path.dirname(outPath), { recursive: true })

  console.log(
    `AI-citation monitor: ${questions.length} question(s) × ${engines.length} engine(s) [${engines
      .map((e) => e.name)
      .join(', ')}] → ${outPath}`,
  )

  const checks: CitationCheck[] = []
  let first = true
  for (const engine of engines) {
    const model = engine.name === 'anthropic' ? CITATION_MODEL : engine.name
    for (const q of questions) {
      if (!first) await sleep(REQUEST_GAP_MS)
      first = false

      const base = {
        timestamp: new Date().toISOString(),
        engine: engine.name,
        model,
        questionId: q.id,
        question: q.text,
      }
      let check: CitationCheck
      try {
        const answer = await engine.ask(q.text)
        const verdict = checkCitation(answer)
        check = {
          ...base,
          cited: verdict.cited,
          mentionedInText: verdict.mentionedInText,
          matchedUrls: verdict.matchedUrls,
          citationCount: answer.citationCount,
          answerSnippet: answer.answerText.slice(0, 200),
        }
      } catch (err) {
        check = {
          ...base,
          cited: false,
          mentionedInText: false,
          matchedUrls: [],
          citationCount: 0,
          answerSnippet: '',
          error: err instanceof Error ? err.message : String(err),
        }
      }
      fs.appendFileSync(outPath, JSON.stringify(check) + '\n')
      checks.push(check)
      const mark = check.error ? '!' : check.cited ? '✓' : check.mentionedInText ? '~' : '·'
      console.log(`  ${mark} [${engine.name}] ${q.id}`)
    }
  }

  console.log('\n' + summarize(checks))
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err)
  process.exitCode = 1
})

// AI-citation monitor — IO entry point. Asks each configured AI engine the target
// questions and records whether gmaslist.com is CITED, appending one JSONL line per
// observation to a LOCAL log (never committed — like products.db, this is home-machine
// measurement state). Run locally / on a Scheduled Task; the served site is untouched.
//
//   Manual run:  cd server ; npx tsx scripts/aiCitationRun.ts
//   Dry run:     cd server ; npx tsx scripts/aiCitationRun.ts --dry   (no key/cost)
//
// Engines are PLUGGABLE (matches the "data source is a commodity" instinct). Today:
//   - anthropic  : Claude + the server-side web_search tool, which returns cited sources.
//                  Needs ANTHROPIC_API_KEY (put it in the repo-root .env — gitignored).
//   - perplexity : Perplexity Sonar (a grounded consumer answer-engine that cites its sources).
//                  Needs PERPLEXITY_API_KEY (repo-root .env). Skipped when the key is absent.
//   - dry-run    : keyless placeholder so the whole pipeline runs at zero cost.
// OpenAI / Gemini adapters can be added the same way (one more CitationEngine implementation).
//
// Env:
//   ANTHROPIC_API_KEY  - enables the anthropic engine (else it is skipped)
//   CITATION_MODEL     - Claude model id (default claude-haiku-4-5; if you set an Opus/Sonnet
//                        model, switch the web_search tool version accordingly — see ask())
//   PERPLEXITY_API_KEY - enables the perplexity engine (else it is skipped)
//   PERPLEXITY_MODEL   - Perplexity model id (default sonar — cheapest search-grounded tier)
//   CITATION_LOG_PATH  - JSONL log path (default ~/GmaS-data/citation-log.jsonl)
//
// See project_reach-launch-plan (Phase 0, item 1) and ADR-106.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import {
  checkCitation,
  summarize,
  type CitationCheck,
  type TargetQuestion,
} from './citationMonitor.js'
import {
  selectEngines,
  sleep,
  CITATION_MODEL,
  PERPLEXITY_MODEL,
  REQUEST_GAP_MS,
} from './searchEngines.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
    const model =
      engine.name === 'anthropic'
        ? CITATION_MODEL
        : engine.name === 'perplexity'
          ? PERPLEXITY_MODEL
          : engine.name
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
          citedDomains: verdict.citedDomains,
          citationCount: answer.citationCount,
          answerSnippet: answer.answerText.slice(0, 200),
        }
      } catch (err) {
        check = {
          ...base,
          cited: false,
          mentionedInText: false,
          matchedUrls: [],
          citedDomains: [],
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

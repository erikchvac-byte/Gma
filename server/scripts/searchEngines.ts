// Shared pluggable AI search engines (Anthropic Claude + web_search, Perplexity Sonar, and a
// keyless dry-run). Extracted from aiCitationRun.ts so BOTH the citation monitor (Story 1.1 chain)
// and the opportunity finder (Story 1.3 / ADR-115) use ONE source of truth for the capped
// web_search pause_turn loop and the model/tool-version pinning (AR-5: reuse, don't fork the
// search path). This module has no top-level main() — importing it makes no network call and
// prints nothing; it only loads the repo-root .env (idempotent) so ANTHROPIC_API_KEY /
// PERPLEXITY_API_KEY are picked up regardless of cwd.

import { config as loadEnv } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parsePerplexityResponse,
  type CitationEngine,
  type EngineAnswer,
  type PerplexityResponse,
} from './citationMonitor.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The project's .env lives at the REPO ROOT (where EIA_API_KEY etc. already live), not in server/.
// These scripts run with cwd=server/, so a bare `dotenv/config` (which reads ./.env) would miss it.
// Load the root .env by an absolute path resolved from this file's location.
loadEnv({ path: path.resolve(__dirname, '../../.env') })

export const REQUEST_GAP_MS = 1500 // gentle pacing between calls to avoid rate limits

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
// Haiku 4.5, not Opus: these tasks are "search the web and extract sources/threads" — retrieval +
// extraction, no deep reasoning — so the cheapest capable model wins. Override with CITATION_MODEL;
// note the web_search tool version below must match the model's support.
const DEFAULT_MODEL = 'claude-haiku-4-5'
export const CITATION_MODEL = process.env.CITATION_MODEL || DEFAULT_MODEL

const PERPLEXITY_URL = 'https://api.perplexity.ai/chat/completions'
// `sonar` is Perplexity's cheapest search-grounded tier — enough for retrieval. Override with
// PERPLEXITY_MODEL if ever needed.
const DEFAULT_PERPLEXITY_MODEL = 'sonar'
export const PERPLEXITY_MODEL = process.env.PERPLEXITY_MODEL || DEFAULT_PERPLEXITY_MODEL

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

// ---- engines ----

// Keyless placeholder: runs the whole pipeline with zero cost. Never "cited".
export const dryRunEngine: CitationEngine = {
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

// Claude with the server-side web_search tool. The tool returns web_search_result blocks (the
// sources it consulted) and text blocks may carry per-claim citations — we collect URLs from both,
// so the answer reflects whatever the grounded answer actually leaned on.
export const anthropicEngine: CitationEngine = {
  name: 'anthropic',
  available: () => Boolean(process.env.ANTHROPIC_API_KEY),
  async ask(question: string): Promise<EngineAnswer> {
    const key = process.env.ANTHROPIC_API_KEY
    if (!key) throw new Error('ANTHROPIC_API_KEY not set')

    const tools = [
      {
        // Basic web_search variant: supported by Haiku 4.5 (the default model). The newer
        // web_search_20260209 (dynamic filtering) is Opus-4.6+/Sonnet-only and would 400 on Haiku.
        // Result-block shape (web_search_tool_result -> web_search_result.url) is identical, so
        // extraction below is unchanged. If you override CITATION_MODEL to an Opus/Sonnet model you
        // may switch this back to web_search_20260209.
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

    // The server runs its own search loop; it may return stop_reason "pause_turn" to be resumed.
    // Re-send the accumulated messages until it settles (cap to avoid loops).
    const messages: Array<{ role: string; content: unknown }> = [{ role: 'user', content: question }]
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

// Perplexity's public API is OpenAI-compatible chat-completions; the model does its own web search
// server-side and returns the sources it used. parsePerplexityResponse (pure, tested) turns the
// response into the engine-agnostic EngineAnswer.
export const perplexityEngine: CitationEngine = {
  name: 'perplexity',
  available: () => Boolean(process.env.PERPLEXITY_API_KEY),
  async ask(question: string): Promise<EngineAnswer> {
    const key = process.env.PERPLEXITY_API_KEY
    if (!key) throw new Error('PERPLEXITY_API_KEY not set')

    const res = await fetch(PERPLEXITY_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: PERPLEXITY_MODEL,
        messages: [{ role: 'user', content: question }],
      }),
    })
    if (!res.ok) {
      throw new Error(`Perplexity API ${res.status}: ${(await res.text()).slice(0, 300)}`)
    }
    const data = (await res.json()) as PerplexityResponse
    return parsePerplexityResponse(data)
  },
}

// Pick the engines to run: dry-run when forced, else every real engine whose key is present, else
// fall back to dry-run so the pipeline always runs at zero cost.
export function selectEngines(forceDry: boolean): CitationEngine[] {
  if (forceDry) return [dryRunEngine]
  const real = [anthropicEngine, perplexityEngine].filter((e) => e.available())
  return real.length > 0 ? real : [dryRunEngine]
}

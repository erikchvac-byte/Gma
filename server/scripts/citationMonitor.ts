// AI-citation monitor — PURE logic (no network, no fs), so it is unit-testable.
// Phase-0 reach instrumentation (see project_reach-launch-plan): a scheduled job asks
// AI answer engines the questions real WA shoppers ask ("cheapest weed near Marysville")
// and records whether gmaslist.com is CITED in the grounded answer. A dead-man's-switch
// for REACH: you see the moment you start getting picked up, and catch when a page stops
// being cited. The IO half (Anthropic web-search call, JSONL log) lives in aiCitationRun.ts.

export const TARGET_DOMAIN = 'gmaslist.com'
export const BRAND_NEEDLE = 'gmaslist'

// One question we ask each engine.
export interface TargetQuestion {
  id: string
  text: string
}

// What an engine returns for one question, normalized across providers.
export interface EngineAnswer {
  // Concatenated visible answer text the engine produced.
  answerText: string
  // Every source URL the engine cited / surfaced while answering (any domain).
  citedUrls: string[]
  // Total number of citation references seen (>= matchedUrls; for trend context).
  citationCount: number
}

// A pluggable engine (Anthropic web-search, a keyless dry-run, later Perplexity/OpenAI...).
export interface CitationEngine {
  name: string
  // False when the engine can't run (e.g. no API key) so the runner can skip it.
  available(): boolean
  ask(question: string): Promise<EngineAnswer>
}

// One recorded observation, appended as a JSONL line to the local log.
export interface CitationCheck {
  timestamp: string
  engine: string
  model: string
  questionId: string
  question: string
  cited: boolean // hard signal: gmaslist.com appears in the engine's cited SOURCES
  mentionedInText: boolean // soft signal: the brand appears in the answer text
  matchedUrls: string[]
  citationCount: number
  answerSnippet: string
  error?: string
}

// Does a cited URL's hostname belong to the target domain? Matches the apex and any
// subdomain (www.gmaslist.com), and nothing that merely contains the string
// (evil-gmaslist.com.attacker.net must NOT match). Invalid URLs are not a match.
export function hostnameMatches(url: string, domain = TARGET_DOMAIN): boolean {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return false
  }
  const d = domain.toLowerCase()
  return host === d || host.endsWith(`.${d}`)
}

export interface CitationVerdict {
  cited: boolean
  matchedUrls: string[]
  mentionedInText: boolean
}

// The core decision: given an engine's answer, was gmaslist.com cited (hard) and/or
// mentioned in prose (soft)? Pure and deterministic.
export function checkCitation(
  answer: EngineAnswer,
  domain = TARGET_DOMAIN,
  brandNeedle = BRAND_NEEDLE,
): CitationVerdict {
  const matchedUrls = Array.from(
    new Set(answer.citedUrls.filter((u) => hostnameMatches(u, domain))),
  )
  return {
    cited: matchedUrls.length > 0,
    matchedUrls,
    mentionedInText: answer.answerText.toLowerCase().includes(brandNeedle.toLowerCase()),
  }
}

// A short, human-readable roll-up of a run, printed after the log is written.
export function summarize(checks: CitationCheck[]): string {
  if (checks.length === 0) return 'No checks run.'
  const byEngine = new Map<string, CitationCheck[]>()
  for (const c of checks) {
    const list = byEngine.get(c.engine) ?? []
    list.push(c)
    byEngine.set(c.engine, list)
  }
  const lines: string[] = []
  for (const [engine, list] of byEngine) {
    const cited = list.filter((c) => c.cited)
    const mentioned = list.filter((c) => !c.cited && c.mentionedInText)
    const errored = list.filter((c) => c.error)
    lines.push(
      `${engine}: cited in ${cited.length}/${list.length}` +
        (mentioned.length ? `, mentioned-only in ${mentioned.length}` : '') +
        (errored.length ? `, ${errored.length} error(s)` : ''),
    )
    for (const c of cited) {
      lines.push(`  ✓ "${c.question}" → ${c.matchedUrls.join(', ')}`)
    }
    for (const c of mentioned) {
      lines.push(`  ~ "${c.question}" (named in text, not cited as a source)`)
    }
    for (const c of errored) {
      lines.push(`  ! "${c.question}" — ${c.error}`)
    }
  }
  return lines.join('\n')
}

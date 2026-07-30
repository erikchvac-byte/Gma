import type { Request, Response, NextFunction } from 'express'

// Standing crawler-visibility instrument (investigation
// discovery-crawl-bottleneck, 2026-07-30). Render's starter plan exposes no
// `request`-type logs and the app previously logged nothing per HTTP hit, so we
// were blind to whether Bing/AI bots actually fetch pages — the one question no
// third-party console (GSC is Google-only) fully answers. This logs a single,
// trivially-greppable line per crawler request to stdout, which Render surfaces
// as an `app` log searchable by the `[crawler]` prefix.
//
// Deliberately bot-scoped, not a full access log: near-zero human traffic means
// a blanket access log would be mostly /healthz keep-warm pings and the hourly
// /api/ingest cron — noise that buries the signal. Only requests whose
// User-Agent matches a known crawler token are logged.

// Known crawler User-Agent tokens: the AI citation/training bots (kept in sync
// with AI_CRAWLER_AGENTS in sitemapRoute.ts), the major search engines, plus a
// generic bot/crawler/spider/slurp catch-all so an unlisted crawler still shows
// up. Case-insensitive. Ordered specific-before-generic so the reported name is
// the most informative match.
const CRAWLER_TOKENS = [
  // AI training / model-usage + citation / live-answer crawlers
  'Googlebot',
  'Google-Extended',
  'Bingbot',
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'PerplexityBot',
  'Perplexity-User',
  'Applebot-Extended',
  'Applebot',
  'CCBot',
  'Meta-ExternalAgent',
  'Amazonbot',
  'Bytespider',
  'YandexBot',
  'Baiduspider',
  'DuckDuckBot',
  'Slurp',
  // generic fallbacks — last so a specific token above wins the report
  'crawler',
  'spider',
  'bot',
]

const CRAWLER_RE = new RegExp(`(${CRAWLER_TOKENS.join('|')})`, 'i')

// Returns the matched crawler token (canonical casing from CRAWLER_TOKENS) for a
// User-Agent string, or null if none match. Exported for tests. The regex reports
// the substring as-found; we map it back to the canonical token for a stable log.
export function matchCrawler(userAgent: string | undefined): string | null {
  if (!userAgent) return null
  const m = CRAWLER_RE.exec(userAgent)
  if (!m) return null
  const found = m[1].toLowerCase()
  // Prefer the specific token whose lowercase equals the match; fall back to the
  // as-found substring (covers the generic bot/crawler/spider hits).
  const canonical = CRAWLER_TOKENS.find((t) => t.toLowerCase() === found)
  return canonical ?? m[1]
}

// UA can be arbitrarily long / attacker-controlled; cap it so one log line can
// never blow up. 256 chars is ample for every real crawler UA.
const MAX_UA_LEN = 256

export function crawlerLogger(req: Request, res: Response, next: NextFunction) {
  const ua = req.headers['user-agent']
  const bot = matchCrawler(ua)
  if (!bot) return next()

  // Log on response finish so the real status code is known (a bot hit that 301s
  // via trailingSlashRedirect or 404s is exactly what we want to see).
  res.on('finish', () => {
    const safeUa = (ua ?? '').slice(0, MAX_UA_LEN)
    console.log(
      `[crawler] ${bot} ${req.method} ${req.originalUrl} ${res.statusCode} ua="${safeUa}"`,
    )
  })

  next()
}

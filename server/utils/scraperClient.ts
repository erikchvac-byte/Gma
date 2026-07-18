import axios from 'axios'

// Typed wrapper over the Python Scraper microservice (ADR-017). The service runs
// as a separate process (FastAPI + Playwright + GraphQL interception) and is the
// only way to read Dutchie/iFrame menus, which are invisible to Axios+Cheerio.
// Target URL is SCRAPER_URL-overridable (ADR-033), defaulting to
// http://localhost:8000/scrape when unset — unchanged for local dev and current
// Render. Read per call (not at module load) so it is runtime-/test-overridable.
// Contract: this never throws — any failure (service down, non-200, success:false,
// timeout, malformed body) returns [] so the caller's scrape() degrades to stale.

const DEFAULT_SERVICE_URL = 'http://localhost:8000/scrape'

// Opt-in Dutchie numbered-pagination walk (product scrape). When present, the
// service — after capturing page 0 — walks every numbered page of each `types`
// category in-page and returns them alongside the intercepts. Absent for the deals
// scrape, whose navigate-wait-return timing is therefore unchanged. Replaces the
// former `scroll_after_wait` no-op (the embed menu is numbered pages, not scroll).
export interface PaginateFilteredProducts {
  types: string[]
  per_page?: number
  max_pages?: number
}

export interface ScrapeRequest {
  url: string
  intercept_pattern: string
  wait_for_pattern: string
  tier: 'browser' | 'tls' | 'cloudflare'
  headless: boolean
  timeout: number
  paginate?: PaginateFilteredProducts
}

export interface Intercepted {
  url: string
  status: number
  data: unknown
}

export interface ScrapeResponse {
  request_url: string
  tier_used: string
  success: boolean
  duration_ms: number
  intercepted: Intercepted[]
  raw_html: string | null
  error: string | null
  timestamp: string
}

// Detailed variant exposing whether the service call itself SUCCEEDED (ADR-083).
// `ok: true` means the scraper service answered `success: true` with a well-formed
// intercepted array — the caller can then trust an empty capture as evidence
// rather than a swallowed failure. Still never throws.
// Client-side HTTP timeout for one service call. Must sit above the service's own
// worst case: for a plain scrape that's the 45s browser nav (+settle), so 50s. A
// `paginate` request does its numbered-page walk AFTER the nav inside the same
// service call (categories × pages sub-second in-page fetches + pauses), so it gets
// a much larger budget — an HTTP timeout mid-walk would discard a COMPLETED capture
// and send the retry loop into full re-scrapes that yield zero (worse than page-0).
export function clientTimeoutMs(req: ScrapeRequest): number {
  return req.paginate ? 180000 : 50000
}

export async function postScrapeDetailed(
  req: ScrapeRequest,
): Promise<{ ok: boolean; intercepted: Intercepted[] }> {
  try {
    const url = process.env.SCRAPER_URL || DEFAULT_SERVICE_URL
    const res = await axios.post<ScrapeResponse>(url, req, { timeout: clientTimeoutMs(req) })
    const body = res.data
    if (body?.success === true && Array.isArray(body.intercepted)) {
      return { ok: true, intercepted: body.intercepted }
    }
    console.error('[scraperClient] unsuccessful scrape', body?.error ?? body)
    return { ok: false, intercepted: [] }
  } catch (err) {
    // Service unreachable / non-2xx / timeout all land here.
    console.error('[scraperClient]', err)
    return { ok: false, intercepted: [] }
  }
}

export async function postScrape(req: ScrapeRequest): Promise<Intercepted[]> {
  return (await postScrapeDetailed(req)).intercepted
}

// HTML variant: returns the service's `raw_html` (page.content()) instead of the
// intercepted GraphQL payloads. For sources that render their content into the DOM
// rather than a capturable API — e.g. a store's own marketing page behind a JS
// challenge (Vercel checkpoint) that only a real browser clears. Pair it with an
// EMPTY intercept_pattern: the service returns page.content() only when nothing was
// captured (api/server.py `_run_browser`), so any matched request would null the
// HTML. Never throws — a service failure / non-2xx / missing html returns null so
// the caller degrades to an empty scrape (→ stale), same contract as the others.
export async function postScrapeHtml(
  req: ScrapeRequest,
): Promise<{ ok: boolean; html: string | null }> {
  try {
    const url = process.env.SCRAPER_URL || DEFAULT_SERVICE_URL
    const res = await axios.post<ScrapeResponse>(url, req, { timeout: clientTimeoutMs(req) })
    const body = res.data
    if (body?.success === true) {
      return { ok: true, html: typeof body.raw_html === 'string' ? body.raw_html : null }
    }
    console.error('[scraperClient] unsuccessful scrape', body?.error ?? body)
    return { ok: false, html: null }
  } catch (err) {
    console.error('[scraperClient]', err)
    return { ok: false, html: null }
  }
}

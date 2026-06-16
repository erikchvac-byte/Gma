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

export interface ScrapeRequest {
  url: string
  intercept_pattern: string
  wait_for_pattern: string
  tier: 'browser' | 'tls' | 'cloudflare'
  headless: boolean
  timeout: number
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

export async function postScrape(req: ScrapeRequest): Promise<Intercepted[]> {
  try {
    const url = process.env.SCRAPER_URL || DEFAULT_SERVICE_URL
    // Timeout sits above the service's own 45s browser timeout so the HTTP wait
    // never fires before the service has had its chance to respond or fail.
    const res = await axios.post<ScrapeResponse>(url, req, { timeout: 50000 })
    const body = res.data
    if (body?.success === true && Array.isArray(body.intercepted)) {
      return body.intercepted
    }
    console.error('[scraperClient] unsuccessful scrape', body?.error ?? body)
    return []
  } catch (err) {
    // Service unreachable / non-2xx / timeout all land here.
    console.error('[scraperClient]', err)
    return []
  }
}

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { postScrape, type Intercepted, type ScrapeRequest } from './scraperClient.js'

vi.mock('axios')
const mockedPost = vi.mocked(axios.post)

const req: ScrapeRequest = {
  url: 'https://dutchie.com/embedded-menu/abc123',
  intercept_pattern: 'dutchie\\.com.*(graphql|api-0)',
  wait_for_pattern: 'dutchie\\.com/graphql',
  tier: 'browser',
  headless: true,
  timeout: 45000,
}

const intercepted: Intercepted[] = [
  { url: 'https://dutchie.com/graphql?operationName=GetSpecialMenuCards', status: 200, data: {} },
]

describe('postScrape', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('returns intercepted[] on a successful scrape', async () => {
    mockedPost.mockResolvedValueOnce({ data: { success: true, intercepted } })
    await expect(postScrape(req)).resolves.toEqual(intercepted)
  })

  it('returns [] when the service reports success:false', async () => {
    mockedPost.mockResolvedValueOnce({ data: { success: false, intercepted: [], error: 'boom' } })
    await expect(postScrape(req)).resolves.toEqual([])
  })

  it('returns [] when the service is unreachable (connection refused)', async () => {
    mockedPost.mockRejectedValueOnce(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }))
    await expect(postScrape(req)).resolves.toEqual([])
  })

  it('returns [] on a non-2xx response (axios rejects)', async () => {
    mockedPost.mockRejectedValueOnce(Object.assign(new Error('Request failed with status code 500'), {
      response: { status: 500 },
    }))
    await expect(postScrape(req)).resolves.toEqual([])
  })

  it('returns [] on a request timeout', async () => {
    mockedPost.mockRejectedValueOnce(Object.assign(new Error('timeout of 50000ms exceeded'), { code: 'ECONNABORTED' }))
    await expect(postScrape(req)).resolves.toEqual([])
  })

  it('returns [] when the body is malformed (no intercepted array)', async () => {
    mockedPost.mockResolvedValueOnce({ data: { success: true } })
    await expect(postScrape(req)).resolves.toEqual([])
  })

  it('POSTs to the default localhost:8000/scrape endpoint when SCRAPER_URL is unset', async () => {
    // Empty is falsy → default applies. Stub explicitly so a stray ambient env value can't break it.
    vi.stubEnv('SCRAPER_URL', '')
    mockedPost.mockResolvedValueOnce({ data: { success: true, intercepted } })
    await postScrape(req)
    expect(mockedPost).toHaveBeenCalledWith(
      'http://localhost:8000/scrape',
      req,
      expect.objectContaining({ timeout: expect.any(Number) }),
    )
  })

  it('POSTs to SCRAPER_URL when set', async () => {
    vi.stubEnv('SCRAPER_URL', 'http://scraper.internal:8000/scrape')
    mockedPost.mockResolvedValueOnce({ data: { success: true, intercepted } })
    await postScrape(req)
    expect(mockedPost).toHaveBeenCalledWith(
      'http://scraper.internal:8000/scrape',
      req,
      expect.objectContaining({ timeout: expect.any(Number) }),
    )
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { crawlerLogger, matchCrawler } from './crawlerLogger.js'

// Mount the middleware ahead of sentinel routes so we can assert which requests
// it logs (via a spied console.log) and that it never alters the response.
function makeApp() {
  const app = express()
  app.use(express.json())
  app.use(crawlerLogger)
  app.get('/', (_req, res) => res.send('home'))
  app.get('/store/:slug', (_req, res) => res.send('store'))
  app.get('/api/data', (_req, res) => res.send('api'))
  return app
}

describe('matchCrawler', () => {
  it('identifies known search + AI crawler UAs with canonical token', () => {
    expect(matchCrawler('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBe(
      'Googlebot',
    )
    expect(matchCrawler('Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)')).toBe(
      'Bingbot',
    )
    expect(matchCrawler('Mozilla/5.0 AppleWebKit (compatible; PerplexityBot/1.0)')).toBe('PerplexityBot')
    expect(matchCrawler('GPTBot/1.2')).toBe('GPTBot')
    expect(matchCrawler('Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)')).toBe(
      'ClaudeBot',
    )
  })

  it('reports the specific token, not the generic one, when both could match', () => {
    // "Googlebot" contains "bot" — the specific entry must win the report.
    expect(matchCrawler('Googlebot/2.1')).toBe('Googlebot')
  })

  it('falls back to a generic bot/crawler/spider match for unlisted crawlers', () => {
    expect(matchCrawler('SomeNewThing-crawler/9')).toBe('crawler')
    expect(matchCrawler('bigco-spider')).toBe('spider')
  })

  it('returns null for a normal browser UA', () => {
    expect(
      matchCrawler(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      ),
    ).toBeNull()
  })

  it('returns null for a missing/empty UA', () => {
    expect(matchCrawler(undefined)).toBeNull()
    expect(matchCrawler('')).toBeNull()
  })
})

describe('crawlerLogger middleware', () => {
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    logSpy.mockRestore()
  })

  it('logs a single greppable line for a crawler request, with method/path/status', async () => {
    const res = await request(makeApp())
      .get('/store/remedy-tulalip')
      .set('User-Agent', 'Mozilla/5.0 (compatible; bingbot/2.0)')
    expect(res.status).toBe(200)
    expect(logSpy).toHaveBeenCalledTimes(1)
    const line = logSpy.mock.calls[0][0] as string
    expect(line).toContain('[crawler]')
    expect(line).toContain('Bingbot')
    expect(line).toContain('GET')
    expect(line).toContain('/store/remedy-tulalip')
    expect(line).toContain('200')
  })

  it('logs the real status code (a 404 crawler hit is still recorded)', async () => {
    const res = await request(makeApp())
      .get('/nope')
      .set('User-Agent', 'GPTBot/1.1')
    expect(res.status).toBe(404)
    expect(logSpy).toHaveBeenCalledTimes(1)
    expect(logSpy.mock.calls[0][0] as string).toContain('404')
  })

  it('does NOT log a normal browser request', async () => {
    await request(makeApp())
      .get('/')
      .set(
        'User-Agent',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605 Safari/605',
      )
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('never alters the response body', async () => {
    const res = await request(makeApp())
      .get('/')
      .set('User-Agent', 'Googlebot/2.1')
    expect(res.text).toBe('home')
  })

  it('truncates an over-long UA so one log line cannot blow up', async () => {
    const longUa = 'bingbot ' + 'x'.repeat(1000)
    await request(makeApp()).get('/').set('User-Agent', longUa)
    const line = logSpy.mock.calls[0][0] as string
    // 256-char cap + the surrounding `ua="..."` — the 1000 x's must not all appear.
    expect(line.length).toBeLessThan(400)
  })
})

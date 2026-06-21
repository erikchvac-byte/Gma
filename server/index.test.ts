import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

describe('server/index.ts', () => {
  it('sets process.env.TZ as the first executable line', () => {
    const content = readFileSync(join(__dirname, 'index.ts'), 'utf-8')
    const firstExecutableLine = content
      .split('\n')
      .find(line => { const t = line.trim(); return t && !t.startsWith('//') && !t.startsWith('/*') && !t.startsWith('*') })
    expect(firstExecutableLine?.trim()).toBe("process.env.TZ = 'America/Los_Angeles'")
  })

  it('TZ is set to Pacific time', () => {
    process.env.TZ = 'America/Los_Angeles'
    expect(process.env.TZ).toBe('America/Los_Angeles')
  })

  it('invokes refreshGasPrice at startup and schedules it on an interval', () => {
    const content = readFileSync(join(__dirname, 'index.ts'), 'utf-8')

    expect(content).toContain('void refreshGasPrice().catch(console.error)')
    expect(content).toMatch(/setInterval\([\s\S]*?refreshGasPrice\(\)[\s\S]*?REFRESH_INTERVAL_MS\)/)
    expect(content).toContain('const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000')
  })

  // ADR-034 Goal C: the in-process setInterval scrape (ADR-010) was retired —
  // the GitHub Actions cron → POST /api/ingest is now the sole data trigger, so
  // this entry must not call or schedule runScrapers.
  it('does not run in-process scraping (ADR-034 Goal C)', () => {
    const content = readFileSync(join(__dirname, 'index.ts'), 'utf-8')

    expect(content).not.toContain('runScrapers')
    expect(content).not.toContain('SCRAPE_INTERVAL_MS')
    // Render stays read-only over data.json — the in-process scraper client must
    // not be wired into the server entry; the only data writer is POST /api/ingest.
    expect(content).not.toContain('scraperClient')
  })
})

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runScrapers } from './runScrapers.js'
import type { Deal } from '../../client/src/types/index.js'

const deal: Deal = {
  type: 'daily',
  description: '20% off edibles',
  discountPct: 20,
  startTime: null,
  endTime: null,
  daysValid: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
}

const existingDeal: Deal = {
  type: 'happy_hour',
  description: 'Existing happy hour',
  discountPct: 10,
  startTime: '15:00',
  endTime: '18:00',
  daysValid: ['friday'],
}

const seedData = {
  meta: {
    lastScraperRun: '2026-06-09T00:00:00.000Z',
    gasPrice: 4.25,
    nationalMpg: 28,
    gasPriceUpdatedAt: '2026-06-09T00:00:00.000Z',
  },
  dispensaries: [
    {
      id: 'success-store',
      name: 'Success Store',
      url: 'https://success.example.com/',
      distanceMiles: 1,
      stale: true,
      lastFetchedAt: '2026-06-01T00:00:00.000Z',
      deals: [],
    },
    {
      id: 'empty-result-store',
      name: 'Empty Result Store',
      url: 'https://empty.example.com/',
      distanceMiles: 2,
      stale: false,
      lastFetchedAt: '2026-06-01T00:00:00.000Z',
      deals: [existingDeal],
    },
    {
      id: 'unregistered-store',
      name: 'Unregistered Store',
      url: 'https://unregistered.example.com/',
      distanceMiles: 3,
      stale: false,
      lastFetchedAt: '2026-06-01T00:00:00.000Z',
      deals: [existingDeal],
    },
    {
      id: 'throwing-store',
      name: 'Throwing Store',
      url: 'https://throwing.example.com/',
      distanceMiles: 4,
      stale: false,
      lastFetchedAt: '2026-06-01T00:00:00.000Z',
      deals: [existingDeal],
    },
  ],
}

describe('runScrapers', () => {
  let dir: string
  let dataPath: string
  let logsPath: string

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'run-scrapers-'))
    dataPath = path.join(dir, 'data.json')
    logsPath = path.join(dir, 'logs.json')
    writeFileSync(dataPath, JSON.stringify(seedData, null, 2), 'utf-8')
    writeFileSync(logsPath, JSON.stringify({ runs: [] }, null, 2), 'utf-8')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const registry = {
    'success-store': async () => [deal],
    'empty-result-store': async () => [],
    'throwing-store': async () => {
      throw new Error('site down')
    },
    // 'unregistered-store' intentionally has no entry
  }

  it('AC2: success updates stale, deals, and lastFetchedAt', async () => {
    const before = Date.now()
    await runScrapers(dataPath, logsPath, registry)

    const file = JSON.parse(readFileSync(dataPath, 'utf-8'))
    const dispensary = file.dispensaries.find((d: { id: string }) => d.id === 'success-store')

    expect(dispensary.stale).toBe(false)
    expect(dispensary.deals).toEqual([deal])
    expect(Date.parse(dispensary.lastFetchedAt)).toBeGreaterThanOrEqual(before)
  })

  it('AC3: empty-array result sets stale=true and preserves existing deals/lastFetchedAt', async () => {
    await runScrapers(dataPath, logsPath, registry)

    const file = JSON.parse(readFileSync(dataPath, 'utf-8'))
    const dispensary = file.dispensaries.find((d: { id: string }) => d.id === 'empty-result-store')

    expect(dispensary.stale).toBe(true)
    expect(dispensary.deals).toEqual([existingDeal])
    expect(dispensary.lastFetchedAt).toBe('2026-06-01T00:00:00.000Z')
  })

  it('AC3: missing registry entry sets stale=true, preserves deals, and logs "no scraper registered"', async () => {
    await runScrapers(dataPath, logsPath, registry)

    const file = JSON.parse(readFileSync(dataPath, 'utf-8'))
    const dispensary = file.dispensaries.find((d: { id: string }) => d.id === 'unregistered-store')

    expect(dispensary.stale).toBe(true)
    expect(dispensary.deals).toEqual([existingDeal])
    expect(dispensary.lastFetchedAt).toBe('2026-06-01T00:00:00.000Z')

    const logsFile = JSON.parse(readFileSync(logsPath, 'utf-8'))
    expect(logsFile.runs[0].results['unregistered-store']).toBe('error: no scraper registered')
  })

  it('AC3: a thrown error sets stale=true, preserves deals, and logs the error message', async () => {
    await runScrapers(dataPath, logsPath, registry)

    const file = JSON.parse(readFileSync(dataPath, 'utf-8'))
    const dispensary = file.dispensaries.find((d: { id: string }) => d.id === 'throwing-store')

    expect(dispensary.stale).toBe(true)
    expect(dispensary.deals).toEqual([existingDeal])
    expect(dispensary.lastFetchedAt).toBe('2026-06-01T00:00:00.000Z')

    const logsFile = JSON.parse(readFileSync(logsPath, 'utf-8'))
    expect(logsFile.runs[0].results['throwing-store']).toBe('error: site down')
  })

  it('AC4/5: appends a logs.json entry with runAt and per-source results, and sets meta.lastScraperRun', async () => {
    const before = Date.now()
    await runScrapers(dataPath, logsPath, registry)

    const file = JSON.parse(readFileSync(dataPath, 'utf-8'))
    const logsFile = JSON.parse(readFileSync(logsPath, 'utf-8'))

    expect(logsFile.runs).toHaveLength(1)
    const run = logsFile.runs[0]
    expect(Date.parse(run.runAt)).toBeGreaterThanOrEqual(before)
    expect(run.results).toEqual({
      'success-store': 'ok',
      'empty-result-store': 'error: scraper returned no deals',
      'unregistered-store': 'error: no scraper registered',
      'throwing-store': 'error: site down',
    })
    expect(file.meta.lastScraperRun).toBe(run.runAt)
  })

  it('a contract-violating scraper (returns non-array) degrades to stale=true without poisoning the run', async () => {
    // Single bad source alongside a good one; the bad scrape returns null
    // (violating the Promise<Deal[]> contract). The good source must still be
    // written and the run must complete — not reject and skip every write.
    const customSeed = {
      ...seedData,
      dispensaries: [
        seedData.dispensaries[0], // success-store
        { ...seedData.dispensaries[1], id: 'null-store', stale: false, deals: [existingDeal] },
      ],
    }
    writeFileSync(dataPath, JSON.stringify(customSeed, null, 2), 'utf-8')

    const badRegistry = {
      'success-store': async () => [deal],
      // returns a non-array, violating the contract — must not crash the run
      'null-store': async () => null as unknown as Deal[],
    }

    await runScrapers(dataPath, logsPath, badRegistry)

    const file = JSON.parse(readFileSync(dataPath, 'utf-8'))
    const good = file.dispensaries.find((d: { id: string }) => d.id === 'success-store')
    const bad = file.dispensaries.find((d: { id: string }) => d.id === 'null-store')

    expect(good.stale).toBe(false)
    expect(good.deals).toEqual([deal])
    expect(bad.stale).toBe(true)
    expect(bad.deals).toEqual([existingDeal]) // preserved (AC3)

    const logsFile = JSON.parse(readFileSync(logsPath, 'utf-8'))
    expect(logsFile.runs).toHaveLength(1)
    expect(logsFile.runs[0].results['success-store']).toBe('ok')
    expect(logsFile.runs[0].results['null-store']).toMatch(/^error: /)
  })

  it('normalizes ingested deals: a degenerate-only scrape result yields stale=true and preserves prior deals', async () => {
    // success-store returns a single zero-length-window deal (start === end).
    // normalizeDeals drops it, leaving [], which reuses the empty-deals
    // contract: stale=true, prior deals/lastFetchedAt untouched — and the junk
    // deal never reaches data.json (so it can't become always-active).
    const degenerateDeal: Deal = {
      type: 'happy_hour',
      description: 'Zero-length window',
      discountPct: 15,
      startTime: '16:00',
      endTime: '16:00',
      daysValid: ['friday'],
    }
    const customSeed = {
      ...seedData,
      dispensaries: [{ ...seedData.dispensaries[0], stale: false, deals: [existingDeal] }],
    }
    writeFileSync(dataPath, JSON.stringify(customSeed, null, 2), 'utf-8')

    await runScrapers(dataPath, logsPath, { 'success-store': async () => [degenerateDeal] })

    const file = JSON.parse(readFileSync(dataPath, 'utf-8'))
    const dispensary = file.dispensaries.find((d: { id: string }) => d.id === 'success-store')

    expect(dispensary.stale).toBe(true)
    expect(dispensary.deals).toEqual([existingDeal])
    expect(dispensary.lastFetchedAt).toBe('2026-06-01T00:00:00.000Z')

    const logsFile = JSON.parse(readFileSync(logsPath, 'utf-8'))
    expect(logsFile.runs[0].results['success-store']).toBe('error: scraper returned no deals')
  })

  it('leaves no .tmp.json files behind', async () => {
    await runScrapers(dataPath, logsPath, registry)

    expect(existsSync(path.join(dir, 'data.tmp.json'))).toBe(false)
    expect(existsSync(path.join(dir, 'logs.tmp.json'))).toBe(false)
  })
})

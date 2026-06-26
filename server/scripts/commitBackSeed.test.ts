import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { commitBackSeed, readEntries } from './commitBackSeed.js'
import { filterActiveDeals } from '../utils/filterActiveDeals.js'
import type { ApiDataResponse, Deal, Dispensary } from '../../client/src/types/index.js'
import type { IngestEntry } from '../types/index.js'

// Always-active, survives normalizeDeals.
const validDeal: Deal = {
  type: 'daily',
  description: '20% off flower',
  discountPct: 20,
  startTime: null,
  endTime: null,
  daysValid: ['everyday'],
}
// Structurally valid (survives normalizeDeals) but NOT active at noon: a 02:00–03:00
// happy hour. filterActiveDeals would drop it from GET /api/data — so a seed sourced
// from /api/data would silently lose it. applyIngest (what commitBackSeed uses) keeps it.
const inactiveHappyHour: Deal = {
  type: 'happy_hour',
  description: 'early-bird 30% off',
  discountPct: 30,
  startTime: '02:00',
  endTime: '03:00',
  daysValid: ['everyday'],
}

const EPOCH = '2020-01-01T00:00:00.000Z'

function seed(): { dataPath: string; priorRemedy: Deal[]; priorKush: Deal[] } {
  const dir = mkdtempSync(path.join(tmpdir(), 'cbs-data-'))
  const dataPath = path.join(dir, 'data.json')
  const priorRemedy: Deal[] = [{ ...validDeal, description: 'prior remedy deal', daysValid: ['monday'] }]
  const priorKush: Deal[] = [{ ...validDeal, description: 'prior kush deal' }]
  const mk = (id: string, deals: Deal[]): Dispensary => ({
    id,
    name: id,
    url: 'https://example.test',
    distanceMiles: 1,
    stale: true,
    lastFetchedAt: EPOCH,
    deals,
  })
  const file: ApiDataResponse = {
    meta: { lastScraperRun: EPOCH, gasPrice: 4, gasPriceUpdatedAt: EPOCH },
    dispensaries: [mk('remedy-tulalip', priorRemedy), mk('kush21', priorKush)],
  }
  writeFileSync(dataPath, JSON.stringify(file))
  return { dataPath, priorRemedy, priorKush }
}

function artifactDir(entries: IngestEntry[]): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'cbs-in-'))
  for (const e of entries) writeFileSync(path.join(dir, `${e.dispensaryId}.json`), JSON.stringify(e))
  return dir
}

const read = (p: string): ApiDataResponse => JSON.parse(readFileSync(p, 'utf-8'))
const byId = (data: ApiDataResponse, id: string) => data.dispensaries.find((d) => d.id === id)!

describe('commitBackSeed', () => {
  it('(a) a fresh non-empty scrape replaces deals and clears stale', async () => {
    const { dataPath } = seed()
    const inDir = artifactDir([{ dispensaryId: 'remedy-tulalip', deals: [validDeal] }])

    const results = await commitBackSeed(inDir, dataPath)

    expect(results['remedy-tulalip']).toBe('ok')
    const after = byId(read(dataPath), 'remedy-tulalip')
    expect(after.deals).toEqual([validDeal])
    expect(after.stale).toBe(false)
    expect(after.lastFetchedAt).not.toBe(EPOCH)
    expect(read(dataPath).meta.lastScraperRun).not.toBe(EPOCH) // bumped — something accepted
  })

  it('(b) AC2 invariant: an empty entry keeps last-known-good deals + timestamp, flips stale', async () => {
    const { dataPath, priorRemedy } = seed()
    const inDir = artifactDir([{ dispensaryId: 'remedy-tulalip', deals: [] }])

    const results = await commitBackSeed(inDir, dataPath)

    expect(results['remedy-tulalip']).toBe('stale')
    const after = byId(read(dataPath), 'remedy-tulalip')
    expect(after.deals).toEqual(priorRemedy) // NOT lost
    expect(after.lastFetchedAt).toBe(EPOCH) // untouched
    expect(after.stale).toBe(true)
    expect(read(dataPath).meta.lastScraperRun).toBe(EPOCH) // not bumped — nothing accepted
  })

  it('(c) a store absent from the artifacts is untouched', async () => {
    const { dataPath, priorKush } = seed()
    const inDir = artifactDir([{ dispensaryId: 'remedy-tulalip', deals: [validDeal] }])

    await commitBackSeed(inDir, dataPath)

    const kush = byId(read(dataPath), 'kush21')
    expect(kush.deals).toEqual(priorKush) // wholly untouched
    expect(kush.stale).toBe(true)
    expect(kush.lastFetchedAt).toBe(EPOCH)
  })

  it('(d) a time-inactive deal survives the merge (the /api/data regression this prevents)', async () => {
    const { dataPath } = seed()
    const inDir = artifactDir([{ dispensaryId: 'remedy-tulalip', deals: [inactiveHappyHour] }])
    const noon = new Date(2026, 5, 22, 12, 0, 0) // 12:00 — outside the 02:00–03:00 window

    await commitBackSeed(inDir, dataPath)

    const merged = byId(read(dataPath), 'remedy-tulalip')
    expect(merged.deals).toEqual([inactiveHappyHour]) // applyIngest kept it

    // Proof of the distinction: GET /api/data's time filter WOULD have dropped it,
    // so a seed sourced from /api/data would have silently deleted this real deal.
    const projected = filterActiveDeals(read(dataPath).dispensaries, noon)
    expect(projected.find((d) => d.id === 'remedy-tulalip')!.deals).toEqual([])
  })

  it('an empty / nonexistent artifact dir leaves data.json byte-identical', async () => {
    const { dataPath } = seed()
    const before = readFileSync(dataPath, 'utf-8')
    const emptyDir = mkdtempSync(path.join(tmpdir(), 'cbs-empty-'))

    const results = await commitBackSeed(emptyDir, dataPath)
    expect(results).toEqual({})
    expect(readFileSync(dataPath, 'utf-8')).toBe(before)

    const missing = await commitBackSeed(path.join(emptyDir, 'does-not-exist'), dataPath)
    expect(missing).toEqual({})
    expect(readFileSync(dataPath, 'utf-8')).toBe(before)
  })
})

describe('readEntries', () => {
  it('reads valid IngestEntry artifacts and skips malformed ones without throwing', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cbs-read-'))
    writeFileSync(path.join(dir, 'good.json'), JSON.stringify({ dispensaryId: 'good', deals: [validDeal] }))
    writeFileSync(path.join(dir, 'broken.json'), '{ not valid json')
    writeFileSync(path.join(dir, 'wrong-shape.json'), JSON.stringify({ foo: 'bar' }))
    writeFileSync(path.join(dir, 'ignored.txt'), 'not a json artifact')

    const entries = readEntries(dir)
    expect(entries).toEqual([{ dispensaryId: 'good', deals: [validDeal] }])
  })

  it('returns [] for a nonexistent dir', () => {
    expect(readEntries(path.join(tmpdir(), 'cbs-nope-zzz'))).toEqual([])
  })
})

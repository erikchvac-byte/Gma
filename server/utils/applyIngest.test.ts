import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { applyIngest } from './applyIngest.js'
import type { ApiDataResponse, Deal } from '../../client/src/types/index.js'

// Survives normalizeDeals: both times null (all-day) + valid days.
const validDeal: Deal = {
  type: 'daily',
  description: '20% off flower',
  discountPct: 20,
  startTime: null,
  endTime: null,
  daysValid: ['everyday'],
}
// Dropped by normalizeDeals: 'funday' is not in the day vocabulary.
const invalidDeal = { ...validDeal, daysValid: ['funday'] } as Deal

const EPOCH = '2020-01-01T00:00:00.000Z'

function seed(): { dataPath: string; prior: Deal[] } {
  const dir = mkdtempSync(path.join(tmpdir(), 'ingest-'))
  const dataPath = path.join(dir, 'data.json')
  const prior: Deal[] = [{ ...validDeal, description: 'prior deal', daysValid: ['monday'] }]
  const file: ApiDataResponse = {
    meta: { lastScraperRun: EPOCH, gasPrice: 4, nationalMpg: 28, gasPriceUpdatedAt: EPOCH },
    dispensaries: [
      {
        id: 'remedy-tulalip',
        name: 'Remedy Tulalip',
        url: 'https://example.test',
        distanceMiles: 1,
        stale: true,
        lastFetchedAt: EPOCH,
        deals: prior,
      },
    ],
  }
  writeFileSync(dataPath, JSON.stringify(file))
  return { dataPath, prior }
}

const read = (p: string): ApiDataResponse => JSON.parse(readFileSync(p, 'utf-8'))

describe('applyIngest', () => {
  it('applies accepted deals: replaces deals, clears stale, bumps timestamps (ok)', async () => {
    const { dataPath } = seed()

    const results = await applyIngest([{ dispensaryId: 'remedy-tulalip', deals: [validDeal] }], dataPath)

    expect(results).toEqual({ 'remedy-tulalip': 'ok' })
    const after = read(dataPath).dispensaries[0]
    expect(after.deals).toEqual([validDeal])
    expect(after.stale).toBe(false)
    expect(after.lastFetchedAt).not.toBe(EPOCH)
    expect(read(dataPath).meta.lastScraperRun).not.toBe(EPOCH)
  })

  it('never overwrites good data when deals normalize to empty (stale)', async () => {
    const { dataPath, prior } = seed()

    const results = await applyIngest([{ dispensaryId: 'remedy-tulalip', deals: [invalidDeal] }], dataPath)

    expect(results).toEqual({ 'remedy-tulalip': 'stale' })
    const after = read(dataPath)
    expect(after.dispensaries[0].deals).toEqual(prior) // untouched
    expect(after.dispensaries[0].lastFetchedAt).toBe(EPOCH) // untouched
    expect(after.dispensaries[0].stale).toBe(true)
    expect(after.meta.lastScraperRun).toBe(EPOCH) // not bumped — nothing accepted
  })

  it('reports an unknown dispensary and writes nothing', async () => {
    const { dataPath } = seed()
    const before = readFileSync(dataPath, 'utf-8')

    const results = await applyIngest([{ dispensaryId: 'no-such-store', deals: [validDeal] }], dataPath)

    expect(results).toEqual({ 'no-such-store': 'unknown' })
    expect(readFileSync(dataPath, 'utf-8')).toBe(before) // byte-for-byte unchanged
  })

  it('handles a mixed batch with partial success', async () => {
    const { dataPath } = seed()

    const results = await applyIngest(
      [
        { dispensaryId: 'remedy-tulalip', deals: [validDeal] },
        { dispensaryId: 'no-such-store', deals: [validDeal] },
      ],
      dataPath,
    )

    expect(results).toEqual({ 'remedy-tulalip': 'ok', 'no-such-store': 'unknown' })
    expect(read(dataPath).dispensaries[0].stale).toBe(false)
  })

  it('serializes concurrent writes through the data lock (no torn file)', async () => {
    const { dataPath } = seed()

    const [r1, r2] = await Promise.all([
      applyIngest([{ dispensaryId: 'remedy-tulalip', deals: [validDeal] }], dataPath),
      applyIngest([{ dispensaryId: 'remedy-tulalip', deals: [validDeal] }], dataPath),
    ])

    expect(r1).toEqual({ 'remedy-tulalip': 'ok' })
    expect(r2).toEqual({ 'remedy-tulalip': 'ok' })
    // file is still valid JSON and consistent after interleaved runs
    expect(read(dataPath).dispensaries[0].deals).toEqual([validDeal])
  })
})

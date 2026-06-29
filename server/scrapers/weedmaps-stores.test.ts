import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { inWaBounds } from '../scripts/geocodeStores.js'
import { WEEDMAPS_STORES, weedmapsProductScrapers } from './weedmaps-stores.js'
import type { ApiDataResponse } from '../../client/src/types/index.js'

// ─────────────────────────────────────────────────────────────────────────────
// GUARD RAIL for the PRIVATE Weedmaps roster — the same WA-only integrity net as
// storeRegistry.test.ts, applied to the second source. It enforces (at PR time, not
// runtime — preserves ADR-043 deals-first decoupling): every net-new Weedmaps store is
// geo-verified inside Washington; overlap stores reuse an id that actually exists in
// data.json (so the matcher reconciles, not self-disparates); net-new ids stay PRIVATE
// (absent from the public data.json feed — story AC8); ids + slugs are unique.
//
// This is exactly where the One Hit Wonder mis-mapping (labeled "Bellingham", actually
// Port Townsend/Silverdale) and the liv-ferndale Michigan store would fail at review.
// ─────────────────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const data: ApiDataResponse = JSON.parse(
  readFileSync(path.join(__dirname, '../data/data.json'), 'utf-8'),
)
const dataIds = new Set(data.dispensaries.map((d) => d.id))

const netNew = WEEDMAPS_STORES.filter((s) => !s.overlap)
const overlaps = WEEDMAPS_STORES.filter((s) => s.overlap)

describe('weedmaps private store registry integrity', () => {
  it('every net-new store has finite lat/lng inside Washington', () => {
    const offenders = netNew
      .filter((s) => !(Number.isFinite(s.lat) && Number.isFinite(s.lng) && inWaBounds(s.lat as number, s.lng as number)))
      .map((s) => s.dispensaryId)
    expect(offenders, `not WA-geocoded: ${offenders.join(', ')}`).toEqual([])
  })

  it('every overlap store reuses an id that exists in data.json (so it reconciles, not self-disparates)', () => {
    const missing = overlaps.filter((s) => !dataIds.has(s.dispensaryId)).map((s) => s.dispensaryId)
    expect(missing, `overlap id absent from data.json: ${missing.join(', ')}`).toEqual([])
  })

  it('net-new stores stay PRIVATE — their ids are NOT in the public data.json feed (AC8)', () => {
    const leaked = netNew.filter((s) => dataIds.has(s.dispensaryId)).map((s) => s.dispensaryId)
    expect(leaked, `net-new id surfaced in data.json: ${leaked.join(', ')}`).toEqual([])
  })

  it('dispensary ids are unique across the roster', () => {
    const ids = WEEDMAPS_STORES.map((s) => s.dispensaryId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('weedmaps slugs are unique', () => {
    const slugs = WEEDMAPS_STORES.map((s) => s.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('overlap stores omit coords (they inherit data.json) and carry no stray coords', () => {
    expect(overlaps.every((s) => s.lat === undefined && s.lng === undefined)).toBe(true)
  })

  it('every registered scraper id maps to a roster store', () => {
    const rosterIds = new Set(WEEDMAPS_STORES.map((s) => s.dispensaryId))
    const orphan = Object.keys(weedmapsProductScrapers).filter((id) => !rosterIds.has(id))
    expect(orphan).toEqual([])
    expect(Object.keys(weedmapsProductScrapers).length).toBe(WEEDMAPS_STORES.length)
  })
})

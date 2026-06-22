import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { inWaBounds } from '../scripts/geocodeStores.js'
import { DUTCHIE_STORE_IDS } from './dutchie-stores.js'
import type { ApiDataResponse } from '../../client/src/types/index.js'

// ─────────────────────────────────────────────────────────────────────────────
// GUARD RAIL: keep out-of-state stores off the list (added 2026-06-22 after
// `liv-ferndale` — LIV Cannabis in Ferndale, MICHIGAN — was found seeded into
// this Washington-only app, scraped hourly, and forever uncoordable).
//
// This is a DATA-INTEGRITY test, deliberately NOT a runtime filter: it runs in
// CI over the committed seed, so it cannot silently hide a store from users or
// break the ADR-043 deals-first decoupling (a store still renders without
// distance at runtime). The rule it enforces is simply: every store we ship is
// geo-verified to sit inside Washington. An out-of-state store fails here at PR
// time, exactly where `liv-ferndale` should have been caught.
//
// Adding a legitimate WA store stays a normal flow: add the row + registry id,
// run `npx tsx server/scripts/geocodeStores.ts` to commit its WA coords, done.
// A store that cannot geocode to WA bounds simply does not belong on the list.
// ─────────────────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const data: ApiDataResponse = JSON.parse(
  readFileSync(path.join(__dirname, '../data/data.json'), 'utf-8'),
)
const dispensaries = data.dispensaries
const ids = new Set(dispensaries.map((d) => d.id))

describe('store registry / seed data integrity', () => {
  it('every store has finite lat/lng that sit inside Washington (no out-of-state stores)', () => {
    const offenders = dispensaries
      .filter((d) => !(Number.isFinite(d.lat) && Number.isFinite(d.lng) && inWaBounds(d.lat as number, d.lng as number)))
      .map((d) => d.id)
    expect(offenders, `not WA-geocoded: ${offenders.join(', ')}`).toEqual([])
  })

  it('store ids are unique', () => {
    expect(ids.size).toBe(dispensaries.length)
  })

  it('every Dutchie registry id refers to a store that exists in the seed (no orphan scrape targets)', () => {
    const orphans = DUTCHIE_STORE_IDS.filter((id) => !ids.has(id))
    expect(orphans, `registered to scrape but absent from data.json: ${orphans.join(', ')}`).toEqual([])
  })

  it('liv-ferndale (the Michigan store) is gone', () => {
    expect(ids.has('liv-ferndale')).toBe(false)
  })
})

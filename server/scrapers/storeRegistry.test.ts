import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { inWaBounds } from '../scripts/geocodeStores.js'
import { DUTCHIE_STORE_IDS, dutchieProductScrapers } from './dutchie-stores.js'
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
//
// THE `url` FIELD — use the right method (ADR-068, after the-vault-silvana 404'd):
// the card link is `Dispensary.url`, shown to users. Do NOT synthesize it as
// `dutchie.com/dispensary/<id>` from the registry id — that is a SLUG GUESS that
// renders fine (isLinkableUrl only checks syntax) but can silently 404 / hit
// Dutchie's location-state glitch. Instead:
//   1. Prefer the store's OWN official site — its location-specific page for a
//      multi-location chain (e.g. thevaultcannabis.com/silvana/), like the
//      original stores. This is immune to Dutchie slug/state breakage.
//   2. Only fall back to the Dutchie slug when no clean own-page exists (generic
//      multi-location homepage) AND the slug is verified live.
//   3. ALWAYS verify before committing — run, from a RESIDENTIAL IP (Dutchie
//      403-walls datacenters/CI): `npx tsx server/scripts/checkStoreLinks.ts`
//      (0 broken required).
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

  // ADR-053 / Item 3 (2026-06-24): the three original Dutchie stores were excluded from
  // product scraping because their readable id ≠ embed cName. They are now wired via
  // ORIGINAL_DUTCHIE_PRODUCT_CNAMES (registered under the readable id, scraped by cName).
  it('the three original Dutchie stores are registered for product scraping', () => {
    for (const id of ['the-joint-everett', 'jet-cannabis-everett', 'kush21-everett-evergreen']) {
      expect(dutchieProductScrapers[id], `missing product scraper: ${id}`).toBeTypeOf('function')
    }
  })

  it('every product-scraper id refers to a store that exists in the seed (no orphan targets)', () => {
    const orphans = Object.keys(dutchieProductScrapers).filter((id) => !ids.has(id))
    expect(orphans, `product-scrape targets absent from data.json: ${orphans.join(', ')}`).toEqual([])
  })
})

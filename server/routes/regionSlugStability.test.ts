import { describe, it, expect } from 'vitest'
import { readRegions } from './compareRoute.js'

// SLUG-STABILITY GUARD (ADR-111, AC5 of geo-page-sitemap-durability).
//
// A region's URL family (/compare/<region> + /compare/<category>/<region>) is named
// after the cluster's DOMINANT (modal) member city (regionModel.dominantCity). That
// name is a function of the COMMITTED cluster membership only — the request-time
// freshness overlay never changes it — so it is stable day-to-day. BUT a future daily
// re-cluster (a boundary store gaining/losing geo, or membership shifting the modal
// city) could FLIP a region's dominant city, silently renaming the whole URL family and
// 404-ing every previously-indexed URL for it.
//
// This test pins the live region slug set. On a real flip it FAILS LOUDLY so a human
// ratifies the rename AND adds a 301/alias from the old slugs before the old URLs die
// (the redirect machinery is intentionally NOT built yet — see deferred-work.md). Do NOT
// "fix" a failure by blindly editing EXPECTED_REGION_SLUGS: confirm the rename is real,
// wire the redirect, THEN update the snapshot.
//
// Because the fix decoupled URL existence from freshness, this set is deterministic
// regardless of when the test runs (store staleness no longer drops a region/category).
const EXPECTED_REGION_SLUGS = ['bellingham', 'everett', 'mount-vernon']

describe('region slug stability (committed-membership snapshot)', () => {
  it('serves exactly the ratified region slugs from the committed derived data', () => {
    const { regions } = readRegions()
    const slugs = regions.map((r) => r.slug).sort((a, b) => a.localeCompare(b))
    expect(slugs).toEqual(EXPECTED_REGION_SLUGS)
  })

  it('every region exposes at least one category → a resolvable /compare/<cat>/<region> URL', () => {
    const { regions } = readRegions()
    // A region with zero categories would still emit a hub URL but no category pages;
    // the live clusters all carry the 4 WA categories, so each must have ≥1.
    for (const r of regions) {
      expect(r.categories.length).toBeGreaterThan(0)
    }
  })
})

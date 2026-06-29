import { fetchWeedmapsMenu } from './_weedmaps.js'
import type { RawProduct } from '../types/index.js'

// PRIVATE Weedmaps store roster (AI-search Phase 2 — second source feeding the matcher).
// Each entry: the Weedmaps URL slug, the dispensaryId observations are recorded under, and
// (for net-new stores) committed WA coordinates.
//
// PRIVATE-ONLY (story AC8 + the "no public surfacing until Phase 4 / counsel" posture):
// net-new Weedmaps stores are deliberately NOT added to data.json / the public /api/data
// feed. They live here. The cross-store matcher resolves disparities by dispensaryId off
// products.json and needs no data.json entry; coordinates are committed for the future
// cheapest-DELIVERED / distance surfacing and are guarded WA-only by weedmaps-stores.test.ts
// (the same out-of-state guard rail that the liv-ferndale Michigan incident motivated).
//
// OVERLAP stores reuse the EXISTING data.json dispensaryId so the matcher reconciles the two
// sources (Dutchie + Weedmaps) as ONE physical store (B2 reconciliation, cheapest offer wins)
// — never a false self-disparity. Overlaps inherit their coords from data.json (omit here).
//
// Coordinates: dev-time OSM-Nominatim geocode (2026-06-29) of each store's sourced street
// address; verified inside WA bounds. Addresses sourced from each operator's site / Yelp /
// Weedmaps listing (cited inline), mirroring server/scripts/geocodeStores.ts STORE_ADDRESSES.

export interface WeedmapsStore {
  slug: string // weedmaps.com/dispensaries/<slug>
  dispensaryId: string // products.json key; reuses an existing data.json id for overlaps
  overlap: boolean // true = same physical store already in data.json (reuse its id + coords)
  lat?: number // net-new stores carry committed WA coords; overlaps inherit data.json's
  lng?: number
}

export const WEEDMAPS_STORES: WeedmapsStore[] = [
  // ── overlaps — reuse existing data.json ids (coords already live in data.json) ──
  { slug: '2020-solutions-pacific-highway', dispensaryId: '2020-solutions-pacific-highway', overlap: true },
  { slug: '2020-solutions-recreational-north-bellingham', dispensaryId: '2020-solutions-north-bellingham', overlap: true },
  { slug: 'traditional-biologics-company-dba-remedy-tulalip', dispensaryId: 'remedy-tulalip', overlap: true },

  // ── net-new (private; WA coords committed + guarded) ──
  // 20291 State Route 20, Burlington, WA 98233 (westernbud.com / Yelp)
  { slug: 'western-bud-skagit-valley-wa', dispensaryId: 'western-bud-burlington', overlap: false, lat: 48.483114, lng: -122.307298 },
  // 9574 Old Hwy 99 N, Burlington, WA 98233 (caravan-cannabis.com / washingtonweedstores)
  { slug: 'caravan-cannabis-company-skagit-county', dispensaryId: 'caravan-cannabis-burlington', overlap: false, lat: 48.506397, lng: -122.337338 },
  // 33858 State Route 20, Oak Harbor, WA 98277 (kaleafa.com / Yelp / Waze)
  { slug: 'kaleafa-cannabis-company', dispensaryId: 'kaleafa-oak-harbor', overlap: false, lat: 48.3155, lng: -122.632917 },
  // 1309 236th St NE, Arlington, WA 98223 (210cannabisco.com / Yelp)
  { slug: '210-cananbis-company', dispensaryId: '210-cannabis-arlington', overlap: false, lat: 48.20922, lng: -122.060227 },
  // 5200 172nd St NE, Ste F101, Arlington, WA 98223 (prcwa.com / Yelp)
  { slug: '221-inc', dispensaryId: 'prc-arlington', overlap: false, lat: 48.151669, lng: -122.161267 },
  // Anacortes / Fidalgo (Swinomish), WA 98221 — APPROXIMATE: exact street unconfirmed in
  // sourcing (northwindcannabis.com); coord is the Anacortes-area Nominatim match, in WA bounds.
  { slug: 'northwind-cannabis', dispensaryId: 'northwind-anacortes', overlap: false, lat: 48.476025, lng: -122.65864 },
  // 14608 Hwy 99 #304, Lynnwood, WA 98087 (agreenertoday.com / Yelp)
  { slug: 'puget-sound-marijuana-recreational-21', dispensaryId: 'a-greener-today-lynnwood', overlap: false, lat: 47.865948, lng: -122.280987 },
  // 20925 Cypress Way, Lynnwood, WA 98036 (euphorium502.com / Yelp)
  { slug: 'euphorium-2-2', dispensaryId: 'euphorium-lynnwood', overlap: false, lat: 47.80843, lng: -122.259388 },

  // ── deferred (slug→store mapping unresolved) ──
  // One Hit Wonder Cannabis (slug `one-hit-wonder-cannabis`): the source file labeled it
  // "Bellingham", but its real locations are Port Townsend + Silverdale and the slug does not
  // disambiguate which. Omitted from v1 until the slug→physical-store mapping is confirmed
  // (omit-don't-guess; same discipline that caught the liv-ferndale out-of-state store).
]

// PRODUCT scrapers keyed by dispensaryId (a SEPARATE registry from dutchieProductScrapers,
// returning RawProduct[] from the static Weedmaps fetch). The throttled run (scrapeWeedmapsRun)
// iterates these; overlap ids that also appear in dutchieProductScrapers are NOT a collision —
// the two registries run in separate workflows and merge only as observations in products.json.
export const weedmapsProductScrapers: Record<string, () => Promise<RawProduct[]>> = Object.fromEntries(
  WEEDMAPS_STORES.map((s) => [
    s.dispensaryId,
    () => fetchWeedmapsMenu(s.slug, { label: s.dispensaryId }),
  ]),
)

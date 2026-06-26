import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import axios from 'axios'
import { atomicWriteJson } from '../utils/atomicWrite.js'
import type { ApiDataResponse, Dispensary } from '../../client/src/types/index.js'

// Dev-time, run-once geocoder (ADR-044, User-Relative Positioning #1). Resolves
// each store's street address to lat/lng via free OpenStreetMap Nominatim (no key,
// no runtime dependency) and writes the coords into the COMMITTED data.json — the
// real deliverable, because Render's disk is ephemeral and resets to the committed
// seed on every redeploy. Coords survive cron ingests: applyIngest mutates records
// in place by id, touching only deals/lastFetchedAt/stale. Idempotent — only fills
// records that have no coords yet, so re-running is a no-op.
//
// Run: npx tsx server/scripts/geocodeStores.ts

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_PATH = path.join(__dirname, '../data/data.json')

// id -> full street address. DEV INPUT ONLY — never a runtime schema field;
// nothing at runtime reads this map. Sourced 2026-06-21 from each store's own
// site / public listing (Yelp, the operator's site, Dutchie store-locator).
// An entry that cannot be confidently sourced is OMITTED (not guessed) so the
// run flags it rather than committing a wrong coordinate (Honest Math, ADR-007/009).
export const STORE_ADDRESSES: Record<string, string> = {
  // — original 4 (retiring the fixed-origin 98270 distance, ADR-008/011) —
  'remedy-tulalip': '9226 34th Avenue NE, Tulalip, WA 98271', // Tulalip reservation; Yelp/loc8nearme
  'kush21-everett-evergreen': '8911 Evergreen Way, Everett, WA 98208', // Waze/operator
  'the-joint-everett': '9506 19th Ave SE, Everett, WA 98208', // thejointllc.com / Yelp
  'jet-cannabis-everett': '13224 Highway 99, Everett, WA 98204', // jetcannabisco.com / Yelp
  // — Skagit / Stanwood / Camano —
  'happy-time-mt-vernon': '200 Suzanne Ln, Mount Vernon, WA 98273', // happytimeweed.com / Yelp
  'cannazone-old-hwy-99': '3010 Old Hwy 99 S, Mount Vernon, WA 98273', // Yelp (Old Hwy 99 location)
  'sweet-relief-mt-vernon': '14637 State Route 20, Mount Vernon, WA 98273', // AllBud / operator
  'cannazone-mt-vernon': '17905 State Route 536, Mount Vernon, WA 98273', // Yelp "West Side" / Dutchie WA-536
  'the-vault-silvana': '1323 Pioneer Highway, Stanwood, WA 98292', // thevaultcannabis.com/silvana
  'bud-hut-camano-island': '1137 State Route 532, Camano, WA 98282', // budhut.net / Yelp
  // — Everett / Lynnwood —
  'kushmart-north': '6309 Evergreen Way, Everett, WA 98203', // Yelp (now Kush21 Everett North)
  'local-roots-everett-128th': '517 128th Street SW, Everett, WA 98204', // mylocalroots.com / Yelp
  'hangar-420-everett': '14221 Lake Rd, Everett, WA 98087', // hangar420wa.com store locator (Everett)
  'hangar-420-west': '15919 Highway 99, Lynnwood, WA 98087', // hangar420wa.com store locator (Lynnwood / "West")
  // — Whatcom / Bellingham —
  'evolve-cannabis-bellingham': '4712 Pacific Hwy, Bellingham, WA 98226', // evolvewashington.com / Yelp
  'cannazone-bellingham': '5655 Guide Meridian Road, Bellingham, WA 98226', // Yelp / washingtonweedstores
  '2020-solutions-north-bellingham': '1706 Mt Baker Hwy, Bellingham, WA 98226', // 2020-solutions.com Mt Baker (the "North Bellingham" store)
  '2020-solutions-pacific-highway': '4770 Pacific Hwy, Bellingham, WA 98226', // 2020-solutions.com Pacific Hwy
  'starbuds-bellingham': '145 N Samish Way, Bellingham, WA 98225', // starbud.com / Yelp
  'salish-coast-cannabis': '12947 Casino Drive, Anacortes, WA 98221', // salishcoastcannabis.com/contact (Anacortes, NOT Port Townsend)
}

// Building-precision coordinates that OSM Nominatim cannot derive because the
// street address's house number is absent from OSM (rural / highway / reservation
// addresses). Each is verified from an authoritative source and CITED, then
// committed so the run stays reproducible without a paid geocoder. Checked before
// the Nominatim path; an entry here short-circuits the address lookup for its id.
// This is not fabrication (Honest Math, ADR-007/009) — each coord is sourced.
export const VERIFIED_COORDS: Record<string, { lat: number; lng: number }> = {
  'remedy-tulalip': { lat: 48.0803125, lng: -122.1861767 }, // OSM POI "Remedy Tulalip" (reverse-geocode confirmed), Quil Ceda Village
  'bud-hut-camano-island': { lat: 48.2399961, lng: -122.4212191 }, // Google Maps place pin "Bud Hut Camano Island"
  'local-roots-everett-128th': { lat: 47.8826827, lng: -122.240823 }, // Google Maps place pin "Local Roots Cannabis in Everett"
  'cannazone-bellingham': { lat: 48.846368, lng: -122.486043 }, // greentripz embedded Google Maps coord, 5655 Guide Meridian
}

// Stores knowingly left uncoorded by an explicit human call (NOT a geocode
// failure), so the exit code stays meaningful: the run fails only on an
// UNEXPECTED miss. Add an id here only with a justification; currently empty —
// every listed store geocodes to a real WA coordinate (enforced by the
// data.json WA-bounds integrity test, server/scrapers/storeRegistry.test.ts).
// (liv-ferndale was removed 2026-06-22: it was LIV Cannabis in Ferndale,
// MICHIGAN — an out-of-state store that never belonged in this WA list.)
export const EXPECTED_UNCOORDED = new Set<string>([])

// Rough WA bounding box — rejects an out-of-state mis-geocode (e.g. a homonym
// resolving to Ferndale, MI) before it can poison the data.
export function inWaBounds(lat: number, lng: number): boolean {
  return lat >= 45.5 && lat <= 49.0 && lng >= -124.85 && lng <= -116.9
}

// Idempotent merge: writes coords ONLY when the record has none. Returns whether
// it wrote, so the caller knows when a re-run is a true no-op.
export function mergeCoords(
  record: Pick<Dispensary, 'lat' | 'lng'>,
  coords: { lat: number; lng: number },
): boolean {
  // Number.isFinite (not typeof) so a stray NaN/Infinity on a prior bad write is
  // re-resolved rather than mistaken for an already-geocoded record.
  if (Number.isFinite(record.lat) && Number.isFinite(record.lng)) return false
  record.lat = coords.lat
  record.lng = coords.lng
  return true
}

// Minimal injectable GET so the parse logic is unit-testable without a network call.
export type HttpGet = (
  url: string,
  config: { params: Record<string, unknown>; headers: Record<string, string>; timeout: number },
) => Promise<{ data: unknown }>

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
// Nominatim usage policy requires an identifying User-Agent.
const USER_AGENT = 'gmas-helper-geocoder/1.0 (https://gmaslist.com; erikchvac@gmail.com)'

export async function geocode(
  address: string,
  get: HttpGet = axios.get as unknown as HttpGet,
): Promise<{ lat: number; lng: number } | null> {
  const res = await get(NOMINATIM_URL, {
    params: { format: 'json', limit: 1, countrycodes: 'us', q: address },
    headers: { 'User-Agent': USER_AGENT },
    timeout: 30000,
  })
  const rows = res.data as Array<{ lat?: string; lon?: string }>
  if (!Array.isArray(rows) || rows.length === 0) return null
  const row = rows[0]
  // A non-object first element (e.g. Nominatim served [null] or an HTML error
  // body parsed oddly) is "no usable result", not a transport error to retry.
  if (row === null || typeof row !== 'object') return null
  const lat = Number(row.lat)
  const lng = Number(row.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function main(): Promise<void> {
  const file: ApiDataResponse = JSON.parse(readFileSync(DATA_PATH, 'utf-8'))
  const unresolved: string[] = []
  let wrote = 0

  for (const store of file.dispensaries) {
    if (Number.isFinite(store.lat) && Number.isFinite(store.lng)) {
      console.log(`skip  ${store.id} (already geocoded)`)
      continue
    }

    // Verified-coord override (OSM lacks the house number) takes precedence over
    // the Nominatim address lookup.
    const override = VERIFIED_COORDS[store.id]
    if (override !== undefined) {
      if (!inWaBounds(override.lat, override.lng)) {
        console.error(`FAIL  ${store.id}: verified coord is outside WA bounds — fix VERIFIED_COORDS`)
        unresolved.push(store.id)
        continue
      }
      if (mergeCoords(store, override)) {
        wrote++
        console.log(`ok    ${store.id} -> ${override.lat},${override.lng} (verified override)`)
      }
      continue
    }

    const address = STORE_ADDRESSES[store.id]
    if (address === undefined) {
      console.warn(`WARN  ${store.id}: no address in STORE_ADDRESSES — leaving uncoorded`)
      unresolved.push(store.id)
      continue
    }

    let coords: { lat: number; lng: number } | null = null
    try {
      coords = await geocode(address)
    } catch (err) {
      // Nominatim 429 / transient network: back off once, then retry.
      console.warn(`retry ${store.id}: ${(err as Error).message}`)
      await sleep(2000)
      try {
        coords = await geocode(address)
      } catch (err2) {
        console.error(`FAIL  ${store.id}: ${(err2 as Error).message}`)
        unresolved.push(store.id)
        await sleep(1100)
        continue
      }
    }
    // Respect Nominatim's >=1 req/sec policy.
    await sleep(1100)

    if (coords === null) {
      console.warn(`WARN  ${store.id}: no Nominatim result for "${address}" — leaving uncoorded`)
      unresolved.push(store.id)
      continue
    }
    if (!inWaBounds(coords.lat, coords.lng)) {
      console.warn(
        `WARN  ${store.id}: ${coords.lat},${coords.lng} is outside WA bounds (likely a wrong match) — leaving uncoorded`,
      )
      unresolved.push(store.id)
      continue
    }
    if (mergeCoords(store, coords)) {
      wrote++
      console.log(`ok    ${store.id} -> ${coords.lat},${coords.lng}`)
    }
  }

  if (wrote > 0) {
    atomicWriteJson(DATA_PATH, file)
    console.log(`\nWrote coords for ${wrote} store(s).`)
  } else {
    console.log('\nNo new coords written.')
  }

  // Flag dead map entries — a typo'd id silently no-ops otherwise (never matched
  // a store, so it never geocoded anything).
  const ids = new Set(file.dispensaries.map((d) => d.id))
  for (const key of [...Object.keys(STORE_ADDRESSES), ...Object.keys(VERIFIED_COORDS)]) {
    if (!ids.has(key)) console.warn(`WARN  map entry "${key}" matches no store id`)
  }

  // Split known-deferred stores from real failures so the exit code is honest:
  // exit non-zero ONLY on an unexpected miss, not on a store we chose to skip.
  const expected = unresolved.filter((id) => EXPECTED_UNCOORDED.has(id))
  const unexpected = unresolved.filter((id) => !EXPECTED_UNCOORDED.has(id))
  if (expected.length > 0) {
    console.log(`\nExpected-uncoorded (known, not a failure): ${expected.join(', ')}`)
  }
  if (unexpected.length > 0) {
    console.error(`\n${unexpected.length} store(s) unexpectedly uncoorded: ${unexpected.join(', ')}`)
    process.exit(1)
  }
  console.log('\nAll resolvable stores geocoded.')
}

// Only run the network/IO path when executed directly, so importing this module
// in tests (for the pure helpers) has no side effects.
const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  void main()
}

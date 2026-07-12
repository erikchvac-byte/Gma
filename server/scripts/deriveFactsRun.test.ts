import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { deriveFacts } from './deriveFactsRun.js'
import { openProductsDb, importProductsFile } from '../utils/productsDb.js'
import type { ProductRecord, ProductsFile } from '../types/index.js'

function rec(over: Partial<ProductRecord> & Pick<ProductRecord, 'productId' | 'dispensaryId'>): ProductRecord {
  return {
    name: 'Blue Dream',
    category: 'Flower',
    brand: 'Acme',
    strainType: 'hybrid',
    packCount: null,
    flags: [],
    history: [
      {
        observedAt: '2026-07-01T00:00:00.000Z',
        special: false,
        options: [
          {
            option: '3.5g',
            weightGrams: null,
            basePrice: 40,
            specialPrice: null,
            pricePerGram: null,
            pricePerItem: null,
            specialPricePerGram: null,
            specialPricePerItem: null,
            quantityAvailable: null,
          },
        ],
      },
    ],
    ...over,
  }
}

function populatedFile(): ProductsFile {
  return {
    lastUpdated: '2026-07-01T00:00:00.000Z',
    products: {
      'store-a::bd': rec({ productId: 'bd', dispensaryId: 'store-a' }),
      'store-b::bd': rec({ productId: 'bd', dispensaryId: 'store-b' }),
    },
  }
}

describe('deriveFacts (ADR-077 Phase 1 regression guard)', () => {
  let dir: string
  let dbPath: string
  let derivedDir: string
  let dataPath: string

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'derive-'))
    dbPath = path.join(dir, 'products.db')
    derivedDir = path.join(dir, 'derived')
    dataPath = path.join(dir, 'data.json')
    writeFileSync(dataPath, JSON.stringify({ dispensaries: [] }), 'utf-8')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('writes derived facts from a populated DB, envelope-shaped (derivation-1.1)', () => {
    const db = openProductsDb(dbPath)
    importProductsFile(db, populatedFile())
    db.close()

    const outcome = deriveFacts({ dbPath, dataPath, derivedDir })
    expect(outcome.totalRecords).toBe(2)

    const written = JSON.parse(readFileSync(outcome.disparitiesPath, 'utf-8'))
    expect(written.data.totalRecords).toBe(2)
    expect(Array.isArray(written.excluded)).toBe(true)
    expect(typeof written.coverage).toBe('object')
    expect(typeof written.generatedAt).toBe('string')

    const dealScopeWritten = JSON.parse(readFileSync(outcome.dealScopePath, 'utf-8'))
    expect(typeof dealScopeWritten.data.totalDeals).toBe('number')
    expect(Array.isArray(dealScopeWritten.excluded)).toBe(true)
    expect(typeof dealScopeWritten.coverage).toBe('object')
    expect(typeof dealScopeWritten.generatedAt).toBe('string')

    const extractionHealthWritten = JSON.parse(readFileSync(outcome.extractionHealthPath, 'utf-8'))
    expect(Array.isArray(extractionHealthWritten.data.entries)).toBe(true)
    expect(typeof extractionHealthWritten.data.totalStores).toBe('number')
    expect(Array.isArray(extractionHealthWritten.excluded)).toBe(true)
    expect(typeof extractionHealthWritten.coverage).toBe('object')
    expect(typeof extractionHealthWritten.generatedAt).toBe('string')
    // store-a/store-b (this fixture's dispensaryIds) aren't in the real product-scraper
    // roster, so every entry in the real roster is a zero-history store here — proving a
    // roster store absent from productsFile.products degrades to insufficient-history, not a
    // throw (derivation-1.2.5 AC1/AC5).
    expect(extractionHealthWritten.data.entries.length).toBeGreaterThan(0)
    expect(extractionHealthWritten.data.entries.every((e: { status: string }) => e.status === 'insufficient-history')).toBe(true)

    const specialEventsWritten = JSON.parse(readFileSync(outcome.specialEventsPath, 'utf-8'))
    expect(Array.isArray(specialEventsWritten.data.events)).toBe(true)
    expect(typeof specialEventsWritten.data.totalProducts).toBe('number')
    expect(Array.isArray(specialEventsWritten.excluded)).toBe(true)
    expect(typeof specialEventsWritten.coverage).toBe('object')
    expect(typeof specialEventsWritten.generatedAt).toBe('string')
    // populatedFile()'s two records each have a single observation dated 2026-07-01 (special:
    // false), well before the real wall-clock `today` this test runs with — every entry is a
    // 'gap' today, proving the wiring reaches the pure function without throwing (derivation-1.3).
    expect(specialEventsWritten.data.gapCount).toBe(2)
    expect(specialEventsWritten.data.events).toHaveLength(0)

    // derivation-1.4: store-a/store-b (fixture-only ids, absent from data.json AND the real
    // WEEDMAPS_STORES registry) form exactly one disparity row (same Blue Dream/Acme/3.5g key
    // across 2 stores) — proving the rollup wiring reaches the pure function without throwing.
    const rollupsWritten = JSON.parse(readFileSync(outcome.disparityRollupsPath, 'utf-8'))
    expect(rollupsWritten.data.totalDisparities).toBe(1)
    expect(rollupsWritten.data.byCategory).toHaveLength(1)
    expect(rollupsWritten.data.byStore).toHaveLength(2)
    expect(rollupsWritten.data.missingGeoCount).toBe(2) // neither fixture store resolves geo
    expect(Array.isArray(rollupsWritten.excluded)).toBe(true)
    expect(typeof rollupsWritten.coverage).toBe('object')
    expect(typeof rollupsWritten.generatedAt).toBe('string')

    // derivation-1.5: populatedFile()'s two records are both brand 'Acme', special:false, one
    // observed day each → one normalized brand 'acme' with 2 observed product-days (< the
    // MIN_OBSERVED_PRODUCT_DAYS=10 floor) → insufficient-history, and zero null-brand products.
    // Proves the projection + wiring reach the pure function without throwing.
    const brandPersonasWritten = JSON.parse(readFileSync(outcome.brandPersonasPath, 'utf-8'))
    expect(Array.isArray(brandPersonasWritten.data.personas)).toBe(true)
    expect(brandPersonasWritten.data.totalBrands).toBe(1)
    expect(brandPersonasWritten.data.personas[0].brandKey).toBe('acme')
    expect(brandPersonasWritten.data.personas[0].persona).toBe('insufficient-history')
    expect(brandPersonasWritten.data.personas[0].specialDayFraction).toBeNull()
    expect(brandPersonasWritten.data.nullBrandProductCount).toBe(0)
    expect(Array.isArray(brandPersonasWritten.excluded)).toBe(true)
    expect(typeof brandPersonasWritten.coverage).toBe('object')
    expect(typeof brandPersonasWritten.generatedAt).toBe('string')

    // derivation-1.6: populatedFile()'s two records are brand 'Acme' at store-a/store-b, both the
    // same 'Blue Dream' 3.5g product (basePrice 40) → one normalized brand 'acme' carried at 2
    // stores, and one like-for-like (matchKey, 3.5g) cell at 2 stores (a natural ≥2-store cheapest
    // cell). Proves the boundary projection (matchKey + canonicalWeightGrams + specialPrice ??
    // basePrice reduction) and the wiring reach the pure function without throwing.
    const matrixWritten = JSON.parse(readFileSync(outcome.brandStoreMatrixPath, 'utf-8'))
    expect(Array.isArray(matrixWritten.data.brands)).toBe(true)
    expect(matrixWritten.data.totalBrands).toBe(1)
    expect(matrixWritten.data.multiStoreBrandCount).toBe(1)
    expect(matrixWritten.data.nullBrandProductCount).toBe(0)
    expect(matrixWritten.data.unmatchedProductCount).toBe(0)
    const acme = matrixWritten.data.brands[0]
    expect(acme.brandKey).toBe('acme')
    expect(acme.storesCarrying).toEqual(['store-a', 'store-b'])
    expect(acme.tiers).toEqual([3.5])
    expect(acme.cheapestCells).toHaveLength(1)
    expect(acme.cheapestCells[0]).toMatchObject({ weightGrams: 3.5, lowPrice: 40, storesCarrying: 2 })
    expect(acme.cheapestCells[0].cheapestStores).toEqual(['store-a', 'store-b']) // tied at 40
    expect(matrixWritten.data.cheapestCellCount).toBe(1)
    expect(matrixWritten.excluded).toEqual([
      { reason: 'nullBrand', count: 0 },
      { reason: 'unmatchedProduct', count: 0 },
    ])
    expect(matrixWritten.coverage).toMatchObject({ totalBrands: 1, multiStoreBrandCount: 1, cheapestCellCount: 1 })
    expect(typeof matrixWritten.generatedAt).toBe('string')

    // derivation-1.7: populatedFile()'s store-a/store-b are fixture-only ids, absent from the real
    // product-scraper roster → every roster entry here is insufficient-history (asserted above), so
    // the storeStatus map built from extractionHealth.entries has NO 'ok' entry for either store.
    // Each record's single 2026-07-01 observation is a pre-`today` gap (not observed today) → a
    // dormancy candidate whose store is not `ok` → suppressed, never emitted. This proves the
    // store-health gate reaches the pure function through the real in-process wiring: dormantCount 0,
    // suppressedUnhealthyStoreCount 2. newArrivalCount 0 (today is a gap, never 'first').
    const nadWritten = JSON.parse(readFileSync(outcome.newArrivalDormancyPath, 'utf-8'))
    expect(Array.isArray(nadWritten.data.newArrivals)).toBe(true)
    expect(Array.isArray(nadWritten.data.dormant)).toBe(true)
    expect(nadWritten.data.dormantCount).toBe(0)
    expect(nadWritten.data.newArrivalCount).toBe(0)
    expect(nadWritten.data.suppressedUnhealthyStoreCount).toBe(2)
    expect(nadWritten.excluded).toEqual([
      { reason: 'suppressedUnhealthyStore', count: 2 },
      { reason: 'belowThreshold', count: 0 },
      { reason: 'onboardingStore', count: 0 },
    ])
    expect(nadWritten.coverage).toMatchObject({ totalProducts: 2, newArrivalCount: 0, dormantCount: 0 })
    expect(typeof nadWritten.generatedAt).toBe('string')
    expect(outcome.dormantCount).toBe(0)
    expect(outcome.newArrivalCount).toBe(0)
  })

  it('projection gates non-weight (Edible) and flag-poisoned records out of tiers/cells but keeps them in availability (derivation-1.6)', () => {
    // canonicalWeightGrams does NOT return null for mg/count labels ("100mg" → 0.1g), so the
    // projection must apply crossStoreValue's category gate (Gate 5) and flag gate (Gate 1) — else
    // an Edible priced by mg-THC would leak a bogus "$/gram" cheapest cell. A record dropped from
    // weight comparison must still count toward AVAILABILITY (its store stocks the brand).
    const opt100mg = {
      option: '100mg',
      weightGrams: null,
      basePrice: 15,
      specialPrice: null,
      pricePerGram: null,
      pricePerItem: null,
      specialPricePerGram: null,
      specialPricePerItem: null,
      quantityAvailable: null,
    }
    const products: Record<string, ProductRecord> = {
      // Same edible product/brand at 2 stores — a naive ungated matrix would emit a 0.1g cheapest cell.
      'store-e1::gum': rec({
        productId: 'gum',
        dispensaryId: 'store-e1',
        brand: 'Wyld',
        name: 'Raspberry Gummies',
        category: 'Edible',
        history: [{ observedAt: '2026-07-01T00:00:00.000Z', special: false, options: [opt100mg] }],
      }),
      'store-e2::gum': rec({
        productId: 'gum',
        dispensaryId: 'store-e2',
        brand: 'Wyld',
        name: 'Raspberry Gummies',
        category: 'Edible',
        history: [{ observedAt: '2026-07-01T00:00:00.000Z', special: false, options: [opt100mg] }],
      }),
      // Same flower product/brand at 2 stores, but weight flagged untrustworthy (Gate 1).
      'store-f1::mystery': rec({
        productId: 'mystery',
        dispensaryId: 'store-f1',
        brand: 'Fringe',
        name: 'Mystery Flower',
        flags: ['weight-mismatch'],
      }),
      'store-f2::mystery': rec({
        productId: 'mystery',
        dispensaryId: 'store-f2',
        brand: 'Fringe',
        name: 'Mystery Flower',
        flags: ['weight-mismatch'],
      }),
    }

    const db = openProductsDb(dbPath)
    importProductsFile(db, { lastUpdated: '2026-07-01', products })
    db.close()

    const outcome = deriveFacts({ dbPath, dataPath, derivedDir })
    const matrix = JSON.parse(readFileSync(outcome.brandStoreMatrixPath, 'utf-8')).data

    const wyld = matrix.brands.find((b: { brandKey: string }) => b.brandKey === 'wyld')
    expect(wyld.storesCarrying).toEqual(['store-e1', 'store-e2']) // IS stocked at both (availability)
    expect(wyld.tiers).toEqual([]) // but the mg label is no honest weight axis
    expect(wyld.cheapestCells).toEqual([]) // and NO bogus 0.1g cheapest cell leaks

    const fringe = matrix.brands.find((b: { brandKey: string }) => b.brandKey === 'fringe')
    expect(fringe.storesCarrying).toEqual(['store-f1', 'store-f2']) // still in availability
    expect(fringe.tiers).toEqual([]) // untrustworthy weight suppressed
    expect(fringe.cheapestCells).toEqual([])

    expect(matrix.cheapestCellCount).toBe(0)
    expect(matrix.unmatchedProductCount).toBe(0) // both have valid match-keys; suppressed, not unmatched
  })

  it('refuses to overwrite a previously-populated disparities.json with a zero-record result', () => {
    const db = openProductsDb(dbPath)
    importProductsFile(db, populatedFile())
    db.close()
    deriveFacts({ dbPath, dataPath, derivedDir }) // seeds a real, populated disparities.json (envelope-shaped)

    // Simulate a misconfigured/wrong PRODUCTS_DB_PATH: a fresh, empty DB at a different path.
    const emptyDbPath = path.join(dir, 'empty.db')
    openProductsDb(emptyDbPath).close()

    expect(() => deriveFacts({ dbPath: emptyDbPath, dataPath, derivedDir })).toThrow(/refusing to write/)

    // The previously-written (good) envelope must be untouched — the guard must correctly read
    // `.data.totalRecords` off the new envelope shape, not the old flat shape.
    const stillGood = JSON.parse(readFileSync(path.join(derivedDir, 'disparities.json'), 'utf-8'))
    expect(stillGood.data.totalRecords).toBe(2)
  })

  it('a genuinely empty DB with no prior derived file is not blocked (first-ever run)', () => {
    openProductsDb(dbPath).close()
    const outcome = deriveFacts({ dbPath, dataPath, derivedDir })
    expect(outcome.totalRecords).toBe(0)
  })

  it('extraction-health reaches ok/suspected-extraction-failure through the real wiring (derivation-1.2.5)', () => {
    // 'kush21-everett-evergreen' is a real id in the product-scraper roster (dutchie-stores.ts) —
    // using it here (rather than a fixture-only id) proves the runner's roster + `today`
    // computation reach a real non-insufficient-history verdict, not just the pure function in
    // isolation (extractionHealth.test.ts already covers that).
    const today = new Date().toISOString().slice(0, 10)
    const dayMs = 24 * 60 * 60 * 1000
    const dayStr = (offsetDays: number) => new Date(Date.now() + offsetDays * dayMs).toISOString().slice(0, 10)

    const products: Record<string, ProductRecord> = {}
    // 14 trailing days at 20 distinct products/day (baseline).
    for (let p = 0; p < 20; p++) {
      const history = []
      for (let i = 14; i >= 1; i--) {
        history.push({ observedAt: `${dayStr(-i)}T12:00:00.000Z`, special: false, options: [] })
      }
      products[`kush21-everett-evergreen::p${p}`] = rec({
        productId: `p${p}`,
        dispensaryId: 'kush21-everett-evergreen',
        history,
      })
    }
    // Today: only 5 of those 20 products observed (75% drop — well past the 50% threshold).
    for (let p = 0; p < 5; p++) {
      products[`kush21-everett-evergreen::p${p}`].history.push({
        observedAt: `${today}T12:00:00.000Z`,
        special: false,
        options: [],
      })
    }

    const db = openProductsDb(dbPath)
    importProductsFile(db, { lastUpdated: today, products })
    db.close()

    const outcome = deriveFacts({ dbPath, dataPath, derivedDir })
    expect(outcome.suspectedCount).toBeGreaterThanOrEqual(1)

    const written = JSON.parse(readFileSync(outcome.extractionHealthPath, 'utf-8'))
    const entry = written.data.entries.find((e: { dispensaryId: string }) => e.dispensaryId === 'kush21-everett-evergreen')
    expect(entry).toMatchObject({ status: 'suspected-extraction-failure', todayCount: 5, trailingMedian: 20 })
  })

  it('special-events reaches a real start/end transition through the real wiring (derivation-1.3)', () => {
    const today = new Date().toISOString().slice(0, 10)
    const dayMs = 24 * 60 * 60 * 1000
    const dayStr = (offsetDays: number) => new Date(Date.now() + offsetDays * dayMs).toISOString().slice(0, 10)

    const products: Record<string, ProductRecord> = {
      'store-a::starts-today': rec({
        productId: 'starts-today',
        dispensaryId: 'store-a',
        history: [
          { observedAt: `${dayStr(-1)}T12:00:00.000Z`, special: false, options: [] },
          { observedAt: `${today}T12:00:00.000Z`, special: true, options: [] },
        ],
      }),
      'store-a::ends-today': rec({
        productId: 'ends-today',
        dispensaryId: 'store-a',
        history: [
          { observedAt: `${dayStr(-1)}T12:00:00.000Z`, special: true, options: [] },
          { observedAt: `${today}T12:00:00.000Z`, special: false, options: [] },
        ],
      }),
    }

    const db = openProductsDb(dbPath)
    importProductsFile(db, { lastUpdated: today, products })
    db.close()

    const outcome = deriveFacts({ dbPath, dataPath, derivedDir })
    expect(outcome.startCount).toBe(1)
    expect(outcome.endCount).toBe(1)

    const written = JSON.parse(readFileSync(outcome.specialEventsPath, 'utf-8'))
    expect(written.data.events).toHaveLength(2)
    expect(written.data.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ productId: 'starts-today', type: 'special-start', date: today }),
        expect.objectContaining({ productId: 'ends-today', type: 'special-end', date: today }),
      ]),
    )
  })

  it('price-vs-own-median reaches a real below-median mover through the bounded window read, and excludes sold-out-today (derivation-2.1)', () => {
    const today = new Date().toISOString().slice(0, 10)
    const dayMs = 24 * 60 * 60 * 1000
    // Anchor every day string to the single captured `today` (not per-call Date.now()) so a UTC
    // midnight crossing mid-test can't desynchronize the fixture's "today" row from itself.
    const todayMs = Date.parse(`${today}T00:00:00.000Z`)
    const dayStr = (offsetDays: number) => new Date(todayMs + offsetDays * dayMs).toISOString().slice(0, 10)

    const opt = (option: string, price: number, quantityAvailable: number | null = null) => ({
      option,
      weightGrams: null,
      basePrice: price,
      specialPrice: null,
      pricePerGram: null,
      pricePerItem: null,
      specialPricePerGram: null,
      specialPricePerItem: null,
      quantityAvailable,
    })

    // 8 trailing days (offset −7..0=today). Option '3.5g': 40 for 7 days then 30 today → below own
    // median (median 40 → −25%), emitted. Option '7g': buyable at 80 for 7 days but SOLD OUT today
    // (quantityAvailable 0) → 7 usable history days clear the floor, but today's price is dropped at
    // the runner boundary (Gate 4), so it is noObservationToday, never compared.
    const history = []
    for (let i = 7; i >= 1; i--) {
      history.push({ observedAt: `${dayStr(-i)}T12:00:00.000Z`, special: false, options: [opt('3.5g', 40), opt('7g', 80)] })
    }
    history.push({ observedAt: `${today}T12:00:00.000Z`, special: false, options: [opt('3.5g', 30), opt('7g', 80, 0)] })

    const db = openProductsDb(dbPath)
    importProductsFile(db, {
      lastUpdated: today,
      products: { 'store-a::bd': rec({ productId: 'bd', dispensaryId: 'store-a', history }) },
    })
    db.close()

    const outcome = deriveFacts({ dbPath, dataPath, derivedDir })
    expect(outcome.priceComparedCount).toBe(1)
    expect(outcome.priceBelowMedianCount).toBe(1)

    const written = JSON.parse(readFileSync(outcome.priceVsOwnMedianPath, 'utf-8'))
    expect(written.data.rows).toHaveLength(1)
    expect(written.data.rows[0]).toMatchObject({
      dispensaryId: 'store-a',
      productId: 'bd',
      option: '3.5g',
      currentPrice: 30,
      medianPrice: 40,
      pctVsMedian: -0.25,
      observedDays: 8,
    })
    // the sold-out-today '7g' series cleared the floor but has no usable price today → not compared
    expect(written.data.noObservationTodayCount).toBe(1)
    expect(written.data.comparedCount).toBe(1)
    expect(written.excluded).toEqual([
      { reason: 'belowFloor', count: 0 },
      { reason: 'noObservationToday', count: 1 },
      { reason: 'atOwnMedian', count: 0 },
      { reason: 'noUsablePrice', count: 0 },
    ])
    expect(written.coverage).toMatchObject({ totalProducts: 1, totalSeries: 2, comparedCount: 1, belowMedianCount: 1, aboveMedianCount: 0 })
    expect(typeof written.generatedAt).toBe('string')
  })

  it('disparity-rollups geo merge reaches both the private WEEDMAPS_STORES registry and data.json through the real wiring (derivation-1.4)', () => {
    // 'western-bud-burlington' is a real non-overlap entry in WEEDMAPS_STORES (its own committed
    // coords, absent from data.json). 'store-only-in-datajson' is a fixture id present ONLY in
    // this test's own data.json fixture (never in the real WEEDMAPS_STORES). 'nowhere-store' is
    // in neither source. All three carry the same product so they land in one disparity row.
    const products: Record<string, ProductRecord> = {
      'western-bud-burlington::bd': rec({ productId: 'bd', dispensaryId: 'western-bud-burlington' }),
      'store-only-in-datajson::bd': rec({ productId: 'bd', dispensaryId: 'store-only-in-datajson' }),
      'nowhere-store::bd': rec({ productId: 'bd', dispensaryId: 'nowhere-store' }),
    }

    writeFileSync(
      dataPath,
      JSON.stringify({
        dispensaries: [
          {
            id: 'store-only-in-datajson',
            name: 'Store Only In data.json',
            url: 'https://example.com',
            stale: false,
            lastFetchedAt: '2026-07-01T00:00:00.000Z',
            deals: [],
            lat: 47.5,
            lng: -122.3,
          },
        ],
      }),
      'utf-8',
    )

    const db = openProductsDb(dbPath)
    importProductsFile(db, { lastUpdated: '2026-07-01', products })
    db.close()

    const outcome = deriveFacts({ dbPath, dataPath, derivedDir })
    const written = JSON.parse(readFileSync(outcome.disparityRollupsPath, 'utf-8'))

    expect(written.data.totalDisparities).toBe(1)
    expect(written.data.byStore).toHaveLength(3)
    expect(written.data.byStore).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dispensaryId: 'western-bud-burlington', lat: 48.483114, lng: -122.307298 }),
        expect.objectContaining({ dispensaryId: 'store-only-in-datajson', lat: 47.5, lng: -122.3 }),
        expect.objectContaining({ dispensaryId: 'nowhere-store', lat: null, lng: null }),
      ]),
    )
    expect(written.data.missingGeoCount).toBe(1)
  })
})

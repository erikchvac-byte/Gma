import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { atomicWriteJson } from '../utils/atomicWrite.js'
import {
  readProductsFromDbPath,
  readWindowedObservationsFromDbPath,
  DEFAULT_PRODUCTS_DB_PATH,
} from '../utils/productsDb.js'
import { buildMatchReport, EXCLUDED_FLAGS } from '../utils/crossStoreValue.js'
import { WEIGHT_BASED_CATEGORIES } from '../utils/normalizeProduct.js'
import { buildDealScopeLinks } from '../utils/dealScope.js'
import { buildExtractionHealthReport } from '../utils/extractionHealth.js'
import { buildSpecialEventsReport } from '../utils/specialEvents.js'
import { buildDisparityRollups, buildStoreGeoLookup } from '../utils/disparityRollups.js'
import { buildBrandPersonas, type BrandProductSeries } from '../utils/brandPersonas.js'
import { buildBrandStoreMatrix, type BrandStoreProduct, type BrandStoreOption } from '../utils/brandStoreMatrix.js'
import { buildNewArrivalDormancyReport } from '../utils/newArrivalDormancy.js'
import {
  buildPriceVsOwnMedianReport,
  windowStartDay,
  type PriceProductSeries,
} from '../utils/priceVsOwnMedian.js'
import { buildCheapestDeliveredReport } from '../utils/cheapestDelivered.js'
import type { StoreHealthStatus } from '../utils/extractionHealth.js'
import { canonicalWeightGrams, deriveMatchKey } from '../utils/productMatchKey.js'
import { wrapEnvelope } from '../utils/derivedEnvelope.js'
import { dutchieProductScrapers } from '../scrapers/dutchie-stores.js'
import { weedmapsProductScrapers, WEEDMAPS_STORES } from '../scrapers/weedmaps-stores.js'
import type { Dispensary } from '../../client/src/types/index.js'

// ADR-077 Phase 1 — local derivation runner (AC3). Runs on the HOME machine only. It reads
// the local products.db, runs the UNCHANGED pure functions (buildMatchReport +
// buildDealScopeLinks — the honesty gates 1–5, EXCLUDED_FLAGS and fix6 all live inside them,
// so behaviour is byte-identical to the old request-time computation), and writes the two
// small DERIVED fact files. Those files — and ONLY those files — are what Render serves. The
// heavy raw dataset never leaves this machine.
//
// Gap-tolerance contract (reconciliation note #2): the DB reader reconstructs the full
// per-observation history in insertion order, so `history.at(-1)` is the true latest and a
// product with no observation on a given day is simply absent from that day — the runner
// never fabricates an unchanged-price observation. Downstream time-range facts must read the
// same way (distinguish "no observation" from "observed, unchanged").

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_DERIVED_DIR = path.join(__dirname, '../data/derived')
const DEFAULT_DATA_PATH = path.join(__dirname, '../data/data.json')

// Read the deals file's dispensaries for the deal→SKU scope join, fail-soft to empty
// (mirrors valueRoute.readDispensaries). deal-scope is precomputed daily (open decision #3).
function readDispensaries(dataPath: string): Dispensary[] {
  if (!existsSync(dataPath)) return []
  try {
    const parsed = JSON.parse(readFileSync(dataPath, 'utf-8'))
    return Array.isArray(parsed?.dispensaries) ? parsed.dispensaries : []
  } catch {
    return []
  }
}

export interface DeriveOptions {
  dbPath?: string
  dataPath?: string
  derivedDir?: string
}

export interface DeriveOutcome {
  disparities: number
  totalRecords: number
  links: number
  totalDeals: number
  disparitiesPath: string
  dealScopePath: string
  extractionHealthPath: string
  specialEventsPath: string
  disparityRollupsPath: string
  brandPersonasPath: string
  brandStoreMatrixPath: string
  newArrivalDormancyPath: string
  priceVsOwnMedianPath: string
  cheapestDeliveredPath: string
  suspectedCount: number
  insufficientHistoryCount: number
  startCount: number
  endCount: number
  categoryCount: number
  storeCount: number
  alwaysOnSpecialCount: number
  neverDiscountedCount: number
  intermittentCount: number
  brandInsufficientHistoryCount: number
  nullBrandProductCount: number
  matrixTotalBrands: number
  multiStoreBrandCount: number
  cheapestCellCount: number
  matrixNullBrandProductCount: number
  unmatchedProductCount: number
  newArrivalCount: number
  dormantCount: number
  priceComparedCount: number
  priceBelowMedianCount: number
  priceAboveMedianCount: number
  priceAtMedianCount: number
  priceBelowFloorCount: number
  deliveredCellCount: number
  deliveredStoreOfferCount: number
  deliveredMissingGeoCount: number
}

// The product-scraper roster (AC1) — every store actively attempted, not just ids that happen
// to have observation rows in products.db (a zero-history store must still be evaluated; see
// the story's grounding section for why caravan-cannabis-burlington/the-vault-silvana motivated
// this). Both registries are plain object literals with no top-level side effects — importing
// them for their keys does not trigger any scrape.
function productScraperRoster(): string[] {
  return [...new Set([...Object.keys(dutchieProductScrapers), ...Object.keys(weedmapsProductScrapers)])]
}

// `openProductsDb` creates a fresh, empty SQLite file if `dbPath` doesn't exist yet — so a
// misconfigured/wrong PRODUCTS_DB_PATH doesn't throw, it just opens a legitimately-empty DB.
// Reading the previously-committed disparities.json's totalRecords is the only way to catch
// that: a total collapse to zero against a previously-populated dataset is the signature of a
// wrong path or empty DB, not a real one-day loss of every record. Refuse to overwrite in that
// case rather than silently pushing empty facts to the site (see readProductsFromDbPath).
// The committed file is envelope-shaped (derivation-1.1) — the count now lives under `.data`.
function readPreviousTotalRecords(disparitiesPath: string): number {
  if (!existsSync(disparitiesPath)) return 0
  try {
    const parsed = JSON.parse(readFileSync(disparitiesPath, 'utf-8'))
    return typeof parsed?.data?.totalRecords === 'number' ? parsed.data.totalRecords : 0
  } catch {
    return 0
  }
}

export function deriveFacts(opts: DeriveOptions = {}): DeriveOutcome {
  const dbPath = opts.dbPath ?? DEFAULT_PRODUCTS_DB_PATH
  const dataPath = opts.dataPath ?? DEFAULT_DATA_PATH
  const derivedDir = opts.derivedDir ?? DEFAULT_DERIVED_DIR

  mkdirSync(derivedDir, { recursive: true })

  const disparitiesPath = path.join(derivedDir, 'disparities.json')
  const dealScopePath = path.join(derivedDir, 'deal-scope.json')
  const extractionHealthPath = path.join(derivedDir, 'extraction-health.json')
  const specialEventsPath = path.join(derivedDir, 'special-events.json')
  const disparityRollupsPath = path.join(derivedDir, 'disparity-rollups.json')
  const brandPersonasPath = path.join(derivedDir, 'brand-personas.json')
  const brandStoreMatrixPath = path.join(derivedDir, 'brand-store-matrix.json')
  const newArrivalDormancyPath = path.join(derivedDir, 'new-arrival-dormancy.json')
  const priceVsOwnMedianPath = path.join(derivedDir, 'price-vs-own-median.json')
  const cheapestDeliveredPath = path.join(derivedDir, 'cheapest-delivered.json')

  const productsFile = readProductsFromDbPath(dbPath)
  const report = buildMatchReport(productsFile)

  const previousTotalRecords = readPreviousTotalRecords(disparitiesPath)
  if (previousTotalRecords > 0 && report.totalRecords === 0) {
    throw new Error(
      `refusing to write derived facts: '${dbPath}' produced 0 records but the previously ` +
        `committed disparities.json had ${previousTotalRecords} — this looks like a wrong/empty ` +
        `PRODUCTS_DB_PATH, not genuine data loss. Not overwriting the live derived facts.`,
    )
  }

  const dispensaries = readDispensaries(dataPath)
  const dealScope = buildDealScopeLinks({ dispensaries }, productsFile)

  const disparitiesEnvelope = wrapEnvelope(
    report,
    [
      { reason: 'nonComparableCategory', count: report.nonComparableCategoryCount },
      { reason: 'excludedFlag', count: report.excludedFlagCount },
      { reason: 'unmatched', count: report.unmatchedCount },
    ],
    {
      totalRecords: report.totalRecords,
      placedRecords: report.placedRecords,
      disparityCount: report.disparities.length,
    },
  )

  const dealScopeEnvelope = wrapEnvelope(
    dealScope,
    [
      { reason: 'unsupportedCategory', count: dealScope.unsupportedCategoryCount },
      { reason: 'unresolved', count: dealScope.unresolvedCount },
      { reason: 'zeroMatch', count: dealScope.zeroMatchCount },
    ],
    {
      totalDeals: dealScope.totalDeals,
      storewideCount: dealScope.storewideCount,
      categoryCount: dealScope.categoryCount,
      linkedSkuCount: dealScope.linkedSkuCount,
      brandCount: dealScope.brandCount,
    },
  )

  atomicWriteJson(disparitiesPath, disparitiesEnvelope)
  atomicWriteJson(dealScopePath, dealScopeEnvelope)

  const today = new Date().toISOString().slice(0, 10)
  const extractionHealth = buildExtractionHealthReport(productsFile, productScraperRoster(), today)

  const extractionHealthEnvelope = wrapEnvelope(
    extractionHealth,
    [{ reason: 'insufficientHistory', count: extractionHealth.insufficientHistoryCount }],
    {
      totalStores: extractionHealth.totalStores,
      okCount: extractionHealth.okCount,
      suspectedCount: extractionHealth.suspectedCount,
      insufficientHistoryCount: extractionHealth.insufficientHistoryCount,
    },
  )

  atomicWriteJson(extractionHealthPath, extractionHealthEnvelope)

  const specialEvents = buildSpecialEventsReport(productsFile, today)

  const specialEventsEnvelope = wrapEnvelope(
    specialEvents,
    [
      { reason: 'noObservationToday', count: specialEvents.gapCount },
      { reason: 'firstObservation', count: specialEvents.firstObservationCount },
    ],
    {
      totalProducts: specialEvents.totalProducts,
      startCount: specialEvents.startCount,
      endCount: specialEvents.endCount,
      unchangedCount: specialEvents.unchangedCount,
      gapCount: specialEvents.gapCount,
      firstObservationCount: specialEvents.firstObservationCount,
    },
  )

  atomicWriteJson(specialEventsPath, specialEventsEnvelope)

  // derivation-1.4: rollups over the ALREADY-computed `report.disparities` (decision A — a
  // separate artifact, no second buildMatchReport call, no mutation of disparities.json).
  // Written last, after every pre-existing write, preserving the ordering discipline from
  // 1.2.5's review (a new fallible step ahead of existing writes could silently drop them).
  const geoLookup = buildStoreGeoLookup(dispensaries, WEEDMAPS_STORES)
  const disparityRollups = buildDisparityRollups(report.disparities, geoLookup)

  const disparityRollupsEnvelope = wrapEnvelope(
    disparityRollups,
    [{ reason: 'missingGeo', count: disparityRollups.missingGeoCount }],
    {
      totalDisparities: disparityRollups.totalDisparities,
      categoryCount: disparityRollups.byCategory.length,
      storeCount: disparityRollups.byStore.length,
    },
  )

  atomicWriteJson(disparityRollupsPath, disparityRollupsEnvelope)

  // derivation-1.5: brand discount personas (D2/FR9). Project the full ProductRecord DOWN to the
  // narrowed BrandProductSeries at THIS boundary — the only place prices/potency are dropped — so
  // the pure buildBrandPersonas never sees a price (decision F, Gate 2/5). Written last, after
  // every pre-existing write, preserving the ordering discipline from 1.2.5's review.
  const brandSeries: BrandProductSeries[] = Object.values(productsFile.products).map((r) => ({
    productId: r.productId,
    brand: r.brand,
    history: r.history.map((o) => ({ observedAt: o.observedAt, special: o.special })),
  }))
  const brandPersonas = buildBrandPersonas(brandSeries, today)

  const brandPersonasEnvelope = wrapEnvelope(
    brandPersonas,
    [
      { reason: 'nullBrand', count: brandPersonas.nullBrandProductCount },
      { reason: 'insufficientHistory', count: brandPersonas.insufficientHistoryCount },
    ],
    {
      totalBrands: brandPersonas.totalBrands,
      alwaysOnSpecialCount: brandPersonas.alwaysOnSpecialCount,
      neverDiscountedCount: brandPersonas.neverDiscountedCount,
      intermittentCount: brandPersonas.intermittentCount,
      insufficientHistoryCount: brandPersonas.insufficientHistoryCount,
    },
  )

  atomicWriteJson(brandPersonasPath, brandPersonasEnvelope)

  // derivation-1.6: brand→store matrix (D5/FR12). Project the full ProductRecord DOWN to the
  // narrowed BrandStoreProduct at THIS boundary — the ONLY place prices/potency are dropped and
  // the per-option reductions happen — so the pure buildBrandStoreMatrix never sees a price PAIR
  // or potency (decision F, Gates 2/5). Cross-sectional: latest observation only (history.at(-1)),
  // like crossStoreValue.ts — no gap logic, no 1.2 helper. Each option's canonical weight comes
  // from canonicalWeightGrams (mg-labelled Edible options → null, dropped so they contribute no
  // weight tier/cell), a reported sold-out offer is dropped (Gate 4, matching crossStoreValue),
  // and price is the single reduced specialPrice ?? basePrice (Gate 3). Written last, after every
  // pre-existing write, preserving the ordering discipline from 1.2.5's review.
  const matrixProducts: BrandStoreProduct[] = Object.values(productsFile.products).map((rec) => {
    const mk = deriveMatchKey(rec)
    const matchKey = 'key' in mk ? mk.key : null
    // A weight tier / cheapest cell may only be built from a record with an HONEST weight axis —
    // the same two gates crossStoreValue.ts applies. Gate 5: only WEIGHT_BASED_CATEGORIES (Flower/
    // Vaporizers/Pre-Rolls/Concentrate) carry a real gram weight; an Edible option label is mg-THC
    // or a count, which canonicalWeightGrams would parse as a BOGUS gram weight (e.g. "100mg" → 0.1g)
    // and leak a "$/gram" cell — the exact lie Gate 5 forbids. Gate 1: a record whose weight is
    // flagged untrustworthy (weight-mismatch / unparseable-* / unreconciled-pack) is dropped from
    // weight comparison. Such a product still counts toward AVAILABILITY (its store stocks the brand)
    // but contributes NO tier and NO cheapest cell — exactly the edible-only-brand behaviour
    // Grounding §7 intends (achieved by an explicit gate, since canonicalWeightGrams does NOT return
    // null for mg/count labels — the story's §7 premise was factually wrong; see Change Log).
    const weightComparable =
      WEIGHT_BASED_CATEGORIES.has(rec.category) && !rec.flags.some((f) => EXCLUDED_FLAGS.has(f))
    const options: BrandStoreOption[] = []
    if (weightComparable) {
      const latest = rec.history.at(-1)
      for (const opt of latest?.options ?? []) {
        const weightGrams = canonicalWeightGrams(opt.option)
        if (weightGrams === null) continue // no usable weight on this option label
        if (opt.quantityAvailable !== null && opt.quantityAvailable <= 0) continue // Gate 4: sold-out
        const price = opt.specialPrice ?? opt.basePrice // Gate 3: real price paid (never the pair)
        if (price === null || !Number.isFinite(price) || price <= 0) continue
        options.push({ weightGrams, price })
      }
    }
    return { brand: rec.brand, dispensaryId: rec.dispensaryId, matchKey, name: rec.name, options }
  })
  const brandStoreMatrix = buildBrandStoreMatrix(matrixProducts)

  const brandStoreMatrixEnvelope = wrapEnvelope(
    brandStoreMatrix,
    [
      { reason: 'nullBrand', count: brandStoreMatrix.nullBrandProductCount },
      { reason: 'unmatchedProduct', count: brandStoreMatrix.unmatchedProductCount },
    ],
    {
      totalBrands: brandStoreMatrix.totalBrands,
      multiStoreBrandCount: brandStoreMatrix.multiStoreBrandCount,
      cheapestCellCount: brandStoreMatrix.cheapestCellCount,
    },
  )

  atomicWriteJson(brandStoreMatrixPath, brandStoreMatrixEnvelope)

  // derivation-1.7: new-arrival & dormancy feed (D3/FR10, Gate 4) — the LAST and most dangerous
  // Tier-1 fact. First real consumer of 1.2.5's extraction-health: build the store-status map from
  // the ALREADY-computed `extractionHealth.entries` (in-process — no re-read, no recompute) and pass
  // it into the pure function, which emits dormancy ONLY for `ok` stores (the outage gate) and never
  // from a single absent run. Presence-only output (no price/potency). Written last, after every
  // pre-existing write, preserving the ordering discipline from 1.2.5's review (a new fallible step
  // ahead of existing writes could silently drop them on a throw).
  const storeStatus = new Map<string, StoreHealthStatus>(
    extractionHealth.entries.map((e) => [e.dispensaryId, e.status]),
  )
  const newArrivalDormancy = buildNewArrivalDormancyReport(productsFile, storeStatus, today)

  const newArrivalDormancyEnvelope = wrapEnvelope(
    newArrivalDormancy,
    [
      { reason: 'suppressedUnhealthyStore', count: newArrivalDormancy.suppressedUnhealthyStoreCount },
      { reason: 'belowThreshold', count: newArrivalDormancy.belowThresholdCount },
      { reason: 'onboardingStore', count: newArrivalDormancy.onboardingStoreArrivalCount },
    ],
    {
      totalProducts: newArrivalDormancy.totalProducts,
      newArrivalCount: newArrivalDormancy.newArrivalCount,
      dormantCount: newArrivalDormancy.dormantCount,
    },
  )

  atomicWriteJson(newArrivalDormancyPath, newArrivalDormancyEnvelope)

  // derivation-2.1: price vs own rolling median (D6/FR13) — the fix6 keystone, and the FIRST real
  // consumer of the (product_key, observedAt) index: a BOUNDED time-range read (readWindowed...),
  // not the whole-file reconstruction the facts above share. Project each parsed
  // ProductOptionObservation DOWN at THIS boundary — the ONLY place the base/special PAIR exists —
  // to a single reduced `effectivePrice` per option-day, so the pure buildPriceVsOwnMedianReport
  // never sees the pair, the banner rate, or potency (decision F, Gate 2/FR16). A reported sold-out
  // offer is dropped (Gate 4, crossStoreValue/brandStoreMatrix precedent — an unbuyable price is not
  // a price paid); a null/≤0 effectivePrice is passed THROUGH so the pure fn owns the noUsablePrice
  // count the envelope restates (never invented here). Written LAST, after every pre-existing write,
  // preserving the 1.2.5 write-ordering discipline (a new fallible step must never gate the others).
  const sinceIso = `${windowStartDay(today)}T00:00:00.000Z`
  const windowedRows = readWindowedObservationsFromDbPath(sinceIso, dbPath)
  const priceSeriesByKey = new Map<string, PriceProductSeries>()
  for (const row of windowedRows) {
    const key = `${row.dispensaryId}::${row.productId}`
    let s = priceSeriesByKey.get(key)
    if (!s) {
      s = { productId: row.productId, dispensaryId: row.dispensaryId, name: row.name, category: row.category, entries: [] }
      priceSeriesByKey.set(key, s)
    }
    for (const opt of row.options) {
      if (opt.quantityAvailable !== null && opt.quantityAvailable <= 0) continue // Gate 4: sold-out
      const effectivePrice = opt.specialPrice ?? opt.basePrice // Gate 2: single reduced (never the pair)
      s.entries.push({ observedAt: row.observedAt, option: opt.option, effectivePrice })
    }
  }
  const priceVsOwnMedian = buildPriceVsOwnMedianReport([...priceSeriesByKey.values()], today)

  const priceVsOwnMedianEnvelope = wrapEnvelope(
    priceVsOwnMedian,
    [
      { reason: 'belowFloor', count: priceVsOwnMedian.belowFloorCount },
      { reason: 'noObservationToday', count: priceVsOwnMedian.noObservationTodayCount },
      { reason: 'atOwnMedian', count: priceVsOwnMedian.atMedianCount },
      { reason: 'noUsablePrice', count: priceVsOwnMedian.noUsablePriceCount },
    ],
    {
      totalProducts: priceVsOwnMedian.totalProducts,
      totalSeries: priceVsOwnMedian.totalSeries,
      comparedCount: priceVsOwnMedian.comparedCount,
      belowMedianCount: priceVsOwnMedian.belowMedianCount,
      aboveMedianCount: priceVsOwnMedian.aboveMedianCount,
    },
  )

  atomicWriteJson(priceVsOwnMedianPath, priceVsOwnMedianEnvelope)

  // derivation-2.2: cheapest-DELIVERED INPUT fact (D7/FR14). The structural twin of 1.4 — a pure
  // consumer of the ALREADY-computed `report.disparities` oracle + the ALREADY-built `geoLookup`
  // (both reused straight from above, no recompute, no second DB read, no weight re-parse). It emits
  // every qualifying store's real price + committed geo per like-for-like cell so the client can
  // compose delivered cost user-relatively with roundTripGasCost (ADR-057 — NO baked-in origin here).
  // All honesty gates are inherited from buildMatchReport (a Disparity is already a same-product,
  // same-weight, ≥2-store, sold-out-excluded cell). Written LAST, after every pre-existing write,
  // preserving the 1.2.5 write-ordering discipline (a new fallible step must never gate the others).
  const cheapestDelivered = buildCheapestDeliveredReport(report.disparities, geoLookup)

  const cheapestDeliveredEnvelope = wrapEnvelope(
    cheapestDelivered,
    [{ reason: 'missingGeo', count: cheapestDelivered.missingGeoCount }],
    {
      totalCells: cheapestDelivered.totalCells,
      totalStoreOffers: cheapestDelivered.totalStoreOffers,
      offersWithGeo: cheapestDelivered.offersWithGeo,
    },
  )

  atomicWriteJson(cheapestDeliveredPath, cheapestDeliveredEnvelope)

  return {
    disparities: report.disparities.length,
    totalRecords: report.totalRecords,
    links: dealScope.links.length,
    totalDeals: dealScope.totalDeals,
    disparitiesPath,
    dealScopePath,
    extractionHealthPath,
    specialEventsPath,
    disparityRollupsPath,
    brandPersonasPath,
    brandStoreMatrixPath,
    newArrivalDormancyPath,
    suspectedCount: extractionHealth.suspectedCount,
    insufficientHistoryCount: extractionHealth.insufficientHistoryCount,
    startCount: specialEvents.startCount,
    endCount: specialEvents.endCount,
    categoryCount: disparityRollups.byCategory.length,
    storeCount: disparityRollups.byStore.length,
    alwaysOnSpecialCount: brandPersonas.alwaysOnSpecialCount,
    neverDiscountedCount: brandPersonas.neverDiscountedCount,
    intermittentCount: brandPersonas.intermittentCount,
    brandInsufficientHistoryCount: brandPersonas.insufficientHistoryCount,
    nullBrandProductCount: brandPersonas.nullBrandProductCount,
    matrixTotalBrands: brandStoreMatrix.totalBrands,
    multiStoreBrandCount: brandStoreMatrix.multiStoreBrandCount,
    cheapestCellCount: brandStoreMatrix.cheapestCellCount,
    matrixNullBrandProductCount: brandStoreMatrix.nullBrandProductCount,
    unmatchedProductCount: brandStoreMatrix.unmatchedProductCount,
    newArrivalCount: newArrivalDormancy.newArrivalCount,
    dormantCount: newArrivalDormancy.dormantCount,
    priceComparedCount: priceVsOwnMedian.comparedCount,
    priceBelowMedianCount: priceVsOwnMedian.belowMedianCount,
    priceAboveMedianCount: priceVsOwnMedian.aboveMedianCount,
    priceAtMedianCount: priceVsOwnMedian.atMedianCount,
    priceBelowFloorCount: priceVsOwnMedian.belowFloorCount,
    priceVsOwnMedianPath,
    cheapestDeliveredPath,
    deliveredCellCount: cheapestDelivered.totalCells,
    deliveredStoreOfferCount: cheapestDelivered.totalStoreOffers,
    deliveredMissingGeoCount: cheapestDelivered.missingGeoCount,
  }
}

function main(): void {
  const r = deriveFacts()
  console.log(`[derive] disparities: ${r.disparities} (from ${r.totalRecords} records) → ${r.disparitiesPath}`)
  console.log(`[derive] deal-scope links: ${r.links} (from ${r.totalDeals} deals) → ${r.dealScopePath}`)
  console.log(
    `[derive] extraction-health: ${r.suspectedCount} suspected, ${r.insufficientHistoryCount} insufficient-history → ${r.extractionHealthPath}`,
  )
  console.log(`[derive] special-events: ${r.startCount} started, ${r.endCount} ended → ${r.specialEventsPath}`)
  console.log(
    `[derive] disparity-rollups: ${r.categoryCount} categories, ${r.storeCount} stores → ${r.disparityRollupsPath}`,
  )
  console.log(
    `[derive] brand-personas: ${r.alwaysOnSpecialCount} always / ${r.neverDiscountedCount} never / ${r.intermittentCount} intermittent / ${r.brandInsufficientHistoryCount} insufficient (${r.nullBrandProductCount} null-brand excluded) → ${r.brandPersonasPath}`,
  )
  console.log(
    `[derive] brand-store-matrix: ${r.matrixTotalBrands} brands / ${r.multiStoreBrandCount} multi-store / ${r.cheapestCellCount} cheapest cells (${r.matrixNullBrandProductCount} null-brand, ${r.unmatchedProductCount} unmatched excluded) → ${r.brandStoreMatrixPath}`,
  )
  console.log(
    `[derive] new-arrival-dormancy: ${r.newArrivalCount} new arrivals / ${r.dormantCount} dormant → ${r.newArrivalDormancyPath}`,
  )
  console.log(
    `[derive] price-vs-own-median: ${r.priceBelowMedianCount} below / ${r.priceAboveMedianCount} above own median (${r.priceAtMedianCount} at-median, ${r.priceBelowFloorCount} below-floor) → ${r.priceVsOwnMedianPath}`,
  )
  console.log(
    `[derive] cheapest-delivered: ${r.deliveredCellCount} cells / ${r.deliveredStoreOfferCount} store-offers (${r.deliveredMissingGeoCount} missing-geo) → ${r.cheapestDeliveredPath}`,
  )
  console.log('[derive] ✓ derived facts written')
}

const entry = process.argv[1]
if (entry && import.meta.url === pathToFileURL(entry).href) {
  try {
    main()
  } catch (err) {
    console.error('[derive] fatal', err)
    process.exit(1)
  }
}

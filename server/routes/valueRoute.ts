import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { Request, Response } from 'express'
import type { MatchReport } from '../utils/crossStoreValue.js'
import type { DealScopeReport } from '../types/index.js'
import type { DisparityRollupsReport } from '../utils/disparityRollups.js'
import type { PriceVsOwnMedianReport } from '../utils/priceVsOwnMedian.js'
import { isEnvelope, type DerivedEnvelope } from '../utils/derivedEnvelope.js'

// ADR-077 Phase 1 — these two private/internal routes NO LONGER compute anything at request
// time. The raw products dataset left git for a local SQLite DB on the home machine; the home
// runner (deriveFactsRun) precomputes both reports and commits the small derived JSON files.
// These routes just READ those files.
//
// THE LOAD-BEARING RULE: Render must NEVER open the home DB. If the home machine is off, the
// last-committed derived files keep serving; only fresh accrual pauses. So a missing/malformed
// derived file degrades to a safe EMPTY report (same fail-soft posture as readProducts) — it
// never throws and never reaches for product data.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DERIVED_DIR = path.join(__dirname, '../data/derived')
const DISPARITIES_PATH = path.join(DERIVED_DIR, 'disparities.json')
const DEAL_SCOPE_PATH = path.join(DERIVED_DIR, 'deal-scope.json')
const DISPARITY_ROLLUPS_PATH = path.join(DERIVED_DIR, 'disparity-rollups.json')
const PRICE_VS_OWN_MEDIAN_PATH = path.join(DERIVED_DIR, 'price-vs-own-median.json')

// derivation-1.1: served artifacts are wrapped in the honesty envelope (decision E). The
// empty fallback's `generatedAt` is a FIXED value, not "now" — the fail-soft output must stay
// referentially stable so tests (and any future freshness check) can tell "never derived" apart
// from "derived a moment ago".
const EMPTY_GENERATED_AT = new Date(0).toISOString()

export const EMPTY_DISPARITIES_ENVELOPE: DerivedEnvelope<MatchReport> = {
  data: {
    disparities: [],
    totalRecords: 0,
    unmatchedCount: 0,
    excludedFlagCount: 0,
    nonComparableCategoryCount: 0,
    placedRecords: 0,
    staleRecords: 0,
  },
  excluded: [],
  coverage: {},
  generatedAt: EMPTY_GENERATED_AT,
}

export const EMPTY_DEAL_SCOPE_ENVELOPE: DerivedEnvelope<DealScopeReport> = {
  data: {
    links: [],
    totalDeals: 0,
    storewideCount: 0,
    categoryCount: 0,
    linkedSkuCount: 0,
    unsupportedCategoryCount: 0,
    brandCount: 0,
    unresolvedCount: 0,
    zeroMatchCount: 0,
  },
  excluded: [],
  coverage: {},
  generatedAt: EMPTY_GENERATED_AT,
}

// derivation-1.4
export const EMPTY_DISPARITY_ROLLUPS_ENVELOPE: DerivedEnvelope<DisparityRollupsReport> = {
  data: { byCategory: [], byStore: [], totalDisparities: 0, missingGeoCount: 0 },
  excluded: [],
  coverage: {},
  generatedAt: EMPTY_GENERATED_AT,
}

// derivation-3.2 (FR13/D6 in-app value cards): the flagship "real price drop" fact —
// each SKU's current price vs its OWN rolling median. Movers-only rows; the empty report
// mirrors the pure fn's shape (priceVsOwnMedian.ts) with every counter zeroed.
export const EMPTY_PRICE_VS_OWN_MEDIAN_ENVELOPE: DerivedEnvelope<PriceVsOwnMedianReport> = {
  data: {
    rows: [],
    totalProducts: 0,
    totalSeries: 0,
    comparedCount: 0,
    belowMedianCount: 0,
    aboveMedianCount: 0,
    atMedianCount: 0,
    belowFloorCount: 0,
    noObservationTodayCount: 0,
    noUsablePriceCount: 0,
  },
  excluded: [],
  coverage: {},
  generatedAt: EMPTY_GENERATED_AT,
}

// Read a precomputed derived fact file, fail-soft to the given empty envelope. A missing file
// (home machine never ran / first deploy), an unparseable one, or one that parses but doesn't
// match the envelope shape all degrade to empty rather than throwing — never a 500, never a
// read of the raw dataset.
export function readDerived<T extends object>(
  filePath: string,
  empty: DerivedEnvelope<T>,
): DerivedEnvelope<T> {
  if (!existsSync(filePath)) return empty
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8'))
    return isEnvelope<T>(parsed) ? parsed : empty
  } catch {
    return empty
  }
}

// GET /api/value/disparities (SPEC ai-search-data-strategy A1). Serves the precomputed
// cross-store price-disparity dataset from server/data/derived/disparities.json. Private/
// internal only — no public SSR page/schema.org (Phase 4, legal-gated). Response is the
// honesty envelope (derivation-1.1); `data` is the unchanged MatchReport.
export function disparitiesRoute(_req: Request, res: Response) {
  res.json(readDerived<MatchReport>(DISPARITIES_PATH, EMPTY_DISPARITIES_ENVELOPE))
}

// GET /api/value/deal-scope (ADR-070). Serves the precomputed deal→SKU scope-bridge report
// from server/data/derived/deal-scope.json (open decision #3: precomputed daily, so links can
// be up to ~24h stale — acceptable to start). Same private/decoupled/fail-soft posture.
export function dealScopeRoute(_req: Request, res: Response) {
  res.json(readDerived<DealScopeReport>(DEAL_SCOPE_PATH, EMPTY_DEAL_SCOPE_ENVELOPE))
}

// GET /api/value/disparity-rollups (derivation-1.4, FR11 — "needs a served consumer surface").
// Serves the precomputed rollups over the disparities dataset from
// server/data/derived/disparity-rollups.json. Same private/internal/fail-soft posture.
export function disparityRollupsRoute(_req: Request, res: Response) {
  res.json(readDerived<DisparityRollupsReport>(DISPARITY_ROLLUPS_PATH, EMPTY_DISPARITY_ROLLUPS_ENVELOPE))
}

// GET /api/value/price-vs-own-median (derivation-3.2, FR13/D6 — the in-app "Real price drops"
// surface). Serves the precomputed flagship fact from server/data/derived/price-vs-own-median.json.
// Same private/decoupled/fail-soft posture: never a 500, never a read of the raw dataset. This is
// the one honest discount the engine can compute (a SKU below its OWN rolling median); the flat
// banner % (Gate 2) is deliberately NOT in this fact and must not reach any surface.
// Shared reader for the price-vs-own-median envelope — used by the route above AND by the shell
// snapshot injector (shellRoute) so the in-app "Real price drops" surface can hydrate from
// window.__GMA_DROPS__ on the FIRST client render instead of an ungated post-paint fetch that
// reflowed the deal feed (ADR-092 CLS fix). Same fail-soft posture: missing/malformed → empty.
export function readPriceVsOwnMedian(): DerivedEnvelope<PriceVsOwnMedianReport> {
  return readDerived<PriceVsOwnMedianReport>(PRICE_VS_OWN_MEDIAN_PATH, EMPTY_PRICE_VS_OWN_MEDIAN_ENVELOPE)
}

export function priceVsOwnMedianRoute(_req: Request, res: Response) {
  res.json(readPriceVsOwnMedian())
}

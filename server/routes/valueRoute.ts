import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { Request, Response } from 'express'
import type { MatchReport } from '../utils/crossStoreValue.js'
import type { DealScopeReport } from '../types/index.js'

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

export const EMPTY_MATCH_REPORT: MatchReport = {
  disparities: [],
  totalRecords: 0,
  unmatchedCount: 0,
  excludedFlagCount: 0,
  nonComparableCategoryCount: 0,
  placedRecords: 0,
}

export const EMPTY_DEAL_SCOPE: DealScopeReport = {
  links: [],
  totalDeals: 0,
  storewideCount: 0,
  categoryCount: 0,
  linkedSkuCount: 0,
  unsupportedCategoryCount: 0,
  brandCount: 0,
  unresolvedCount: 0,
  zeroMatchCount: 0,
}

// Read a precomputed derived fact file, fail-soft to the given empty shape. A missing file
// (home machine never ran / first deploy) or a malformed one degrades to empty rather than
// throwing — never a 500, never a read of the raw dataset.
export function readDerived<T>(filePath: string, empty: T): T {
  if (!existsSync(filePath)) return empty
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8'))
    if (!parsed || typeof parsed !== 'object') return empty
    return parsed as T
  } catch {
    return empty
  }
}

// GET /api/value/disparities (SPEC ai-search-data-strategy A1). Serves the precomputed
// cross-store price-disparity dataset from server/data/derived/disparities.json. Private/
// internal only — no public SSR page/schema.org (Phase 4, legal-gated). Response shape (the
// MatchReport with disparity rows + audit counts) is UNCHANGED; only the source moved from a
// request-time computation to a committed derived file.
export function disparitiesRoute(_req: Request, res: Response) {
  res.json(readDerived<MatchReport>(DISPARITIES_PATH, EMPTY_MATCH_REPORT))
}

// GET /api/value/deal-scope (ADR-070). Serves the precomputed deal→SKU scope-bridge report
// from server/data/derived/deal-scope.json (open decision #3: precomputed daily, so links can
// be up to ~24h stale — acceptable to start). Same private/decoupled/fail-soft posture.
export function dealScopeRoute(_req: Request, res: Response) {
  res.json(readDerived<DealScopeReport>(DEAL_SCOPE_PATH, EMPTY_DEAL_SCOPE))
}

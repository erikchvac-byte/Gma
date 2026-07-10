import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { atomicWriteJson } from '../utils/atomicWrite.js'
import { readProductsFromDbPath, DEFAULT_PRODUCTS_DB_PATH } from '../utils/productsDb.js'
import { buildMatchReport } from '../utils/crossStoreValue.js'
import { buildDealScopeLinks } from '../utils/dealScope.js'
import { buildExtractionHealthReport } from '../utils/extractionHealth.js'
import { buildSpecialEventsReport } from '../utils/specialEvents.js'
import { wrapEnvelope } from '../utils/derivedEnvelope.js'
import { dutchieProductScrapers } from '../scrapers/dutchie-stores.js'
import { weedmapsProductScrapers } from '../scrapers/weedmaps-stores.js'
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
  suspectedCount: number
  insufficientHistoryCount: number
  startCount: number
  endCount: number
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

  const dealScope = buildDealScopeLinks({ dispensaries: readDispensaries(dataPath) }, productsFile)

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

  return {
    disparities: report.disparities.length,
    totalRecords: report.totalRecords,
    links: dealScope.links.length,
    totalDeals: dealScope.totalDeals,
    disparitiesPath,
    dealScopePath,
    extractionHealthPath,
    specialEventsPath,
    suspectedCount: extractionHealth.suspectedCount,
    insufficientHistoryCount: extractionHealth.insufficientHistoryCount,
    startCount: specialEvents.startCount,
    endCount: specialEvents.endCount,
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

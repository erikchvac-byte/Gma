import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { atomicWriteJson } from '../utils/atomicWrite.js'
import { readProductsFromDbPath, DEFAULT_PRODUCTS_DB_PATH } from '../utils/productsDb.js'
import { buildMatchReport } from '../utils/crossStoreValue.js'
import { buildDealScopeLinks } from '../utils/dealScope.js'
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
}

export function deriveFacts(opts: DeriveOptions = {}): DeriveOutcome {
  const dbPath = opts.dbPath ?? DEFAULT_PRODUCTS_DB_PATH
  const dataPath = opts.dataPath ?? DEFAULT_DATA_PATH
  const derivedDir = opts.derivedDir ?? DEFAULT_DERIVED_DIR

  mkdirSync(derivedDir, { recursive: true })

  const productsFile = readProductsFromDbPath(dbPath)
  const report = buildMatchReport(productsFile)
  const dealScope = buildDealScopeLinks({ dispensaries: readDispensaries(dataPath) }, productsFile)

  const disparitiesPath = path.join(derivedDir, 'disparities.json')
  const dealScopePath = path.join(derivedDir, 'deal-scope.json')
  atomicWriteJson(disparitiesPath, report)
  atomicWriteJson(dealScopePath, dealScope)

  return {
    disparities: report.disparities.length,
    totalRecords: report.totalRecords,
    links: dealScope.links.length,
    totalDeals: dealScope.totalDeals,
    disparitiesPath,
    dealScopePath,
  }
}

function main(): void {
  const r = deriveFacts()
  console.log(`[derive] disparities: ${r.disparities} (from ${r.totalRecords} records) → ${r.disparitiesPath}`)
  console.log(`[derive] deal-scope links: ${r.links} (from ${r.totalDeals} deals) → ${r.dealScopePath}`)
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

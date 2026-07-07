import { existsSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { openProductsDb, importProductsFile, countRecords, countObservations } from '../utils/productsDb.js'
import { DEFAULT_PRODUCTS_PATH } from '../utils/productsStore.js'
import { DEFAULT_PRODUCTS_DB_PATH } from '../utils/productsDb.js'
import type { ProductsFile } from '../types/index.js'

// ADR-077 Phase 1 — one-time, re-runnable migration of the committed products.json into the
// local products.db (AC1). Drop-and-recreate import, then ASSERT the DB's record and
// observation counts equal the source EXACTLY — a "zero-loss" migration must never silently
// drop a row. Prints both sides so the parity is inspectable. Node/CLI only; never on Render.
//
//   npx tsx scripts/importProductsToSqlite.ts [--source <products.json>] [--db <products.db>]

export interface ImportResult {
  sourceRecords: number
  sourceObservations: number
  dbRecords: number
  dbObservations: number
  match: boolean
}

function countSource(file: ProductsFile): { records: number; observations: number } {
  const records = Object.keys(file.products).length
  let observations = 0
  for (const rec of Object.values(file.products)) observations += rec.history.length
  return { records, observations }
}

export function runImport(sourcePath: string, dbPath: string): ImportResult {
  if (!existsSync(sourcePath)) {
    throw new Error(`source products file not found: ${sourcePath}`)
  }
  const file = JSON.parse(readFileSync(sourcePath, 'utf-8')) as ProductsFile
  if (!file || typeof file.products !== 'object') {
    throw new Error(`source is not a valid ProductsFile: ${sourcePath}`)
  }

  const src = countSource(file)
  const db = openProductsDb(dbPath)
  try {
    importProductsFile(db, file)
    const dbRecords = countRecords(db)
    const dbObservations = countObservations(db)
    return {
      sourceRecords: src.records,
      sourceObservations: src.observations,
      dbRecords,
      dbObservations,
      match: dbRecords === src.records && dbObservations === src.observations,
    }
  } finally {
    db.close()
  }
}

function parseArg(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag)
  return i >= 0 ? argv[i + 1] : undefined
}

function main(): void {
  const argv = process.argv.slice(2)
  const sourcePath = parseArg(argv, '--source') ?? DEFAULT_PRODUCTS_PATH
  const dbPath = parseArg(argv, '--db') ?? DEFAULT_PRODUCTS_DB_PATH

  console.log(`[import] source: ${sourcePath}`)
  console.log(`[import] db:     ${dbPath}`)
  const r = runImport(sourcePath, dbPath)
  console.log(`[import] source records/observations: ${r.sourceRecords} / ${r.sourceObservations}`)
  console.log(`[import] db     records/observations: ${r.dbRecords} / ${r.dbObservations}`)
  if (!r.match) {
    console.error('[import] COUNT MISMATCH — migration is NOT zero-loss. Aborting.')
    process.exit(1)
  }
  console.log('[import] ✓ counts match exactly — zero-loss migration verified.')
}

const entry = process.argv[1]
if (entry && import.meta.url === pathToFileURL(entry).href) {
  try {
    main()
  } catch (err) {
    console.error('[import] fatal', err)
    process.exit(1)
  }
}

import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import type {
  ProductRecord,
  ProductsFile,
  ProductObservation,
  ProductOptionObservation,
  PotencyRange,
} from '../types/index.js'

// ADR-077 Phase 1 — local SQLite substrate for the longitudinal product dataset.
//
// The raw products.json (18MB+ and growing ~1.75MB/day) is being taken OUT of git to
// kill the GitHub file-size wall. This module is the substrate that replaces it: the
// full raw history lives in a local `products.db` on the home machine, and small DERIVED
// facts (disparities.json / deal-scope.json) are the only thing committed + served.
//
// THE LOAD-BEARING RULE: this module is Node-only and MUST NEVER be reached by a Render
// request. Render serves the pre-computed derived JSON; it never opens this DB. The seam
// that makes that safe is `readProductsFile` — it returns the EXACT same `ProductsFile`
// shape `readProducts()` returned, so the pure derivation functions
// (buildMatchReport / buildDealScopeLinks) stay byte-identical and only their INPUT source
// changes. That equivalence is what the AC8 parity test proves.
//
// `node:sqlite` (Node 24 built-in, synchronous) is deliberate: zero native dependency, no
// node-gyp/prebuild risk, and it can never enter the client bundle.

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Local, git-IGNORED store. The home runners override this to a stable path outside any
// git worktree (env PRODUCTS_DB_PATH) so a `git reset --hard` in the ingest worktree can
// never wipe the accrued history.
export const DEFAULT_PRODUCTS_DB_PATH =
  process.env.PRODUCTS_DB_PATH ?? path.join(__dirname, '../data/products.db')

const PRODUCT_KEY = (dispensaryId: string, productId: string) => `${dispensaryId}::${productId}`

// (product_key, observedAt) is UNIQUE — it doubles as the AC2 "per-store, per-day presence
// explicitly queryable" key AND guards integrity. ix_obs_disp_time serves the derivation
// engine's regional/trend time-range queries (dispensaryId denormalized onto observation so
// those never need a join). ix_obs_time serves whole-corpus time-range facts.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS product (
  product_key   TEXT PRIMARY KEY,
  dispensaryId  TEXT NOT NULL,
  productId     TEXT NOT NULL,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL,
  brand         TEXT,
  strainType    TEXT,
  packCount     INTEGER,
  thc           TEXT,
  cbd           TEXT,
  totalTerpenes REAL,
  effects       TEXT,
  subcategory   TEXT,
  flags         TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS observation (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  product_key   TEXT NOT NULL REFERENCES product(product_key),
  dispensaryId  TEXT NOT NULL,
  observedAt    TEXT NOT NULL,
  special       INTEGER NOT NULL,
  options_json  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (
  key           TEXT PRIMARY KEY,
  value         TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_obs_key_time ON observation(product_key, observedAt);
CREATE INDEX IF NOT EXISTS ix_obs_time ON observation(observedAt);
CREATE INDEX IF NOT EXISTS ix_obs_disp_time ON observation(dispensaryId, observedAt);
CREATE INDEX IF NOT EXISTS ix_product_dispensary ON product(dispensaryId);
`

export function ensureSchema(db: DatabaseSync): void {
  db.exec(SCHEMA)
}

// Open (or create) the DB with the schema applied and FK enforcement on. WAL + a busy_timeout
// are load-bearing: three independent local processes (Dutchie/Weedmaps feeders + the
// derivation runner) can open this same file, and without them a concurrent writer throws
// SQLITE_BUSY immediately instead of waiting briefly for the lock to clear.
export function openProductsDb(dbPath: string = DEFAULT_PRODUCTS_DB_PATH): DatabaseSync {
  if (dbPath !== ':memory:') mkdirSync(path.dirname(dbPath), { recursive: true })
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA busy_timeout = 5000')
  ensureSchema(db)
  return db
}

// node:sqlite params accept only string | number | bigint | null | Uint8Array. Objects and
// undefined are rejected, so complex fields are JSON-encoded and undefined coalesces to null.
const jsonOrNull = (v: unknown): string | null =>
  v === undefined || v === null ? null : JSON.stringify(v)
const numOrNull = (v: number | null | undefined): number | null =>
  v === undefined || v === null ? null : v
const strOrNull = (v: string | null | undefined): string | null =>
  v === undefined || v === null ? null : v

interface DbCounts {
  records: number
  observations: number
}

export function countRecords(db: DatabaseSync): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM product').get() as { n: number }
  return row.n
}
export function countObservations(db: DatabaseSync): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM observation').get() as { n: number }
  return row.n
}

function setMeta(db: DatabaseSync, key: string, value: string): void {
  db.prepare(
    'INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, value)
}
function getMeta(db: DatabaseSync, key: string): string | null {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
    | { value: string | null }
    | undefined
  return row ? row.value : null
}

// Upsert one product's descriptive identity (refreshed to the latest scrape, mirroring
// applyProductObservations) keyed by product_key.
function upsertProductStmt(db: DatabaseSync) {
  return db.prepare(`
    INSERT INTO product(
      product_key, dispensaryId, productId, name, category, brand, strainType,
      packCount, thc, cbd, totalTerpenes, effects, subcategory, flags
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(product_key) DO UPDATE SET
      name = excluded.name, category = excluded.category, brand = excluded.brand,
      strainType = excluded.strainType, packCount = excluded.packCount, thc = excluded.thc,
      cbd = excluded.cbd, totalTerpenes = excluded.totalTerpenes, effects = excluded.effects,
      subcategory = excluded.subcategory, flags = excluded.flags
  `)
}

function bindProduct(stmt: ReturnType<DatabaseSync['prepare']>, key: string, rec: ProductRecord) {
  stmt.run(
    key,
    rec.dispensaryId,
    rec.productId,
    rec.name,
    rec.category,
    strOrNull(rec.brand),
    strOrNull(rec.strainType),
    numOrNull(rec.packCount),
    jsonOrNull(rec.thc),
    jsonOrNull(rec.cbd),
    numOrNull(rec.totalTerpenes),
    jsonOrNull(rec.effects),
    strOrNull(rec.subcategory),
    JSON.stringify(rec.flags ?? []),
  )
}

// One-time / re-runnable full migration (AC1). DROP-and-recreate then bulk-insert the entire
// file so the import is idempotent and the counts are asserted against the exact source. Any
// duplicate (product_key, observedAt) would throw on the UNIQUE index — a LOUD failure is the
// correct posture for a "zero-loss" migration (never a silent drop).
export function importProductsFile(db: DatabaseSync, file: ProductsFile): DbCounts {
  db.exec('DROP TABLE IF EXISTS observation; DROP TABLE IF EXISTS product; DROP TABLE IF EXISTS meta')
  ensureSchema(db)

  const upsert = upsertProductStmt(db)
  const insertObs = db.prepare(
    'INSERT INTO observation(product_key, dispensaryId, observedAt, special, options_json) VALUES(?, ?, ?, ?, ?)',
  )

  let records = 0
  let observations = 0
  db.exec('BEGIN')
  try {
    for (const [key, rec] of Object.entries(file.products)) {
      bindProduct(upsert, key, rec)
      records++
      for (const obs of rec.history) {
        insertObs.run(
          key,
          rec.dispensaryId,
          obs.observedAt,
          obs.special ? 1 : 0,
          JSON.stringify(obs.options ?? []),
        )
        observations++
      }
    }
    setMeta(db, 'lastUpdated', file.lastUpdated ?? '')
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  return { records, observations }
}

// Append-only write path (AC7) mirroring applyProductObservations semantics: refresh the
// product's descriptive identity to the latest scrape and APPEND the new observation. Each
// incoming record carries exactly one fresh observation in history[0] (as the scrapers emit).
// INSERT OR IGNORE on the UNIQUE (product_key, observedAt) makes a re-run of the same scrape a
// no-op instead of a throw, so the home runner is safely idempotent. Records with empty history
// are skipped (mirrors applyProductObservations).
export function appendObservations(
  db: DatabaseSync,
  incoming: ProductRecord[],
  now: string,
): { productsSeen: number; observationsAppended: number } {
  const upsert = upsertProductStmt(db)
  const insertObs = db.prepare(
    'INSERT OR IGNORE INTO observation(product_key, dispensaryId, observedAt, special, options_json) VALUES(?, ?, ?, ?, ?)',
  )
  const existsObs = db.prepare('SELECT 1 FROM observation WHERE product_key = ? AND observedAt = ?')

  let productsSeen = 0
  let observationsAppended = 0
  db.exec('BEGIN')
  try {
    for (const rec of incoming) {
      const observation = rec.history[0]
      if (!observation) continue
      const key = PRODUCT_KEY(rec.dispensaryId, rec.productId)
      productsSeen++
      // Only refresh the product's identity (name/brand/thc/...) when this (product, day) is
      // genuinely new. A retry of an already-recorded pair may carry degraded data from a
      // partial page load — a true duplicate must not clobber previously-good metadata with
      // it. A brand-new product always has no prior observation, so its identity is still
      // written here (also required by the FK: observation.product_key REFERENCES product).
      const alreadyRecorded = existsObs.get(key, observation.observedAt) !== undefined
      if (!alreadyRecorded) bindProduct(upsert, key, rec)
      const res = insertObs.run(
        key,
        rec.dispensaryId,
        observation.observedAt,
        observation.special ? 1 : 0,
        JSON.stringify(observation.options ?? []),
      )
      if (res.changes > 0) observationsAppended++
    }
    setMeta(db, 'lastUpdated', now)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  return { productsSeen, observationsAppended }
}

// AC7 convenience: open the local DB, append a scrape batch (append-only, idempotent), close.
// The single DB write path the home scrape runners (Dutchie + Weedmaps) call. Replaces the
// JSON commit-back — the DB is the durable store now, so nothing large is ever committed.
export function persistObservationsToDb(
  incoming: ProductRecord[],
  now: string,
  dbPath: string = DEFAULT_PRODUCTS_DB_PATH,
): { productsSeen: number; observationsAppended: number } {
  const db = openProductsDb(dbPath)
  try {
    return appendObservations(db, incoming, now)
  } finally {
    db.close()
  }
}

interface ProductRow {
  product_key: string
  dispensaryId: string
  productId: string
  name: string
  category: string
  brand: string | null
  strainType: string | null
  packCount: number | null
  thc: string | null
  cbd: string | null
  totalTerpenes: number | null
  effects: string | null
  subcategory: string | null
  flags: string
}

interface ObsRow {
  product_key: string
  observedAt: string
  special: number
  options_json: string
}

function parseJson<T>(v: string | null): T | null {
  if (v === null) return null
  try {
    return JSON.parse(v) as T
  } catch {
    return null
  }
}

// THE SEAM (AC3). Reconstruct the exact `ProductsFile` shape the pure derivation functions
// consume, so they stay untouched. Observations are ordered by insertion (id) so
// `history.at(-1)` — the ONLY access the matcher/dealScope make — is the true latest, and the
// gap-tolerant history is faithful for the derivation engine. Fail-soft: a read error degrades
// to an empty file, mirroring readProducts().
export function readProductsFile(db: DatabaseSync): ProductsFile {
  const products: Record<string, ProductRecord> = {}

  const productRows = db.prepare('SELECT * FROM product').all() as unknown as ProductRow[]
  for (const r of productRows) {
    products[r.product_key] = {
      productId: r.productId,
      dispensaryId: r.dispensaryId,
      name: r.name,
      category: r.category,
      brand: r.brand,
      strainType: r.strainType,
      packCount: r.packCount,
      thc: parseJson<PotencyRange>(r.thc),
      cbd: parseJson<PotencyRange>(r.cbd),
      totalTerpenes: r.totalTerpenes,
      effects: parseJson<Record<string, number>>(r.effects),
      subcategory: r.subcategory,
      flags: parseJson<string[]>(r.flags) ?? [],
      history: [],
    }
  }

  const obsRows = db
    .prepare('SELECT product_key, observedAt, special, options_json FROM observation ORDER BY id')
    .all() as unknown as ObsRow[]
  for (const o of obsRows) {
    const rec = products[o.product_key]
    if (!rec) continue // orphan observation (shouldn't happen under FK) — skip defensively
    const observation: ProductObservation = {
      observedAt: o.observedAt,
      special: o.special === 1,
      options: parseJson<ProductOptionObservation[]>(o.options_json) ?? [],
    }
    rec.history.push(observation)
  }

  return { lastUpdated: getMeta(db, 'lastUpdated') ?? '', products }
}

// Open the local DB and return the ProductsFile. Used by the local derivation runner.
// Deliberately NOT fail-soft: this is the INPUT to a computation whose output gets committed
// and pushed to master (derive-facts-local.ps1). Swallowing a DB-open failure here would let
// a misconfigured PRODUCTS_DB_PATH, a permissions error, or a mid-write lock collision silently
// produce an empty ProductsFile that then overwrites the live derived facts served to
// gmaslist.com. The Express route layer (valueRoute.ts) is the one that stays fail-soft — it
// only ever reads already-computed derived files, never this DB.
export function readProductsFromDbPath(dbPath: string = DEFAULT_PRODUCTS_DB_PATH): ProductsFile {
  const db = openProductsDb(dbPath)
  try {
    return readProductsFile(db)
  } finally {
    db.close()
  }
}

// One windowed observation, joined to its product's descriptive identity. Deliberately carries
// ONLY the fields a per-SKU own-history fact needs — potency (thc/cbd/totalTerpenes/effects) and
// `flags` are NOT selected (SQL-level reinforcement of decision F / Gate 5, and no weight/$-per-
// gram claim is made by the fact that consumes this).
export interface WindowedObservationRow {
  product_key: string
  dispensaryId: string
  productId: string
  name: string
  category: string
  observedAt: string
  options: ProductOptionObservation[]
}

interface WindowedObsRow {
  product_key: string
  dispensaryId: string
  productId: string
  name: string
  category: string
  observedAt: string
  options_json: string
}

// derivation-2.1 (FR13) — the FIRST real consumer of the (product_key, observedAt) index designed
// into 1.0: a BOUNDED time-range read instead of the whole-file `readProductsFile` reconstruction.
// `sinceIso` is an inclusive lower bound (`observedAt >= ?`), so a row exactly at the window-start
// boundary is included. The AC-1 sorted-on-read guarantee lives in the SQL itself (ORDER BY
// product_key, observedAt) — never in caller convention — so a consumer walking a series never has
// to assume insertion order. Potency/flags are omitted at the SELECT (decision F reinforcement).
export function readWindowedObservations(db: DatabaseSync, sinceIso: string): WindowedObservationRow[] {
  const rows = db
    .prepare(
      `SELECT o.product_key, o.dispensaryId, p.productId, p.name, p.category, o.observedAt, o.options_json
       FROM observation o
       JOIN product p ON p.product_key = o.product_key
       WHERE o.observedAt >= ?
       ORDER BY o.product_key, o.observedAt`,
    )
    .all(sinceIso) as unknown as WindowedObsRow[]
  return rows.map((r) => ({
    product_key: r.product_key,
    dispensaryId: r.dispensaryId,
    productId: r.productId,
    name: r.name,
    category: r.category,
    observedAt: r.observedAt,
    options: parseJson<ProductOptionObservation[]>(r.options_json) ?? [],
  }))
}

// Open the local DB, read one window, close. Used by the local derivation runner. Deliberately
// NOT fail-soft, same rationale as readProductsFromDbPath: this feeds committed + pushed output, so
// a misconfigured PRODUCTS_DB_PATH or a mid-write lock collision must fail LOUD, never silently
// yield an empty window that overwrites the live derived facts.
export function readWindowedObservationsFromDbPath(
  sinceIso: string,
  dbPath: string = DEFAULT_PRODUCTS_DB_PATH,
): WindowedObservationRow[] {
  const db = openProductsDb(dbPath)
  try {
    return readWindowedObservations(db, sinceIso)
  } finally {
    db.close()
  }
}

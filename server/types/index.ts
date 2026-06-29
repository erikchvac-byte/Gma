import type { Deal } from '../../client/src/types/index.js'

export type ScraperResult = Deal[]

// Push-ingest contract (ADR-034 Goal A). One store's scraped result, POSTed to
// /api/ingest by the GitHub Actions runner. `IngestResult` is the per-store
// outcome surfaced back: 'ok' (deals applied), 'stale' (empty/invalid — good
// data kept), 'unknown' (no such dispensary in data.json).
export interface IngestEntry {
  dispensaryId: string
  deals: Deal[]
}

export type IngestResult = 'ok' | 'stale' | 'unknown'

export type LogEntry = string // "ok" | `error: ${string}`

export interface LogRun {
  runAt: string
  results: Record<string, LogEntry>
}

// --- Dutchie product / menu pricing (SPEC-dutchie-product-pricing) ----------
// A NEW, additive capability, fully decoupled from the Deal/specials pipeline
// (ADR-053). These types never touch Deal, filterActiveDeals, or /api/data.

// One weight/size option's pricing as extracted from FilteredProducts, BEFORE
// unit-economics normalization (CAP-1/CAP-2). Base price comes from the
// self-describing POSMetaData.children[] (matched by `option`); special price
// comes from the positional recSpecialPrices[i] — the only place it exists.
export interface RawProductOption {
  option: string // weight label, e.g. "2g", "3.5g"
  basePrice: number | null // POSMetaData.children matched by option
  specialPrice: number | null // positional recSpecialPrices[i]
  quantityAvailable: number | null
}

// One product as extracted from a FilteredProducts response (CAP-1/CAP-2),
// before normalization. `weightField` is the raw, unit-unresolved `weight`
// (a validation signal only — see CAP-5); `netWeightMg` is measurements.netWeight
// in MILLIGRAMS when present.
export interface RawProduct {
  productId: string
  name: string
  category: string // `type`: Pre-Rolls / Flower / Vaporizers
  brand: string | null
  strainType: string | null
  special: boolean
  weightField: number | null
  netWeightMg: number | null
  options: RawProductOption[]
}

// One option's normalized unit economics at one scrape time (CAP-5). Computed
// $/gram and $/item are stored IN the observation so historical math stays
// reproducible even if parsing logic later changes.
export interface ProductOptionObservation {
  option: string
  weightGrams: number | null // total grams for this option (parsed from `option`)
  basePrice: number | null
  specialPrice: number | null
  pricePerGram: number | null
  pricePerItem: number | null // base / packCount (pre-rolls only); null otherwise
  specialPricePerGram: number | null
  specialPricePerItem: number | null
  quantityAvailable: number | null
}

// One timestamped price observation for a product across all its options (CAP-6).
export interface ProductObservation {
  observedAt: string // ISO timestamp of the scrape
  special: boolean
  options: ProductOptionObservation[]
}

// A product's stable identity + descriptive fields + appended observation
// history (CAP-6). `packCount` is parsed from `name` (null = unparseable);
// `flags` records normalization caveats (e.g. 'unparseable-pack',
// 'unparseable-weight', 'weight-mismatch') so a bad parse is never silent.
export interface ProductRecord {
  productId: string
  dispensaryId: string
  name: string
  category: string
  brand: string | null
  strainType: string | null
  packCount: number | null
  flags: string[]
  history: ProductObservation[]
}

// The committed longitudinal dataset (CAP-4/CAP-6). Keyed by
// `${dispensaryId}::${productId}`. Append-only history, version-controlled in
// the repo (commit-back, Erik's decision 2026-06-24) — export format IS this JSON.
export interface ProductsFile {
  lastUpdated: string
  products: Record<string, ProductRecord>
}

// --- Cross-store value matcher (SPEC ai-search-data-strategy, Tier A item A1) ----
// The keystone proprietary fact: the SAME product priced across DIFFERENT stores.
// Additive + read-only — never touches Deal, /api/data, or the ProductsFile write
// path. Built by `buildDisparities` (server/utils/crossStoreValue.ts).

// One store's offer within a disparity, at the canonical weight. `price` is the real
// price paid: latest observation's `specialPrice ?? basePrice` (fix6 — discount % is
// not a value signal).
export interface DisparityStore {
  dispensaryId: string
  price: number
  quantityAvailable: number | null
}

// A like-for-like cross-store price disparity for one (product identity, canonical
// weight) carried by ≥2 distinct stores. Only same-weight absolute prices are
// compared — never cross-weight, never a whole-catalog $/gram leaderboard
// (value-analysis §4: that structurally surfaces trim). `spread = high - low`,
// `spreadPct = spread / low`.
export interface Disparity {
  matchKey: string
  displayName: string
  category: string
  weightGrams: number
  lowPrice: number
  highPrice: number
  spread: number
  spreadPct: number
  storesCarrying: DisparityStore[]
}

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

// A potency figure as the provider states it (spec-potency-extraction). `unit` is
// stored VERBATIM ('PERCENTAGE', 'MILLIGRAMS', …) and never converted — a number
// without its stated unit lies (Honest Math, ADR-007/009). A single-point payload
// range collapses to low === high.
export interface PotencyRange {
  unit: string
  low: number
  high: number
}

// One product as extracted from a FilteredProducts response (CAP-1/CAP-2),
// before normalization. `weightField` is the raw, unit-unresolved `weight`
// (a validation signal only — see CAP-5); `netWeightMg` is measurements.netWeight
// in MILLIGRAMS when present. Potency/effects/subcategory are provider-stated
// enrichment (spec-potency-extraction) — null whenever absent or malformed.
export interface RawProduct {
  productId: string
  name: string
  category: string // `type`: Pre-Rolls / Flower / Vaporizers
  brand: string | null
  strainType: string | null
  special: boolean
  weightField: number | null
  netWeightMg: number | null
  thc: PotencyRange | null
  cbd: PotencyRange | null
  // Provider-stated scalar whose unit is UNDOCUMENTED by the source (unlike
  // THCContent/CBDContent there is no self-describing alternative). Collected
  // verbatim as the only way to accrue it; do NOT compare across stores until the
  // unit is established empirically (review decision 2026-07-03).
  totalTerpenes: number | null
  effects: Record<string, number> | null
  subcategory: string | null
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
// Potency/effects/subcategory are RECORD-LEVEL descriptive identity — refreshed
// to the latest scrape like `name`/`brand`, deliberately NOT per-observation
// (spec-potency-extraction design note): listing-stable data on a file that
// grows daily. Optional (`?`) because committed pre-potency records lack them
// until the next scrape's identity refresh backfills.
export interface ProductRecord {
  productId: string
  dispensaryId: string
  name: string
  category: string
  brand: string | null
  strainType: string | null
  packCount: number | null
  thc?: PotencyRange | null
  cbd?: PotencyRange | null
  totalTerpenes?: number | null
  effects?: Record<string, number> | null
  subcategory?: string | null
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

// --- Deal→SKU scope bridge (deal-sku-bridge story) --------------------------------
// The one relationship the data model was missing: which in-store SKUs a free-text
// banner actually covers, and when. A read-only THIRD consumer joining the two
// deliberately decoupled pipelines (ADR-043/053) — Deal banners live in data.json,
// ProductRecords in products.json, on separate cadences. These types add NO field to
// Deal / ProductRecord / ProductsFile and touch NO write path (mirrors the A1 matcher).
//
// HONESTY (fix6-basePrice-verdict.md): a banner `discountPct` is a flat storewide/brand
// promo rate with NO per-item signal. A link is EXPLANATORY + TEMPORAL — "this banner
// covers these SKUs, on these days/times" — NEVER a savings computation. The observed
// `specialPrice` on a ProductRecord stays the price-of-record; the bridge sits beside it.

// The 3 BANNER-LINKABLE categories — the only categories the deal-scope bridge emits
// cues for and links to. Collection is now wider (DEFAULT_PRODUCT_CATEGORIES includes
// Edible + Concentrate, spec-category-expansion), and Concentrate even has an honest
// weight axis — but banner-linking either newcomer is a deliberate FUTURE decision
// (see deferred-work), not implied by collection. Records outside this set are never
// linked (any path, incl. storewide); banners targeting them stay `unsupported-category`
// or `unresolved`, counted, linked to nothing.
export type ScrapedCategory = 'Flower' | 'Vaporizers' | 'Pre-Rolls'

// A banner's inferred product scope (AC1). Exactly one kind. Ambiguity resolves to
// `unresolved`, NEVER silently to storewide. `brand` is classified-and-deferred (this
// deliverable does not attempt brand matching).
export type DealScope =
  | { kind: 'storewide' }
  | { kind: 'category'; category: ScrapedCategory; weightGrams: number | null }
  | { kind: 'unsupported-category'; targeted: string }
  | { kind: 'brand' }
  | { kind: 'unresolved' }

// One inferred link: a banner (identified by its within-store index + description) to the
// same store's SKUs it covers (AC2), carrying the deal's day/time window (AC3) so a
// consumer can answer "is SKU X on a banner deal right now" with the SAME logic as
// filterActiveDeals. `productIds` are ProductRecord.productId within `dispensaryId`.
export interface DealScopeLink {
  dispensaryId: string
  dealIndex: number
  dealDescription: string
  scope: DealScope
  productIds: string[]
  // Temporal inheritance from the deal (AC3) — mirror of filterActiveDeals' inputs.
  daysValid: string[]
  startTime: string | null
  endTime: string | null
}

// Bookkeeping so nothing is silently dropped (AC5) — same discipline as MatchReport.
// Every deal lands in exactly one counter; unplaceable scopes are counted, never fanned
// out storewide.
export interface DealScopeReport {
  links: DealScopeLink[]
  totalDeals: number
  storewideCount: number
  categoryCount: number
  linkedSkuCount: number // total productIds across all links (with multiplicity)
  // The counted, un-linked buckets (AC4c/AC4d).
  unsupportedCategoryCount: number
  brandCount: number
  unresolvedCount: number
  // A deal whose scope resolved but matched ZERO in-store SKUs — distinct from unresolved.
  zeroMatchCount: number
}

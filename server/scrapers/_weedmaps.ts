import { DEFAULT_PRODUCT_CATEGORIES } from './_dutchieProducts.js'
import type { RawProduct, RawProductOption } from '../types/index.js'

// Static Weedmaps PRODUCT source (AI-search Phase 2 — TYPE 3 `weedmaps-static-json`).
// A SECOND product source feeding the existing cross-store value matcher (A1, ADR-062/063):
// plain throttled HTTP GET (no Playwright, no scraper-svc), extract the page's
// `<script id="__NEXT_DATA__">` blob, walk it to `menuItems[]`, and map each item to the
// EXISTING `RawProduct` shape so it flows through the UNCHANGED `normalizeProduct` →
// `persistProductObservations` → matcher. The only genuinely new code is fetch + map; the
// reuse downstream is the architecture (mirror `_dutchieProducts.ts`).
//
// Source shape verified by a live read-only fetch 2026-06-28 (no browser) — see
// _bmad-output/implementation-artifacts/investigations/weedmaps-source-data-inventory.md
// and the captured fixture __fixtures__/weedmaps-western-bud.json. Scaled-crawl/rate-limit
// gate cleared 2026-06-29 (weedmaps-scaled-crawl-gate-result.md): crawl SHALLOW + throttled
// + nightly; re-probe from the runner IP before trusting a production cron.
//
// Defensive at every hop: a drift / challenge page / missing blob degrades to fewer products
// or [], never throws (mirrors scrapeDutchieProducts). Additive + decoupled (ADR-043/053):
// touches no Deal, /api/data, _dutchie*, normalizeProduct, or matcher code.

const BASE = 'https://weedmaps.com/dispensaries'

// A real desktop Chrome UA — the gate proved a desktop UA is served real menu JSON without
// a bot challenge. A blank/curl UA is more likely to trip the (currently benign) captcha ref.
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// Launch scope: the same three weight/pack categories the Dutchie product scraper keeps
// (DEFAULT_PRODUCT_CATEGORIES). Anything else is dropped at extraction. The shallow category
// subpages we crawl (gate caveat #1: do NOT exhaustively paginate the 1,500-product catalog).
// These are best-effort hints — the bare dispensary landing already returns a menu slice, and
// every page degrades to [] on a miss, so a wrong/redirecting slug is harmless.
const DEFAULT_CATEGORY_SLUGS = ['flower', 'pre-roll', 'vape-pens'] as const

// Coerce an unknown to a finite number or null (prices arrive as numbers but stay defensive
// against nulls / drift). Mirrors `_dutchieProducts.num`.
function num(x: unknown): number | null {
  return typeof x === 'number' && Number.isFinite(x) ? x : null
}

// ── menuItems shapes (everything optional/defensive so a live drift degrades, never throws) ──

interface WmTier {
  label?: string
  price?: number | null
  originalPrice?: number | null
  onSale?: boolean
  units?: string
}
interface WmCategoryRef {
  name?: string
  slug?: string
}
interface WmMenuItem {
  id?: string | number
  slug?: string
  name?: string
  brand?: string | { name?: string } | null
  // Weedmaps' `category` field is the STRAIN type (Indica/Sativa/Hybrid), NOT the product
  // category — the product category lives in `edgeCategory`. (Confirmed live, inventory doc.)
  category?: WmCategoryRef
  geneticsTag?: WmCategoryRef
  edgeCategory?: WmCategoryRef & { ancestors?: WmCategoryRef[] }
  price?: { complianceNetMg?: number | null }
  // `prices` is keyed by unit ("ounce"/"gram"/"each") → tier[]; it also carries scalar
  // siblings (e.g. `gramsPerEighth`) which we skip by taking only array values.
  prices?: Record<string, unknown>
}

// ── extraction: HTML → __NEXT_DATA__ JSON → menuItems[] ──

const NEXT_DATA_RE = /<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/

// Walk the dehydrated React-Query cache to every `menuItems[]` array and concat+dedupe.
// The JSON path is `props.dehydratedState.queries[].state.data.data.menuItems`; we also
// accept `state.data.menuItems` defensively in case a query nests one level shallower.
function collectMenuItems(nextData: unknown): WmMenuItem[] {
  const root = nextData as
    | {
        props?: {
          dehydratedState?: {
            queries?: Array<{
              state?: { data?: { data?: { menuItems?: unknown }; menuItems?: unknown } }
            }>
          }
        }
      }
    | undefined
  const queries = root?.props?.dehydratedState?.queries
  if (!Array.isArray(queries)) return []
  const byKey = new Map<string, WmMenuItem>()
  for (const q of queries) {
    const data = q?.state?.data
    const items = data?.data?.menuItems ?? data?.menuItems
    if (!Array.isArray(items)) continue
    for (const it of items as WmMenuItem[]) {
      const key = (it?.slug ?? it?.id ?? '').toString()
      if (key && !byKey.has(key)) byKey.set(key, it)
    }
  }
  return [...byKey.values()]
}

// Extract the menuItems array from one page's raw HTML. Missing/blocked/unparseable blob
// (e.g. a PerimeterX/DataDome challenge page carries no __NEXT_DATA__) degrades to [].
export function extractMenuItems(html: string): WmMenuItem[] {
  if (typeof html !== 'string') return []
  const m = html.match(NEXT_DATA_RE)
  if (!m) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(m[1])
  } catch {
    return []
  }
  return collectMenuItems(parsed)
}

// ── mapping: menuItems[] → RawProduct[] (conforms to the shape; never bends normalizeProduct) ──

type LaunchCategory = (typeof DEFAULT_PRODUCT_CATEGORIES)[number]

// edgeCategory (sub + ancestors) → the SAME vocabulary the Dutchie products use
// (DEFAULT_PRODUCT_CATEGORIES). Load-bearing for cross-source matching (AC3): without this the
// match key's category component never aligns and no cross-source disparity forms. Out-of-vocab
// products are dropped (launch scope), matching the Dutchie product scraper.
const CATEGORY_RULES: { match: RegExp; category: LaunchCategory }[] = [
  // pre-roll BEFORE flower (an "infused pre-roll" ancestor must not fall through to Flower)
  { match: /pre[-\s]?roll/, category: 'Pre-Rolls' },
  { match: /vape|vapor|cartridge|\bcart\b|\bpen/, category: 'Vaporizers' },
  { match: /flower/, category: 'Flower' },
]

function categoryHaystack(edge: WmMenuItem['edgeCategory']): string {
  if (!edge) return ''
  const parts: (string | undefined)[] = [edge.name, edge.slug]
  for (const a of edge.ancestors ?? []) parts.push(a.name, a.slug)
  return parts.filter(Boolean).join(' ').toLowerCase()
}

export function normalizeCategory(edge: WmMenuItem['edgeCategory']): LaunchCategory | null {
  const hay = categoryHaystack(edge)
  if (!hay) return null
  for (const rule of CATEGORY_RULES) if (rule.match.test(hay)) return rule.category
  return null
}

// The root category token used to split a brand prefix off the slug (Weedmaps-native word).
function rootCategorySlug(edge: WmMenuItem['edgeCategory']): string | null {
  const root = edge?.ancestors?.[0]?.slug ?? edge?.slug ?? null
  return root ? root.toLowerCase() : null
}

function titleCase(t: string): string {
  return t.length === 0 ? t : t[0].toUpperCase() + t.slice(1)
}

// Conservative brand recovery from the product slug when the JSON `brand` field is null
// (Open Q4 default — under-matching is the safe bias, ADR-062). The slug is
// `{brand-tokens}-{category}-{strain-tokens}-{hash}`; we take the tokens BEFORE the first
// category token as the brand, and ONLY when that yields a clean 1–4 token prefix. No clean
// delimiter → null (the matcher's strain token still keys the product).
export function brandFromSlug(slug: string | undefined, categoryToken: string | null): string | null {
  if (!slug || !categoryToken) return null
  const tokens = slug.toLowerCase().split('-').filter(Boolean)
  const catHead = categoryToken.split(/[-\s]/).filter(Boolean)[0]
  if (!catHead) return null
  const idx = tokens.indexOf(catHead)
  if (idx <= 0) return null // category token absent or no prefix before it → not confident
  const brandTokens = tokens.slice(0, idx)
  if (brandTokens.length === 0 || brandTokens.length > 4) return null
  return brandTokens.map(titleCase).join(' ')
}

function pickBrand(it: WmMenuItem): string | null {
  const raw = typeof it.brand === 'string' ? it.brand : it.brand?.name
  if (raw && raw.trim()) return raw.trim()
  return brandFromSlug(it.slug, rootCategorySlug(it.edgeCategory))
}

// Every weight tier in `prices.<unit>[]` → a RawProductOption. base = originalPrice ?? price;
// special = onSale ? price : null. Weedmaps exposes no reliable per-tier stock → quantityAvailable
// null (unknown), which the matcher's Gate 4 keeps. Deduped by option label (first wins).
function buildOptions(prices: WmMenuItem['prices']): RawProductOption[] {
  if (!prices || typeof prices !== 'object') return []
  const byLabel = new Map<string, RawProductOption>()
  for (const value of Object.values(prices)) {
    if (!Array.isArray(value)) continue // skip scalar siblings (gramsPerEighth, …)
    for (const tier of value as WmTier[]) {
      const label = (tier?.label ?? '').toString().replace(/\s+/g, ' ').trim()
      const price = num(tier?.price)
      if (!label || price === null || byLabel.has(label)) continue
      const onSale = tier?.onSale === true
      byLabel.set(label, {
        option: label,
        basePrice: num(tier?.originalPrice) ?? price,
        specialPrice: onSale ? price : null,
        quantityAvailable: null,
      })
    }
  }
  return [...byLabel.values()]
}

// Weedmaps names are "Strain | Sub-Category" ("Golden Pineapple | Big Buds", "OG Chem |
// Bong Buddies"). The part after the pipe is the Weedmaps line/sub-category, NOT the strain
// — keeping it would leak non-filler tokens ("big buds") into the match-key's strain
// signature and block every cross-source match against a Dutchie name. Strip to the strain.
function strainName(raw: string): string {
  const head = raw.split('|')[0].replace(/\s+/g, ' ').trim()
  return head || raw.replace(/\s+/g, ' ').trim()
}

function transformOne(it: WmMenuItem): RawProduct | null {
  const productId = (it?.slug ?? it?.id ?? '').toString()
  const name = strainName((it?.name ?? '').toString())
  if (!productId || !name) return null

  const category = normalizeCategory(it.edgeCategory)
  if (!category) return null // out-of-vocab → drop (launch scope, mirrors Dutchie products)

  const options = buildOptions(it.prices)
  if (options.length === 0) return null

  const special = options.some((o) => o.specialPrice !== null)

  return {
    productId,
    name,
    category,
    brand: pickBrand(it),
    strainType: (it.category?.name ?? it.geneticsTag?.name ?? null) || null,
    special,
    // Weedmaps has no ambiguous unit-unresolved `weight` field; netWeightMg comes from the
    // selected tier's complianceNetMg (validation signal only — normalizeProduct's weight
    // reconciliation is skipped here because weightField is null).
    weightField: null,
    netWeightMg: num(it.price?.complianceNetMg),
    options,
  }
}

export function transformWeedmapsProducts(menuItems: WmMenuItem[]): RawProduct[] {
  if (!Array.isArray(menuItems)) return []
  const out: RawProduct[] = []
  for (const it of menuItems) {
    const mapped = transformOne(it)
    if (mapped) out.push(mapped)
  }
  return out
}

// ── fetch: throttled static GET of the landing + shallow category subpages ──

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export interface FetchWeedmapsOptions {
  // injectable GET so the parse/throttle logic is unit-testable without a network call
  getFn?: (url: string, config: { headers: Record<string, string>; timeout: number }) => Promise<{ data: unknown }>
  categorySlugs?: readonly string[]
  // inter-request delay between the landing + each category subpage (ms; jittered by caller in the run)
  delayMs?: number
  label?: string
  timeoutMs?: number
}

// Fetch one store's menu: the dispensary landing page + a shallow set of category subpages,
// concat + dedupe across pages. Plain GET, desktop UA, follow redirects (fetch default). Never
// throws — a per-page error/challenge contributes [] and the others still load. The matcher only
// needs list price per SKU, so this shallow crawl suffices (no exhaustive pagination — gate caveat).
export async function fetchWeedmapsMenu(
  slug: string,
  opts: FetchWeedmapsOptions = {},
): Promise<RawProduct[]> {
  const get = opts.getFn ?? defaultGet
  const categorySlugs = opts.categorySlugs ?? DEFAULT_CATEGORY_SLUGS
  const delayMs = opts.delayMs ?? 0
  const timeout = opts.timeoutMs ?? 20000
  const label = opts.label ?? slug

  const urls = [`${BASE}/${slug}`, ...categorySlugs.map((c) => `${BASE}/${slug}/${c}`)]
  const byId = new Map<string, RawProduct>()

  for (let i = 0; i < urls.length; i++) {
    if (i > 0 && delayMs > 0) await sleep(delayMs)
    try {
      const { data } = await get(urls[i], {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
        timeout,
      })
      for (const p of transformWeedmapsProducts(extractMenuItems(typeof data === 'string' ? data : ''))) {
        if (!byId.has(p.productId)) byId.set(p.productId, p)
      }
    } catch (err) {
      console.error(`[weedmaps:${label}] ${urls[i]}`, err)
    }
  }
  return [...byId.values()]
}

// Native fetch (undici), NOT axios. From a clean residential IP, Weedmaps 406-walls axios's
// request fingerprint (its default header set / Node-TLS + HTTP/1.1) while serving 200 to
// undici/curl with the IDENTICAL UA + Accept headers — verified same-machine/same-IP 2026-06-30
// (ADR-065). Return the body as { data } to satisfy the injectable getFn contract; a non-2xx
// throws so the caller's per-page catch logs it and that page degrades to [] (preserves the prior
// axios fail-soft, since axios also threw on non-2xx). AbortSignal.timeout mirrors axios `timeout`.
const defaultGet: NonNullable<FetchWeedmapsOptions['getFn']> = async (url, config) => {
  const res = await fetch(url, {
    headers: config.headers,
    redirect: 'follow',
    signal: AbortSignal.timeout(config.timeout),
  })
  if (!res.ok) throw new Error(`weedmaps GET ${url} -> HTTP ${res.status}`)
  return { data: await res.text() }
}

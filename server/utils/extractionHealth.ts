import { walkPresenceAwareSeries } from './presenceAwareSeries.js'
import type { DayEntry } from './presenceAwareSeries.js'
import type { ProductsFile } from '../types/index.js'

// ADR-077 derivation-1.2.5 — flags a store whose menu likely broke in extraction versus is
// genuinely empty (decision C). Grounding note (story-creation, 2026-07-09): products.db alone
// cannot distinguish "scraped successfully, found 0 products" from "scrape silently failed" for
// a store with NO real observation history at all — both leave zero trace. So a 3rd status,
// 'insufficient-history', covers any store lacking a real trailing baseline (including zero),
// rather than guessing. The collapse mechanism (today vs. trailing median) is reserved for
// stores that HAD real accrued history and then genuinely dropped — see the story file's
// grounding section for the live worked example.

export const TRAILING_WINDOW_DAYS = 14
// The two newest-onboarded stores in the live dataset (as of story-creation) had only 9 days of
// total history — a 5-day floor is reachable by every currently-active store while still
// excluding same-day-onboarded noise.
export const MIN_BASELINE_DAYS = 5
// Largest normal day-to-day swing observed live (~26%, kush21-everett-evergreen) sits
// comfortably above this threshold; the real collapse this fact is built to catch (~73%,
// the 2020-solutions pair) sits comfortably below it.
export const COLLAPSE_RATIO = 0.5

export type StoreHealthStatus = 'ok' | 'suspected-extraction-failure' | 'insufficient-history'

export interface StoreHealthEntry {
  dispensaryId: string
  status: StoreHealthStatus
  todayCount: number | null
  trailingMedian: number | null
  observedDaysInWindow: number
}

export interface ExtractionHealthReport {
  entries: StoreHealthEntry[]
  totalStores: number
  okCount: number
  suspectedCount: number
  insufficientHistoryCount: number
}

interface DayItem {
  observedAt: string
  productId: string
}

// Subtract `days` calendar days from a `YYYY-MM-DD` string, UTC-safe (setUTCDate handles
// month/year rollover correctly, mirroring presenceAwareSeries.ts's day-stepping approach).
// Not imported from there — that module's day arithmetic is internal, not exported.
function subtractDaysUTC(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

// Array.prototype.filter doesn't narrow a discriminated union's element type without an
// explicit type predicate — this keeps `.value` access below type-checked instead of a raw cast.
function hasValue(entry: DayEntry<number>): entry is Exclude<DayEntry<number>, { status: 'gap' }> {
  return entry.status !== 'gap'
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function groupByDispensary(productsFile: ProductsFile): Map<string, DayItem[]> {
  const byStore = new Map<string, DayItem[]>()
  for (const rec of Object.values(productsFile.products)) {
    const bucket = byStore.get(rec.dispensaryId)
    const items = bucket ?? []
    if (!bucket) byStore.set(rec.dispensaryId, items)
    for (const obs of rec.history) {
      items.push({ observedAt: obs.observedAt, productId: rec.productId })
    }
  }
  return byStore
}

function buildStoreEntry(dispensaryId: string, items: DayItem[], today: string): StoreHealthEntry {
  const startDate = subtractDaysUTC(today, TRAILING_WINDOW_DAYS)
  const walk =
    items.length === 0
      ? []
      : walkPresenceAwareSeries(items, {
          getObservedAt: (i) => i.observedAt,
          getValue: (dayItems) => new Set(dayItems.map((i) => i.productId)).size,
          startDate,
          endDate: today,
        })

  const todayEntry = walk.find((e) => e.date === today)
  const todayCount = todayEntry && todayEntry.status !== 'gap' ? todayEntry.value : null

  const trailingValues = walk
    .filter((e): e is Exclude<DayEntry<number>, { status: 'gap' }> => e.date !== today && hasValue(e))
    .map((e) => e.value)

  if (trailingValues.length < MIN_BASELINE_DAYS) {
    return {
      dispensaryId,
      status: 'insufficient-history',
      todayCount,
      trailingMedian: null,
      observedDaysInWindow: trailingValues.length,
    }
  }

  const trailingMedian = median(trailingValues)
  const collapsed = todayCount === null || todayCount < trailingMedian * COLLAPSE_RATIO

  return {
    dispensaryId,
    status: collapsed ? 'suspected-extraction-failure' : 'ok',
    todayCount,
    trailingMedian,
    observedDaysInWindow: trailingValues.length,
  }
}

export function buildExtractionHealthReport(
  productsFile: ProductsFile,
  storeIds: string[],
  today: string,
): ExtractionHealthReport {
  const byStore = groupByDispensary(productsFile)
  const entries = storeIds.map((id) => buildStoreEntry(id, byStore.get(id) ?? [], today))

  let okCount = 0
  let suspectedCount = 0
  let insufficientHistoryCount = 0
  for (const entry of entries) {
    if (entry.status === 'ok') okCount++
    else if (entry.status === 'suspected-extraction-failure') suspectedCount++
    else insufficientHistoryCount++
  }

  return { entries, totalStores: entries.length, okCount, suspectedCount, insufficientHistoryCount }
}

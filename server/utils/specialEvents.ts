import { walkPresenceAwareSeries } from './presenceAwareSeries.js'
import type { ProductObservation, ProductsFile } from '../types/index.js'

// ADR-077 derivation-1.3 (D1/FR8) — list prices are sticky (0% median drift, first-look Finding
// 1), so all real daily price movement is a special starting or ending. `ProductObservation.special`
// is ALREADY the correct per-observation signal for both sources (Dutchie sets it straight from the
// source's own flag; Weedmaps ORs it across weight-tier `specialPrice` presence) — this module does
// NOT re-derive it from per-option `specialPrice`. Per-SKU, gap-tolerant via the 1.2 helper (Gate 3):
// a store-wide extraction gap shows up as 'gap' for every affected product, never a fabricated event.

export type SpecialEventType = 'special-start' | 'special-end'

// Identity + event only — deliberately NO price/discount field (Gate 2/fix6: the banner/special
// discount magnitude carries no honest signal; this reports THAT a special changed, never how good
// a deal it is).
export interface SpecialEvent {
  dispensaryId: string
  productId: string
  name: string
  category: string
  type: SpecialEventType
  date: string
}

export interface SpecialEventsReport {
  events: SpecialEvent[]
  totalProducts: number
  startCount: number
  endCount: number
  unchangedCount: number
  gapCount: number
  firstObservationCount: number
}

export function buildSpecialEventsReport(productsFile: ProductsFile, today: string): SpecialEventsReport {
  const events: SpecialEvent[] = []
  let startCount = 0
  let endCount = 0
  let unchangedCount = 0
  let gapCount = 0
  let firstObservationCount = 0

  for (const rec of Object.values(productsFile.products)) {
    let walk
    try {
      walk = walkPresenceAwareSeries(rec.history, {
        getObservedAt: (o: ProductObservation) => o.observedAt,
        getValue: (dayItems: ProductObservation[]) => dayItems.at(-1)!.special,
        endDate: today,
      })
    } catch {
      // A product whose entire history postdates `today` (clock skew, a bad `observedAt`, a
      // manual DB repair) makes walkPresenceAwareSeries' default startDate (that product's own
      // earliest day) land after `endDate`, which throws. Treat it the same as "no observation
      // today" rather than letting one anomalous product abort the whole derive run.
      gapCount++
      continue
    }
    const todayEntry = walk.find((e) => e.date === today)

    if (!todayEntry || todayEntry.status === 'gap') {
      gapCount++
      continue
    }
    if (todayEntry.status === 'first') {
      firstObservationCount++
      continue
    }
    if (todayEntry.status === 'unchanged') {
      unchangedCount++
      continue
    }

    // 'changed'
    const type: SpecialEventType = todayEntry.value ? 'special-start' : 'special-end'
    events.push({
      dispensaryId: rec.dispensaryId,
      productId: rec.productId,
      name: rec.name,
      category: rec.category,
      type,
      date: today,
    })
    if (type === 'special-start') startCount++
    else endCount++
  }

  return {
    events,
    totalProducts: Object.keys(productsFile.products).length,
    startCount,
    endCount,
    unchangedCount,
    gapCount,
    firstObservationCount,
  }
}

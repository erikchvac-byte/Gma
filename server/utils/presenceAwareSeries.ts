// ADR-077 Gate 3 primitive (derivation-1.2). Distinguishes "no observation that day" (gap)
// from "observed, unchanged" so trend/delta facts (1.2.5, 1.3, Epic 2) don't have to
// reimplement gap-tolerant day-walking themselves. Stays generic over item/value type so it
// can back a per-SKU series (price, special) or a per-store series (daily product count)
// without any domain type ever being imported here.

export type DayEntry<V> =
  | { date: string; status: 'gap' }
  | { date: string; status: 'first'; value: V }
  | { date: string; status: 'unchanged'; value: V }
  | { date: string; status: 'changed'; value: V; previousValue: V }

export interface WalkSeriesOptions<T, V> {
  getObservedAt: (item: T) => string
  getValue: (dayItems: T[]) => V
  // Default is strict `===`, which is a reference-equality trap for object/array-valued V and
  // never equates NaN to itself. Pass a custom comparator for anything but primitives.
  equals?: (a: V, b: V) => boolean
  // Restricts the walk to this window. A day at the start of an explicit range is still labeled
  // 'first' even if real observations exist earlier outside the window — callers needing true
  // historical continuity must include enough lead-in days themselves.
  startDate?: string
  endDate?: string
}

// Internal boundary: observedAt is trusted to already be a well-formed ISO timestamp (as every
// current/anticipated caller's data source guarantees), so no defensive parsing here.
export function toCalendarDay(observedAt: string): string {
  return new Date(observedAt).toISOString().slice(0, 10)
}

function nextCalendarDay(day: string): string {
  const d = new Date(`${day}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export function walkPresenceAwareSeries<T, V>(
  items: T[],
  options: WalkSeriesOptions<T, V>,
): DayEntry<V>[] {
  const { getObservedAt, getValue, equals = (a: V, b: V) => a === b, startDate, endDate } = options

  const byDay = new Map<string, T[]>()
  for (const item of items) {
    const day = toCalendarDay(getObservedAt(item))
    const bucket = byDay.get(day)
    if (bucket) bucket.push(item)
    else byDay.set(day, [item])
  }

  if (byDay.size === 0) return []

  const observedDays = [...byDay.keys()].sort()
  const rangeStart = startDate ?? observedDays[0]
  const rangeEnd = endDate ?? observedDays[observedDays.length - 1]
  if (rangeStart > rangeEnd) {
    throw new Error(`startDate (${rangeStart}) must not be after endDate (${rangeEnd})`)
  }

  const result: DayEntry<V>[] = []
  let lastObserved: { value: V } | undefined

  for (let day = rangeStart; day <= rangeEnd; day = nextCalendarDay(day)) {
    const dayItems = byDay.get(day)
    if (!dayItems) {
      result.push({ date: day, status: 'gap' })
      continue
    }

    const value = getValue(dayItems)
    if (!lastObserved) {
      result.push({ date: day, status: 'first', value })
    } else if (equals(lastObserved.value, value)) {
      result.push({ date: day, status: 'unchanged', value })
    } else {
      result.push({ date: day, status: 'changed', value, previousValue: lastObserved.value })
    }
    lastObserved = { value }
  }

  return result
}

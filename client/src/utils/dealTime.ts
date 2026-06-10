import type { Deal } from '../types'

const MINUTES_PER_DAY = 24 * 60
const TIME_PATTERN = /^(\d{1,2}):(\d{2})$/

// Returns minutes since midnight, or NaN for malformed/out-of-range strings
// (e.g. "4pm", "25:00") so callers can fail soft without throwing.
export function parseTimeToMinutes(time: string): number {
  const match = TIME_PATTERN.exec(time)
  if (match === null) return NaN
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return NaN
  return hours * 60 + minutes
}

export function minutesUntilEnd(endTime: string, now: Date): number {
  const endMinutes = parseTimeToMinutes(endTime)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const diff = endMinutes - nowMinutes
  // overnight windows (e.g. 22:00-02:00) end "tomorrow" — wrap past midnight
  return diff < 0 ? diff + MINUTES_PER_DAY : diff
}

// A deal has a fully-valid timed window only when BOTH times are present and
// parseable. This single predicate drives expiry, countdown, and sort-tier
// routing so the three can never disagree about a degenerate shape.
export function hasValidTimedWindow(deal: Deal): boolean {
  return (
    deal.startTime != null &&
    deal.endTime != null &&
    !Number.isNaN(parseTimeToMinutes(deal.startTime)) &&
    !Number.isNaN(parseTimeToMinutes(deal.endTime))
  )
}

// Mirrors server/utils/filterActiveDeals.ts minus daysValid (the server
// already day-filtered at fetch; the client tick only removes): the server
// treats ANY null time as day-long-active, so every shape without a fully
// valid timed window (nulls, partial, malformed) is never dropped client-side.
export function isDealActive(deal: Deal, now: Date): boolean {
  if (!hasValidTimedWindow(deal)) return true

  const start = parseTimeToMinutes(deal.startTime as string)
  const end = parseTimeToMinutes(deal.endTime as string)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  if (end > start) {
    // same-day window [start, end) — startTime-aware, so ended-earlier-today
    // is dropped instead of wrapping to "ends tomorrow"
    return nowMinutes >= start && nowMinutes < end
  }
  // overnight window (e.g. 22:00-02:00): active across midnight
  return nowMinutes >= start || nowMinutes < end
}

import type { Deal } from '../../client/src/types/index.js'

const DAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'everyday',
]
// 24-hour HH:MM, e.g. '09:00', '23:30' — the format filterActiveDeals parses.
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

function isValidTime(time: unknown): boolean {
  return typeof time === 'string' && TIME_RE.test(time)
}

// A window is usable when:
//   - both times null  -> all-day (kept)
//   - exactly one null -> one-sided ('9:00 PM – close'); the present time parses
//   - both present     -> both parse AND differ. start === end is a zero-length
//                         window that filterActiveDeals' overnight branch would
//                         promote to ALWAYS-active — reject it.
// Overnight (end < start, e.g. 22:00–02:00) is intentional and kept.
function hasUsableWindow(deal: Deal): boolean {
  const { startTime, endTime } = deal
  if (startTime !== null && !isValidTime(startTime)) return false
  if (endTime !== null && !isValidTime(endTime)) return false
  if (startTime !== null && endTime !== null && startTime === endTime) return false
  return true
}

// daysValid must be a non-empty array of the vocabulary filterActiveDeals
// matches against (full lowercase day names or 'everyday'). Anything else is
// silently dropped by the consumer, so reject at ingestion (retro lesson 2).
function hasUsableDays(deal: Deal): boolean {
  return (
    Array.isArray(deal.daysValid) &&
    deal.daysValid.length > 0 &&
    deal.daysValid.every((day) => DAY_NAMES.includes(day))
  )
}

function isUsableDeal(item: unknown): item is Deal {
  if (item === null || typeof item !== 'object') return false
  const deal = item as Deal
  return hasUsableWindow(deal) && hasUsableDays(deal)
}

// Reject malformed/degenerate deals at the scraper-ingestion chokepoint
// (runScrapers) so junk data never reaches data.json or filterActiveDeals.
// Valid deals pass through unchanged; if every deal is rejected the caller's
// empty-deals contract takes over (stale=true, prior deals untouched).
export function normalizeDeals(deals: Deal[]): Deal[] {
  return deals.filter(isUsableDeal)
}

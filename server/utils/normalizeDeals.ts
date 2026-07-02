import type { Deal } from '../../client/src/types/index.js'
import { sanitizeDescription } from './sanitizeDescription.js'

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

// Reject malformed/degenerate deals at the push-ingestion chokepoint
// (applyIngest <- POST /api/ingest; ADR-034 retired the in-process scraper) so
// junk data never reaches data.json or filterActiveDeals. Surviving deals also
// have their third-party description sanitized for compliance (markup/emoji/length
// stripped, therapeutic-claim & youth-appeal copy suppressed) -- see
// sanitizeDescription. A suppressed description blanks only that field; the deal is
// kept, so this never falsely trips the caller's empty-deals (stale) contract.
export function normalizeDeals(deals: Deal[]): Deal[] {
  return deals.filter(isUsableDeal).map((deal) => {
    const out: Deal = { ...deal, description: sanitizeDescription(deal.description) }
    // providerNote is third-party body text (captured for investigation, not yet
    // displayed) — sanitize it on its OWN so a blocked term in the note can never
    // suppress the visible `description`. Drop the field when it sanitizes to '' (the
    // common case: absent, empty, or blocklisted) so data.json stays uncluttered.
    if (out.providerNote !== undefined) {
      const note = sanitizeDescription(out.providerNote)
      if (note) out.providerNote = note
      else delete out.providerNote
    }
    return out
  })
}

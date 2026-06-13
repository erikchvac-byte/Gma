import type { Deal } from '../../client/src/types/index.js'
import { type Intercepted, type ScrapeRequest } from '../utils/scraperClient.js'

// Shared, store-agnostic Dutchie logic. Every Dutchie store serves the identical
// GraphQL shape, so the transform lives here once; the per-store files only supply
// their embed id. The `_` prefix marks this a non-store helper (like `_template.ts`).

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

// Dutchie embed iframe URL for a store id (ADR-017 / Scraper HANDOFF). Navigate the
// embed URL directly — NOT the dispensary's own site (the host embed is lazy/flaky).
export function dutchieEmbedUrl(storeId: string): string {
  return `https://dutchie.com/embedded-menu/${storeId}`
}

// Request preset: browser tier + GraphQL network interception for a Dutchie menu.
export function dutchieRequest(storeId: string): ScrapeRequest {
  return {
    url: dutchieEmbedUrl(storeId),
    intercept_pattern: 'dutchie\\.com.*(graphql|api-0)',
    wait_for_pattern: 'dutchie\\.com/graphql',
    tier: 'browser',
    headless: true,
    timeout: 45000,
  }
}

// --- Assumed GetSpecialMenuCards shape -------------------------------------
// Synthesized from the documented Dutchie schema (Scraper HANDOFF). No real
// capture exists until the deferred live pass; the fixture is the single
// reconciliation point. Field access stays defensive so a live shape delta
// degrades to skipped cards / [], never a throw. See the 4.3 spec Design Notes.
interface DutchieSpecialCard {
  title?: string
  name?: string
  discountPercent?: number | null
  days?: string[] | null
  window?: { start?: string; end?: string } | null
}

// Locate the GetSpecialMenuCards intercept and return its special cards (or []).
export function pickSpecials(intercepted: Intercepted[]): DutchieSpecialCard[] {
  const entry = intercepted.find((i) => /GetSpecialMenuCards/i.test(i.url))
  if (!entry) return []
  const data = entry.data as { data?: { specialMenuCards?: { specials?: unknown } } } | undefined
  const specials = data?.data?.specialMenuCards?.specials
  return Array.isArray(specials) ? (specials as DutchieSpecialCard[]) : []
}

// Full lowercase day names (or 'everyday') — the vocabulary filterActiveDeals
// matches. Accepts full names or abbreviations, any case.
function normalizeDays(days: string[] | null | undefined): string[] {
  if (!Array.isArray(days) || days.length === 0) return ['everyday']
  const mapped = days
    .map((d) => (typeof d === 'string' ? d.toLowerCase().trim() : ''))
    .map((d) => (d ? WEEKDAYS.find((w) => w.startsWith(d) || d.startsWith(w)) : undefined))
    .filter((d): d is string => Boolean(d))
  return mapped.length > 0 ? Array.from(new Set(mapped)) : ['everyday']
}

function parsePercent(card: DutchieSpecialCard, name: string): number | null {
  if (typeof card.discountPercent === 'number' && Number.isFinite(card.discountPercent)) {
    return card.discountPercent
  }
  const m = name.match(/(\d+)\s*%/)
  return m ? parseInt(m[1], 10) : null
}

// GetSpecialMenuCards → Deal[]. A recurring time-of-day window → happy_hour with
// 24h strings; otherwise daily (the common case — Dutchie specials are mostly
// all-day, and calendar start/end DATES are sale validity, not time windows).
export function transformSpecials(intercepted: Intercepted[]): Deal[] {
  const deals: Deal[] = []
  for (const card of pickSpecials(intercepted)) {
    const name = (card?.title ?? card?.name ?? '').toString().replace(/\s+/g, ' ').trim()
    if (!name) continue // skip nameless / malformed cards

    const start = card?.window?.start
    const end = card?.window?.end
    let type: Deal['type'] = 'daily'
    let startTime: string | null = null
    let endTime: string | null = null
    if (typeof start === 'string' && typeof end === 'string' && HHMM.test(start) && HHMM.test(end)) {
      type = 'happy_hour'
      startTime = start
      endTime = end
    }

    deals.push({
      type,
      description: name,
      discountPct: parsePercent(card, name),
      startTime,
      endTime,
      daysValid: normalizeDays(card?.days),
    })
  }
  return deals
}

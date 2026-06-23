import type { Deal } from '../../client/src/types/index.js'
import { type Intercepted, type ScrapeRequest } from '../utils/scraperClient.js'

// Shared, store-agnostic Dutchie logic. Every Dutchie store serves the identical
// GraphQL shape, so the transform lives here once; the per-store files only supply
// their embed id. The `_` prefix marks this a non-store helper (like `_template.ts`).
//
// SHAPE RECONCILED against live captures 2026-06-13 (the-joint / jet / kush21 — see
// _bmad-output/specs/spec-4-3-live-pass/live-findings-2026-06-13.md). The earlier
// synthesized assumptions (specialMenuCards.specials, discountPercent, days[],
// window) were wrong on every field; this is the real GetSpecialMenuCards shape.

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

// Dutchie embed iframe URL for a store id (ADR-017 / Scraper HANDOFF). Navigate the
// embed URL directly — NOT the dispensary's own site (the host embed is lazy/flaky).
export function dutchieEmbedUrl(storeId: string): string {
  return `https://dutchie.com/embedded-menu/${storeId}`
}

// Request preset: browser tier + GraphQL network interception for a Dutchie menu.
// Wait specifically for the GetSpecialMenuCards op — not just any GraphQL call.
// Large menus (e.g. kush21, 150+ specials) emit it late in the load; waiting on the
// first generic `dutchie.com/graphql` ends collection before the specials arrive,
// silently yielding zero deals. Confirmed in the live pass 2026-06-13.
export function dutchieRequest(storeId: string): ScrapeRequest {
  return {
    url: dutchieEmbedUrl(storeId),
    intercept_pattern: 'dutchie\\.com.*(graphql|api-0)',
    wait_for_pattern: 'GetSpecialMenuCards',
    tier: 'browser',
    headless: true,
    timeout: 45000,
  }
}

// --- Real GetSpecialMenuCards shape ----------------------------------------
// Live operation field is `getSpecialMenuCards.menuCards`. Each card carries free
// display text only — there is NO numeric discount field and NO structured day or
// time-window field. Percent and weekday restrictions are parsed out of the text.
// Field access stays defensive so a live shape drift degrades to skipped cards / [],
// never a throw.
interface DutchieSpecialCard {
  menuDisplayName?: string
  menuDisplayDescription?: string
  specialType?: string
  // recurringSchedule holds time-of-day / recurrence when a special is timed, but
  // it was null on every live card sampled (no live timed special exists yet), so
  // its shape is unverified. happy_hour support is deferred until a real sample
  // appears — see deferred-work.md. Until then every Dutchie special maps to daily.
  recurringSchedule?: unknown | null
}

// Locate the GetSpecialMenuCards intercept and return its menu cards (or []).
export function pickSpecials(intercepted: Intercepted[]): DutchieSpecialCard[] {
  const entry = intercepted.find((i) => /GetSpecialMenuCards/i.test(i.url))
  if (!entry) return []
  const data = entry.data as { data?: { getSpecialMenuCards?: { menuCards?: unknown } } } | undefined
  const cards = data?.data?.getSpecialMenuCards?.menuCards
  return Array.isArray(cards) ? (cards as DutchieSpecialCard[]) : []
}

// Day restrictions live only in free display text (e.g. "Storewide - Monday & Friday").
// Parse full weekday names (and unambiguous 3-letter forms) when present; otherwise
// the special is everyday. Returns full lowercase names in canonical week order —
// the only vocabulary filterActiveDeals.ts matches.
const DAY_ALIASES: Record<string, string> = {
  sunday: 'sunday', sun: 'sunday',
  monday: 'monday', mon: 'monday',
  tuesday: 'tuesday', tue: 'tuesday', tues: 'tuesday',
  wednesday: 'wednesday', wed: 'wednesday',
  thursday: 'thursday', thu: 'thursday', thurs: 'thursday',
  friday: 'friday', fri: 'friday',
  saturday: 'saturday', sat: 'saturday',
}
function parseDays(text: string): string[] {
  const found = new Set<string>()
  const re = /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues?|wed|thurs?|fri|sat)\b/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const full = DAY_ALIASES[m[1].toLowerCase()]
    if (full) found.add(full)
  }
  return WEEKDAYS.filter((d) => found.has(d))
}

// First whole-number percent in the text (e.g. "40% OFF" → 40), else null. Live
// discounts are always expressed as a whole-number percent in the display text.
function parsePercent(text: string): number | null {
  const m = text.match(/(\d+)\s*%/)
  return m ? parseInt(m[1], 10) : null
}

// A title that quotes a literal price (e.g. "$50 Crossroads Ounce").
const PRICE_IN_TITLE = /\$\s*\d/

// Resolve the badge percent for a card. parsePercent reads name + the (often invisible)
// menuDisplayDescription, but the displayed title is the name ALONE — so a "% off" living
// only in the description would badge a PRICE-titled card with a discount its own visible
// title contradicts ("$50 …" shown, "50% off" badged; see ADR-050). Guard: when the title
// states a price and carries no percent of its own, drop any description-sourced percent.
// Prose titles with no price keep the description percent — there the badge is the only
// place the number appears (e.g. "Join the Joint…" / "20% OFF ALL ONLINE ORDERS"). A title
// stating BOTH a price and its own percent (e.g. "$50 Oz - 50% off") keeps that percent.
function resolveDiscountPct(name: string, text: string): number | null {
  if (PRICE_IN_TITLE.test(name) && parsePercent(name) === null) return null
  return parsePercent(text)
}

// GetSpecialMenuCards → Deal[]. Every live special is all-day → daily (times null).
// description ← menuDisplayName; discountPct + daysValid are parsed from the combined
// name + description text. Cards with no usable name are skipped (never throw).
export function transformSpecials(intercepted: Intercepted[]): Deal[] {
  const deals: Deal[] = []
  for (const card of pickSpecials(intercepted)) {
    const name = (card?.menuDisplayName ?? '').toString().replace(/\s+/g, ' ').trim()
    if (!name) continue // skip nameless / malformed cards
    const description = (card?.menuDisplayDescription ?? '').toString().replace(/\s+/g, ' ').trim()
    const text = `${name} ${description}`

    const days = parseDays(text)
    deals.push({
      type: 'daily',
      description: name,
      discountPct: resolveDiscountPct(name, text),
      startTime: null,
      endTime: null,
      daysValid: days.length > 0 ? days : ['everyday'],
    })
  }
  return deals
}

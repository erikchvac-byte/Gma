import axios from 'axios'
import * as cheerio from 'cheerio'
import type { Deal } from '../../client/src/types/index.js'
import type { DealScrapeOutcome } from '../types/index.js'

const URL = 'https://remedytulalip.com/promos/'

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

// Match an explicit time window like "7-8am", "9am-9pm", "10:30am - 2pm".
// The end meridiem (am/pm) is required; the start meridiem is inferred from the
// end when omitted ("7-8am" → both am). Returns 24-hour "HH:MM" strings or null.
function parseWindow(text: string): { startTime: string; endTime: string } | null {
  const m = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[-–—]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i)
  if (!m) return null
  const [, sh, sm, sap, eh, em, eap] = m
  const endAp = eap.toLowerCase()
  const startAp = (sap ?? eap).toLowerCase()
  const to24 = (h: string, mm: string | undefined, ap: string) => {
    let hour = parseInt(h, 10) % 12
    if (ap === 'pm') hour += 12
    return `${String(hour).padStart(2, '0')}:${(mm ?? '00').padStart(2, '0')}`
  }
  return { startTime: to24(sh, sm, startAp), endTime: to24(eh, em, endAp) }
}

function parseDiscount(text: string): number | null {
  const m = text.match(/(\d+)\s*%/)
  return m ? parseInt(m[1], 10) : null
}

// Full lowercase day names (or 'everyday') — the vocabulary filterActiveDeals
// matches against. A weekday named in the title wins; otherwise 'everyday'.
function parseDays(title: string): string[] {
  const lower = title.toLowerCase()
  const days = WEEKDAYS.filter((d) => lower.includes(d))
  if (days.length > 0) return days
  return ['everyday']
}

export function parse(html: string): Deal[] {
  const $ = cheerio.load(html)
  const deals: Deal[] = []

  $('li.el-item').each((_, el) => {
    const title = $(el).find('.el-title').text().replace(/\s+/g, ' ').trim()
    const contentEl = $(el).find('.el-content')
    const contentRaw = contentEl.text().replace(/\s+/g, ' ').trim()
    const combined = `${title} ${contentRaw}`

    // Only deal cards carry "NN% Off"; this skips nav/footer/other el-items.
    if (!/\d+\s*%/.test(combined) || !/off/i.test(combined)) return

    const window = parseWindow(combined)
    const discountPct = parseDiscount(combined)
    const daysValid = parseDays(title)

    // Description: prefer the content when it carries the offer ("15% Off …");
    // otherwise the title states the offer (happy-hour / group cards). Trim
    // trailing fine print after the first bullet, plus trailing :/*.
    const content = contentRaw.split('•')[0].trim()
    const titleClean = title.replace(/[:\s*]+$/, '').trim()
    let description: string
    if (/\d+\s*%/.test(content)) {
      description = content
    } else {
      // Title carries the offer; the content (when present) qualifies it. A real
      // <li> list names who/what the offer applies to — e.g. the customer groups
      // "Military Veterans, Tribal Members, Wisdom (50+)" — and would otherwise be
      // dropped, leaving a card that promises a list it never shows. Capture those
      // items onto the title. Ignore bulleted fine print (starts with •) and
      // empty/emphasis-only content (happy-hour's "*complete before 8am" caveat).
      const items = contentEl
        .find('li')
        .map((_, li) => $(li).text().replace(/\s+/g, ' ').trim())
        .get()
        .filter((t) => t !== '' && !t.startsWith('•'))
      description = items.length > 0 ? `${titleClean}: ${items.join(', ')}` : titleClean
    }

    deals.push({
      type: window ? 'happy_hour' : 'daily',
      description,
      discountPct,
      startTime: window ? window.startTime : null,
      endTime: window ? window.endTime : null,
      daysValid,
    })
  })

  return deals
}

// Axios+Cheerio has no positive no-deals signal (an empty promo page and a
// silently-changed selector look identical), so this source can never assert
// `confirmedEmpty: true` (ADR-083) — empties always degrade to stale.
export default async function scrape(): Promise<DealScrapeOutcome> {
  try {
    const { data } = await axios.get(URL, {
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GmaHelper/1.0)' },
    })
    return { deals: parse(data), confirmedEmpty: false }
  } catch (err) {
    // Log for operator monitoring (FR-12) — matches _template.ts; runScrapers
    // still marks the source stale on the returned empty outcome.
    console.error('[scraper:remedy-tulalip]', err)
    return { deals: [], confirmedEmpty: false }
  }
}

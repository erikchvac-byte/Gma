import type { Dispensary, Deal } from '../../client/src/types/index.js'

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

function isDealActive(deal: Deal, now: Date): boolean {
  const today = DAY_NAMES[now.getDay()]
  const dayMatches = deal.daysValid.includes('everyday') || deal.daysValid.includes(today)
  if (!dayMatches) return false

  if (deal.startTime === null || deal.endTime === null) return true

  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  return nowMinutes >= parseTimeToMinutes(deal.startTime) && nowMinutes < parseTimeToMinutes(deal.endTime)
}

export function filterActiveDeals(dispensaries: Dispensary[], now: Date = new Date()): Dispensary[] {
  return dispensaries.map((dispensary) => ({
    ...dispensary,
    deals: dispensary.deals.filter((deal) => isDealActive(deal, now)),
  }))
}

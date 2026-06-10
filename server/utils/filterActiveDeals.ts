import type { Dispensary, Deal } from '../../client/src/types/index.js'

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

function isDealActive(deal: Deal, now: Date): boolean {
  const today = DAY_NAMES[now.getDay()]
  const dayMatches = (day: string) => deal.daysValid.includes('everyday') || deal.daysValid.includes(day)

  if (deal.startTime === null || deal.endTime === null) return dayMatches(today)

  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const startMinutes = parseTimeToMinutes(deal.startTime)
  const endMinutes = parseTimeToMinutes(deal.endTime)

  if (endMinutes > startMinutes) {
    return dayMatches(today) && nowMinutes >= startMinutes && nowMinutes < endMinutes
  }

  // Overnight deal (e.g. 22:00-02:00): active from startTime to midnight on a
  // valid day, and from midnight to endTime on the day after a valid day.
  const yesterday = DAY_NAMES[(now.getDay() + 6) % 7]
  return (dayMatches(today) && nowMinutes >= startMinutes) || (dayMatches(yesterday) && nowMinutes < endMinutes)
}

export function filterActiveDeals(dispensaries: Dispensary[], now: Date = new Date()): Dispensary[] {
  return dispensaries.map((dispensary) => ({
    ...dispensary,
    deals: dispensary.deals.filter((deal) => isDealActive(deal, now)),
  }))
}

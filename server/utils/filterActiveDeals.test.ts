process.env.TZ = 'America/Los_Angeles'

import { describe, it, expect } from 'vitest'
import { filterActiveDeals } from './filterActiveDeals.js'
import type { Dispensary, Deal } from '../../client/src/types/index.js'

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

// Wednesday, June 10 2026, 2:30pm Pacific
const NOW = new Date(2026, 5, 10, 14, 30, 0)
const TODAY = DAY_NAMES[NOW.getDay()]
const OTHER_DAY = DAY_NAMES[(NOW.getDay() + 3) % 7]

function makeDispensary(deals: Deal[]): Dispensary {
  return {
    id: 'test-dispensary',
    name: 'Test Dispensary',
    url: 'https://example.com/',
    distanceMiles: 1,
    stale: false,
    lastFetchedAt: '2026-06-09T00:00:00.000Z',
    deals,
  }
}

describe('filterActiveDeals', () => {
  it('filters out a happy_hour deal whose endTime has already passed (AC2)', () => {
    const expiredDeal: Deal = {
      type: 'happy_hour',
      description: 'Expired Happy Hour',
      discountPct: 10,
      startTime: '11:00',
      endTime: '13:00',
      daysValid: [TODAY],
    }

    const result = filterActiveDeals([makeDispensary([expiredDeal])], NOW)

    expect(result[0].deals).toHaveLength(0)
  })

  it('keeps a happy_hour deal currently active (AC3)', () => {
    const activeDeal: Deal = {
      type: 'happy_hour',
      description: 'Active Happy Hour',
      discountPct: 20,
      startTime: '14:00',
      endTime: '16:00',
      daysValid: [TODAY],
    }

    const result = filterActiveDeals([makeDispensary([activeDeal])], NOW)

    expect(result[0].deals).toEqual([activeDeal])
  })

  it('keeps a daily deal valid today (AC4)', () => {
    const dailyDeal: Deal = {
      type: 'daily',
      description: 'Daily Special',
      discountPct: 5,
      startTime: null,
      endTime: null,
      daysValid: [TODAY],
    }

    const result = filterActiveDeals([makeDispensary([dailyDeal])], NOW)

    expect(result[0].deals).toEqual([dailyDeal])
  })

  it('filters out a deal whose daysValid does not include today', () => {
    const wrongDayDeal: Deal = {
      type: 'daily',
      description: 'Wrong Day Special',
      discountPct: 5,
      startTime: null,
      endTime: null,
      daysValid: [OTHER_DAY],
    }

    const result = filterActiveDeals([makeDispensary([wrongDayDeal])], NOW)

    expect(result[0].deals).toHaveLength(0)
  })

  it('keeps an "everyday" deal that is currently active', () => {
    const everydayDeal: Deal = {
      type: 'happy_hour',
      description: 'Everyday Happy Hour',
      discountPct: 15,
      startTime: '14:00',
      endTime: '15:00',
      daysValid: ['everyday'],
    }

    const result = filterActiveDeals([makeDispensary([everydayDeal])], NOW)

    expect(result[0].deals).toEqual([everydayDeal])
  })

  it('keeps an overnight deal active after midnight on the day after daysValid (e.g. Tue 22:00-02:00, now Wed 00:30)', () => {
    const yesterday = DAY_NAMES[(NOW.getDay() + 6) % 7]
    const overnightDeal: Deal = {
      type: 'happy_hour',
      description: 'Late Night Special',
      discountPct: 10,
      startTime: '22:00',
      endTime: '02:00',
      daysValid: [yesterday],
    }

    const earlyMorning = new Date(2026, 5, 10, 0, 30, 0)
    const result = filterActiveDeals([makeDispensary([overnightDeal])], earlyMorning)

    expect(result[0].deals).toEqual([overnightDeal])
  })

  it('keeps an overnight deal active before midnight on a daysValid day (e.g. Wed 22:00-02:00, now Wed 23:00)', () => {
    const overnightDeal: Deal = {
      type: 'happy_hour',
      description: 'Late Night Special',
      discountPct: 10,
      startTime: '22:00',
      endTime: '02:00',
      daysValid: [TODAY],
    }

    const lateNight = new Date(2026, 5, 10, 23, 0, 0)
    const result = filterActiveDeals([makeDispensary([overnightDeal])], lateNight)

    expect(result[0].deals).toEqual([overnightDeal])
  })

  it('filters out an overnight deal once endTime has passed the next morning', () => {
    const overnightDeal: Deal = {
      type: 'happy_hour',
      description: 'Late Night Special',
      discountPct: 10,
      startTime: '22:00',
      endTime: '02:00',
      daysValid: [DAY_NAMES[(NOW.getDay() + 6) % 7]],
    }

    const morning = new Date(2026, 5, 10, 9, 0, 0)
    const result = filterActiveDeals([makeDispensary([overnightDeal])], morning)

    expect(result[0].deals).toHaveLength(0)
  })

  it('never removes a dispensary, even when all its deals are filtered out', () => {
    const expiredDeal: Deal = {
      type: 'happy_hour',
      description: 'Expired Happy Hour',
      discountPct: 10,
      startTime: '11:00',
      endTime: '13:00',
      daysValid: [TODAY],
    }

    const result = filterActiveDeals([makeDispensary([expiredDeal])], NOW)

    expect(result).toHaveLength(1)
    expect(result[0].deals).toEqual([])
  })
})

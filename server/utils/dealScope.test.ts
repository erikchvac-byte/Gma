import { describe, it, expect } from 'vitest'
import { parseDealScope, isDealScopeLinkActive } from './dealScope.js'
import type { Deal } from '../../client/src/types/index.js'
import type { DealScopeLink } from '../types/index.js'

// Unit coverage for the scope parser (AC1) over REAL banner strings, plus the temporal
// mirror (AC3). The parser is pure over the Deal — it never sees a product or a price,
// so a scope can never encode a per-item saving (fix6 honesty gate).

function deal(description: string, over: Partial<Deal> = {}): Deal {
  return {
    type: 'daily',
    description,
    discountPct: null,
    startTime: null,
    endTime: null,
    daysValid: ['everyday'],
    ...over,
  }
}

describe('parseDealScope (AC1)', () => {
  it('weight-qualified flower: "50% off Ounces" ⇒ Flower @ 28g', () => {
    expect(parseDealScope(deal('50% off Ounces — Monday'))).toEqual({
      kind: 'category',
      category: 'Flower',
      weightGrams: 28,
    })
  })

  it('weight-qualified flower: "$25 Eighths" ⇒ Flower @ 3.5g (ADR-054 fractional-oz snap)', () => {
    expect(parseDealScope(deal('$25 Eighths all day'))).toEqual({
      kind: 'category',
      category: 'Flower',
      weightGrams: 3.5,
    })
  })

  it('spaced fractional-ounce eighth "1/8 oz" ⇒ Flower @ 3.5g (eighth wins over the "oz" cue)', () => {
    expect(parseDealScope(deal('$25 1/8 oz Fridays'))).toEqual({
      kind: 'category',
      category: 'Flower',
      weightGrams: 3.5,
    })
  })

  it('bare flower has no weight qualifier ⇒ Flower @ null', () => {
    expect(parseDealScope(deal('Flower Friday'))).toEqual({
      kind: 'category',
      category: 'Flower',
      weightGrams: null,
    })
  })

  it('pre-roll is classified BEFORE flower (infused pre-roll must not fall through)', () => {
    expect(parseDealScope(deal('Infused Pre-Rolls 2 for $20'))).toEqual({
      kind: 'category',
      category: 'Pre-Rolls',
      weightGrams: null,
    })
  })

  it('vape/cartridge ⇒ Vaporizers', () => {
    expect(parseDealScope(deal('Vape Cartridge Blowout'))).toEqual({
      kind: 'category',
      category: 'Vaporizers',
      weightGrams: null,
    })
  })

  it('"cart"/"cartridge" still ⇒ Vaporizers, but "your cart" is the shopping-cart false friend', () => {
    expect(parseDealScope(deal('Cart Sale — all day')).kind).toBe('category')
    expect(parseDealScope(deal('Cart Sale — all day'))).toEqual({
      kind: 'category',
      category: 'Vaporizers',
      weightGrams: null,
    })
    // "your cartridge" is NOT the false friend — cartridge is matched on its own.
    expect(parseDealScope(deal('20% off your cartridge order')).kind).toBe('category')
    // "your cart" / "in your cart" = shopping cart → not vape; no other cue ⇒ unresolved.
    expect(parseDealScope(deal('20% off your cart'))).toEqual({ kind: 'unresolved' })
    expect(parseDealScope(deal('Everything in your cart is on sale')).kind).toBe('storewide')
  })

  it('explicit storewide signal ⇒ storewide', () => {
    expect(parseDealScope(deal('40% Storewide'))).toEqual({ kind: 'storewide' })
    expect(parseDealScope(deal('20% OFF ALL ONLINE ORDERS'))).toEqual({ kind: 'storewide' })
  })

  it('out-of-catalog target ⇒ unsupported-category (counted, never fanned out)', () => {
    const scope = parseDealScope(deal('15% Off Edibles + Drinks'))
    expect(scope.kind).toBe('unsupported-category')
    if (scope.kind === 'unsupported-category') expect(scope.targeted).toBe('edibles')
  })

  it('"all edibles" is edibles-scoped, NOT storewide (out-of-catalog wins over "all")', () => {
    expect(parseDealScope(deal('20% off all edibles')).kind).toBe('unsupported-category')
  })

  it('"all flower" is Flower-scoped, NOT storewide', () => {
    expect(parseDealScope(deal('20% off all flower'))).toEqual({
      kind: 'category',
      category: 'Flower',
      weightGrams: null,
    })
  })

  it('brand cue ⇒ brand (deferred stub — classified, never matched)', () => {
    expect(parseDealScope(deal('Brand of the Day — 25% off'))).toEqual({ kind: 'brand' })
  })

  it('"brand new" is a false friend, guarded out ⇒ unresolved', () => {
    expect(parseDealScope(deal('Brand new deals dropping today'))).toEqual({ kind: 'unresolved' })
  })

  it('ambiguity resolves to unresolved, NEVER silently to storewide', () => {
    expect(parseDealScope(deal('Happy Hour 4-6pm'))).toEqual({ kind: 'unresolved' })
    expect(parseDealScope(deal('Big savings today!'))).toEqual({ kind: 'unresolved' })
  })
})

describe('isDealScopeLinkActive (AC3 — mirror of filterActiveDeals)', () => {
  function link(over: Partial<DealScopeLink>): DealScopeLink {
    return {
      dispensaryId: 's',
      dealIndex: 0,
      dealDescription: 'x',
      scope: { kind: 'storewide' },
      productIds: [],
      daysValid: ['everyday'],
      startTime: null,
      endTime: null,
      ...over,
    }
  }

  const monday17 = new Date(2026, 5, 29, 17, 0) // 2026-06-29 is a Monday, 17:00 local
  const monday19 = new Date(2026, 5, 29, 19, 0)
  const tuesday17 = new Date(2026, 5, 30, 17, 0)

  it('everyday + no window ⇒ always active', () => {
    expect(isDealScopeLinkActive(link({}), tuesday17)).toBe(true)
  })

  it('windowed on a valid day ⇒ active inside the window, inactive outside', () => {
    const l = link({ daysValid: ['monday'], startTime: '16:00', endTime: '18:00' })
    expect(isDealScopeLinkActive(l, monday17)).toBe(true)
    expect(isDealScopeLinkActive(l, monday19)).toBe(false)
    expect(isDealScopeLinkActive(l, tuesday17)).toBe(false)
  })

  it('overnight window (22:00–02:00) spans midnight from a valid day', () => {
    const l = link({ daysValid: ['monday'], startTime: '22:00', endTime: '02:00' })
    expect(isDealScopeLinkActive(l, new Date(2026, 5, 29, 23, 0))).toBe(true) // Mon 23:00
    expect(isDealScopeLinkActive(l, new Date(2026, 5, 30, 1, 0))).toBe(true) // Tue 01:00 (after valid Mon)
    expect(isDealScopeLinkActive(l, new Date(2026, 5, 30, 12, 0))).toBe(false) // Tue noon
  })
})

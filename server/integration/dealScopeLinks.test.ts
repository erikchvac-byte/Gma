import { describe, it, expect } from 'vitest'
import { buildDealScopeLinks } from '../utils/dealScope.js'
import type { Deal, Dispensary } from '../../client/src/types/index.js'
import type { ProductRecord, ProductsFile } from '../types/index.js'

// The join proof (AC2/AC3/AC4/AC5): fixture deals + fixture products → expected links and
// report buckets. Asserts the load-bearing honesty behaviours — NO storewide fan-out on
// ambiguous text, flagged records excluded on a weight-qualified scope, out-of-catalog
// banners counted-not-linked, zero-match distinct from unresolved, same-store linkage only.

const NOW = '2026-06-29T12:00:00.000Z'

function rec(
  productId: string,
  dispensaryId: string,
  category: string,
  opts: { option: string; price: number | null }[],
  flags: string[] = [],
): ProductRecord {
  return {
    productId,
    dispensaryId,
    name: productId,
    category,
    brand: null,
    strainType: null,
    packCount: null,
    flags,
    history: [
      {
        observedAt: NOW,
        special: false,
        options: opts.map((o) => ({
          option: o.option,
          weightGrams: null,
          basePrice: o.price,
          specialPrice: null,
          pricePerGram: null,
          pricePerItem: null,
          specialPricePerGram: null,
          specialPricePerItem: null,
          quantityAvailable: 5,
        })),
      },
    ],
  }
}

function file(records: ProductRecord[]): ProductsFile {
  return {
    lastUpdated: NOW,
    products: Object.fromEntries(records.map((r) => [`${r.dispensaryId}::${r.productId}`, r])),
  }
}

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

function store(id: string, deals: Deal[]): Dispensary {
  return { id, name: id, url: '', stale: false, lastFetchedAt: NOW, deals }
}

describe('buildDealScopeLinks (deal→SKU bridge)', () => {
  // One store with a representative product mix.
  const products = file([
    rec('flower28', 'kushmart-north', 'Flower', [{ option: '28g', price: 100 }]),
    rec('flower35', 'kushmart-north', 'Flower', [{ option: '3.5g', price: 20 }]),
    rec('vape1g', 'kushmart-north', 'Vaporizers', [{ option: '1g', price: 30 }]),
    rec('flowerFlagged', 'kushmart-north', 'Flower', [{ option: '28g', price: 90 }], ['weight-mismatch']),
    rec('flowerUnpriced', 'kushmart-north', 'Flower', [{ option: '28g', price: null }]),
    // A different store's ounce — must NEVER be linked to a kushmart deal.
    rec('otherOunce', 'other-store', 'Flower', [{ option: '28g', price: 50 }]),
  ])

  it('weight-qualified ounce scope links ONLY same-store 28g flower, excludes flagged/unpriced/other-store', () => {
    const data = { dispensaries: [store('kushmart-north', [deal('50% off Ounces')])] }
    const report = buildDealScopeLinks(data, products)

    expect(report.links).toHaveLength(1)
    const link = report.links[0]
    expect(link.dispensaryId).toBe('kushmart-north')
    expect(link.scope).toEqual({ kind: 'category', category: 'Flower', weightGrams: 28 })
    // flower28 only: flower35 wrong weight, flowerFlagged excluded (AC4b), flowerUnpriced
    // has no price, otherOunce is a different store (AC2 same-store only).
    expect(link.productIds).toEqual(['flower28'])
    expect(report.categoryCount).toBe(1)
    expect(report.linkedSkuCount).toBe(1)
    expect(report.zeroMatchCount).toBe(0)
  })

  it('storewide links ALL priced same-store SKUs (flagged INCLUDED, unpriced excluded)', () => {
    const data = { dispensaries: [store('kushmart-north', [deal('40% Storewide')])] }
    const report = buildDealScopeLinks(data, products)

    expect(report.storewideCount).toBe(1)
    expect(report.links).toHaveLength(1)
    // flagged record IS covered by storewide (AC4b flag-exclusion is weight-scoped only);
    // only the unpriced record and the other store drop out.
    expect(report.links[0].productIds.sort()).toEqual(
      ['flower28', 'flower35', 'flowerFlagged', 'vape1g'].sort(),
    )
    expect(report.linkedSkuCount).toBe(4)
  })

  it('out-of-catalog and ambiguous deals are COUNTED but link to nothing (no fan-out)', () => {
    const data = {
      dispensaries: [
        store('kushmart-north', [deal('15% Off Edibles + Drinks'), deal('Happy Hour 4-6pm')]),
      ],
    }
    const report = buildDealScopeLinks(data, products)

    expect(report.links).toHaveLength(0) // NOTHING fanned across the flower menu
    expect(report.unsupportedCategoryCount).toBe(1)
    expect(report.unresolvedCount).toBe(1)
    expect(report.totalDeals).toBe(2)
    expect(report.linkedSkuCount).toBe(0)
  })

  it('resolved scope with zero matching SKUs ⇒ zero-match (distinct from unresolved)', () => {
    // Vaporizers scope against a store that has only flower → resolves, matches nothing.
    const flowerOnly = file([rec('f', 'kushmart-north', 'Flower', [{ option: '3.5g', price: 20 }])])
    const data = { dispensaries: [store('kushmart-north', [deal('Vape Cartridge Blowout')])] }
    const report = buildDealScopeLinks(data, flowerOnly)

    expect(report.categoryCount).toBe(1) // it WAS classified
    expect(report.zeroMatchCount).toBe(1) // but matched nothing
    expect(report.unresolvedCount).toBe(0) // NOT the same as unresolved
    expect(report.links).toHaveLength(0)
  })

  it('degrades to empty for a store with deals but no products — never throws', () => {
    const data = { dispensaries: [store('ghost-store', [deal('40% Storewide')])] }
    const report = buildDealScopeLinks(data, products)
    expect(report.storewideCount).toBe(1)
    expect(report.zeroMatchCount).toBe(1)
    expect(report.links).toHaveLength(0)
  })

  it('links inherit the deal day/time window (AC3 temporal inheritance)', () => {
    const data = {
      dispensaries: [
        store('kushmart-north', [
          deal('50% off Ounces', { daysValid: ['monday'], startTime: '16:00', endTime: '18:00' }),
        ]),
      ],
    }
    const report = buildDealScopeLinks(data, products)
    const link = report.links[0]
    expect(link.daysValid).toEqual(['monday'])
    expect(link.startTime).toBe('16:00')
    expect(link.endTime).toBe('18:00')
  })

  it('full report bookkeeping accounts for every deal (AC5 — none silently dropped)', () => {
    const data = {
      dispensaries: [
        store('kushmart-north', [
          deal('50% off Ounces'), // category (linked)
          deal('40% Storewide'), // storewide (linked)
          deal('15% Off Edibles'), // unsupported
          deal('Brand of the Day 25% off'), // brand
          deal('Happy Hour'), // unresolved
          deal('Vape Blowout'), // category but zero-match? vape1g exists → linked
        ]),
      ],
    }
    const report = buildDealScopeLinks(data, products)
    expect(report.totalDeals).toBe(6)
    expect(report.categoryCount).toBe(2) // ounces + vape
    expect(report.storewideCount).toBe(1)
    expect(report.unsupportedCategoryCount).toBe(1)
    expect(report.brandCount).toBe(1)
    expect(report.unresolvedCount).toBe(1)
    // every deal is in exactly one scope-class counter
    expect(
      report.categoryCount +
        report.storewideCount +
        report.unsupportedCategoryCount +
        report.brandCount +
        report.unresolvedCount,
    ).toBe(report.totalDeals)
  })
})

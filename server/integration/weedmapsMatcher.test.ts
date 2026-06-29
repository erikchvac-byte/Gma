import { describe, it, expect } from 'vitest'
import { transformWeedmapsProducts } from '../scrapers/_weedmaps.js'
import { normalizeProduct } from '../utils/normalizeProduct.js'
import { applyProductObservations } from '../utils/productsStore.js'
import { buildDisparities, buildMatchReport } from '../utils/crossStoreValue.js'
import type { ProductsFile, RawProduct } from '../types/index.js'

// AC7 / AC8 — the wiring proof: a Weedmaps-sourced record and a Dutchie-sourced record for the
// SAME SKU flow through the UNCHANGED normalize → persist → matcher and produce ONE reconciled
// cross-source disparity, with ZERO edit to crossStoreValue.ts / productMatchKey.ts. And an
// OVERLAP store (same physical store, two sources) never self-disparates.

const NOW = '2026-06-29T12:00:00.000Z'

// A real Weedmaps menuItem (OG Chem | Bong Buddies, Phat Panda via slug, 2g, on-sale $8.40/$14).
const wmOgChemMenuItem = [
  {
    id: 902,
    slug: 'phat-panda-flower-og-chem-bong-buddies-a1b2c3d4',
    name: 'OG Chem | Bong Buddies',
    brand: null,
    category: { name: 'Hybrid', slug: 'hybrid' },
    edgeCategory: { name: 'Bong Buddies', slug: 'bong-buddies', ancestors: [{ name: 'Flower', slug: 'flower' }] },
    price: { label: '2g', complianceNetMg: 2000, price: 8.4, onSale: true, originalPrice: 14 },
    prices: { gram: [{ label: '2g', price: 8.4, onSale: true, originalPrice: 14 }] },
  },
]

// The Dutchie-sourced counterpart of the same SKU (brand/strain/category/weight align).
function dutchieOgChem(over: Partial<RawProduct> = {}): RawProduct {
  return {
    productId: 'dutchie-og-chem',
    name: 'OG Chem',
    category: 'Flower',
    brand: 'Phat Panda',
    strainType: 'Hybrid',
    special: false,
    weightField: null,
    netWeightMg: null,
    options: [{ option: '2g', basePrice: 14, specialPrice: null, quantityAvailable: 6 }],
    ...over,
  }
}

function fileFrom(records: { raw: RawProduct; store: string }[]): ProductsFile {
  const normalized = records.map((r) => normalizeProduct(r.raw, r.store, NOW))
  return applyProductObservations({ lastUpdated: '', products: {} }, normalized, NOW)
}

describe('Weedmaps → matcher integration (AC7)', () => {
  it('a Weedmaps and a Dutchie record for the same SKU → exactly one cross-source disparity', () => {
    const wmRaw = transformWeedmapsProducts(wmOgChemMenuItem)
    expect(wmRaw).toHaveLength(1)

    const file = fileFrom([
      { raw: wmRaw[0], store: 'western-bud-burlington' }, // Weedmaps store, real price 8.40
      { raw: dutchieOgChem(), store: 'kushmart-north' }, // Dutchie store, price 14
    ])

    const disparities = buildDisparities(file)
    expect(disparities).toHaveLength(1)
    const d = disparities[0]
    expect(d.weightGrams).toBe(2)
    expect(d.lowPrice).toBe(8.4) // Weedmaps special is the real low
    expect(d.highPrice).toBe(14)
    expect(d.storesCarrying.map((s) => s.dispensaryId).sort()).toEqual([
      'kushmart-north',
      'western-bud-burlington',
    ])
  })

  it('an OVERLAP store (same id, two sources) does NOT self-disparate; cheapest source wins', () => {
    const wmRaw = transformWeedmapsProducts(wmOgChemMenuItem)
    // 2020-solutions-pacific-highway carries the SAME SKU from BOTH sources (Dutchie $14,
    // Weedmaps special $8.40). A second distinct store (kushmart) carries it at $12.
    const file = fileFrom([
      { raw: wmRaw[0], store: '2020-solutions-pacific-highway' }, // Weedmaps 8.40
      { raw: dutchieOgChem({ productId: 'dutchie-2020' }), store: '2020-solutions-pacific-highway' }, // Dutchie 14
      { raw: dutchieOgChem({ productId: 'dutchie-kush', options: [{ option: '2g', basePrice: 12, specialPrice: null, quantityAvailable: 3 }] }), store: 'kushmart-north' },
    ])

    const disparities = buildDisparities(file)
    // exactly one disparity, across TWO distinct stores (not a 2020-vs-2020 self-disparity)
    expect(disparities).toHaveLength(1)
    const stores = disparities[0].storesCarrying
    expect(stores).toHaveLength(2)
    const byId = Object.fromEntries(stores.map((s) => [s.dispensaryId, s.price]))
    expect(byId['2020-solutions-pacific-highway']).toBe(8.4) // cheaper Weedmaps source won (B2)
    expect(byId['kushmart-north']).toBe(12)
  })

  it('all records are accounted for (none silently dropped — AC5 bookkeeping holds)', () => {
    const wmRaw = transformWeedmapsProducts(wmOgChemMenuItem)
    const file = fileFrom([
      { raw: wmRaw[0], store: 'western-bud-burlington' },
      { raw: dutchieOgChem(), store: 'kushmart-north' },
    ])
    const report = buildMatchReport(file)
    expect(report.totalRecords).toBe(2)
    expect(report.placedRecords).toBe(2)
    expect(report.unmatchedCount).toBe(0)
    expect(report.excludedFlagCount).toBe(0)
  })
})

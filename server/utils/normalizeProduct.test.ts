import { describe, it, expect } from 'vitest'
import { normalizeProduct, parseGrams, parsePackCount } from './normalizeProduct.js'
import type { RawProduct } from '../types/index.js'

const AT = '2026-06-24T12:00:00.000Z'

function preRoll(over: Partial<RawProduct> = {}): RawProduct {
  return {
    productId: 'p1',
    name: "Mama J's: Alien Rock Candy - PR 2pk",
    category: 'Pre-Rolls',
    brand: "mama J's",
    strainType: 'Indica',
    special: true,
    weightField: 1000, // per-unit mg
    netWeightMg: 2000, // total mg
    options: [{ option: '2g', basePrice: 8, specialPrice: 4, quantityAvailable: 25 }],
    ...over,
  }
}

describe('parsePackCount', () => {
  it.each([
    ["Mama J's: Alien Rock Candy - PR 2pk", 2],
    ['Blue Dream 5-pack', 5],
    ['Sativa 3 pack pre-rolls', 3],
    ['Mini joints 10ct', 10],
    ['House 5 joints', 5],
    ['Single Flower 1g', null],
    ['No pack here', null],
  ])('parses %j → %j', (name, expected) => {
    expect(parsePackCount(name)).toBe(expected)
  })
})

describe('parseGrams', () => {
  it.each([
    ['2g', 2],
    ['3.5g', 3.5],
    ['14g', 14],
    ['0.5g', 0.5],
    ['100mg', 0.1],
    ['1oz', 28.35],
    ['weird', null],
  ])('parses %j → %j', (option, expected) => {
    expect(parseGrams(option)).toBe(expected)
  })
})

describe('normalizeProduct — pre-roll $/gram + $/joint (CAP-5)', () => {
  it('computes correct per-gram and per-joint for the 2g/2-pack at $8 ($4 special)', () => {
    const rec = normalizeProduct(preRoll(), 'kushmart-north', AT)
    expect(rec.packCount).toBe(2)
    expect(rec.flags).toEqual([]) // weight reconciles: 2g = 2000mg = 1000mg×2
    const o = rec.history[0].options[0]
    expect(o).toMatchObject({
      option: '2g',
      weightGrams: 2,
      basePrice: 8,
      specialPrice: 4,
      pricePerGram: 4, // 8 / 2g
      pricePerItem: 4, // 8 / 2 joints
      specialPricePerGram: 2, // 4 / 2g
      specialPricePerItem: 2, // 4 / 2 joints
    })
  })

  it('a 3-pack and a 5-pack of equal total weight yield DIFFERENT $/item, same $/g', () => {
    // Two pre-rolls, both 5g total at $25, but one is a 3-pack and one a 5-pack.
    const threePack = normalizeProduct(
      preRoll({
        productId: 'three',
        name: 'House Sativa 3pk',
        netWeightMg: 5000,
        weightField: null, // per-unit weight ambiguous; skip reconciliation
        options: [{ option: '5g', basePrice: 25, specialPrice: null, quantityAvailable: 1 }],
      }),
      'store',
      AT,
    )
    const fivePack = normalizeProduct(
      preRoll({
        productId: 'five',
        name: 'House Sativa 5pk',
        netWeightMg: 5000,
        weightField: null,
        options: [{ option: '5g', basePrice: 25, specialPrice: null, quantityAvailable: 1 }],
      }),
      'store',
      AT,
    )
    const three = threePack.history[0].options[0]
    const five = fivePack.history[0].options[0]
    expect(three.pricePerGram).toBe(5) // 25 / 5g
    expect(five.pricePerGram).toBe(5) // same $/g
    expect(three.pricePerItem).toBeCloseTo(8.33, 2) // 25 / 3
    expect(five.pricePerItem).toBe(5) // 25 / 5  → genuinely different
  })

  it('treats a pre-roll with no pack word as a single joint, flagged assumed-single', () => {
    // Erik's rule 2026-06-24: a pre-roll lacking a pack indicator IS a single joint.
    const rec = normalizeProduct(
      preRoll({ name: 'Mystery Pre-Roll', weightField: null }),
      'store',
      AT,
    )
    expect(rec.packCount).toBe(1) // inferred single, not null
    expect(rec.flags).toContain('assumed-single') // provenance preserved, not silent
    expect(rec.flags).not.toContain('unparseable-pack')
    // $/item IS computed at qty 1 (the single joint = the whole price)
    expect(rec.history[0].options[0].pricePerItem).toBe(8) // 8 / 1
    expect(rec.history[0].options[0].pricePerGram).toBe(4) // 8 / 2g
  })

  it('a parsed "1pk" is a real single, NOT flagged assumed-single', () => {
    const rec = normalizeProduct(preRoll({ name: 'Real Single 1pk', weightField: null }), 'store', AT)
    expect(rec.packCount).toBe(1)
    expect(rec.flags).not.toContain('assumed-single')
  })

  it('flags a weight contradiction (unit assumption wrong)', () => {
    // netWeight says 2000mg but weightField×pack says 8000mg (4000×2) — contradiction.
    const rec = normalizeProduct(preRoll({ weightField: 4000 }), 'store', AT)
    expect(rec.flags).toContain('weight-mismatch')
  })
})

describe('normalizeProduct — flower / vape use $/gram only (CAP-5)', () => {
  const flower: RawProduct = {
    productId: 'sk',
    name: 'Space Kush Flower',
    category: 'Flower',
    brand: 'Galaxy',
    strainType: 'Hybrid',
    special: true,
    weightField: 1000,
    netWeightMg: null,
    options: [
      { option: '1g', basePrice: 11, specialPrice: 5.5, quantityAvailable: 4 },
      { option: '3.5g', basePrice: 35, specialPrice: 17.5, quantityAvailable: 2 },
    ],
  }

  it('computes $/gram per option and leaves $/item null (n/a, not flagged)', () => {
    const rec = normalizeProduct(flower, 'store', AT)
    expect(rec.flags).toEqual([])
    const [g1, g35] = rec.history[0].options
    expect(g1).toMatchObject({ pricePerGram: 11, specialPricePerGram: 5.5, pricePerItem: null })
    expect(g35).toMatchObject({ pricePerGram: 10, specialPricePerGram: 5, pricePerItem: null })
  })

  it('flags an unparseable weight option', () => {
    const rec = normalizeProduct(
      { ...flower, options: [{ option: 'each', basePrice: 5, specialPrice: null, quantityAvailable: 1 }] },
      'store',
      AT,
    )
    expect(rec.flags).toContain('unparseable-weight')
    expect(rec.history[0].options[0].pricePerGram).toBeNull()
  })
})

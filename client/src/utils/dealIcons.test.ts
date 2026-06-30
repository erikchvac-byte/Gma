import { describe, it, expect } from 'vitest'
import { dealIcons, DEAL_ICON_LABEL, type DealIconName } from './dealIcons'

describe('dealIcons', () => {
  describe('empty / blank', () => {
    it('returns no icons for null/undefined/blank', () => {
      expect(dealIcons(null)).toEqual([])
      expect(dealIcons(undefined)).toEqual([])
      expect(dealIcons('   ')).toEqual([])
    })
  })

  describe('single product (real deal strings)', () => {
    it.each<[string, DealIconName[]]>([
      ['50% off Ounces', ['bud']],
      ['50% OFF Bondi Flower', ['bud']],
      ['JUNE 2026 SUMMER SALE 30% Off Flower 28g PULLMAN', ['bud']],
      ['JUNE 2026 SUMMER SALE 20% ALL Pre-Rolls PULLMAN', ['joint-single']],
      ['JUNE 2026 SUMMER SALE 25% Carts/Dispos PULLMAN', ['vape']],
      ['JUNE 2026 SUMMER SALE 30% Off Edibles PULLMAN', ['edible']],
      ['MAY 2026 MEMORIAL DAY SALE 30% Concentrates PULLMAN', ['concentrate']],
    ])('%s → %j', (desc, expected) => {
      expect(dealIcons(desc)).toEqual(expected)
    })
  })

  describe('multiple products — one icon per item, in reading order', () => {
    it('Concentrates, Flower, Prerolls and Vapes → 4 icons in order', () => {
      expect(dealIcons('15% Off Concentrates, Infused Flower, Infused Prerolls and Vapes')).toEqual(
        ['concentrate', 'bud', 'joint-single', 'vape'],
      )
    })

    it('Flower and Regular Prerolls → bud then joint', () => {
      expect(dealIcons('15% Off Flower and Regular Prerolls')).toEqual(['bud', 'joint-single'])
    })

    it('Edibles + Drinks → edible then drink', () => {
      expect(dealIcons('15% Off Edibles + Drinks')).toEqual(['edible', 'drink'])
    })

    it('de-dupes one family named several times', () => {
      expect(dealIcons('15% Off Topicals, Tinctures & Capsules')).toEqual(['tincture'])
    })
  })

  describe('exclusion clauses do not emit the negated item', () => {
    it('"(Excluding Capsules)" does not add a tincture glyph', () => {
      expect(dealIcons('15% Off Edibles + Drinks (Excluding Capsules)')).toEqual([
        'edible',
        'drink',
      ])
    })

    it('"excludes flower" suppresses the bud glyph', () => {
      expect(dealIcons('20% Off Vapes (excludes flower)')).toEqual(['vape'])
    })
  })

  describe('false friends — brand / program names', () => {
    it('"Join the Joint" membership is not a pre-roll', () => {
      expect(dealIcons('Join the Joint: Savings for Everyone!')).toEqual(['special-pricing'])
    })

    it('"Cookies" brand on a vape deal does not add an edible', () => {
      expect(dealIcons('40% Off Cookies Vapes June 2026')).toEqual(['vape'])
    })
  })

  describe('pre-roll pack count', () => {
    it('double → joint-double', () => {
      expect(dealIcons('25% off Double Pre-Rolls')).toEqual(['joint-double'])
      expect(dealIcons('25% off 2-pack joints')).toEqual(['joint-double'])
    })
    it('triple → joint-triple', () => {
      expect(dealIcons('25% off Triple Joints')).toEqual(['joint-triple'])
      expect(dealIcons('25% off 3pk pre-rolls')).toEqual(['joint-triple'])
    })
    it('plain pre-roll → joint-single', () => {
      expect(dealIcons('20% off Pre-Rolls')).toEqual(['joint-single'])
    })
  })

  describe('concentrate sub-forms — most specific wins, one glyph', () => {
    it('live resin → diamond', () => {
      expect(dealIcons('30% off Live Resin')).toEqual(['diamond'])
    })
    it('shatter → dabs', () => {
      expect(dealIcons('30% off Shatter')).toEqual(['dabs'])
    })
    it('generic concentrates → concentrate', () => {
      expect(dealIcons('30% off Concentrates')).toEqual(['concentrate'])
    })
  })

  describe('store-wide is exclusive', () => {
    it.each([
      '40% off Storewide',
      '50% off Storewide',
      '40% OFF Your Entire Order!',
      '20% Off All Cannabis Items',
    ])('%s → store-wide only', (desc) => {
      expect(dealIcons(desc)).toEqual(['store-wide'])
    })
  })

  describe('fixed-dollar price → price-drop (alongside product)', () => {
    it('$50 ounce → bud + price-drop', () => {
      expect(dealIcons('$50 Crossroads Ounce')).toEqual(['bud', 'price-drop'])
    })
    it('a spend threshold is NOT a price drop', () => {
      expect(dealIcons('20% Off Single Purchases Greater Than $100')).toEqual(['special-pricing'])
    })
  })

  describe('special-pricing catch-all — deals that name no product', () => {
    it.each([
      '50% off Select Brands',
      '15% Off Rotating Brands',
      '25% Off Select Products',
      '50% off Online Orders',
      'To-Go Tuesday',
      '25% Off Items Purchased to Max Out Your Legal Limit*',
      '10% Off Everyday for the Following Customer Groups (with Proof of Valid ID)',
    ])('%s → special-pricing', (desc) => {
      expect(dealIcons(desc)).toEqual(['special-pricing'])
    })
  })

  it('every DealIconName has a human label', () => {
    const names = Object.keys(DEAL_ICON_LABEL) as DealIconName[]
    for (const n of names) expect(DEAL_ICON_LABEL[n]).toBeTruthy()
  })
})

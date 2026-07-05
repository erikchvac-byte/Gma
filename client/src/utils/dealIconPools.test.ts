import { describe, it, expect } from 'vitest'
import {
  ROTATING_ICON_POOLS,
  ROTATING_ICON_NAMES,
  buildIconSequence,
  mulberry32,
} from './dealIconPools'

describe('ROTATING_ICON_POOLS', () => {
  it('holds distinct assets per pool: edible x11, bud x4, vape x3, shatter x2, glass x4', () => {
    const sizes = { edible: 11, bud: 4, vape: 3, shatter: 2, glass: 4 } as const
    for (const [family, size] of Object.entries(sizes)) {
      const pool = ROTATING_ICON_POOLS[family as keyof typeof sizes]
      expect(pool).toHaveLength(size)
      expect(new Set(pool).size).toBe(size)
    }
  })

  it('exposes exactly the rotating family names', () => {
    expect(ROTATING_ICON_NAMES.sort()).toEqual(['bud', 'edible', 'glass', 'shatter', 'vape'])
  })
})

describe('buildIconSequence', () => {
  const POOLS = Object.values(ROTATING_ICON_POOLS)

  it('returns an empty sequence for count 0 and for an empty pool', () => {
    expect(buildIconSequence(ROTATING_ICON_POOLS.edible, 0, mulberry32(1))).toEqual([])
    expect(buildIconSequence([], 5, mulberry32(1))).toEqual([])
  })

  it('never repeats an image before the whole pool has been used', () => {
    for (const pool of POOLS) {
      const seq = buildIconSequence(pool, pool.length, mulberry32(42))
      expect(new Set(seq).size).toBe(pool.length)
    }
  })

  it('keeps every aligned pool-sized window repeat-free past two full cycles', () => {
    for (const pool of POOLS) {
      const count = pool.length * 2 + 3 // spans three chunks
      const seq = buildIconSequence(pool, count, mulberry32(7))
      expect(seq).toHaveLength(count)
      for (let start = 0; start < count; start += pool.length) {
        const window = seq.slice(start, start + pool.length)
        expect(new Set(window).size).toBe(window.length)
      }
      // every entry is genuinely from the pool
      for (const src of seq) expect(pool).toContain(src)
    }
  })

  it('reshuffles each cycle — the second cycle order differs from the first', () => {
    const pool = ROTATING_ICON_POOLS.edible
    const seq = buildIconSequence(pool, pool.length * 2, mulberry32(42))
    const first = seq.slice(0, pool.length)
    const second = seq.slice(pool.length, pool.length * 2)
    // both cycles use the whole pool, but in a different order
    expect(new Set(second).size).toBe(pool.length)
    expect(second).not.toEqual(first)
  })

  it('is prefix-stable: growing count never re-deals earlier entries', () => {
    for (const pool of POOLS) {
      const short = buildIconSequence(pool, 3, mulberry32(99))
      const long = buildIconSequence(pool, pool.length * 2 + 1, mulberry32(99))
      expect(long.slice(0, 3)).toEqual(short)
    }
  })

  it('is deterministic for a seed and differs across seeds', () => {
    const pool = ROTATING_ICON_POOLS.edible
    const a1 = buildIconSequence(pool, pool.length, mulberry32(1))
    const a2 = buildIconSequence(pool, pool.length, mulberry32(1))
    const b = buildIconSequence(pool, pool.length, mulberry32(2))
    expect(a2).toEqual(a1)
    expect(b).not.toEqual(a1)
  })
})

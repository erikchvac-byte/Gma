import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { useValueDrops, selectDrops } from './useValueDrops'

// A minimal envelope carrying the given rows. The served fact is movers-only, so `rows` may
// contain BOTH below-median drops (pctVsMedian < 0) and above-median premiums (> 0).
const envelope = (rows: unknown[]) => ({
  data: {
    rows,
    totalProducts: 0,
    totalSeries: 0,
    comparedCount: 0,
    belowMedianCount: 0,
    aboveMedianCount: 0,
    atMedianCount: 0,
    belowFloorCount: 0,
    noObservationTodayCount: 0,
    noUsablePriceCount: 0,
  },
  excluded: [],
  coverage: {},
  generatedAt: '2026-07-13T18:02:47.401Z',
})

const drop = (over: Record<string, unknown> = {}) => ({
  dispensaryId: 'store-a',
  productId: 'p1',
  name: 'Blue Dream',
  category: 'flower',
  option: '1/8 oz',
  currentPrice: 32.4,
  medianPrice: 40,
  pctVsMedian: -0.19,
  ...over,
})

const okResponse = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response
const errorResponse = (status: number) =>
  ({ ok: false, status, json: async () => ({}) }) as Response

describe('selectDrops (pure envelope → honest-discount rows)', () => {
  it('keeps only below-median rows and drops above-median premiums (AC4)', () => {
    const rows = selectDrops(envelope([drop(), drop({ productId: 'p2', pctVsMedian: 0.12 })]))
    expect(rows).toHaveLength(1)
    expect(rows[0].pctVsMedian).toBeLessThan(0)
  })

  it('drops rows missing/mistyping a rendered field (Honest Math — never a fabricated value)', () => {
    const rows = selectDrops(
      envelope([
        drop({ name: '' }), // empty name
        drop({ productId: 'p2', currentPrice: 'cheap' }), // non-numeric price
        drop({ productId: 'p3', dispensaryId: 42 }), // non-string store id
        drop({ productId: 'p4' }), // valid
      ]),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].productId).toBe('p4')
  })

  it('drops a row with an empty productId (identity + React-key integrity)', () => {
    // productId is part of the row key (dispensaryId::productId::option); an empty one would let
    // two option-sharing rows from one store collide, so it is rejected, not defaulted to ''.
    expect(selectDrops(envelope([drop({ productId: '' })]))).toEqual([])
  })

  it('fail-softs every non-envelope shape to []', () => {
    expect(selectDrops(null)).toEqual([])
    expect(selectDrops('nope')).toEqual([])
    expect(selectDrops({})).toEqual([]) // no data
    expect(selectDrops({ data: {} })).toEqual([]) // no rows
    expect(selectDrops({ data: { rows: 'not-an-array' } })).toEqual([])
  })

  it('an empty/epoch envelope yields zero drops', () => {
    expect(selectDrops(envelope([]))).toEqual([])
  })
})

describe('useValueDrops', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns the honest-discount drops on success and clears loading', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(envelope([drop()]))))

    const { result } = renderHook(() => useValueDrops())
    expect(result.current.isLoading).toBe(true)

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.drops).toHaveLength(1)
    expect(result.current.error).toBeNull()
  })

  it('yields zero drops (never throws) on a malformed 200 body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse({ nope: true })))

    const { result } = renderHook(() => useValueDrops())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.drops).toEqual([])
  })

  it('yields zero drops on HTTP 500', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorResponse(500)))

    const { result } = renderHook(() => useValueDrops())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.drops).toEqual([])
  })

  it('yields zero drops when the network request rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const { result } = renderHook(() => useValueDrops())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.drops).toEqual([])
  })

  it('does not set error state when aborted on unmount', async () => {
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'))
          })
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { result, unmount } = renderHook(() => useValueDrops())
    unmount()
    await Promise.resolve()
    await Promise.resolve()

    expect(result.current.error).toBeNull()
    expect(result.current.drops).toEqual([])
  })
})

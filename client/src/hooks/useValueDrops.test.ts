import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { useValueDrops, selectDrops, selectGeneratedAt } from './useValueDrops'

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

describe('selectGeneratedAt (pure envelope → honest freshness)', () => {
  it('returns the derive time for a real (non-epoch) envelope', () => {
    expect(selectGeneratedAt(envelope([drop()]))).toBe('2026-07-13T18:02:47.401Z')
  })

  it('maps the epoch fail-soft sentinel to null (never a 1970 date)', () => {
    // valueRoute EMPTY_GENERATED_AT — "never derived" must not read as freshness
    const epoch = { ...envelope([]), generatedAt: new Date(0).toISOString() }
    expect(selectGeneratedAt(epoch)).toBeNull()
  })

  it('rejects the epoch instant in ANY valid ISO form (numeric guard, not string-match)', () => {
    // guards against server-side ISO-format drift: all of these ARE the epoch and must be null,
    // even though none string-equals the client's `new Date(0).toISOString()`.
    for (const g of ['1970-01-01T00:00:00Z', '1970-01-01T00:00:00.000+00:00', '1969-12-31T16:00:00-08:00']) {
      expect(selectGeneratedAt({ generatedAt: g })).toBeNull()
    }
  })

  it('rejects an unparseable date string (never surfaces garbage as freshness)', () => {
    expect(selectGeneratedAt({ generatedAt: 'not-a-date' })).toBeNull()
    expect(selectGeneratedAt({ generatedAt: '' })).toBeNull()
  })

  it('fail-softs absent / non-string / non-object generatedAt to null', () => {
    expect(selectGeneratedAt({ data: { rows: [] } })).toBeNull() // absent
    expect(selectGeneratedAt({ generatedAt: 1720000000000 })).toBeNull() // number
    expect(selectGeneratedAt(null)).toBeNull()
    expect(selectGeneratedAt('nope')).toBeNull()
  })
})

describe('useValueDrops — server snapshot (window.__GMA_DROPS__, ADR-092)', () => {
  afterEach(() => {
    delete (window as { __GMA_DROPS__?: unknown }).__GMA_DROPS__
    vi.unstubAllGlobals()
  })

  it('hydrates synchronously from the injected snapshot and never fetches', () => {
    ;(window as { __GMA_DROPS__?: unknown }).__GMA_DROPS__ = envelope([drop()])
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useValueDrops())

    // no loading flash, drops present on the very first render, no network call
    expect(result.current.isLoading).toBe(false)
    expect(result.current.drops).toHaveLength(1)
    expect(result.current.generatedAt).toBe('2026-07-13T18:02:47.401Z')
    expect(result.current.error).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('treats a present-but-empty snapshot as authoritative (skips the fetch, no drops)', () => {
    ;(window as { __GMA_DROPS__?: unknown }).__GMA_DROPS__ = envelope([])
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useValueDrops())

    expect(result.current.isLoading).toBe(false)
    expect(result.current.drops).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('falls back to the fetch when no snapshot global is present', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(envelope([drop()])))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useValueDrops())
    expect(result.current.isLoading).toBe(true)

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.drops).toHaveLength(1)
    expect(result.current.generatedAt).toBe('2026-07-13T18:02:47.401Z')
    expect(fetchMock).toHaveBeenCalledTimes(1)
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

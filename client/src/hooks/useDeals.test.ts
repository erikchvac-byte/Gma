import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { useDeals } from './useDeals'
import type { ApiDataResponse } from '../types'

const payload: ApiDataResponse = {
  meta: {
    lastScraperRun: '2026-06-10T07:45:00Z',
    gasPrice: 4.1,
    gasPriceUpdatedAt: '2026-06-10T07:00:00Z',
  },
  dispensaries: [],
}

const okResponse = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as Response

const errorResponse = (status: number, body: unknown) =>
  ({ ok: false, status, json: async () => body }) as Response

describe('useDeals', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    delete window.__GMA_DATA__
  })

  it('returns data on success and clears loading', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(payload)))

    const { result } = renderHook(() => useDeals())
    expect(result.current.isLoading).toBe(true)

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toEqual(payload)
    expect(result.current.error).toBeNull()
  })

  it('sets error and leaves data null when a 200 response has a malformed shape', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse({ dispensaries: [] })))

    const { result } = renderHook(() => useDeals())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).not.toBeNull()
    expect(result.current.data).toBeNull()
  })

  it('sets error and leaves data null on HTTP 500', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(errorResponse(500, { error: 'Internal server error', code: 'SERVER_ERROR' })),
    )

    const { result } = renderHook(() => useDeals())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).not.toBeNull()
    expect(result.current.data).toBeNull()
  })

  it('sets error and leaves data null when the network request rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const { result } = renderHook(() => useDeals())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).not.toBeNull()
    expect(result.current.data).toBeNull()
  })

  it('initializes synchronously from a valid injected snapshot and never fetches', () => {
    window.__GMA_DATA__ = payload
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useDeals())

    // no loading phase: data is present on the very first render
    expect(result.current.isLoading).toBe(false)
    expect(result.current.data).toEqual(payload)
    expect(result.current.error).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('falls back to the fetch path when the snapshot is not an object at all', async () => {
    window.__GMA_DATA__ = 'not an object'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(payload)))

    const { result } = renderHook(() => useDeals())
    expect(result.current.isLoading).toBe(true)

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toEqual(payload)
  })

  it('falls back to the fetch path when the snapshot shape is malformed', async () => {
    window.__GMA_DATA__ = { dispensaries: [] } // missing meta
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(payload)))

    const { result } = renderHook(() => useDeals())
    expect(result.current.isLoading).toBe(true)

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toEqual(payload)
    expect(result.current.error).toBeNull()
  })

  it('aborts on unmount without setting error state', async () => {
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'))
          })
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result, unmount } = renderHook(() => useDeals())
    unmount()

    // let the rejected fetch promise settle after the abort
    await Promise.resolve()
    await Promise.resolve()

    expect(result.current.error).toBeNull()
    expect(result.current.data).toBeNull()
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
})

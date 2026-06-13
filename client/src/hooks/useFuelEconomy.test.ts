import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'
import { useFuelEconomy } from './useFuelEconomy'

const jsonResponse = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response

const errorResponse = (status: number): Response =>
  ({ ok: false, status, json: async () => ({}) }) as unknown as Response

// a fetch response whose settlement the test controls explicitly
const deferred = () => {
  let resolve!: (value: Response) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<Response>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

let fetchMock: Mock

describe('useFuelEconomy', () => {
  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loadYears populates years from the menu', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ menuItem: [{ text: '2020', value: '2020' }, { text: '2019', value: '2019' }] }),
    )
    const { result } = renderHook(() => useFuelEconomy())

    await act(async () => {
      await result.current.loadYears()
    })

    expect(result.current.years).toEqual(['2020', '2019'])
    expect(result.current.error).toBeNull()
    expect(result.current.isLoading).toBe(false)
  })

  it('sends Accept: application/json on every request', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ menuItem: [{ text: '2020', value: '2020' }] }))
    const { result } = renderHook(() => useFuelEconomy())

    await act(async () => {
      await result.current.loadYears()
      await result.current.loadMakes('2020')
      await result.current.loadModels('2020', 'Toyota')
      await result.current.resolveMpg('2020', 'Toyota', 'Camry')
    })

    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(5)
    for (const [, init] of fetchMock.mock.calls as [string, RequestInit][]) {
      expect(init.headers).toEqual({ Accept: 'application/json' })
    }
  })

  it('dedupes duplicate menu values', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        menuItem: [
          { text: '2020', value: '2020' },
          { text: '2020 (alt)', value: '2020' },
          { text: '2019', value: '2019' },
        ],
      }),
    )
    const { result } = renderHook(() => useFuelEconomy())

    await act(async () => {
      await result.current.loadYears()
    })

    expect(result.current.years).toEqual(['2020', '2019'])
  })

  it('clearError resets a previous error without a network call', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    const { result } = renderHook(() => useFuelEconomy())

    await act(async () => {
      await result.current.loadYears()
    })
    expect(result.current.error).toBe('network down')

    const callsBefore = fetchMock.mock.calls.length
    act(() => {
      result.current.clearError()
    })

    expect(result.current.error).toBeNull()
    expect(fetchMock.mock.calls.length).toBe(callsBefore)
  })

  it('clearError supersedes an in-flight operation so it cannot resurrect the error', async () => {
    const pending = deferred()
    fetchMock.mockReturnValueOnce(pending.promise)
    const { result } = renderHook(() => useFuelEconomy())

    let loadCall!: Promise<void>
    act(() => {
      loadCall = result.current.loadYears()
    })

    act(() => {
      result.current.clearError()
    })

    pending.reject(new Error('network down'))
    await act(async () => {
      await loadCall
    })

    expect(result.current.error).toBeNull()
    expect(result.current.isLoading).toBe(false)
  })

  describe('stale-response invalidation', () => {
    it('ignores an out-of-order loadMakes response from a superseded call', async () => {
      const first = deferred()
      const second = deferred()
      fetchMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
      const { result } = renderHook(() => useFuelEconomy())

      let firstCall!: Promise<void>
      let secondCall!: Promise<void>
      act(() => {
        firstCall = result.current.loadMakes('2019')
      })
      act(() => {
        secondCall = result.current.loadMakes('2020')
      })

      second.resolve(jsonResponse({ menuItem: [{ text: 'Honda', value: 'Honda' }] }))
      await act(async () => {
        await secondCall
      })
      first.resolve(jsonResponse({ menuItem: [{ text: 'Toyota', value: 'Toyota' }] }))
      await act(async () => {
        await firstCall
      })

      expect(result.current.makes).toEqual(['Honda'])
    })

    it('a superseded rejection cannot set error or revive isLoading', async () => {
      const first = deferred()
      const second = deferred()
      fetchMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
      const { result } = renderHook(() => useFuelEconomy())

      let firstCall!: Promise<void>
      let secondCall!: Promise<void>
      act(() => {
        firstCall = result.current.loadMakes('2019')
      })
      act(() => {
        secondCall = result.current.loadMakes('2020')
      })

      second.resolve(jsonResponse({ menuItem: [{ text: 'Honda', value: 'Honda' }] }))
      await act(async () => {
        await secondCall
      })
      first.reject(new Error('slow network died'))
      await act(async () => {
        await firstCall
      })

      expect(result.current.error).toBeNull()
      expect(result.current.isLoading).toBe(false)
      expect(result.current.makes).toEqual(['Honda'])
    })

    it('empties makes and models immediately when a replacement loadMakes starts', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ menuItem: [{ text: 'X', value: 'X' }] }))
      const { result } = renderHook(() => useFuelEconomy())

      await act(async () => {
        await result.current.loadMakes('2019')
        await result.current.loadModels('2019', 'X')
      })
      expect(result.current.makes).toEqual(['X'])
      expect(result.current.models).toEqual(['X'])

      fetchMock.mockReturnValue(new Promise<Response>(() => {}))
      act(() => {
        void result.current.loadMakes('2020')
      })

      expect(result.current.makes).toEqual([])
      expect(result.current.models).toEqual([])
    })

    it('empties models immediately when a replacement loadModels starts', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ menuItem: [{ text: 'X', value: 'X' }] }))
      const { result } = renderHook(() => useFuelEconomy())

      await act(async () => {
        await result.current.loadModels('2019', 'Toyota')
      })
      expect(result.current.models).toEqual(['X'])

      fetchMock.mockReturnValue(new Promise<Response>(() => {}))
      act(() => {
        void result.current.loadModels('2019', 'Honda')
      })

      expect(result.current.models).toEqual([])
    })

    it('resolveMpg resolves null when superseded by a newer operation', async () => {
      const options = deferred()
      fetchMock.mockImplementation((input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/menu/options')) return options.promise
        if (url.includes('/menu/make')) {
          return Promise.resolve(jsonResponse({ menuItem: [{ text: 'Honda', value: 'Honda' }] }))
        }
        return Promise.resolve(jsonResponse({ comb08: 32 }))
      })
      const { result } = renderHook(() => useFuelEconomy())

      let mpgPromise!: Promise<number | null>
      act(() => {
        mpgPromise = result.current.resolveMpg('2019', 'Toyota', 'Camry')
      })
      // user changes year while the lookup is in flight
      await act(async () => {
        await result.current.loadMakes('2018')
      })

      options.resolve(jsonResponse({ menuItem: [{ text: 'Trim A', value: '41234' }] }))
      let mpg: number | null = 99
      await act(async () => {
        mpg = await mpgPromise
      })

      expect(mpg).toBeNull()
      expect(result.current.error).toBeNull()
    })
  })

  it('normalizes a single-object menuItem into a one-entry list', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ menuItem: { text: '2020', value: '2020' } }))
    const { result } = renderHook(() => useFuelEconomy())

    await act(async () => {
      await result.current.loadYears()
    })

    expect(result.current.years).toEqual(['2020'])
  })

  it('URL-encodes year/make/model query parameters', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ menuItem: [] }))
    const { result } = renderHook(() => useFuelEconomy())

    await act(async () => {
      await result.current.loadModels('2020', 'Land Rover')
    })

    expect(String(fetchMock.mock.calls[0][0])).toContain('make=Land%20Rover')
  })

  it('loadMakes clears stale models from a previous cascade', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ menuItem: [{ text: 'X', value: 'X' }] }))
    const { result } = renderHook(() => useFuelEconomy())

    await act(async () => {
      await result.current.loadModels('2020', 'Toyota')
    })
    expect(result.current.models).toEqual(['X'])

    await act(async () => {
      await result.current.loadMakes('2019')
    })
    expect(result.current.models).toEqual([])
  })

  it('sets error and leaves the list empty on a non-2xx response', async () => {
    fetchMock.mockResolvedValue(errorResponse(500))
    const { result } = renderHook(() => useFuelEconomy())

    await act(async () => {
      await result.current.loadYears()
    })

    expect(result.current.years).toEqual([])
    expect(result.current.error).toBe('Request failed with status 500')
  })

  it('sets error when the network request rejects, without throwing', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    const { result } = renderHook(() => useFuelEconomy())

    await act(async () => {
      await result.current.loadYears()
    })

    expect(result.current.error).toBe('network down')
  })

  it('clears a previous error on the next successful call', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'))
    fetchMock.mockResolvedValue(jsonResponse({ menuItem: [{ text: '2020', value: '2020' }] }))
    const { result } = renderHook(() => useFuelEconomy())

    await act(async () => {
      await result.current.loadYears()
    })
    expect(result.current.error).toBe('network down')

    await act(async () => {
      await result.current.loadYears()
    })
    expect(result.current.error).toBeNull()
  })

  describe('resolveMpg', () => {
    const routeMpg = (comb08: unknown) => {
      fetchMock.mockImplementation((input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/menu/options')) {
          return Promise.resolve(jsonResponse({ menuItem: [{ text: 'Trim A', value: '41234' }] }))
        }
        return Promise.resolve(jsonResponse({ comb08 }))
      })
    }

    it('resolves comb08 from the first option (number)', async () => {
      routeMpg(32)
      const { result } = renderHook(() => useFuelEconomy())

      let mpg: number | null = null
      await act(async () => {
        mpg = await result.current.resolveMpg('2019', 'Toyota', 'Camry')
      })

      expect(mpg).toBe(32)
      expect(result.current.error).toBeNull()
      expect(String(fetchMock.mock.calls[1][0])).toContain('/41234')
    })

    it('coerces a numeric-string comb08', async () => {
      routeMpg('32')
      const { result } = renderHook(() => useFuelEconomy())

      let mpg: number | null = null
      await act(async () => {
        mpg = await result.current.resolveMpg('2019', 'Toyota', 'Camry')
      })

      expect(mpg).toBe(32)
    })

    it.each([[0], [-1], ['abc'], [null], [undefined], [true], [Infinity]])(
      'returns null and sets error when comb08 is %s',
      async (comb08) => {
        routeMpg(comb08)
        const { result } = renderHook(() => useFuelEconomy())

        let mpg: number | null = 99
        await act(async () => {
          mpg = await result.current.resolveMpg('2019', 'Toyota', 'Camry')
        })

        expect(mpg).toBeNull()
        expect(result.current.error).toBe('No MPG available for this vehicle')
      },
    )

    it('returns null and sets error when the options menu is empty', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ menuItem: [] }))
      const { result } = renderHook(() => useFuelEconomy())

      let mpg: number | null = 99
      await act(async () => {
        mpg = await result.current.resolveMpg('2019', 'Toyota', 'Camry')
      })

      expect(mpg).toBeNull()
      expect(result.current.error).toBe('No vehicles found for this selection')
    })
  })
})

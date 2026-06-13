import { useCallback, useRef, useState } from 'react'
import { isPositiveFinite } from '../utils/gasCost'

// fueleconomy.gov vehicle web services — public, no key, called browser-direct
// per the recorded no-proxy decision. All fueleconomy.gov access lives here.
const BASE_URL = 'https://www.fueleconomy.gov/ws/rest/vehicle'

export interface UseFuelEconomyResult {
  years: string[]
  makes: string[]
  models: string[]
  isLoading: boolean
  error: string | null
  loadYears: () => Promise<void>
  loadMakes: (year: string) => Promise<void>
  loadModels: (year: string, make: string) => Promise<void>
  resolveMpg: (year: string, make: string, model: string) => Promise<number | null>
  clearError: () => void
}

// The API returns `menuItem` as a bare object — not a one-element array —
// when a menu has exactly one entry; normalize before any iteration
function toMenuValues(body: unknown): string[] {
  if (body === null || typeof body !== 'object') return []
  const menuItem = (body as { menuItem?: unknown }).menuItem
  const items = Array.isArray(menuItem) ? menuItem : menuItem == null ? [] : [menuItem]
  const values = items
    .map((item) =>
      item !== null && typeof item === 'object' ? (item as { value?: unknown }).value : undefined,
    )
    .filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
    .map(String)
  // the API can repeat a value; duplicates would collide as React keys
  return [...new Set(values)]
}

async function fetchJson(path: string): Promise<unknown> {
  // without this header fueleconomy.gov answers in XML
  const response = await fetch(`${BASE_URL}${path}`, { headers: { Accept: 'application/json' } })
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`)
  }
  return response.json() as Promise<unknown>
}

export function useFuelEconomy(): UseFuelEconomyResult {
  const [years, setYears] = useState<string[]>([])
  const [makes, setMakes] = useState<string[]>([])
  const [models, setModels] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // monotonic id of the latest operation — anything older is superseded
  const seqRef = useRef(0)

  // every public operation funnels through here: clear the previous error,
  // flag loading, and convert any throw into `error` — callers never reject.
  // Starting a new operation supersedes any in-flight one; a superseded
  // operation may not touch state, so out-of-order responses can't win
  const run = useCallback(async (operation: (isCurrent: () => boolean) => Promise<void>) => {
    const seq = ++seqRef.current
    const isCurrent = () => seq === seqRef.current
    setError(null)
    setIsLoading(true)
    try {
      await operation(isCurrent)
    } catch (err) {
      if (isCurrent()) {
        setError(err instanceof Error ? err.message : 'Failed to reach fueleconomy.gov')
      }
    } finally {
      if (isCurrent()) {
        setIsLoading(false)
      }
    }
  }, [])

  const clearError = useCallback(() => {
    // bump seq so an in-flight operation abandoned by closing the panel
    // can't resurrect the error (or isLoading) this clears once it settles
    seqRef.current += 1
    setError(null)
    setIsLoading(false)
  }, [])

  const loadYears = useCallback(
    () =>
      run(async (isCurrent) => {
        const next = toMenuValues(await fetchJson('/menu/year'))
        if (isCurrent()) setYears(next)
      }),
    [run],
  )

  const loadMakes = useCallback(
    (year: string) =>
      run(async (isCurrent) => {
        // cascade reset before the fetch: stale makes/models from a previous
        // year must not stay selectable while the replacement is in flight
        setMakes([])
        setModels([])
        const next = toMenuValues(await fetchJson(`/menu/make?year=${encodeURIComponent(year)}`))
        if (isCurrent()) setMakes(next)
      }),
    [run],
  )

  const loadModels = useCallback(
    (year: string, make: string) =>
      run(async (isCurrent) => {
        setModels([])
        const next = toMenuValues(
          await fetchJson(
            `/menu/model?year=${encodeURIComponent(year)}&make=${encodeURIComponent(make)}`,
          ),
        )
        if (isCurrent()) setModels(next)
      }),
    [run],
  )

  // The Year/Make/Model menus carry no MPG — it takes two more calls: the
  // options menu (each entry = a trim, value = vehicle id) then the vehicle
  // record for comb08. Trim policy per spec: take the first option.
  const resolveMpg = useCallback(
    async (year: string, make: string, model: string): Promise<number | null> => {
      let mpg: number | null = null
      await run(async (isCurrent) => {
        const query = `year=${encodeURIComponent(year)}&make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}`
        const optionIds = toMenuValues(await fetchJson(`/menu/options?${query}`))
        if (optionIds.length === 0) {
          throw new Error('No vehicles found for this selection')
        }
        const detail = await fetchJson(`/${encodeURIComponent(optionIds[0])}`)
        const comb08 =
          detail !== null && typeof detail === 'object'
            ? (detail as { comb08?: unknown }).comb08
            : undefined
        // typeof gate before Number(...) blocks coercion exotica (true → 1)
        const value = typeof comb08 === 'number' || typeof comb08 === 'string' ? Number(comb08) : NaN
        if (!isPositiveFinite(value)) {
          throw new Error('No MPG available for this vehicle')
        }
        // a superseded lookup yields null so callers never act on it
        if (isCurrent()) mpg = value
      })
      return mpg
    },
    [run],
  )

  return {
    years,
    makes,
    models,
    isLoading,
    error,
    loadYears,
    loadMakes,
    loadModels,
    resolveMpg,
    clearError,
  }
}

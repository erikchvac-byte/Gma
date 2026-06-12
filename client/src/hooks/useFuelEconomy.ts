import { useCallback, useState } from 'react'
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
}

// The API returns `menuItem` as a bare object — not a one-element array —
// when a menu has exactly one entry; normalize before any iteration
function toMenuValues(body: unknown): string[] {
  if (body === null || typeof body !== 'object') return []
  const menuItem = (body as { menuItem?: unknown }).menuItem
  const items = Array.isArray(menuItem) ? menuItem : menuItem == null ? [] : [menuItem]
  return items
    .map((item) =>
      item !== null && typeof item === 'object' ? (item as { value?: unknown }).value : undefined,
    )
    .filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
    .map(String)
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

  // every public operation funnels through here: clear the previous error,
  // flag loading, and convert any throw into `error` — callers never reject
  const run = useCallback(async (operation: () => Promise<void>) => {
    setError(null)
    setIsLoading(true)
    try {
      await operation()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reach fueleconomy.gov')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const loadYears = useCallback(
    () =>
      run(async () => {
        setYears(toMenuValues(await fetchJson('/menu/year')))
      }),
    [run],
  )

  const loadMakes = useCallback(
    (year: string) =>
      run(async () => {
        // cascade reset: models from a previous year must not survive
        setModels([])
        setMakes(toMenuValues(await fetchJson(`/menu/make?year=${encodeURIComponent(year)}`)))
      }),
    [run],
  )

  const loadModels = useCallback(
    (year: string, make: string) =>
      run(async () => {
        setModels(
          toMenuValues(
            await fetchJson(
              `/menu/model?year=${encodeURIComponent(year)}&make=${encodeURIComponent(make)}`,
            ),
          ),
        )
      }),
    [run],
  )

  // The Year/Make/Model menus carry no MPG — it takes two more calls: the
  // options menu (each entry = a trim, value = vehicle id) then the vehicle
  // record for comb08. Trim policy per spec: take the first option.
  const resolveMpg = useCallback(
    async (year: string, make: string, model: string): Promise<number | null> => {
      let mpg: number | null = null
      await run(async () => {
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
        mpg = value
      })
      return mpg
    },
    [run],
  )

  return { years, makes, models, isLoading, error, loadYears, loadMakes, loadModels, resolveMpg }
}

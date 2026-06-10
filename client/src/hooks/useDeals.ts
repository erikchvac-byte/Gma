import { useEffect, useState } from 'react'
import type { ApiDataResponse } from '../types'

export interface UseDealsResult {
  data: ApiDataResponse | null
  isLoading: boolean
  error: string | null
}

export function useDeals(): UseDealsResult {
  const [data, setData] = useState<ApiDataResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      try {
        const response = await fetch('/api/data', { signal: controller.signal })
        if (!response.ok) {
          setError(`Request failed with status ${response.status}`)
          return
        }
        const json = (await response.json()) as ApiDataResponse
        // scraper-fed data.json can be malformed; a 200 with a bad shape must not crash render
        if (json === null || typeof json !== 'object' || json.meta == null || !Array.isArray(json.dispensaries)) {
          setError('Malformed API response')
          return
        }
        setData(json)
      } catch (err) {
        // an aborted fetch (unmount) is not an error and must not update state
        if (err instanceof Error && err.name === 'AbortError') return
        setError(err instanceof Error ? err.message : 'Failed to load deals')
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    void load()

    return () => controller.abort()
  }, [])

  return { data, isLoading, error }
}

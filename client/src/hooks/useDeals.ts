import { useEffect, useRef, useState } from 'react'
import type { ApiDataResponse } from '../types'
import { normalizeDispensaries } from '../utils/normalizeDispensaries'

// Server-injected /api/data snapshot (spec-phase-0a-data-snapshot-injection).
// Present only on the production shell served by Express; absent in dev and
// whenever the server degraded to the plain shell.
declare global {
  interface Window {
    __GMA_DATA__?: unknown
  }
}

export interface UseDealsResult {
  data: ApiDataResponse | null
  isLoading: boolean
  error: string | null
}

// ONE validation boundary for both data paths (snapshot + fetch): shape-guard
// the envelope, then drop malformed dispensary records so DealFeed/DealCard
// can trust every element's shape. Returns null on any bad shape.
function validateApiData(raw: unknown): ApiDataResponse | null {
  if (raw === null || typeof raw !== 'object') return null
  const json = raw as ApiDataResponse
  if (json.meta == null || !Array.isArray(json.dispensaries)) return null
  return { ...json, dispensaries: normalizeDispensaries(json.dispensaries) }
}

// A corrupted snapshot must be indistinguishable from no snapshot — including
// one that somehow throws during validation — so the fetch fallback covers it.
function readSnapshot(): ApiDataResponse | null {
  if (typeof window === 'undefined') return null
  try {
    return validateApiData(window.__GMA_DATA__)
  } catch {
    return null
  }
}

export function useDeals(): UseDealsResult {
  // Synchronous init from the injected snapshot: the first data-bearing render
  // happens without a network round trip (the Lighthouse-measured LCP chain).
  const [data, setData] = useState<ApiDataResponse | null>(readSnapshot)
  const [isLoading, setIsLoading] = useState(data === null)
  const [error, setError] = useState<string | null>(null)
  // ref, not state: whether to fetch is decided once at mount and must not
  // re-trigger the effect
  const hasSnapshot = useRef(data !== null)

  useEffect(() => {
    if (hasSnapshot.current) return

    const controller = new AbortController()

    async function load() {
      try {
        const response = await fetch('/api/data', { signal: controller.signal })
        if (!response.ok) {
          setError(`Request failed with status ${response.status}`)
          return
        }
        // scraper-fed data.json can be malformed; a 200 with a bad shape must not crash render
        const validated = validateApiData(await response.json())
        if (validated === null) {
          setError('Malformed API response')
          return
        }
        setData(validated)
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

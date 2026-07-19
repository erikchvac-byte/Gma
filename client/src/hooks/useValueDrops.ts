import { useEffect, useRef, useState } from 'react'
import type { PriceDropRow } from '../types'

// Server-injected drops snapshot (shellRoute / ADR-092). Present only on the production Express
// shell; absent in dev and whenever the server degraded to the plain shell.
declare global {
  interface Window {
    __GMA_DROPS__?: unknown
  }
}

// derivation-3.2 — the "Real price drops" surface's data source. Fetches the flagship
// price-vs-own-median fact from the served route and exposes only the honest-discount rows
// (`pctVsMedian < 0`). PURELY ADDITIVE + FAIL-SOFT: any non-ok response, malformed JSON, or an
// empty/epoch envelope yields ZERO drops and renders nothing — this value surface can never break
// or block the deal feed (mirrors useDeals' posture; it does NOT route through useDeals). No
// snapshot path: the section is non-critical, so a plain fetch-on-mount is enough.

const ENDPOINT = '/api/value/price-vs-own-median'

export interface UseValueDropsResult {
  drops: PriceDropRow[]
  isLoading: boolean
  error: string | null
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

// Validate ONE served row into the shape the surface renders. A row missing/mistyping any
// rendered field is dropped (never rendered against a fabricated value — Honest Math).
function validateRow(raw: unknown): PriceDropRow | null {
  if (raw === null || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.dispensaryId !== 'string' || r.dispensaryId === '') return null
  // productId is part of the row's identity AND its React key (dispensaryId::productId::option) —
  // require it non-empty so two option-sharing rows from one store can't collide on the key.
  if (typeof r.productId !== 'string' || r.productId === '') return null
  if (typeof r.name !== 'string' || r.name === '') return null
  if (typeof r.option !== 'string') return null
  if (!isFiniteNumber(r.currentPrice) || !isFiniteNumber(r.medianPrice) || !isFiniteNumber(r.pctVsMedian)) {
    return null
  }
  return {
    dispensaryId: r.dispensaryId,
    productId: r.productId,
    name: r.name,
    category: typeof r.category === 'string' ? r.category : '',
    option: r.option,
    currentPrice: r.currentPrice,
    medianPrice: r.medianPrice,
    pctVsMedian: r.pctVsMedian,
  }
}

// Validate the honesty envelope `{ data: { rows: [...] }, ... }` and return ONLY the honest-discount
// rows (`pctVsMedian < 0`). The served fact is movers-only, so `rows` also carries above-median
// PREMIUMS — those are filtered out here so a premium can never surface as a "price drop" (AC4).
// Any shape mismatch degrades to [] (fail-soft) rather than throwing.
export function selectDrops(raw: unknown): PriceDropRow[] {
  if (raw === null || typeof raw !== 'object') return []
  const env = raw as { data?: unknown }
  if (env.data === null || typeof env.data !== 'object') return []
  const data = env.data as { rows?: unknown }
  if (!Array.isArray(data.rows)) return []
  return data.rows
    .map(validateRow)
    .filter((row): row is PriceDropRow => row !== null && row.pctVsMedian < 0)
}

// Synchronous read of the server-injected drops snapshot. Returns the selected honest-drop rows
// when the global is present (even []: a valid empty snapshot — skip the fetch), or null when the
// global is absent/unreadable → fall back to the fetch. selectDrops already fail-softs any bad
// shape to [], so a corrupted snapshot degrades to "no drops" exactly like the fetch path would.
function readSnapshot(): PriceDropRow[] | null {
  if (typeof window === 'undefined' || window.__GMA_DROPS__ === undefined) return null
  try {
    return selectDrops(window.__GMA_DROPS__)
  } catch {
    return null
  }
}

export function useValueDrops(): UseValueDropsResult {
  // Init from the injected snapshot so the FIRST render already carries the drops — no post-paint
  // re-render that reflows the feed (ADR-092). Absent snapshot → [] + fetch, exactly as before.
  const initial = readSnapshot()
  const [drops, setDrops] = useState<PriceDropRow[]>(initial ?? [])
  const [isLoading, setIsLoading] = useState(initial === null)
  const [error, setError] = useState<string | null>(null)
  // decided once at mount: a present snapshot means skip the fetch entirely
  const hasSnapshot = useRef(initial !== null)

  useEffect(() => {
    if (hasSnapshot.current) return

    const controller = new AbortController()

    async function load() {
      try {
        const response = await fetch(ENDPOINT, { signal: controller.signal })
        if (!response.ok) {
          // additive surface: a failed fetch is not an app error — just no drops
          setError(`Request failed with status ${response.status}`)
          return
        }
        setDrops(selectDrops(await response.json()))
      } catch (err) {
        // an aborted fetch (unmount) is not an error and must not update state
        if (err instanceof Error && err.name === 'AbortError') return
        setError(err instanceof Error ? err.message : 'Failed to load price drops')
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    void load()
    return () => controller.abort()
  }, [])

  return { drops, isLoading, error }
}

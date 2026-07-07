// ADR-077 honesty envelope (derivation-1.1, decision E). Every derived fact artifact Render
// serves is wrapped uniformly: the unchanged computed payload (`data`), a restatement of the
// pure function's own exclusion counts (`excluded`), a restatement of its coverage counts
// (`coverage`), and a write-time timestamp (`generatedAt`). This module only defines the shape
// and construction/validation helpers — it does not know about any specific fact.

export interface ExcludedEntry {
  reason: string
  count: number
}

export interface DerivedEnvelope<T> {
  data: T
  excluded: ExcludedEntry[]
  coverage: Record<string, number>
  generatedAt: string
}

export function wrapEnvelope<T>(
  data: T,
  excluded: ExcludedEntry[],
  coverage: Record<string, number>,
): DerivedEnvelope<T> {
  return { data, excluded, coverage, generatedAt: new Date().toISOString() }
}

// Structural check against the envelope's four top-level keys — accepts any well-formed
// envelope, rejects arrays, missing-key objects, and a bare (un-enveloped) report.
export function isEnvelope<T>(parsed: unknown): parsed is DerivedEnvelope<T> {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false
  const obj = parsed as Record<string, unknown>
  return (
    'data' in obj &&
    Array.isArray(obj.excluded) &&
    typeof obj.coverage === 'object' &&
    obj.coverage !== null &&
    !Array.isArray(obj.coverage) &&
    typeof obj.generatedAt === 'string'
  )
}

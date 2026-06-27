import waCentroids from '../data/zipCentroids.wa.json'

// Committed Census 2024 ZCTA centroid table, WA only (public domain). The build
// script filters the national Gazetteer to GEOIDs 98001–99403 that fall inside
// the WA bounding box (lat 45.5–49.0, lng −124.85 to −116.9). WA-only is by
// design (SPEC non-goal: no national coverage) — a non-WA ZIP is "not
// recognized" and resolves to the honest no-location state, never a guess.
const CENTROIDS: Record<string, { lat: number; lng: number }> = waCentroids

export interface Centroid {
  lat: number
  lng: number
}

// Resolve a typed ZIP to a {lat,lng} centroid, or null when it is not a clean
// 5-digit WA ZIP in the table. Tolerates surrounding whitespace and a 5+4
// "98270-1234" form (the ZCTA is keyed on the 5-digit prefix). Never throws.
export function lookupZipCentroid(zip: string): Centroid | null {
  if (typeof zip !== 'string') return null
  const trimmed = zip.trim()
  // accept "98270" or "98270-1234"; reject anything else (letters, short, long)
  const match = /^(\d{5})(?:-\d{4})?$/.exec(trimmed)
  if (match === null) return null
  const entry = CENTROIDS[match[1]]
  return entry ? { lat: entry.lat, lng: entry.lng } : null
}

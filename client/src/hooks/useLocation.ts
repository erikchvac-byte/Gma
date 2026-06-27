import { useCallback, useState } from 'react'
import { useLocalStorage } from './useLocalStorage'
import { lookupZipCentroid } from '../utils/zipCentroids'
import type { UserLocation } from '../types'

export const LOCATION_KEY = 'gma_location'

// Transient (non-persisted) status of the last location attempt, so the UI can
// show an honest spinner / error / "not recognized" message instead of a silent
// dead end. `located` is not a state — a resolved location lives in `location`.
export type LocationStatus =
  | 'idle'
  | 'locating' // GPS request in flight
  | 'denied' // user blocked the permission
  | 'unavailable' // no geolocation API / position unavailable / timeout
  | 'zip-not-found' // typed ZIP is not a recognized WA ZIP

export interface UseLocationResult {
  location: UserLocation | null
  status: LocationStatus
  requestGps: () => void
  setFromZip: (zip: string) => boolean
  clear: () => void
}

// Validate a persisted value at the use site (mirrors useVehicleMpg): stored
// JSON can hold any shape, so a location counts only when lat/lng are finite
// numbers and source is one we wrote. Anything else → null (no fixed-origin
// fallback; Honest Math).
function validate(raw: unknown): UserLocation | null {
  if (raw === null || typeof raw !== 'object') return null
  const { lat, lng, source } = raw as Record<string, unknown>
  if (typeof lat !== 'number' || !Number.isFinite(lat)) return null
  if (typeof lng !== 'number' || !Number.isFinite(lng)) return null
  // finite isn't enough — a corrupt/hand-edited value could be a finite but
  // physically-impossible coordinate, which would render a confident-but-bogus
  // distance and gas figure (Honest Math). Reject anything off the globe.
  if (lat < -90 || lat > 90) return null
  if (lng < -180 || lng > 180) return null
  if (source !== 'gps' && source !== 'zip') return null
  return { lat, lng, source }
}

const GPS_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 0,
}

// Single home for the user-location localStorage value + the two doors that set
// it (device GPS, WA ZIP). One hook instance owns the state; the onboarding step
// and the persistent bar both drive it.
export function useLocation(): UseLocationResult {
  const [stored, setStored] = useLocalStorage<UserLocation | null>(LOCATION_KEY, null)
  const [status, setStatus] = useState<LocationStatus>('idle')

  const location = validate(stored)

  // One-tap device GPS. Resolves to exact coords (any region — haversine is
  // global). Permission denial / unavailability / timeout surface a visible
  // status instead of hanging or silently failing.
  const requestGps = useCallback(() => {
    if (typeof navigator === 'undefined' || navigator.geolocation == null) {
      setStatus('unavailable')
      return
    }
    setStatus('locating')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          setStatus('unavailable')
          return
        }
        setStored({ lat: latitude, lng: longitude, source: 'gps' })
        setStatus('idle')
      },
      (err) => {
        setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable')
      },
      GPS_OPTIONS,
    )
  }, [setStored])

  // Resolve a typed ZIP against the committed WA centroid table. A non-WA /
  // unrecognized / malformed ZIP returns false and lands in the no-location
  // state ('zip-not-found') — never a crash, never a guessed coordinate.
  const setFromZip = useCallback(
    (zip: string): boolean => {
      const centroid = lookupZipCentroid(zip)
      if (centroid === null) {
        setStatus('zip-not-found')
        return false
      }
      setStored({ lat: centroid.lat, lng: centroid.lng, source: 'zip' })
      setStatus('idle')
      return true
    },
    [setStored],
  )

  const clear = useCallback(() => {
    setStored(null)
    setStatus('idle')
  }, [setStored])

  return { location, status, requestGps, setFromZip, clear }
}

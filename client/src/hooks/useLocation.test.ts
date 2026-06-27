import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useLocation, LOCATION_KEY } from './useLocation'

// A controllable geolocation stub installed on navigator for each test.
type GeoSuccess = (pos: { coords: { latitude: number; longitude: number } }) => void
type GeoError = (err: { code: number; PERMISSION_DENIED: number }) => void
const PERMISSION_DENIED = 1

function stubGeolocation(impl: (success: GeoSuccess, error: GeoError) => void) {
  const getCurrentPosition = vi.fn((success: GeoSuccess, error: GeoError) => impl(success, error))
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })
  return getCurrentPosition
}

describe('useLocation', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.unstubAllGlobals())

  it('starts with no location and idle status', () => {
    const { result } = renderHook(() => useLocation())
    expect(result.current.location).toBeNull()
    expect(result.current.status).toBe('idle')
  })

  it('restores a valid persisted location, validated at the use site', () => {
    localStorage.setItem(LOCATION_KEY, JSON.stringify({ lat: 48.05, lng: -122.15, source: 'zip' }))
    const { result } = renderHook(() => useLocation())
    expect(result.current.location).toEqual({ lat: 48.05, lng: -122.15, source: 'zip' })
  })

  it.each([
    JSON.stringify({ lat: 'x', lng: -122, source: 'zip' }),
    JSON.stringify({ lat: 48, lng: NaN, source: 'zip' }),
    JSON.stringify({ lat: 48, lng: -122, source: 'bogus' }),
    JSON.stringify({ lat: 48 }),
    // finite but physically-impossible coordinates (corrupt/hand-edited) — must
    // not yield a confident-but-bogus distance (#3, Honest Math)
    JSON.stringify({ lat: 1000, lng: 5000, source: 'gps' }),
    JSON.stringify({ lat: 48, lng: 200, source: 'zip' }),
    JSON.stringify({ lat: -91, lng: -122, source: 'gps' }),
    'not-json',
    'null',
  ])('treats a corrupt stored value (%s) as no location', (stored) => {
    localStorage.setItem(LOCATION_KEY, stored)
    const { result } = renderHook(() => useLocation())
    expect(result.current.location).toBeNull()
  })

  it('requestGps stores exact coords on success', () => {
    stubGeolocation((success) => success({ coords: { latitude: 47.61, longitude: -122.33 } }))
    const { result } = renderHook(() => useLocation())
    act(() => result.current.requestGps())
    expect(result.current.location).toEqual({ lat: 47.61, lng: -122.33, source: 'gps' })
    expect(result.current.status).toBe('idle')
  })

  it('requestGps surfaces a denied status without setting a location', () => {
    stubGeolocation((_s, error) => error({ code: PERMISSION_DENIED, PERMISSION_DENIED }))
    const { result } = renderHook(() => useLocation())
    act(() => result.current.requestGps())
    expect(result.current.location).toBeNull()
    expect(result.current.status).toBe('denied')
  })

  it('requestGps surfaces unavailable for a non-permission error', () => {
    stubGeolocation((_s, error) => error({ code: 2, PERMISSION_DENIED }))
    const { result } = renderHook(() => useLocation())
    act(() => result.current.requestGps())
    expect(result.current.status).toBe('unavailable')
  })

  it('requestGps reports unavailable when the geolocation API is missing', () => {
    vi.stubGlobal('navigator', {})
    const { result } = renderHook(() => useLocation())
    act(() => result.current.requestGps())
    expect(result.current.status).toBe('unavailable')
    expect(result.current.location).toBeNull()
  })

  it('setFromZip resolves a WA ZIP and returns true', () => {
    const { result } = renderHook(() => useLocation())
    let ok = false
    act(() => {
      ok = result.current.setFromZip('98270')
    })
    expect(ok).toBe(true)
    expect(result.current.location?.source).toBe('zip')
    expect(result.current.location?.lat).toBeCloseTo(48.05, 1)
  })

  it('setFromZip rejects a non-WA/garbage ZIP into the no-location state', () => {
    const { result } = renderHook(() => useLocation())
    let ok = true
    act(() => {
      ok = result.current.setFromZip('90210')
    })
    expect(ok).toBe(false)
    expect(result.current.location).toBeNull()
    expect(result.current.status).toBe('zip-not-found')
  })

  it('clear removes a stored location', () => {
    localStorage.setItem(LOCATION_KEY, JSON.stringify({ lat: 48, lng: -122, source: 'gps' }))
    const { result } = renderHook(() => useLocation())
    act(() => result.current.clear())
    expect(result.current.location).toBeNull()
    expect(localStorage.getItem(LOCATION_KEY)).toBe('null')
  })
})

import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { useVehicleMpg, VEHICLE_MPG_KEY, VEHICLE_LABEL_KEY } from './useVehicleMpg'

describe('useVehicleMpg', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns null mpg and label when nothing is stored', () => {
    const { result } = renderHook(() => useVehicleMpg())
    expect(result.current.mpg).toBeNull()
    expect(result.current.label).toBeNull()
  })

  it('setVehicle persists both keys and updates state', () => {
    const { result } = renderHook(() => useVehicleMpg())

    act(() => {
      result.current.setVehicle(32, '2019 Toyota Camry')
    })

    expect(result.current.mpg).toBe(32)
    expect(result.current.label).toBe('2019 Toyota Camry')
    expect(localStorage.getItem(VEHICLE_MPG_KEY)).toBe('32')
    expect(localStorage.getItem(VEHICLE_LABEL_KEY)).toBe('"2019 Toyota Camry"')
  })

  it('restores a stored vehicle on mount', () => {
    localStorage.setItem(VEHICLE_MPG_KEY, '32')
    localStorage.setItem(VEHICLE_LABEL_KEY, '"2019 Toyota Camry"')

    const { result } = renderHook(() => useVehicleMpg())

    expect(result.current.mpg).toBe(32)
    expect(result.current.label).toBe('2019 Toyota Camry')
  })

  it.each(['"abc"', '-5', '0', 'null', 'true', 'not-json'])(
    'treats stored mpg %s as no vehicle MPG',
    (raw) => {
      localStorage.setItem(VEHICLE_MPG_KEY, raw)
      const { result } = renderHook(() => useVehicleMpg())
      expect(result.current.mpg).toBeNull()
    },
  )

  it.each(['42', 'null', '""', 'not-json'])('treats stored label %s as no label', (raw) => {
    localStorage.setItem(VEHICLE_LABEL_KEY, raw)
    const { result } = renderHook(() => useVehicleMpg())
    expect(result.current.label).toBeNull()
  })

  describe('atomic pair validation', () => {
    it('returns null for both when mpg is valid but the label is corrupt', () => {
      localStorage.setItem(VEHICLE_MPG_KEY, '32')
      localStorage.setItem(VEHICLE_LABEL_KEY, '42')

      const { result } = renderHook(() => useVehicleMpg())

      expect(result.current.mpg).toBeNull()
      expect(result.current.label).toBeNull()
    })

    it('returns null for both when mpg is valid but the label is missing', () => {
      localStorage.setItem(VEHICLE_MPG_KEY, '32')

      const { result } = renderHook(() => useVehicleMpg())

      expect(result.current.mpg).toBeNull()
      expect(result.current.label).toBeNull()
    })

    it('returns null for both when the label is valid but mpg is corrupt', () => {
      localStorage.setItem(VEHICLE_MPG_KEY, '"abc"')
      localStorage.setItem(VEHICLE_LABEL_KEY, '"2019 Toyota Camry"')

      const { result } = renderHook(() => useVehicleMpg())

      expect(result.current.mpg).toBeNull()
      expect(result.current.label).toBeNull()
    })

    it('returns null for both when both mpg and label are corrupt', () => {
      localStorage.setItem(VEHICLE_MPG_KEY, '"abc"')
      localStorage.setItem(VEHICLE_LABEL_KEY, '42')

      const { result } = renderHook(() => useVehicleMpg())

      expect(result.current.mpg).toBeNull()
      expect(result.current.label).toBeNull()
    })
  })
})

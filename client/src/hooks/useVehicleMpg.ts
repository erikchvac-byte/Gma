import { useCallback } from 'react'
import { useLocalStorage } from './useLocalStorage'
import { isPositiveFinite } from '../utils/gasCost'

export const VEHICLE_MPG_KEY = 'gma_vehicle_mpg'
export const VEHICLE_LABEL_KEY = 'gma_vehicle_label'

export interface UseVehicleMpgResult {
  mpg: number | null
  label: string | null
  setVehicle: (mpg: number, label: string) => void
}

// Single home for the vehicle localStorage pair. Stored JSON can hold any
// shape, so both values are validated here — consumers only ever see a
// usable MPG (finite > 0) and a non-empty label, or null
export function useVehicleMpg(): UseVehicleMpgResult {
  const [storedMpg, setStoredMpg] = useLocalStorage<number | null>(VEHICLE_MPG_KEY, null)
  const [storedLabel, setStoredLabel] = useLocalStorage<string | null>(VEHICLE_LABEL_KEY, null)

  const setVehicle = useCallback(
    (mpg: number, label: string) => {
      setStoredMpg(mpg)
      setStoredLabel(label)
    },
    [setStoredMpg, setStoredLabel],
  )

  const mpg = typeof storedMpg === 'number' && isPositiveFinite(storedMpg) ? storedMpg : null
  const label = typeof storedLabel === 'string' && storedLabel !== '' ? storedLabel : null

  return { mpg, label, setVehicle }
}

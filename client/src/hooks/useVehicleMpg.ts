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
// shape, so both values are validated here — atomically: a usable MPG with a
// corrupt or missing label (or vice versa) returns null for both, so callers
// never see one valid half of the pair without the other
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

  const validMpg = typeof storedMpg === 'number' && isPositiveFinite(storedMpg) ? storedMpg : null
  const validLabel = typeof storedLabel === 'string' && storedLabel !== '' ? storedLabel : null
  const hasVehicle = validMpg !== null && validLabel !== null

  return {
    mpg: hasVehicle ? validMpg : null,
    label: hasVehicle ? validLabel : null,
    setVehicle,
  }
}

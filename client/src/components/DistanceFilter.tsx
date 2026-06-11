import { useId } from 'react'

// Single home for the slider's contract — DealFeed's stored-value validation
// imports these so the range can't drift between validator and UI
export const MIN_DISTANCE_MILES = 1
export const MAX_DISTANCE_MILES = 50
export const DEFAULT_DISTANCE_MILES = 25

interface DistanceFilterProps {
  value: number
  onChange: (miles: number) => void
}

// Recorded decision: slider, not numeric input — values above 50 are not settable
export default function DistanceFilter({ value, onChange }: DistanceFilterProps) {
  const id = useId()
  return (
    <div className="mb-4">
      <label htmlFor={id} className="block text-sm text-gray-700">
        Within {value} {value === 1 ? 'mile' : 'miles'}
      </label>
      <input
        id={id}
        type="range"
        min={MIN_DISTANCE_MILES}
        max={MAX_DISTANCE_MILES}
        step="1"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full"
      />
    </div>
  )
}

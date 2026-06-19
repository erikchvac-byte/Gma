import { RangeSlider } from './ui'

// Single home for the slider's contract — DealFeed's stored-value validation
// imports these so the range can't drift between validator and UI
export const MIN_DISTANCE_MILES = 1
export const MAX_DISTANCE_MILES = 50
export const DEFAULT_DISTANCE_MILES = 50

interface DistanceFilterProps {
  value: number
  onChange: (miles: number) => void
}

// Recorded decision: slider, not numeric input — values above 50 are not settable.
// The "{n} miles" string drives both the visible value and aria-valuetext.
export default function DistanceFilter({ value, onChange }: DistanceFilterProps) {
  return (
    <RangeSlider
      label="Within"
      value={value}
      onChange={onChange}
      min={MIN_DISTANCE_MILES}
      max={MAX_DISTANCE_MILES}
      step={1}
      valueText={`${value} ${value === 1 ? 'mile' : 'miles'}`}
      showTicks
      minLabel="1 mi"
      maxLabel="50 mi"
    />
  )
}

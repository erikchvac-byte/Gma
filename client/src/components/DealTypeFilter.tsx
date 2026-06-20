import type { DealTypeSelection } from '../utils/dealView'

// Chips map to the real Deal.type field (ADR-030) — no invented product
// categories. This makes ADR-007's primary/secondary split interactive with
// zero scraper changes.
const CHIPS: { value: DealTypeSelection; label: string }[] = [
  { value: 'all', label: 'All deals' },
  { value: 'happy_hour', label: 'Happy hours' },
  { value: 'daily', label: 'Daily deals' },
]

interface DealTypeFilterProps {
  selected: DealTypeSelection
  onSelect: (value: DealTypeSelection) => void
}

export default function DealTypeFilter({ selected, onSelect }: DealTypeFilterProps) {
  return (
    <div className="gma-chips" role="group" aria-label="Filter deals by type">
      {CHIPS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          className="gma-chip"
          aria-pressed={selected === value}
          onClick={() => onSelect(value)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

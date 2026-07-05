import { DEAL_ICON_LABEL } from '../utils/dealIcons'
import { DEAL_ICON_SRC } from '../utils/dealIconAssets'
import type { DealCategory } from '../utils/dealView'

// Icon filter bar (replaces the old Deal.type text chips): one toggle button
// per category actually present on the page, wearing the exact same art the
// deal cards tag with (DEAL_ICON_SRC canonical single art — the rotation pools
// stay card-only). Clicking a pressed icon clears the selection.
interface DealCategoryFilterProps {
  // categories present in the page's active deals, already in canonical order
  categories: DealCategory[]
  selected: DealCategory | null
  onSelect: (value: DealCategory | null) => void
}

export default function DealCategoryFilter({
  categories,
  selected,
  onSelect,
}: DealCategoryFilterProps) {
  // nothing on the page carries a tag → no bar at all (never an empty row)
  if (categories.length === 0) return null
  return (
    <div className="gma-chips" role="group" aria-label="Filter deals by category">
      {categories.map((category) => (
        <button
          key={category}
          type="button"
          className="gma-icon-chip"
          title={DEAL_ICON_LABEL[category]}
          aria-label={DEAL_ICON_LABEL[category]}
          aria-pressed={selected === category}
          onClick={() => onSelect(selected === category ? null : category)}
        >
          <img
            className="gma-deal-icon"
            src={DEAL_ICON_SRC[category]}
            alt=""
            width={28}
            height={28}
          />
        </button>
      ))}
    </div>
  )
}

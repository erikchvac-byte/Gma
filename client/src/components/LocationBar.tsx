import { useState } from 'react'
import LocationInput from './LocationInput'
import { Button, Icon } from './ui'
import type { LocationStatus } from '../hooks/useLocation'
import type { UserLocation } from '../types'

interface LocationBarProps {
  location: UserLocation | null
  status: LocationStatus
  onUseGps: () => void
  onZipSubmit: (zip: string) => boolean
  onClear: () => void
}

// Persistent control at the top of the feed (Erik-confirmed): lets a user set
// location for the first time (e.g. after skipping onboarding) or change it
// later. With no location it shows the honest empty state + the two doors; with
// a location it collapses to a one-line summary with a "Change" toggle.
export default function LocationBar({
  location,
  status,
  onUseGps,
  onZipSubmit,
  onClear,
}: LocationBarProps) {
  // expanded by default when there's nothing to summarize yet
  const [expanded, setExpanded] = useState(location === null)

  const summary =
    location === null
      ? null
      : location.source === 'gps'
        ? 'Distances from your current location'
        : 'Distances from your ZIP area'

  // collapse the editor automatically once a location resolves via either door
  const handleZipSubmit = (zip: string): boolean => {
    const ok = onZipSubmit(zip)
    if (ok) setExpanded(false)
    return ok
  }

  return (
    <section className="gma-location-bar" aria-label="Your location">
      <div className="gma-location-bar__row">
        <span className="gma-location-bar__label">
          <Icon name="map-pin" size={16} />
          {summary ?? 'No location set — distances and gas costs are hidden'}
        </span>
        {location !== null && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            {expanded ? 'Done' : 'Change'}
          </Button>
        )}
      </div>
      {expanded && (
        <div className="gma-location-bar__editor">
          <LocationInput status={status} onUseGps={onUseGps} onZipSubmit={handleZipSubmit} />
          {location !== null && (
            <Button variant="ghost" size="sm" onClick={onClear}>
              Clear location
            </Button>
          )}
        </div>
      )}
    </section>
  )
}

import { Button } from './ui'
import carArt from '../assets/location-icons/car.webp'

interface VehicleBarProps {
  // resolved vehicle from App (already validated by useVehicleMpg); both null
  // together → no vehicle (the hook never returns one valid half of the pair)
  mpg: number | null
  label: string | null
  onOpen: () => void
}

// Persistent labeled control at the top of the feed (CAP-5), paired with
// LocationBar. The vehicle selector used to be reachable only through an
// unlabeled Header gear — undiscoverable now that gas costs require a chosen
// vehicle (no national-MPG default, chunk 1). This makes the entry point plainly
// visible and self-describing. Unlike LocationBar there's no inline editor: the
// action always opens the existing VehicleSelector sheet.
export default function VehicleBar({ mpg, label, onOpen }: VehicleBarProps) {
  const hasVehicle = mpg !== null && label !== null
  const summary = hasVehicle ? `${label} · ${mpg} MPG` : 'Set your vehicle for gas costs'

  return (
    <section className="gma-vehicle-bar" aria-label="Your vehicle">
      <div className="gma-vehicle-bar__row">
        <span className="gma-vehicle-bar__label">
          <img src={carArt} alt="" aria-hidden="true" width={36} height={36} className="gma-location-pin" />
          {summary}
        </span>
        <Button variant={hasVehicle ? 'ghost' : 'secondary'} size="sm" onClick={onOpen}>
          {hasVehicle ? 'Change' : 'Set'}
        </Button>
      </div>
    </section>
  )
}

import { useState } from 'react'
import type { FormEvent } from 'react'
import { Button, Notice, TextField } from './ui'
import pinArt from '../assets/location-icons/pin.webp'
import type { LocationStatus } from '../hooks/useLocation'

interface LocationInputProps {
  status: LocationStatus
  onUseGps: () => void
  // returns true when the ZIP resolved (so the field can clear); false → stays
  onZipSubmit: (zip: string) => boolean
}

// The two doors (CAP-3): one-tap device GPS and a WA ZIP box, side by side, with
// honest status — a spinner while locating, a fallback message when GPS is
// blocked/unavailable, and a "not a WA ZIP" error that keeps the user in the
// no-location state instead of guessing. Purely presentational over useLocation;
// reused by the first-run onboarding step and the persistent top-of-feed bar.
export default function LocationInput({ status, onUseGps, onZipSubmit }: LocationInputProps) {
  const [zip, setZip] = useState('')
  // `status` is owned by the single useLocation instance, so a transient error
  // from a PRIOR instance (e.g. a bad ZIP typed in the onboarding step) would
  // otherwise bleed onto a fresh, untouched field in the persistent bar (#2).
  // Gate each door's message on interaction *here*: the ZIP error shows only
  // after a rejected submit of the current text (and clears on edit); the GPS
  // notice only after a GPS attempt in this instance.
  const [submittedZip, setSubmittedZip] = useState<string | null>(null)
  const [gpsTried, setGpsTried] = useState(false)
  const locating = status === 'locating'

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    // Read the live input value as the source of truth rather than the
    // controlled `zip` state. On some mobile keyboards/suggestion strips/autofill
    // the field value can land in the DOM without firing React's onChange, so
    // `zip` stays '' and the submit silently drops. Reading the element makes the
    // ZIP door work regardless of how the value got there.
    const raw = event.currentTarget.querySelector('input')?.value ?? zip
    if (raw.trim() === '') return // empty tap is a no-op (not a "bad ZIP" error)
    setZip(raw)
    setSubmittedZip(raw)
    if (onZipSubmit(raw)) setZip('')
  }

  const handleUseGps = () => {
    setGpsTried(true)
    onUseGps()
  }

  const showZipError = status === 'zip-not-found' && submittedZip !== null && submittedZip === zip

  // GPS fallback notice — denial and unavailability both point the user at ZIP
  const gpsNotice =
    gpsTried && status === 'denied'
      ? 'Location access is blocked. Enter your ZIP code instead.'
      : gpsTried && status === 'unavailable'
        ? "Couldn't get your location. Enter your ZIP code instead."
        : null

  return (
    <div className="gma-location-input">
      <div className="gma-location-input__doors">
        <Button
          variant="primary"
          onClick={handleUseGps}
          disabled={locating}
          iconLeft={
            <img src={pinArt} alt="" aria-hidden="true" width={16} height={16} className="gma-location-pin" />
          }
          className="gma-location-input__gps"
        >
          {locating ? 'Locating…' : 'Use my location'}
        </Button>
        <span className="gma-location-input__or" aria-hidden="true">
          or
        </span>
        <form className="gma-location-input__zip" onSubmit={handleSubmit}>
          <TextField
            label="ZIP code"
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="e.g. 98270"
            maxLength={10}
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            error={showZipError ? 'Enter a Washington ZIP code.' : undefined}
          />
          <Button type="submit" variant="secondary">
            Go
          </Button>
        </form>
      </div>
      {gpsNotice !== null && (
        <Notice variant="muted" role="status">
          {gpsNotice}
        </Notice>
      )}
    </div>
  )
}

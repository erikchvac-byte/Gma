import { useEffect, useRef } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react'
import LocationInput from './LocationInput'
import { Button } from './ui'
import pinArt from '../assets/location-icons/pin.webp'
import type { LocationStatus } from '../hooks/useLocation'

interface LocationOnboardingProps {
  status: LocationStatus
  onUseGps: () => void
  onZipSubmit: (zip: string) => boolean
  onSkip: () => void
}

// mirrors AgeGate: an aria-modal step must keep keyboard focus inside it
const FOCUSABLE = 'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])'

// First-run step shown once, right after the age gate clears (Erik-confirmed
// placement). Setting a location here auto-advances (App marks onboarding done
// when `location` becomes non-null); "Not now" dismisses to the feed in the
// honest no-location state (CAP-2: deals still list, just no distances/$). The
// persistent top-of-feed bar lets a user set or change location later.
export default function LocationOnboarding({
  status,
  onUseGps,
  onZipSubmit,
  onSkip,
}: LocationOnboardingProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  // move focus into the step on mount (no Escape by design — it's a step, not a
  // dismissable popover; "Not now" is the explicit exit, mirroring AgeGate)
  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
  }, [])

  // trap Tab so an aria-modal step can't leak focus to the browser chrome behind it
  const handleKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key !== 'Tab') return
    const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE)
    if (!focusables || focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="loc-onboard-heading"
      onKeyDown={handleKeyDown}
      style={overlayStyle}
    >
      <div style={cardStyle}>
        <img
          src={pinArt}
          alt=""
          aria-hidden="true"
          width={56}
          height={56}
          style={tileStyle}
          className="gma-location-pin"
        />
        <h1 id="loc-onboard-heading" style={headingStyle}>
          Where are you?
        </h1>
        <p style={contextStyle}>
          Set your location and every deal shows how far the store is — and what the round trip
          costs in gas. Skip it and you&apos;ll still see all the deals, just no distances.
        </p>
        <LocationInput status={status} onUseGps={onUseGps} onZipSubmit={onZipSubmit} />
        <Button variant="ghost" block onClick={onSkip}>
          Not now
        </Button>
      </div>
    </div>
  )
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 45,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--space-5)',
  padding: 'var(--space-6)',
  textAlign: 'center',
  background: 'var(--surface-inverse)',
  color: 'var(--text-on-inverse)',
}

const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--space-4)',
  width: '100%',
  maxWidth: 404,
  padding: 'var(--space-6)',
  background: 'var(--surface-card)',
  border: 'var(--border-hairline) solid var(--border-strong)',
  borderRadius: 'var(--radius-2xl)',
}

// the art carries its own background, so the tile just rounds the corners
const tileStyle: CSSProperties = {
  width: 56,
  height: 56,
  borderRadius: 'var(--radius-lg)',
}

const headingStyle: CSSProperties = {
  color: 'var(--text-strong)',
  fontFamily: 'var(--font-head)',
  fontWeight: 'var(--weight-bold)',
  fontSize: 'var(--text-xl)',
  lineHeight: 'var(--leading-snug)',
  margin: 0,
}

const contextStyle: CSSProperties = {
  color: 'var(--text-muted)',
  font: 'var(--font-body)',
  margin: 0,
}

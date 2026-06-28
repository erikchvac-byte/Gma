import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { AGE_GATE_WARNINGS } from '../constants/legal'
import { Button } from './ui'

interface AgeGateProps {
  children: ReactNode
}

const FOCUSABLE = 'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])'

// Decorative product-category tiles (resized from GmasINCOlist → src/assets at
// build time). Collected via glob so the set self-updates if tiles are added.
const ICON_TILES = Object.values(
  import.meta.glob('../assets/age-icons/*.webp', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
) as string[]

const TILE = 96 // px — tight, uniform grid cell

/**
 * Full-bleed, randomized tile mosaic behind the gate. Purely decorative:
 * aria-hidden, non-interactive, and dimmed to a faint texture so the solid card
 * and warning bar always sit cleanly on top. The shuffle is memoized per mount.
 */
function IconField() {
  const tiles = useMemo(() => {
    if (ICON_TILES.length === 0) return []
    const cols = Math.ceil(window.innerWidth / TILE)
    const rows = Math.ceil(window.innerHeight / TILE)
    const count = cols * rows
    const arr = Array.from({ length: count }, (_, n) => ICON_TILES[n % ICON_TILES.length])
    for (let n = arr.length - 1; n > 0; n--) {
      const j = Math.floor(Math.random() * (n + 1))
      ;[arr[n], arr[j]] = [arr[j], arr[n]]
    }
    return arr
  }, [])

  return (
    <div aria-hidden="true" style={iconFieldStyle}>
      {tiles.map((src, i) => (
        <img key={i} src={src} alt="" draggable={false} style={tileImgStyle} />
      ))}
    </div>
  )
}

/**
 * Shared decorative backdrop: the tile mosaic plus a dark scrim that sits over
 * the tiles (equal z-index, later in the DOM) and under the card (z-index 51).
 * Used by every gate state so the scrim can never drift out of one of them.
 */
function Backdrop() {
  return (
    <>
      <IconField />
      <div aria-hidden="true" style={scrimStyle} />
    </>
  )
}

/**
 * The four WA-mandated warnings, laid out horizontally along the bottom of the
 * page on an opaque strip so the tile mosaic can never reduce their legibility.
 */
function WarningBar() {
  return (
    <div style={warningBarStyle}>
      {AGE_GATE_WARNINGS.map((w) => (
        <p key={w} style={warningItemStyle}>
          {w}
        </p>
      ))}
    </div>
  )
}

/**
 * 21+ age gate (two-option, brief §5a — supersedes ADR-021's no-decline gate;
 * builds on the compliance decline path from ADR-035 per ADR-036). States:
 * ask → in / out. Decline is returnable ("Go back") and session-only, never
 * persisted. "Remember me" persists the pass to localStorage; unchecked confirms
 * for the session only.
 */
export default function AgeGate({ children }: AgeGateProps) {
  const [ageConfirmed, setAgeConfirmed] = useLocalStorage('gma_age_confirmed', false)
  const [sessionConfirmed, setSessionConfirmed] = useState(false)
  const [declined, setDeclined] = useState(false)
  const [remember, setRemember] = useState(true)
  const dialogRef = useRef<HTMLDivElement>(null)

  // strict check: a corrupted or hand-edited localStorage value must not open the gate
  const isIn = ageConfirmed === true || sessionConfirmed

  useEffect(() => {
    if (isIn) return
    // move focus into the gate on mount / when returning to the ask state
    const target = dialogRef.current?.querySelector<HTMLElement>('button, [href]')
    target?.focus()
  }, [isIn, declined])

  if (isIn) return <>{children}</>

  const confirm = () => {
    if (remember) setAgeConfirmed(true)
    else setSessionConfirmed(true)
  }

  // Trap Tab within the gate so an `aria-modal` dialog can't leak focus to the
  // browser chrome. No Escape handler by design — an age gate is not dismissable.
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

  // ----- "out" state: declined -----
  if (declined) {
    return (
      <>
        <Backdrop />
        <div
          ref={dialogRef}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="age-gate-out-heading"
          onKeyDown={handleKeyDown}
          style={overlayStyle}
        >
          <div style={topRowStyle}>
            <Wordmark />
          </div>
          <div style={centerStyle}>
            <div style={cardStyle}>
              <h1 id="age-gate-out-heading" style={headingStyle}>
                Come back at 21+
              </h1>
              <p style={contextStyle}>You must be 21 or older to view cannabis deals.</p>
              <Button variant="secondary" block onClick={() => setDeclined(false)}>
                Go back
              </Button>
            </div>
          </div>
        </div>
      </>
    )
  }

  // ----- "ask" state -----
  return (
    <>
      <Backdrop />
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="age-gate-heading"
        onKeyDown={handleKeyDown}
        style={overlayStyle}
      >
        <div style={topRowStyle}>
          <Wordmark />
        </div>
        <div style={centerStyle}>
          <div style={cardStyle}>
            <span aria-hidden="true" style={tileStyle}>
              21+
            </span>
            <h1 id="age-gate-heading" style={headingStyle}>
              Are you 21 or older?
            </h1>
            <p style={contextStyle}>
              Cannabis deals are for adults 21 and over only.
            </p>
            <div style={{ display: 'grid', gap: 'var(--space-2)', width: '100%' }}>
              <Button variant="primary" block className="gma-btn--lg" onClick={confirm}>
                Yes — I&apos;m 21+
              </Button>
              <Button variant="secondary" block onClick={() => setDeclined(true)}>
                No, take me back
              </Button>
            </div>
            <label style={rememberStyle}>
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                style={{ accentColor: 'var(--accent)', width: 18, height: 18 }}
              />
              Remember me on this device
            </label>
          </div>
        </div>
        <WarningBar />
      </div>
    </>
  )
}

function Wordmark() {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'flex-end',
        fontFamily: 'var(--font-head)',
        fontSize: 'var(--text-4xl)',
        fontWeight: 'var(--weight-medium)',
        letterSpacing: '-0.01em',
        color: 'var(--text-strong)',
      }}
    >
      gmas list
      <span
        aria-hidden="true"
        style={{
          width: '0.21em',
          height: '0.21em',
          borderRadius: 'var(--radius-dot)',
          background: 'var(--accent)',
          marginLeft: '0.14em',
          marginBottom: '0.16em',
        }}
      />
    </span>
  )
}

const iconFieldStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 50,
  display: 'grid',
  gridTemplateColumns: `repeat(auto-fill, minmax(${TILE}px, 1fr))`,
  gap: 0,
  overflow: 'hidden',
  pointerEvents: 'none',
  // dark takeover fill; tiles sit on top at low opacity as a faint texture
  background: 'var(--surface-inverse)',
} as const

// Dark scrim over the mosaic. Same z-index as the field but rendered after it
// in the DOM, so it paints on top of the tiles while the card (z-index 51)
// stays above the scrim. aria-hidden + non-interactive — purely a contrast aid.
const scrimStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 50,
  background: 'rgba(0, 0, 0, 0.5)',
  pointerEvents: 'none',
} as const

const tileImgStyle = {
  width: '100%',
  height: `${TILE}px`,
  objectFit: 'cover',
  opacity: 0.16,
  userSelect: 'none',
} as const

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 51,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: 'var(--space-5)',
  padding: 'var(--space-6)',
  textAlign: 'center',
  // transparent so the IconField mosaic shows through; the card and warning
  // bar carry their own opaque backgrounds, so text legibility is structural.
  background: 'transparent',
  color: 'var(--text-on-inverse)',
} as const

const topRowStyle = {
  display: 'flex',
  justifyContent: 'center',
  flex: '0 0 auto',
} as const

const centerStyle = {
  flex: '1 1 auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
} as const

const cardStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--space-4)',
  width: '100%',
  maxWidth: 404,
  padding: 'var(--space-6)',
  background: 'var(--surface-card)',
  // crisper card edge (--border-strong) — matches .gma-card; --surface sits
  // only ~1.1:1 off the --bg takeover so the hairline must carry the boundary
  border: 'var(--border-hairline) solid var(--border-strong)',
  borderRadius: 'var(--radius-2xl)',
} as const

const tileStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 56,
  height: 56,
  borderRadius: 'var(--radius-lg)',
  background: 'var(--accent-soft)',
  color: 'var(--accent)',
  fontFamily: 'var(--font-head)',
  fontWeight: 'var(--weight-bold)',
  fontSize: 'var(--text-2xl)',
} as const

const headingStyle = {
  color: 'var(--text-strong)',
  fontFamily: 'var(--font-head)',
  fontWeight: 'var(--weight-bold)',
  fontSize: 'var(--text-xl)',
  lineHeight: 'var(--leading-snug)',
  margin: 0,
} as const

const contextStyle = {
  color: 'var(--text-muted)',
  font: 'var(--font-body)',
  margin: 0,
} as const

const rememberStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  font: 'var(--font-caption)',
  color: 'var(--text-muted)',
  cursor: 'pointer',
} as const

const warningBarStyle = {
  // bleed past the overlay padding so the strip runs edge-to-edge along the
  // bottom of the page; opaque background guarantees legibility over the mosaic.
  flex: '0 0 auto',
  margin: 'var(--space-5) calc(-1 * var(--space-6)) calc(-1 * var(--space-6))',
  padding: 'var(--space-3) var(--space-6)',
  background: 'var(--surface-card)',
  borderTop: 'var(--border-hairline) solid var(--border-strong)',
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: 'var(--space-2) var(--space-5)',
  textAlign: 'left',
} as const

const warningItemStyle = {
  margin: 0,
  // legally-mandated warnings: hold the 14px readable floor and a muted (not
  // faint) color so they clear WCAG AA on the opaque strip (review patch).
  font: 'var(--font-caption)',
  fontSize: 'var(--text-sm)',
  lineHeight: 'var(--leading-snug)',
  color: 'var(--text-muted)',
} as const

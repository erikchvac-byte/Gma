import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { AGE_GATE_WARNINGS } from '../constants/legal'
import { Button } from './ui'

interface AgeGateProps {
  children: ReactNode
}

const FOCUSABLE = 'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])'

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
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="age-gate-out-heading"
        onKeyDown={handleKeyDown}
        style={overlayStyle}
      >
        <Wordmark />
        <div style={cardStyle}>
          <h1 id="age-gate-out-heading" style={headingStyle}>
            Come back at 21
          </h1>
          <p style={contextStyle}>You must be 21 or older to view cannabis deals.</p>
          <Button variant="secondary" block onClick={() => setDeclined(false)}>
            Go back
          </Button>
        </div>
      </div>
    )
  }

  // ----- "ask" state -----
  return (
    <div
      ref={dialogRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="age-gate-heading"
      onKeyDown={handleKeyDown}
      style={overlayStyle}
    >
      <Wordmark />
      <div style={cardStyle}>
        <span aria-hidden="true" style={tileStyle}>
          21
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
      <div style={smallPrintStyle}>
        {AGE_GATE_WARNINGS.map((w) => (
          <p key={w}>{w}</p>
        ))}
      </div>
    </div>
  )
}

function Wordmark() {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'flex-end',
        fontFamily: 'var(--font-head)',
        fontSize: 'var(--text-2xl)',
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

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 50,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--space-5)',
  padding: 'var(--space-6)',
  textAlign: 'center',
  background: 'var(--surface-inverse)',
  color: 'var(--text-on-inverse)',
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

const smallPrintStyle = {
  display: 'grid',
  gap: 'var(--space-1)',
  maxWidth: 404,
  // legally-mandated warnings: hold the 14px readable floor and a muted (not
  // faint) color so they clear WCAG AA on the dark card (review patch).
  font: 'var(--font-caption)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-muted)',
} as const

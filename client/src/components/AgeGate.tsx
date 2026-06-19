import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { Button, Icon } from './ui'

interface AgeGateProps {
  children: ReactNode
}

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 50,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--space-6)',
  padding: 'var(--space-6)',
  textAlign: 'center',
  background: 'var(--surface-inverse)',
  color: 'var(--text-on-inverse)',
} as const

const headingStyle = {
  color: 'var(--white)',
  fontWeight: 'var(--weight-regular)',
  fontSize: 'var(--text-lg)',
  lineHeight: 'var(--leading-snug)',
  maxWidth: 320,
  margin: 0,
} as const

export default function AgeGate({ children }: AgeGateProps) {
  const [ageConfirmed, setAgeConfirmed] = useLocalStorage('gma_age_confirmed', false)
  // Decline is deliberately session-only state, NOT persisted: a reload re-shows the
  // normal gate (we never want to lock someone out permanently from a shared browser).
  const [declined, setDeclined] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // move focus to the first action (Confirm) on mount; both gate buttons live
    // inside the dialog so focus stays trapped until the user acts
    dialogRef.current?.querySelector('button')?.focus()
  }, [])

  useEffect(() => {
    // the dead-end screen has no focusable action (it's terminal), so on the decline
    // transition move focus onto the alertdialog container itself — otherwise focus is
    // left on the now-unmounted decline button and falls back to <body>, leaving the
    // takeover unannounced to screen readers (code review 2026-06-18).
    if (declined) dialogRef.current?.focus()
  }, [declined])

  // Terminal dead-end for under-21 visitors. No path back into content and the
  // confirmation flag is never set — re-entry only via a fresh load (re-gate).
  if (declined) {
    return (
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="age-gate-heading"
        tabIndex={-1}
        style={overlayStyle}
      >
        <span aria-hidden="true" style={{ color: 'var(--text-muted)' }}>
          <Icon name="shield-check" size={36} />
        </span>
        <h1 id="age-gate-heading" style={headingStyle}>
          This site is for adults 21 and over.
        </h1>
      </div>
    )
  }

  // strict check: a corrupted or hand-edited localStorage value must not open the gate
  if (ageConfirmed !== true) {
    return (
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="age-gate-heading"
        style={overlayStyle}
      >
        <span aria-hidden="true" style={{ color: 'var(--green-300)' }}>
          <Icon name="shield-check" size={36} />
        </span>
        <h1 id="age-gate-heading" style={headingStyle}>
          You must be 21 or older to view this content.
        </h1>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <Button variant="primary" onClick={() => setAgeConfirmed(true)}>
            I am 21 or older
          </Button>
          <Button variant="ghost" onClick={() => setDeclined(true)}>
            I am under 21
          </Button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

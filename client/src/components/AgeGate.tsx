import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { Button, Icon } from './ui'

interface AgeGateProps {
  children: ReactNode
}

export default function AgeGate({ children }: AgeGateProps) {
  const [ageConfirmed, setAgeConfirmed] = useLocalStorage('gma_age_confirmed', false)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // move focus to the confirm button on mount — the gate's single focusable,
    // so focus is trivially trapped until confirmation
    dialogRef.current?.querySelector('button')?.focus()
  }, [])

  // strict check: a corrupted or hand-edited localStorage value must not open the gate
  if (ageConfirmed !== true) {
    return (
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="age-gate-heading"
        style={{
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
        }}
      >
        <span aria-hidden="true" style={{ color: 'var(--green-300)' }}>
          <Icon name="shield-check" size={36} />
        </span>
        <h1
          id="age-gate-heading"
          style={{
            color: 'var(--white)',
            fontWeight: 'var(--weight-regular)',
            fontSize: 'var(--text-lg)',
            lineHeight: 'var(--leading-snug)',
            maxWidth: 320,
            margin: 0,
          }}
        >
          You must be 21 or older to view this content.
        </h1>
        <Button variant="primary" onClick={() => setAgeConfirmed(true)}>
          I am 21 or older
        </Button>
      </div>
    )
  }

  return <>{children}</>
}

import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useLocalStorage } from '../hooks/useLocalStorage'

interface AgeGateProps {
  children: ReactNode
}

export default function AgeGate({ children }: AgeGateProps) {
  const [ageConfirmed, setAgeConfirmed] = useLocalStorage('gma_age_confirmed', false)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    confirmButtonRef.current?.focus()
  }, [])

  // strict check: a corrupted or hand-edited localStorage value must not open the gate
  if (ageConfirmed !== true) {
    return (
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="age-gate-heading"
        className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-gray-900 p-4 text-center text-white"
      >
        <h1 id="age-gate-heading" className="text-lg font-normal">
          You must be 21 or older to view this content.
        </h1>
        <button
          ref={confirmButtonRef}
          type="button"
          onClick={() => setAgeConfirmed(true)}
          className="rounded-lg bg-green-700 px-6 py-3 text-lg font-semibold hover:bg-green-800"
        >
          I am 21 or older
        </button>
      </div>
    )
  }

  return <>{children}</>
}

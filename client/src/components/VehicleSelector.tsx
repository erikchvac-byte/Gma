import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useFuelEconomy } from '../hooks/useFuelEconomy'
import { Icon, IconButton, Notice, Select } from './ui'

interface VehicleSelectorProps {
  open: boolean
  onClose: () => void
  mpg: number | null
  label: string | null
  onMpgChange: (mpg: number, label: string) => void
}

const FOCUSABLE =
  'button:not([disabled]), select:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Vehicle precision mode (FR-8) as a bottom sheet (ruled .decision-log.md:48).
// The cascading Year → Make → Model selection and its auto-resolve-on-Model
// behavior are unchanged from the inline panel — only the presentation and the
// dialog/focus contract are new. The gear trigger now lives in the Header; this
// sheet is opened/closed by App via the `open`/`onClose` props.
export default function VehicleSelector({ open, onClose, mpg, label, onMpgChange }: VehicleSelectorProps) {
  const [year, setYear] = useState('')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  // bumped on every Year/Make/Model change — an MPG lookup that finishes
  // after the selection moved on must never report its result
  const selectionRef = useRef(0)
  const dialogRef = useRef<HTMLDivElement>(null)
  const { years, makes, models, error, loadYears, loadMakes, loadModels, resolveMpg, clearError } =
    useFuelEconomy()

  // On open: drop any stale error, lazy-load the Year list, lock body scroll,
  // and move focus into the sheet. On close (cleanup): restore scroll and return
  // focus to whatever opened the sheet (the Header gear).
  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    clearError()
    if (years.length === 0) void loadYears()

    const { body } = document
    const prevOverflow = body.style.overflow
    body.style.overflow = 'hidden'
    dialogRef.current?.querySelector<HTMLElement>('select, ' + FOCUSABLE)?.focus()

    return () => {
      body.style.overflow = prevOverflow
      previouslyFocused?.focus()
    }
    // run only on the open/close transition; cascade state is read fresh inside
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
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

  const handleYearChange = (nextYear: string) => {
    selectionRef.current += 1
    setYear(nextYear)
    setMake('')
    setModel('')
    if (nextYear !== '') void loadMakes(nextYear)
  }

  const handleMakeChange = (nextMake: string) => {
    selectionRef.current += 1
    setMake(nextMake)
    setModel('')
    if (nextMake !== '') void loadModels(year, nextMake)
  }

  const handleModelChange = async (nextModel: string) => {
    const selection = ++selectionRef.current
    setModel(nextModel)
    if (nextModel === '') return
    const resolved = await resolveMpg(year, make, nextModel)
    // a failed lookup keeps the sheet open with the error on display;
    // an abandoned one (selection changed while in flight) is dropped
    if (resolved !== null && selection === selectionRef.current) {
      onMpgChange(resolved, `${year} ${make} ${nextModel}`)
      onClose()
    }
  }

  if (!open) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onKeyDown={handleKeyDown}>
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'var(--scrim)' }}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Vehicle settings"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          maxWidth: 640,
          margin: '0 auto',
          background: 'var(--surface-card)',
          borderTopLeftRadius: 'var(--radius-2xl)',
          borderTopRightRadius: 'var(--radius-2xl)',
          boxShadow: 'var(--shadow-lg)',
          padding: 'var(--space-5)',
          display: 'grid',
          gap: 'var(--space-4)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span aria-hidden="true" style={{ color: 'var(--accent)' }}>
              <Icon name="car" size={20} />
            </span>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-semibold)', margin: 0 }}>
              Your vehicle
            </h2>
          </div>
          <IconButton aria-label="Close" size="sm" onClick={onClose}>
            <Icon name="x" size={18} />
          </IconButton>
        </div>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', margin: 0 }}>
          Set it once for exact gas math. Skip it and we use the national average.
        </p>
        {mpg !== null && label !== null && (
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-body)', margin: 0 }}>
            Currently using{' '}
            <strong style={{ fontWeight: 'var(--weight-semibold)' }}>
              {label} · {mpg} MPG
            </strong>
          </p>
        )}
        {error !== null && (
          <Notice variant="error" role="alert" icon={<Icon name="triangle-alert" size={16} />}>
            {error}{' '}
            {mpg !== null
              ? 'Gas costs will keep using your saved vehicle.'
              : 'Gas costs will use the national average.'}
          </Notice>
        )}
        <Select
          label="Year"
          value={year}
          placeholder="Select year"
          options={years.map((option) => ({ value: option, label: option }))}
          onChange={(event) => handleYearChange(event.target.value)}
        />
        <Select
          label="Make"
          value={make}
          placeholder="Select make"
          disabled={year === ''}
          options={makes.map((option) => ({ value: option, label: option }))}
          onChange={(event) => handleMakeChange(event.target.value)}
        />
        <Select
          label="Model"
          value={model}
          placeholder="Select model"
          disabled={make === ''}
          options={models.map((option) => ({ value: option, label: option }))}
          onChange={(event) => void handleModelChange(event.target.value)}
        />
      </div>
    </div>
  )
}

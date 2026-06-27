import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import LocationOnboarding from './LocationOnboarding'

describe('LocationOnboarding', () => {
  const props = {
    status: 'idle' as const,
    onUseGps: vi.fn(),
    onZipSubmit: vi.fn(),
    onSkip: vi.fn(),
  }

  it('renders as a labeled dialog with the two location doors', () => {
    render(<LocationOnboarding {...props} />)
    expect(screen.getByRole('dialog', { name: /where are you/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /use my location/i })).toBeInTheDocument()
    expect(screen.getByLabelText('ZIP code')).toBeInTheDocument()
  })

  it('calls onSkip from "Not now"', () => {
    const onSkip = vi.fn()
    render(<LocationOnboarding {...props} onSkip={onSkip} />)
    fireEvent.click(screen.getByRole('button', { name: /not now/i }))
    expect(onSkip).toHaveBeenCalledOnce()
  })

  it('wires the GPS door to onUseGps', () => {
    const onUseGps = vi.fn()
    render(<LocationOnboarding {...props} onUseGps={onUseGps} />)
    fireEvent.click(screen.getByRole('button', { name: /use my location/i }))
    expect(onUseGps).toHaveBeenCalledOnce()
  })

  it('moves focus into the dialog on mount (aria-modal focus management)', () => {
    render(<LocationOnboarding {...props} />)
    // first focusable is the GPS button
    expect(screen.getByRole('button', { name: /use my location/i })).toHaveFocus()
  })

  it('traps Tab: shift+Tab from the first focusable wraps to the last', () => {
    render(<LocationOnboarding {...props} />)
    const gps = screen.getByRole('button', { name: /use my location/i })
    const notNow = screen.getByRole('button', { name: /not now/i })
    gps.focus()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab', shiftKey: true })
    expect(notNow).toHaveFocus()
  })
})

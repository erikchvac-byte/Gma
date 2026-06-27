import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import LocationBar from './LocationBar'
import type { UserLocation } from '../types'

const base = {
  status: 'idle' as const,
  onUseGps: vi.fn(),
  onZipSubmit: vi.fn(),
  onClear: vi.fn(),
}

const gps: UserLocation = { lat: 47.61, lng: -122.33, source: 'gps' }

describe('LocationBar', () => {
  it('shows the honest empty state and the input doors when no location is set', () => {
    render(<LocationBar {...base} location={null} />)
    expect(screen.getByText(/no location set/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /use my location/i })).toBeInTheDocument()
    expect(screen.getByLabelText('ZIP code')).toBeInTheDocument()
  })

  it('collapses to a summary with a Change toggle when a location is set', () => {
    render(<LocationBar {...base} location={gps} />)
    expect(screen.getByText(/from your current location/i)).toBeInTheDocument()
    // editor hidden until "Change"
    expect(screen.queryByLabelText('ZIP code')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    expect(screen.getByLabelText('ZIP code')).toBeInTheDocument()
  })

  it('summarizes a ZIP-sourced location distinctly', () => {
    render(<LocationBar {...base} location={{ ...gps, source: 'zip' }} />)
    expect(screen.getByText(/from your zip area/i)).toBeInTheDocument()
  })

  it('exposes Clear location only while editing a set location, and calls onClear', () => {
    const onClear = vi.fn()
    render(<LocationBar {...base} location={gps} onClear={onClear} />)
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    fireEvent.click(screen.getByRole('button', { name: /clear location/i }))
    expect(onClear).toHaveBeenCalledOnce()
  })
})

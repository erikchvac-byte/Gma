import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import VehicleBar from './VehicleBar'

describe('VehicleBar', () => {
  it('shows a labeled CTA when no vehicle is set', () => {
    render(<VehicleBar mpg={null} label={null} onOpen={vi.fn()} />)

    expect(screen.getByRole('region', { name: 'Your vehicle' })).toBeInTheDocument()
    expect(screen.getByText('Set your vehicle for gas costs')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Set' })).toBeInTheDocument()
  })

  it('shows the vehicle label and MPG summary when a vehicle is set', () => {
    render(<VehicleBar mpg={32} label="2019 Toyota Camry" onOpen={vi.fn()} />)

    expect(screen.getByText('2019 Toyota Camry · 32 MPG')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument()
    expect(screen.queryByText('Set your vehicle for gas costs')).not.toBeInTheDocument()
  })

  it('falls back to the CTA when the stored pair is incomplete (no half-state)', () => {
    // useVehicleMpg returns both-or-neither; a lone mpg without a label is null/null
    render(<VehicleBar mpg={null} label="orphan label" onOpen={vi.fn()} />)
    expect(screen.getByText('Set your vehicle for gas costs')).toBeInTheDocument()
  })

  it('calls onOpen when the control is activated (CTA state)', () => {
    const onOpen = vi.fn()
    render(<VehicleBar mpg={null} label={null} onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: 'Set' }))
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it('calls onOpen when the control is activated (set state)', () => {
    const onOpen = vi.fn()
    render(<VehicleBar mpg={32} label="2019 Toyota Camry" onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    expect(onOpen).toHaveBeenCalledOnce()
  })
})

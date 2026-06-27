import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import LocationInput from './LocationInput'

describe('LocationInput', () => {
  it('renders both doors: a GPS button and a ZIP field', () => {
    render(<LocationInput status="idle" onUseGps={vi.fn()} onZipSubmit={vi.fn()} />)
    expect(screen.getByRole('button', { name: /use my location/i })).toBeInTheDocument()
    expect(screen.getByLabelText('ZIP code')).toBeInTheDocument()
  })

  it('calls onUseGps when the GPS button is clicked', () => {
    const onUseGps = vi.fn()
    render(<LocationInput status="idle" onUseGps={onUseGps} onZipSubmit={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /use my location/i }))
    expect(onUseGps).toHaveBeenCalledOnce()
  })

  it('disables the GPS button and shows a locating label while in flight', () => {
    render(<LocationInput status="locating" onUseGps={vi.fn()} onZipSubmit={vi.fn()} />)
    const btn = screen.getByRole('button', { name: /locating/i })
    expect(btn).toBeDisabled()
  })

  it('submits the typed ZIP and clears the field on success', () => {
    const onZipSubmit = vi.fn().mockReturnValue(true)
    render(<LocationInput status="idle" onUseGps={vi.fn()} onZipSubmit={onZipSubmit} />)
    const input = screen.getByLabelText('ZIP code') as HTMLInputElement
    fireEvent.change(input, { target: { value: '98270' } })
    fireEvent.click(screen.getByRole('button', { name: 'Go' }))
    expect(onZipSubmit).toHaveBeenCalledWith('98270')
    expect(input.value).toBe('')
  })

  it('keeps the typed ZIP when the submit is rejected', () => {
    const onZipSubmit = vi.fn().mockReturnValue(false)
    render(<LocationInput status="idle" onUseGps={vi.fn()} onZipSubmit={onZipSubmit} />)
    const input = screen.getByLabelText('ZIP code') as HTMLInputElement
    fireEvent.change(input, { target: { value: '90210' } })
    fireEvent.click(screen.getByRole('button', { name: 'Go' }))
    expect(input.value).toBe('90210')
  })

  it('shows the WA-ZIP error after a rejected submit of the current text', () => {
    const onZipSubmit = vi.fn().mockReturnValue(false)
    render(<LocationInput status="zip-not-found" onUseGps={vi.fn()} onZipSubmit={onZipSubmit} />)
    fireEvent.change(screen.getByLabelText('ZIP code'), { target: { value: '90210' } })
    fireEvent.click(screen.getByRole('button', { name: 'Go' }))
    expect(screen.getByText(/washington zip code/i)).toBeInTheDocument()
  })

  it('does NOT show a stale ZIP error on a fresh, untouched field (#2 no bleed)', () => {
    // a prior instance set status to zip-not-found; this empty field must stay clean
    render(<LocationInput status="zip-not-found" onUseGps={vi.fn()} onZipSubmit={vi.fn()} />)
    expect(screen.queryByText(/washington zip code/i)).not.toBeInTheDocument()
  })

  it('clears the ZIP error once the user edits the field', () => {
    const onZipSubmit = vi.fn().mockReturnValue(false)
    render(<LocationInput status="zip-not-found" onUseGps={vi.fn()} onZipSubmit={onZipSubmit} />)
    fireEvent.change(screen.getByLabelText('ZIP code'), { target: { value: '90210' } })
    fireEvent.click(screen.getByRole('button', { name: 'Go' }))
    expect(screen.getByText(/washington zip code/i)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('ZIP code'), { target: { value: '982' } })
    expect(screen.queryByText(/washington zip code/i)).not.toBeInTheDocument()
  })

  it('shows a fallback notice after a GPS attempt in this instance', () => {
    const onUseGps = vi.fn()
    render(<LocationInput status="denied" onUseGps={onUseGps} onZipSubmit={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /use my location/i }))
    expect(screen.getByText(/blocked.*zip/i)).toBeInTheDocument()
  })

  it('does NOT show a stale GPS notice without a GPS attempt here (#2 no bleed)', () => {
    render(<LocationInput status="denied" onUseGps={vi.fn()} onZipSubmit={vi.fn()} />)
    expect(screen.queryByText(/blocked.*zip/i)).not.toBeInTheDocument()
  })
})

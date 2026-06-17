import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import DistanceFilter from './DistanceFilter'

describe('DistanceFilter', () => {
  it('renders a range input bounded to 1–50 at the given value', () => {
    render(<DistanceFilter value={25} onChange={() => {}} />)

    // accessible name comes from the "Within" label; the value is announced
    // via aria-valuetext ("25 miles") rather than baked into the name
    const slider = screen.getByRole('slider', { name: 'Within' })
    expect(slider).toHaveAttribute('type', 'range')
    expect(slider).toHaveAttribute('min', '1')
    expect(slider).toHaveAttribute('max', '50')
    expect(slider).toHaveValue('25')
    expect(slider).toHaveAttribute('aria-valuetext', '25 miles')
  })

  it('shows the current value alongside the "Within" label', () => {
    render(<DistanceFilter value={10} onChange={() => {}} />)

    expect(screen.getByText('Within')).toBeInTheDocument()
    expect(screen.getByText('10 miles')).toBeInTheDocument()
  })

  it('uses the singular "mile" at a value of 1', () => {
    render(<DistanceFilter value={1} onChange={() => {}} />)

    expect(screen.getByText('1 mile')).toBeInTheDocument()
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', '1 mile')
  })

  it('fires onChange with the new value as a number', () => {
    const onChange = vi.fn()
    render(<DistanceFilter value={25} onChange={onChange} />)

    fireEvent.change(screen.getByRole('slider'), { target: { value: '10' } })

    expect(onChange).toHaveBeenCalledWith(10)
  })
})

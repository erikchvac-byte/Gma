import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { RangeSlider } from './RangeSlider'

describe('RangeSlider', () => {
  it('renders label and value', () => {
    render(<RangeSlider label="Distance" value={25} />)
    expect(screen.getByText('Distance')).toBeInTheDocument()
    expect(screen.getByText('25')).toBeInTheDocument()
  })

  it('calls onChange with numeric value', () => {
    const onChange = vi.fn()
    render(<RangeSlider value={25} onChange={onChange} min={0} max={100} />)
    const input = screen.getByRole('slider')
    fireEvent.change(input, { target: { value: '50' } })
    expect(onChange).toHaveBeenCalledWith(50)
  })

  it('sets aria-valuetext when valueText is a string', () => {
    render(<RangeSlider value={25} valueText="25 miles" />)
    const input = screen.getByRole('slider')
    expect(input).toHaveAttribute('aria-valuetext', '25 miles')
  })

  it('omits aria-valuetext when no valueText', () => {
    render(<RangeSlider value={25} />)
    const input = screen.getByRole('slider')
    expect(input).not.toHaveAttribute('aria-valuetext')
  })

  it('omits aria-valuetext when valueText is ReactNode (not string)', () => {
    render(<RangeSlider value={25} valueText={<strong>25 miles</strong>} />)
    const input = screen.getByRole('slider')
    expect(input).not.toHaveAttribute('aria-valuetext')
  })

  it('renders min/max tick labels when showTicks is true', () => {
    render(<RangeSlider value={25} min={0} max={100} showTicks minLabel="0 mi" maxLabel="100 mi" />)
    expect(screen.getByText('0 mi')).toBeInTheDocument()
    expect(screen.getByText('100 mi')).toBeInTheDocument()
  })

  it('forwards min/max/step attributes', () => {
    render(<RangeSlider value={5} min={1} max={10} step={2} />)
    const input = screen.getByRole('slider')
    expect(input).toHaveAttribute('min', '1')
    expect(input).toHaveAttribute('max', '10')
    expect(input).toHaveAttribute('step', '2')
  })
})

import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Select } from './Select'

describe('Select', () => {
  it('renders with label', () => {
    render(<Select label="Year" options={[{ value: '2020', label: '2020' }]} />)
    expect(screen.getByText('Year')).toBeInTheDocument()
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('renders options from array', () => {
    render(
      <Select
        options={[
          { value: 'a', label: 'Option A' },
          { value: 'b', label: 'Option B' },
        ]}
      />
    )
    expect(screen.getByRole('option', { name: 'Option A' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Option B' })).toBeInTheDocument()
  })

  it('renders placeholder as disabled option', () => {
    render(<Select placeholder="Choose one" options={[{ value: 'a', label: 'A' }]} />)
    const placeholder = screen.getByRole('option', { name: 'Choose one' })
    expect(placeholder).toBeDisabled()
  })

  it('renders children when no options prop', () => {
    render(
      <Select>
        <option value="x">Child Option</option>
      </Select>
    )
    expect(screen.getByRole('option', { name: 'Child Option' })).toBeInTheDocument()
  })

  it('fires onChange with value', () => {
    const onChange = vi.fn()
    render(
      <Select onChange={onChange} options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} />
    )
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'b' } })
    expect(onChange).toHaveBeenCalled()
  })

  it('forwards disabled attribute', () => {
    render(<Select disabled options={[{ value: 'a', label: 'A' }]} />)
    expect(screen.getByRole('combobox')).toBeDisabled()
  })
})

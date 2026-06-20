import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import DealTypeFilter from './DealTypeFilter'

describe('DealTypeFilter', () => {
  it('renders the three type chips, marking the selected one pressed', () => {
    render(<DealTypeFilter selected="all" onSelect={() => {}} />)

    const all = screen.getByRole('button', { name: 'All deals' })
    expect(all).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Happy hours' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Daily deals' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('marks a non-default selection pressed', () => {
    render(<DealTypeFilter selected="happy_hour" onSelect={() => {}} />)
    expect(screen.getByRole('button', { name: 'Happy hours' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'All deals' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('emits the chip value on click', () => {
    const onSelect = vi.fn()
    render(<DealTypeFilter selected="all" onSelect={onSelect} />)

    fireEvent.click(screen.getByRole('button', { name: 'Daily deals' }))
    expect(onSelect).toHaveBeenCalledWith('daily')
  })
})

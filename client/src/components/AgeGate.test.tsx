import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import AgeGate from './AgeGate'

const confirmButton = () => screen.getByRole('button', { name: 'I am 21 or older' })
const queryConfirmButton = () => screen.queryByRole('button', { name: 'I am 21 or older' })

describe('AgeGate', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('shows the overlay and hides children when age is not confirmed', () => {
    render(
      <AgeGate>
        <p>Deal Content</p>
      </AgeGate>,
    )

    expect(confirmButton()).toBeInTheDocument()
    expect(screen.queryByText('Deal Content')).not.toBeInTheDocument()
  })

  it('exposes dialog semantics and moves focus to the confirm button', () => {
    render(
      <AgeGate>
        <p>Deal Content</p>
      </AgeGate>,
    )

    const dialog = screen.getByRole('alertdialog', { name: /21 or older/i })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(confirmButton()).toHaveFocus()
  })

  it('confirms age, persists to localStorage, and reveals children on click', () => {
    render(
      <AgeGate>
        <p>Deal Content</p>
      </AgeGate>,
    )

    fireEvent.click(confirmButton())

    expect(queryConfirmButton()).not.toBeInTheDocument()
    expect(screen.getByText('Deal Content')).toBeInTheDocument()
    expect(localStorage.getItem('gma_age_confirmed')).toBe('true')
  })

  it('does not show the overlay when age is already confirmed', () => {
    localStorage.setItem('gma_age_confirmed', 'true')

    render(
      <AgeGate>
        <p>Deal Content</p>
      </AgeGate>,
    )

    expect(queryConfirmButton()).not.toBeInTheDocument()
    expect(screen.getByText('Deal Content')).toBeInTheDocument()
  })

  it.each(['1', '"yes"', '{}', '"false"'])(
    'keeps the gate up when localStorage holds non-boolean value %s',
    (storedValue) => {
      localStorage.setItem('gma_age_confirmed', storedValue)

      render(
        <AgeGate>
          <p>Deal Content</p>
        </AgeGate>,
      )

      expect(confirmButton()).toBeInTheDocument()
      expect(screen.queryByText('Deal Content')).not.toBeInTheDocument()
    },
  )

  it('reappears after localStorage is cleared', () => {
    localStorage.setItem('gma_age_confirmed', 'true')
    const { unmount } = render(
      <AgeGate>
        <p>Deal Content</p>
      </AgeGate>,
    )
    expect(queryConfirmButton()).not.toBeInTheDocument()
    unmount()

    localStorage.clear()
    render(
      <AgeGate>
        <p>Deal Content</p>
      </AgeGate>,
    )
    expect(confirmButton()).toBeInTheDocument()
    expect(screen.queryByText('Deal Content')).not.toBeInTheDocument()
  })
})

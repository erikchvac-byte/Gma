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

  it('offers an "I am under 21" decline action alongside confirm', () => {
    render(
      <AgeGate>
        <p>Deal Content</p>
      </AgeGate>,
    )

    expect(confirmButton()).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'I am under 21' })).toBeInTheDocument()
  })

  it('declining shows a terminal dead-end screen and does NOT confirm or reveal content', () => {
    render(
      <AgeGate>
        <p>Deal Content</p>
      </AgeGate>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'I am under 21' }))

    expect(screen.getByText('This site is for adults 21 and over.')).toBeInTheDocument()
    expect(screen.queryByText('Deal Content')).not.toBeInTheDocument()
    // no path back into content from the dead-end
    expect(queryConfirmButton()).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'I am under 21' })).not.toBeInTheDocument()
    // confirmation flag must never be set by declining
    expect(localStorage.getItem('gma_age_confirmed')).not.toBe('true')
  })

  it('moves focus onto the dead-end alertdialog after declining (a11y)', () => {
    render(
      <AgeGate>
        <p>Deal Content</p>
      </AgeGate>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'I am under 21' }))

    // the terminal screen has no focusable action, so focus must land on the dialog
    // container itself rather than falling back to <body>
    expect(screen.getByRole('alertdialog')).toHaveFocus()
  })

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

import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import AgeGate from './AgeGate'

const confirmButton = () => screen.getByRole('button', { name: /i'm 21\+/i })
const queryConfirmButton = () => screen.queryByRole('button', { name: /i'm 21\+/i })

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

  it('confirms age, persists to localStorage (remember on by default), and reveals children', () => {
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

  it('confirms for the session only (no persistence) when "Remember me" is unchecked', () => {
    render(
      <AgeGate>
        <p>Deal Content</p>
      </AgeGate>,
    )

    fireEvent.click(screen.getByRole('checkbox', { name: /remember me/i }))
    fireEvent.click(confirmButton())

    expect(screen.getByText('Deal Content')).toBeInTheDocument()
    expect(localStorage.getItem('gma_age_confirmed')).toBeNull()
  })

  it('declines to the "out" state and can return to the gate', () => {
    render(
      <AgeGate>
        <p>Deal Content</p>
      </AgeGate>,
    )

    fireEvent.click(screen.getByRole('button', { name: /no, take me back/i }))

    expect(screen.getByRole('heading', { name: /come back at 21/i })).toBeInTheDocument()
    expect(screen.queryByText('Deal Content')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /go back/i }))
    expect(confirmButton()).toBeInTheDocument()
  })

  it('renders the four WA mandated warnings verbatim', () => {
    render(
      <AgeGate>
        <p>Deal Content</p>
      </AgeGate>,
    )

    expect(screen.getByText('This product has intoxicating effects and may be habit forming.')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Cannabis can impair concentration, coordination, and judgment. Do not operate a vehicle or machinery under the influence of this drug.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText('There may be health risks associated with consumption of this product.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('For use only by adults 21 and older. Keep out of the reach of children.'),
    ).toBeInTheDocument()
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

  it('declining never persists the age-confirmation flag (session-only)', () => {
    render(
      <AgeGate>
        <p>Deal Content</p>
      </AgeGate>,
    )

    fireEvent.click(screen.getByRole('button', { name: /no, take me back/i }))

    // decline routes to the returnable "out" state without revealing content
    expect(screen.getByText('Come back at 21')).toBeInTheDocument()
    expect(screen.queryByText('Deal Content')).not.toBeInTheDocument()
    // confirmation flag must never be set by declining
    expect(localStorage.getItem('gma_age_confirmed')).not.toBe('true')
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

import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import Header from './Header'

describe('Header', () => {
  it('renders a banner with the wordmark as the page h1', () => {
    render(<Header />)

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'gmas list' })).toBeInTheDocument()
  })

  it('no longer carries a settings/gear button (vehicle opens from VehicleBar, CAP-5)', () => {
    render(<Header />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /vehicle|settings/i })).not.toBeInTheDocument()
  })
})

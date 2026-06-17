import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import Header from './Header'

describe('Header', () => {
  it('renders a banner with the wordmark as the page h1', () => {
    render(<Header onOpenSettings={vi.fn()} />)

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: "Gma's Helper" })).toBeInTheDocument()
  })

  it('exposes the settings gear with an accessible label', () => {
    render(<Header onOpenSettings={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Vehicle & settings' })).toBeInTheDocument()
  })

  it('calls onOpenSettings when the gear is activated', () => {
    const onOpenSettings = vi.fn()
    render(<Header onOpenSettings={onOpenSettings} />)

    fireEvent.click(screen.getByRole('button', { name: 'Vehicle & settings' }))

    expect(onOpenSettings).toHaveBeenCalledTimes(1)
  })
})

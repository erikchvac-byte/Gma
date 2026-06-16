import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { IconButton } from './IconButton'

describe('IconButton', () => {
  it('renders with aria-label', () => {
    render(<IconButton aria-label="Close">X</IconButton>)
    const btn = screen.getByRole('button', { name: 'Close' })
    expect(btn).toHaveClass('gma-iconbtn')
  })

  it('applies sm class', () => {
    render(<IconButton aria-label="Settings" size="sm">S</IconButton>)
    expect(screen.getByRole('button')).toHaveClass('gma-iconbtn--sm')
  })

  it('applies outlined class', () => {
    render(<IconButton aria-label="Options" outlined>O</IconButton>)
    expect(screen.getByRole('button')).toHaveClass('gma-iconbtn--outlined')
  })

  it('forwards extra props', () => {
    render(<IconButton aria-label="Disabled" disabled>D</IconButton>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('forwards className', () => {
    render(<IconButton aria-label="Custom" className="extra">C</IconButton>)
    expect(screen.getByRole('button')).toHaveClass('extra')
  })
})

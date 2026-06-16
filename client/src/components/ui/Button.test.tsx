import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Button } from './Button'

describe('Button', () => {
  it('renders a primary button by default', () => {
    render(<Button>Click me</Button>)
    const btn = screen.getByRole('button', { name: 'Click me' })
    expect(btn).toHaveClass('gma-btn', 'gma-btn--primary')
  })

  it('renders secondary variant', () => {
    render(<Button variant="secondary">Secondary</Button>)
    expect(screen.getByRole('button')).toHaveClass('gma-btn--secondary')
  })

  it('renders ghost variant', () => {
    render(<Button variant="ghost">Ghost</Button>)
    expect(screen.getByRole('button')).toHaveClass('gma-btn--ghost')
  })

  it('renders danger variant', () => {
    render(<Button variant="danger">Danger</Button>)
    expect(screen.getByRole('button')).toHaveClass('gma-btn--danger')
  })

  it('applies sm size class', () => {
    render(<Button size="sm">Small</Button>)
    expect(screen.getByRole('button')).toHaveClass('gma-btn--sm')
  })

  it('applies block class', () => {
    render(<Button block>Block</Button>)
    expect(screen.getByRole('button')).toHaveClass('gma-btn--block')
  })

  it('renders as anchor when href is provided', () => {
    render(<Button href="/test">Link</Button>)
    expect(screen.getByRole('link', { name: 'Link' })).toHaveAttribute('href', '/test')
  })

  it('renders as button when href is provided but disabled', () => {
    render(<Button href="/test" disabled>Disabled Link</Button>)
    expect(screen.getByRole('button')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('forwards className', () => {
    render(<Button className="custom-class">Btn</Button>)
    expect(screen.getByRole('button')).toHaveClass('custom-class')
  })

  it('renders iconLeft and iconRight', () => {
    render(
      <Button iconLeft={<span data-testid="icon-left" />} iconRight={<span data-testid="icon-right" />}>
        Label
      </Button>
    )
    expect(screen.getByTestId('icon-left')).toBeInTheDocument()
    expect(screen.getByTestId('icon-right')).toBeInTheDocument()
  })
})

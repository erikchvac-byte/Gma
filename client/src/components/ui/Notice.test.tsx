import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Notice } from './Notice'

describe('Notice', () => {
  it('renders default notice', () => {
    const { container } = render(<Notice>Info message</Notice>)
    expect(container.querySelector('p')).toHaveClass('gma-notice', 'gma-notice--default')
    expect(screen.getByText('Info message')).toBeInTheDocument()
  })

  it('renders muted variant', () => {
    const { container } = render(<Notice variant="muted">Quiet</Notice>)
    expect(container.querySelector('p')).toHaveClass('gma-notice--muted')
  })

  it('renders error variant', () => {
    const { container } = render(<Notice variant="error">Error!</Notice>)
    expect(container.querySelector('p')).toHaveClass('gma-notice--error')
  })

  it('renders urgent variant', () => {
    const { container } = render(<Notice variant="urgent">Urgent</Notice>)
    expect(container.querySelector('p')).toHaveClass('gma-notice--urgent')
  })

  it('renders icon when provided', () => {
    render(<Notice icon={<span data-testid="icon" />}>With icon</Notice>)
    expect(screen.getByTestId('icon')).toBeInTheDocument()
    expect(screen.getByTestId('icon').parentElement).toHaveClass('gma-notice__icon')
  })

  it('does not render icon span when no icon provided', () => {
    const { container } = render(<Notice>No icon</Notice>)
    expect(container.querySelector('.gma-notice__icon')).not.toBeInTheDocument()
  })

  it('forwards role prop', () => {
    const { container } = render(<Notice role="alert">Alert!</Notice>)
    expect(container.querySelector('p')).toHaveAttribute('role', 'alert')
  })

  it('forwards className', () => {
    const { container } = render(<Notice className="extra">Custom</Notice>)
    expect(container.querySelector('p')).toHaveClass('extra')
  })
})

import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Icon } from './Icon'

describe('Icon', () => {
  it('renders with correct size attribute', () => {
    const { container } = render(<Icon name="settings" size={32} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '32')
    expect(svg).toHaveAttribute('height', '32')
  })

  it('renders aria-hidden="true"', () => {
    const { container } = render(<Icon name="navigation" />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders a known icon path', () => {
    const { container } = render(<Icon name="x" />)
    const svg = container.querySelector('svg')
    expect(svg?.innerHTML).toContain('M18 6 6 18')
  })

  it('applies className prop', () => {
    const { container } = render(<Icon name="clock" className="test-class" />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveClass('test-class')
  })

  it('rejects unknown icon name at compile time', () => {
    // @ts-expect-error — 'unknown-icon' is not a valid IconName
    render(<Icon name="unknown-icon" />)
  })
})

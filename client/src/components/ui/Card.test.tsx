import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Card } from './Card'

describe('Card', () => {
  it('renders as div by default', () => {
    const { container } = render(<Card>Content</Card>)
    expect(container.querySelector('div')).toHaveClass('gma-card')
  })

  it('renders as article when as="article"', () => {
    const { container } = render(<Card as="article">Content</Card>)
    expect(container.querySelector('article')).toHaveClass('gma-card')
    expect(container.querySelector('div')).not.toBeInTheDocument()
  })

  it('applies flush padding class', () => {
    const { container } = render(<Card padding="flush">Content</Card>)
    expect(container.querySelector('div')).toHaveClass('gma-card--flush')
  })

  it('applies roomy padding class', () => {
    const { container } = render(<Card padding="roomy">Content</Card>)
    expect(container.querySelector('div')).toHaveClass('gma-card--roomy')
  })

  it('applies interactive class', () => {
    const { container } = render(<Card interactive>Content</Card>)
    expect(container.querySelector('div')).toHaveClass('gma-card--interactive')
  })

  it('applies urgent class', () => {
    const { container } = render(<Card urgent>Content</Card>)
    expect(container.querySelector('div')).toHaveClass('gma-card--urgent')
  })

  it('forwards className', () => {
    const { container } = render(<Card className="extra">Content</Card>)
    expect(container.querySelector('div')).toHaveClass('extra')
  })
})

import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Badge } from './Badge'

describe('Badge', () => {
  it('renders neutral badge by default', () => {
    const { container } = render(<Badge>Neutral</Badge>)
    const span = container.querySelector('span')
    expect(span).toHaveClass('gma-badge', 'gma-badge--neutral')
  })

  it('renders urgent variant class', () => {
    const { container } = render(<Badge variant="urgent">Urgent</Badge>)
    expect(container.querySelector('span')).toHaveClass('gma-badge--urgent')
  })

  it('renders fresh badge with dot', () => {
    const { container } = render(<Badge variant="fresh">Fresh</Badge>)
    expect(container.querySelector('span')).toHaveClass('gma-badge--fresh')
    expect(container.querySelector('.gma-badge__dot')).toBeInTheDocument()
  })

  it('renders stale badge with dot', () => {
    const { container } = render(<Badge variant="stale">Stale</Badge>)
    expect(container.querySelector('.gma-badge__dot')).toBeInTheDocument()
  })

  it('renders dot=true forces dot on neutral', () => {
    const { container } = render(<Badge dot>Neutral</Badge>)
    expect(container.querySelector('.gma-badge__dot')).toBeInTheDocument()
  })

  it('renders discount variant class', () => {
    const { container } = render(<Badge variant="discount">10% Off</Badge>)
    expect(container.querySelector('span')).toHaveClass('gma-badge--discount')
    expect(container.querySelector('.gma-badge__dot')).not.toBeInTheDocument()
  })

  it('forwards className', () => {
    const { container } = render(<Badge className="extra">B</Badge>)
    expect(container.querySelector('span')).toHaveClass('extra')
  })
})

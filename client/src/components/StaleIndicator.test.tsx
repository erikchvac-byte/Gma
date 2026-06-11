import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import StaleIndicator from './StaleIndicator'

describe('StaleIndicator', () => {
  it('renders nothing when the count is 0', () => {
    const { container } = render(<StaleIndicator count={0} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for a negative count', () => {
    const { container } = render(<StaleIndicator count={-1} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for NaN — "NaN sources unavailable" must be unrenderable', () => {
    const { container } = render(<StaleIndicator count={Number.NaN} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('uses the singular "source" for a count of 1', () => {
    render(<StaleIndicator count={1} />)

    expect(screen.getByText('1 source unavailable')).toBeInTheDocument()
  })

  it('uses the plural "sources" for counts above 1', () => {
    render(<StaleIndicator count={3} />)

    expect(screen.getByText('3 sources unavailable')).toBeInTheDocument()
  })
})

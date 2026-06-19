import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import DisclaimerFooter, { WA_WARNING_ENABLED, WA_WARNING_TEXT } from './DisclaimerFooter'

describe('DisclaimerFooter', () => {
  it('always renders the accuracy/affiliation disclaimer', () => {
    render(<DisclaimerFooter />)
    expect(
      screen.getByText(/not affiliated with any dispensary and sells nothing/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/verify in store/i)).toBeInTheDocument()
  })

  it('always renders the gas-estimate qualifier', () => {
    render(<DisclaimerFooter />)
    expect(
      screen.getByText(/Gas costs are estimates based on average fuel prices and rated MPG/i),
    ).toBeInTheDocument()
  })

  it('hides the WA mandatory-warning text by default (counsel-gated, flag off)', () => {
    expect(WA_WARNING_ENABLED).toBe(false) // launch default — do not enable without counsel
    render(<DisclaimerFooter />)
    expect(screen.queryByText(WA_WARNING_TEXT)).not.toBeInTheDocument()
  })

  it('surfaces the exact WA warning text when the flag is on', () => {
    render(<DisclaimerFooter showWaWarning />)
    expect(screen.getByText(WA_WARNING_TEXT)).toBeInTheDocument()
  })
})

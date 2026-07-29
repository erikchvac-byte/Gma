import { describe, it, expect } from 'vitest'
import { positioningDisclaimerHtml } from './positioningDisclaimer.js'

describe('positioningDisclaimerHtml', () => {
  it('states the independent-information-service, not-a-seller positioning', () => {
    const html = positioningDisclaimerHtml()
    expect(html).toContain('independent information service')
    expect(html).toContain('not a cannabis seller')
    expect(html).toContain('publicly available deals from licensed Washington retailers')
    expect(html).toContain('worth the drive')
  })

  it('links to the /about entity page and the /compare hub', () => {
    const html = positioningDisclaimerHtml()
    expect(html).toContain('href="/about"')
    expect(html).toContain('href="/compare"')
  })

  it('omits a class attribute when no className is given (crawler-body use)', () => {
    const html = positioningDisclaimerHtml()
    expect(html.startsWith('<p>')).toBe(true)
    expect(html).not.toContain('class=')
  })

  it('emits the class attribute when a className is given (styled document use)', () => {
    expect(positioningDisclaimerHtml('disclaimer')).toContain('<p class="disclaimer">')
    expect(positioningDisclaimerHtml('notice')).toContain('<p class="notice">')
  })

  it('is a single, well-formed paragraph', () => {
    const html = positioningDisclaimerHtml('disclaimer')
    expect(html.startsWith('<p')).toBe(true)
    expect(html.endsWith('</p>')).toBe(true)
    // exactly one paragraph
    expect(html.match(/<p[ >]/g)).toHaveLength(1)
  })
})

import { describe, it, expect } from 'vitest'
import { renderShellBody } from './renderShellBody.js'
import type { ApiDataResponse, Deal, Dispensary } from '../../client/src/types/index.js'

function deal(description: string): Deal {
  return { type: 'daily', description, discountPct: null, startTime: null, endTime: null, daysValid: ['everyday'] }
}

function store(over: Partial<Dispensary> & { id: string; name: string }): Dispensary {
  return {
    url: 'https://example.test',
    stale: false,
    lastFetchedAt: '2026-07-23T00:00:00Z',
    deals: [],
    ...over,
  }
}

function data(dispensaries: Dispensary[]): ApiDataResponse {
  return {
    meta: { lastScraperRun: '2026-07-23T00:00:00Z', gasPrice: 4.2, gasPriceUpdatedAt: '2026-07-23T00:00:00Z' },
    dispensaries,
  }
}

describe('renderShellBody', () => {
  it('renders a heading, the age notice, and a section per store carrying its deal text', () => {
    const html = renderShellBody(
      data([
        store({ id: 'a', name: 'Green Store', deals: [deal('25% off flower'), deal('BOGO edibles')] }),
      ]),
    )
    expect(html).toContain('<h1>Cannabis deals worth the drive at licensed Washington retailers</h1>')
    expect(html).toContain('For use only by adults 21 and older')
    expect(html).toContain('<h2>Green Store</h2>')
    expect(html).toContain('<li>25% off flower</li>')
    expect(html).toContain('<li>BOGO edibles</li>')
  })

  it('escapes hostile store and deal text so it cannot break out of the markup', () => {
    const html = renderShellBody(
      data([
        store({
          id: 'a',
          name: 'Store </script><script>alert(1)</script>',
          deals: [deal('deal <b>x</b> & more')],
        }),
      ]),
    )
    expect(html).not.toContain('</script><script>alert(1)')
    expect(html).toContain('Store &lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('deal &lt;b&gt;x&lt;/b&gt; &amp; more')
  })

  it('renders the store address when present, omits it otherwise', () => {
    const withAddr = renderShellBody(
      data([store({ id: 'a', name: 'A', address: '123 Main St, Everett, WA', deals: [deal('x')] })]),
    )
    expect(withAddr).toContain('<p>123 Main St, Everett, WA</p>')

    const noAddr = renderShellBody(data([store({ id: 'b', name: 'B', deals: [deal('x')] })]))
    expect(noAddr).not.toContain('<p>123 Main St')
  })

  it('skips stores with no active deals, and renders just the heading + notice when nothing is on', () => {
    const mixed = renderShellBody(
      data([
        store({ id: 'a', name: 'Has Deals', deals: [deal('x')] }),
        store({ id: 'b', name: 'No Deals', deals: [] }),
      ]),
    )
    expect(mixed).toContain('<h2>Has Deals</h2>')
    expect(mixed).not.toContain('<h2>No Deals</h2>')

    const empty = renderShellBody(data([store({ id: 'b', name: 'No Deals', deals: [] })]))
    expect(empty).toContain('<h1>')
    expect(empty).toContain('adults 21 and older')
    expect(empty).not.toContain('<section>')
  })
})

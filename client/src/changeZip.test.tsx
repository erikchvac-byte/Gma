import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import App from './App'
import type { ApiDataResponse, Dispensary } from './types'

// Regression for Erik's report: an already-located user CHANGES the ZIP and the
// feed must re-center on the new ZIP in one submit (no one-render lag), and the
// bar must echo the active ZIP so a wrong/auto-filled entry is visible. Uses the
// real committed ZIP table (via App -> useLocation): 98224 = Baring (mountains,
// far from every store), 98274 = Mount Vernon (Tulalip is near, Everett is far).
const store = (id: string, name: string, lat: number, lng: number): Dispensary => ({
  id,
  name,
  url: `https://example.com/${id}`,
  lat,
  lng,
  stale: false,
  lastFetchedAt: '2026-06-10T07:00:00',
  deals: [
    { type: 'daily', description: 'deal', discountPct: 20, startTime: null, endTime: null, daysValid: ['everyday'] },
  ],
})

const payload: ApiDataResponse = {
  meta: { lastScraperRun: '2026-06-10T07:45:00', gasPrice: 4.1, gasPriceUpdatedAt: '2026-06-10T07:00:00' },
  dispensaries: [
    store('remedy-tulalip', 'Remedy Tulalip', 48.0803125, -122.1861767), // ~24mi from 98274
    store('hangar-420-everett', 'Hangar 420 Everett', 47.8890687, -122.2153644), // ~41mi from 98274
    store('happy-time-mt-vernon', 'Happy Time Mt Vernon', 48.4201, -122.335), // ~12mi from 98274
  ],
}

const jsonResponse = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response

const routeFetch = () =>
  vi.fn((input: RequestInfo | URL) =>
    Promise.resolve(
      jsonResponse(String(input).includes('fueleconomy') ? { menuItem: [] } : payload),
    ),
  )

describe('changing the ZIP re-centers the feed and echoes the active ZIP', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('gma_age_confirmed', 'true')
    localStorage.setItem('gma_location_onboarded', 'true')
    // start centered on 98224 (Baring) — Everett is the nearest of these stores
    localStorage.setItem(
      'gma_location',
      JSON.stringify({ lat: 47.72888, lng: -121.5638, source: 'zip', zip: '98224' }),
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it('flips Tulalip ahead of Everett after the ZIP is changed to 98274', async () => {
    vi.stubGlobal('fetch', routeFetch())
    render(<App />)
    await screen.findByRole('region', { name: 'Deal feed' })

    // the bar echoes the starting ZIP so the active area is visible
    expect(screen.getByText(/ZIP 98224/)).toBeInTheDocument()

    const change = screen.queryByRole('button', { name: 'Change' })
    if (change) fireEvent.click(change)
    fireEvent.change(screen.getByLabelText('ZIP code'), { target: { value: '98274' } })
    fireEvent.click(screen.getByRole('button', { name: 'Go' }))

    await waitFor(() => expect(localStorage.getItem('gma_location')).toContain('48.34877'))

    const cards = within(screen.getByRole('region', { name: 'Deal feed' })).getAllByRole('listitem')
    const order = cards.map((c) => c.textContent ?? '')
    const tulalip = order.findIndex((t) => t.includes('Tulalip'))
    const everett = order.findIndex((t) => t.includes('Hangar 420'))
    expect(tulalip).toBeGreaterThanOrEqual(0)
    expect(tulalip).toBeLessThan(everett)
    // and the bar now echoes the new ZIP
    expect(screen.getByText(/ZIP 98274/)).toBeInTheDocument()
  })
})

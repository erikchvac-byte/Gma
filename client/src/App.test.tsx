import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import App from './App'
import type { ApiDataResponse } from './types'

const meta = {
  lastScraperRun: '2026-06-10T07:45:00',
  gasPrice: 4.1,
  gasPriceUpdatedAt: '2026-06-10T07:00:00',
}

const emptyPayload: ApiDataResponse = { meta, dispensaries: [] }

const oneDispensary: ApiDataResponse = {
  meta,
  dispensaries: [
    {
      id: 'a',
      name: 'Alpha Greens',
      url: 'https://example.com/a',
      // real coords so the user-relative transform can compute a distance once a
      // location is set (distanceMiles is now derived, not read from the payload)
      lat: 48.0803,
      lng: -122.1862,
      stale: false,
      lastFetchedAt: '2026-06-10T07:00:00',
      deals: [
        { type: 'daily', description: 'a deal', discountPct: 30, startTime: null, endTime: null, daysValid: ['everyday'] },
      ],
    },
  ],
}

// a confirmed visitor who has cleared age + location onboarding and set a ZIP —
// the common precondition for exercising the feed
const seedConfirmedWithLocation = () => {
  localStorage.setItem('gma_age_confirmed', 'true')
  localStorage.setItem('gma_location_onboarded', 'true')
  localStorage.setItem('gma_location', JSON.stringify({ lat: 47.6109, lng: -122.33642, source: 'zip' }))
}

const jsonResponse = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response

const menu = (...values: string[]) =>
  jsonResponse({ menuItem: values.map((value) => ({ text: value, value })) })

// figures render across styled spans — match on full textContent. Regex variant
// for values whose exact text depends on the user-relative distance (e.g. a
// '$X.XX' gas line): assert the shape, not the magnitude.
const matchesText = (re: RegExp) => (_content: string, node: Element | null) =>
  re.test(node?.textContent?.replace(/\s+/g, ' ').trim() ?? '')

// /api/data → deals payload; fueleconomy.gov → the vehicle cascade
const routeFetch = (dealsPayload: ApiDataResponse, comb08: unknown = 20) =>
  vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('fueleconomy')) {
      if (url.includes('/menu/year')) return Promise.resolve(menu('2019'))
      if (url.includes('/menu/make?')) return Promise.resolve(menu('Toyota'))
      if (url.includes('/menu/model?')) return Promise.resolve(menu('Camry'))
      if (url.includes('/menu/options?')) return Promise.resolve(menu('41234'))
      return Promise.resolve(jsonResponse({ comb08 }))
    }
    return Promise.resolve(jsonResponse(dealsPayload))
  })

describe('App', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the age gate and hides content on first visit', () => {
    vi.stubGlobal('fetch', routeFetch(emptyPayload))
    render(<App />)

    expect(screen.getByRole('button', { name: /i'm 21\+/i })).toBeInTheDocument()
    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
  })

  it('shows the location onboarding step on first run after age is confirmed', () => {
    localStorage.setItem('gma_age_confirmed', 'true')
    vi.stubGlobal('fetch', routeFetch(emptyPayload))
    render(<App />)

    // first-run location step gates the feed; banner/feed not shown yet
    expect(screen.getByRole('dialog', { name: /where are you/i })).toBeInTheDocument()
    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
  })

  it('renders the header wordmark and feed region once age + location onboarding are done', async () => {
    localStorage.setItem('gma_age_confirmed', 'true')
    localStorage.setItem('gma_location_onboarded', 'true')
    vi.stubGlobal('fetch', routeFetch(emptyPayload))
    render(<App />)

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'gmas list' })).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Deal feed' })).toBeInTheDocument()
    expect(screen.getByText('No active deals right now')).toBeInTheDocument()
  })

  it('opens the settings sheet from the header gear and returns focus to it on close', async () => {
    localStorage.setItem('gma_age_confirmed', 'true')
    localStorage.setItem('gma_location_onboarded', 'true')
    vi.stubGlobal('fetch', routeFetch(emptyPayload))
    render(<App />)

    const gear = screen.getByRole('button', { name: 'Vehicle & settings' })
    gear.focus() // browsers focus a button on click; jsdom does not, so do it explicitly
    fireEvent.click(gear)

    expect(await screen.findByRole('dialog', { name: 'Vehicle settings' })).toBeInTheDocument()

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(gear).toHaveFocus()
  })

  it('recalculates every gas cost across the feed when a vehicle is selected', async () => {
    seedConfirmedWithLocation()
    vi.stubGlobal('fetch', routeFetch(oneDispensary, 20))
    render(<App />)

    // location set → distance pill shows; but no vehicle yet → NO gas line (the
    // 28-MPG national default was removed, CAP-4). The deal + distance still render.
    expect(await screen.findByText('30%')).toBeInTheDocument()
    expect(document.querySelector('.gma-distance-pill')).not.toBeNull()
    expect(document.querySelector('.gma-gas-line')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Vehicle & settings' }))
    await screen.findByRole('option', { name: '2019' })
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '2019' } })
    await screen.findByRole('option', { name: 'Toyota' })
    fireEvent.change(screen.getByLabelText('Make'), { target: { value: 'Toyota' } })
    await screen.findByRole('option', { name: 'Camry' })
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'Camry' } })

    // a gas line now appears (exact value depends on the user-relative distance,
    // covered in distance/gasCost unit tests); selection persists, sheet closes
    expect(
      await screen.findByText(matchesText(/^\$\d+\.\d{2}$/), { selector: '.gma-gas-line' }),
    ).toBeInTheDocument()
    expect(localStorage.getItem('gma_vehicle_mpg')).toBe('20')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('uses a saved vehicle + saved location from localStorage to drive gas costs', async () => {
    seedConfirmedWithLocation()
    localStorage.setItem('gma_vehicle_mpg', '20')
    localStorage.setItem('gma_vehicle_label', '"2019 Toyota Camry"')
    vi.stubGlobal('fetch', routeFetch(oneDispensary))
    render(<App />)

    const gas = await screen.findByText(matchesText(/^\$\d+\.\d{2}$/), { selector: '.gma-gas-line' })
    expect(gas).toBeInTheDocument()
  })
})

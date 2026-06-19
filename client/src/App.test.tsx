import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import App from './App'
import type { ApiDataResponse } from './types'

const meta = {
  lastScraperRun: '2026-06-10T07:45:00',
  gasPrice: 4.1,
  nationalMpg: 28,
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
      distanceMiles: 5,
      stale: false,
      lastFetchedAt: '2026-06-10T07:00:00',
      deals: [
        { type: 'daily', description: 'a deal', discountPct: 30, startTime: null, endTime: null, daysValid: ['everyday'] },
      ],
    },
  ],
}

const jsonResponse = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response

const menu = (...values: string[]) =>
  jsonResponse({ menuItem: values.map((value) => ({ text: value, value })) })

// figures/discount render across styled spans — match on full textContent
const hasText = (text: string) => (_content: string, node: Element | null) =>
  node?.textContent?.replace(/\s+/g, ' ').trim() === text

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

  it('renders the header wordmark and feed region once age is confirmed', async () => {
    localStorage.setItem('gma_age_confirmed', 'true')
    vi.stubGlobal('fetch', routeFetch(emptyPayload))
    render(<App />)

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'gmas list' })).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Deal feed' })).toBeInTheDocument()
    expect(screen.getByText('No active deals right now')).toBeInTheDocument()
  })

  it('opens the settings sheet from the header gear and returns focus to it on close', async () => {
    localStorage.setItem('gma_age_confirmed', 'true')
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
    localStorage.setItem('gma_age_confirmed', 'true')
    vi.stubGlobal('fetch', routeFetch(oneDispensary, 20))
    render(<App />)

    // national average first: 5 mi × 2 × 4.1/28 = $1.46 (gas now in the card header)
    expect(await screen.findByText(hasText('$1.46 to get there'))).toBeInTheDocument()
    expect(screen.getByText('30% off')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Vehicle & settings' }))
    await screen.findByRole('option', { name: '2019' })
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '2019' } })
    await screen.findByRole('option', { name: 'Toyota' })
    fireEvent.change(screen.getByLabelText('Make'), { target: { value: 'Toyota' } })
    await screen.findByRole('option', { name: 'Camry' })
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'Camry' } })

    // 5 mi × 2 × 4.1/20 = $2.05; selection persists and the sheet closes
    expect(await screen.findByText(hasText('$2.05 to get there'))).toBeInTheDocument()
    expect(localStorage.getItem('gma_vehicle_mpg')).toBe('20')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('uses a saved vehicle from localStorage to drive gas costs', async () => {
    localStorage.setItem('gma_age_confirmed', 'true')
    localStorage.setItem('gma_vehicle_mpg', '20')
    localStorage.setItem('gma_vehicle_label', '"2019 Toyota Camry"')
    vi.stubGlobal('fetch', routeFetch(oneDispensary))
    render(<App />)

    expect(await screen.findByText(hasText('$2.05 to get there'))).toBeInTheDocument()
  })
})

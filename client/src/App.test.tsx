import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import App from './App'
import type { ApiDataResponse } from './types'

const emptyPayload: ApiDataResponse = {
  meta: {
    lastScraperRun: '2026-06-10T07:45:00',
    gasPrice: 4.1,
    nationalMpg: 28,
    gasPriceUpdatedAt: '2026-06-10T07:00:00',
  },
  dispensaries: [],
}

describe('App', () => {
  beforeEach(() => {
    localStorage.clear()
    // stub fetch so DealFeed never hits a real network in tests
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => emptyPayload,
      } as Response),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the age gate and hides content on first visit', () => {
    render(<App />)
    expect(screen.getByText('I am 21 or older')).toBeInTheDocument()
    expect(screen.queryByText("Gma's Helper")).not.toBeInTheDocument()
  })

  it('renders content once age is confirmed', () => {
    localStorage.setItem('gma_age_confirmed', 'true')
    render(<App />)
    expect(screen.getByText("Gma's Helper")).toBeInTheDocument()
  })

  it('shows the deal feed region below the header once age is confirmed', async () => {
    localStorage.setItem('gma_age_confirmed', 'true')
    render(<App />)
    expect(await screen.findByRole('region', { name: 'Deal feed' })).toBeInTheDocument()
    expect(screen.getByText('No active deals right now')).toBeInTheDocument()
  })
})

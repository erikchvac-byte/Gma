import { vi, describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    readFileSync: vi.fn(actual.readFileSync),
  }
})

import { readFileSync } from 'node:fs'
import { dataRoute } from './dataRoute.js'

const mockedReadFileSync = vi.mocked(readFileSync)

const app = express()
app.get('/api/data', dataRoute)

describe('GET /api/data', () => {
  it('returns 200 with meta and dispensaries matching the seeded data.json (AC1)', async () => {
    const res = await request(app).get('/api/data')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      meta: {
        lastScraperRun: expect.any(String),
        gasPrice: expect.any(Number),
        gasPriceUpdatedAt: expect.any(String),
      },
      dispensaries: expect.any(Array),
    })
  })

  it('emits a per-store status + lastFetchedAt for every dispensary (ADR-034 Goal B)', async () => {
    const res = await request(app).get('/api/data')

    expect(res.status).toBe(200)
    for (const d of res.body.dispensaries) {
      expect(['ok', 'stale', 'failed']).toContain(d.status)
      expect(typeof d.lastFetchedAt).toBe('string')
    }
  })

  it('derives ok / stale / failed from each store lastFetchedAt (ADR-034 Goal B)', async () => {
    const now = new Date()
    const fresh = now.toISOString()
    const old = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
    const base = {
      name: 'X',
      url: 'https://example.test',
      distanceMiles: 1,
      stale: false,
      deals: [],
    }
    mockedReadFileSync.mockReturnValueOnce(
      JSON.stringify({
        meta: { lastScraperRun: fresh, gasPrice: 4, gasPriceUpdatedAt: fresh },
        dispensaries: [
          { id: 'a', ...base, lastFetchedAt: fresh },
          { id: 'b', ...base, lastFetchedAt: old },
          { id: 'c', ...base, lastFetchedAt: '' },
        ],
      }),
    )

    const res = await request(app).get('/api/data')

    expect(res.status).toBe(200)
    const byId = Object.fromEntries(res.body.dispensaries.map((d: { id: string }) => [d.id, d]))
    expect(byId.a.status).toBe('ok')
    expect(byId.b.status).toBe('stale')
    expect(byId.c.status).toBe('failed')
  })

  it('returns 500 with { error, code } when data.json is unreadable (AC6)', async () => {
    mockedReadFileSync.mockImplementationOnce(() => {
      throw new Error('ENOENT: no such file or directory')
    })

    const res = await request(app).get('/api/data')

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Internal server error', code: 'SERVER_ERROR' })
  })
})

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
        nationalMpg: expect.any(Number),
        gasPriceUpdatedAt: expect.any(String),
      },
      dispensaries: expect.any(Array),
    })
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

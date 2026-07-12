import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('../utils/applyIngest.js', () => ({
  applyIngest: vi.fn(),
}))

import { applyIngest } from '../utils/applyIngest.js'
import { ingestRoute } from './ingestRoute.js'

const mockedApply = vi.mocked(applyIngest)

function makeApp() {
  const app = express()
  app.use(express.json())
  app.post('/api/ingest', ingestRoute)
  return app
}

const SECRET = 'test-secret'
const validBody = { stores: [{ dispensaryId: 'remedy-tulalip', deals: [] }] }

describe('POST /api/ingest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.INGEST_SECRET = SECRET
  })
  afterEach(() => {
    delete process.env.INGEST_SECRET
  })

  it('503 INGEST_DISABLED when the secret is not configured', async () => {
    delete process.env.INGEST_SECRET
    const res = await request(makeApp()).post('/api/ingest').send(validBody)
    expect(res.status).toBe(503)
    expect(res.body.code).toBe('INGEST_DISABLED')
    expect(mockedApply).not.toHaveBeenCalled()
  })

  it('401 when the secret header is missing', async () => {
    const res = await request(makeApp()).post('/api/ingest').send(validBody)
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('UNAUTHORIZED')
    expect(mockedApply).not.toHaveBeenCalled()
  })

  it('401 when the secret is wrong', async () => {
    const res = await request(makeApp())
      .post('/api/ingest')
      .set('x-ingest-secret', 'wrong-but-same-length!')
      .send(validBody)
    expect(res.status).toBe(401)
    expect(mockedApply).not.toHaveBeenCalled()
  })

  it('400 when stores is missing or empty', async () => {
    const app = makeApp()
    const missing = await request(app).post('/api/ingest').set('x-ingest-secret', SECRET).send({})
    const empty = await request(app).post('/api/ingest').set('x-ingest-secret', SECRET).send({ stores: [] })
    expect(missing.status).toBe(400)
    expect(empty.status).toBe(400)
    expect(mockedApply).not.toHaveBeenCalled()
  })

  it('400 when an entry is malformed', async () => {
    const res = await request(makeApp())
      .post('/api/ingest')
      .set('x-ingest-secret', SECRET)
      .send({ stores: [{ dispensaryId: 'x' }] }) // missing deals
    expect(res.status).toBe(400)
    expect(mockedApply).not.toHaveBeenCalled()
  })

  it('400 when confirmedEmpty is present but not a boolean (ADR-083 fail-closed)', async () => {
    const res = await request(makeApp())
      .post('/api/ingest')
      .set('x-ingest-secret', SECRET)
      .send({ stores: [{ dispensaryId: 'x', deals: [], confirmedEmpty: 'yes' }] })
    expect(res.status).toBe(400)
    expect(mockedApply).not.toHaveBeenCalled()
  })

  it('200 when confirmedEmpty is a real boolean — entry passes through to applyIngest', async () => {
    mockedApply.mockResolvedValue({ 'remedy-tulalip': 'empty' })
    const body = { stores: [{ dispensaryId: 'remedy-tulalip', deals: [], confirmedEmpty: true }] }
    const res = await request(makeApp()).post('/api/ingest').set('x-ingest-secret', SECRET).send(body)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ results: { 'remedy-tulalip': 'empty' } })
    expect(mockedApply).toHaveBeenCalledWith(body.stores)
  })

  it('200 with the per-store results from applyIngest on a valid request', async () => {
    mockedApply.mockResolvedValue({ 'remedy-tulalip': 'stale' })
    const res = await request(makeApp()).post('/api/ingest').set('x-ingest-secret', SECRET).send(validBody)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ results: { 'remedy-tulalip': 'stale' } })
    expect(mockedApply).toHaveBeenCalledWith(validBody.stores)
  })

  it('500 when applyIngest throws', async () => {
    mockedApply.mockRejectedValue(new Error('disk gone'))
    const res = await request(makeApp()).post('/api/ingest').set('x-ingest-secret', SECRET).send(validBody)
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('SERVER_ERROR')
  })
})

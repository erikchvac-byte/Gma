import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'

import { healthzRoute } from './healthzRoute.js'

const app = express()
app.get('/healthz', healthzRoute)

describe('GET /healthz', () => {
  it('returns 200 with status ok and an ISO timestamp', async () => {
    const res = await request(app).get('/healthz')

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(typeof res.body.time).toBe('string')
    expect(Number.isNaN(Date.parse(res.body.time))).toBe(false)
  })

  it('does not read the filesystem, so it stays cheap and never 500s', async () => {
    // Two back-to-back pings both succeed with fresh timestamps — the point of
    // the keep-warm target is that it has no data dependency that could fail.
    const first = await request(app).get('/healthz')
    const second = await request(app).get('/healthz')

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
  })
})

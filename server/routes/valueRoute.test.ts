import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import { disparitiesRoute } from './valueRoute.js'

// A1: the cross-store disparity dataset is reachable on a NEW private route, derived
// live from the committed products.json. Contract here is "200 + MatchReport shape" and
// independence from the deals contract (no dispensaries/meta) — same fail-soft posture
// as /api/products.
describe('GET /api/value/disparities (A1)', () => {
  const app = express()
  app.get('/api/value/disparities', disparitiesRoute)

  it('serves a MatchReport with disparities + audit counts', async () => {
    const res = await request(app).get('/api/value/disparities')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.disparities)).toBe(true)
    expect(typeof res.body.totalRecords).toBe('number')
    expect(typeof res.body.unmatchedCount).toBe('number')
    expect(typeof res.body.excludedFlagCount).toBe('number')
  })

  it('every disparity row carries the like-for-like shape', async () => {
    const res = await request(app).get('/api/value/disparities')
    for (const d of res.body.disparities) {
      expect(d).toHaveProperty('matchKey')
      expect(d).toHaveProperty('weightGrams')
      expect(d).toHaveProperty('lowPrice')
      expect(d).toHaveProperty('highPrice')
      expect(d).toHaveProperty('spreadPct')
      expect(d.storesCarrying.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('is independent of /api/data — no deals `dispensaries`/`meta` shape', async () => {
    const res = await request(app).get('/api/value/disparities')
    expect(res.body).not.toHaveProperty('dispensaries')
    expect(res.body).not.toHaveProperty('meta')
  })
})

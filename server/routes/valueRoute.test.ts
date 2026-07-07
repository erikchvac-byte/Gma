import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import path from 'node:path'
import {
  disparitiesRoute,
  dealScopeRoute,
  readDerived,
  EMPTY_MATCH_REPORT,
  EMPTY_DEAL_SCOPE,
} from './valueRoute.js'

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

// ADR-070: the deal→SKU scope-bridge report is reachable on a NEW private route, derived
// live by joining the committed data.json + products.json. Contract here is "200 +
// DealScopeReport shape" with the AC5 bookkeeping buckets, and the same fail-soft posture.
describe('GET /api/value/deal-scope (ADR-070)', () => {
  const app = express()
  app.get('/api/value/deal-scope', dealScopeRoute)

  it('serves a DealScopeReport with links + every AC5 bucket count', async () => {
    const res = await request(app).get('/api/value/deal-scope')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.links)).toBe(true)
    for (const k of [
      'totalDeals',
      'storewideCount',
      'categoryCount',
      'linkedSkuCount',
      'unsupportedCategoryCount',
      'brandCount',
      'unresolvedCount',
      'zeroMatchCount',
    ]) {
      expect(typeof res.body[k]).toBe('number')
    }
  })

  it('every link carries same-store deal→SKU shape (AC2)', async () => {
    const res = await request(app).get('/api/value/deal-scope')
    for (const l of res.body.links) {
      expect(l).toHaveProperty('dispensaryId')
      expect(l).toHaveProperty('dealDescription')
      expect(l).toHaveProperty('scope')
      expect(Array.isArray(l.productIds)).toBe(true)
      expect(l).toHaveProperty('daysValid')
    }
  })

  it('is independent of /api/data — no `dispensaries`/`meta` shape', async () => {
    const res = await request(app).get('/api/value/deal-scope')
    expect(res.body).not.toHaveProperty('dispensaries')
    expect(res.body).not.toHaveProperty('meta')
  })
})

// ADR-077 AC5: the routes read precomputed derived JSON and MUST fail-soft to an empty report
// (never throw, never reach for the raw dataset / home DB) when the derived file is
// missing/malformed — the load-bearing rule that keeps the site up when the home machine is off.
describe('readDerived fail-soft (ADR-077 AC5)', () => {
  it('returns the empty shape when the derived file is missing', () => {
    const missing = path.join(__dirname, '../data/derived/__does_not_exist__.json')
    expect(readDerived(missing, EMPTY_MATCH_REPORT)).toEqual(EMPTY_MATCH_REPORT)
    expect(readDerived(missing, EMPTY_DEAL_SCOPE)).toEqual(EMPTY_DEAL_SCOPE)
  })

  it('returns the empty shape on a malformed file', () => {
    // package.json is valid JSON but the wrong shape is still parsed as an object; a
    // non-existent path exercises the miss. Point at a directory-ish path to force a read
    // error → empty (never a throw).
    const bad = path.join(__dirname, 'valueRoute.ts') // not JSON → JSON.parse throws → empty
    expect(readDerived(bad, EMPTY_MATCH_REPORT)).toEqual(EMPTY_MATCH_REPORT)
  })
})

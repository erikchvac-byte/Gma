import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import path from 'node:path'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import {
  disparitiesRoute,
  dealScopeRoute,
  readDerived,
  EMPTY_DISPARITIES_ENVELOPE,
  EMPTY_DEAL_SCOPE_ENVELOPE,
} from './valueRoute.js'

// A1: the cross-store disparity dataset is reachable on a NEW private route, derived
// live from the committed products.json. Contract here is "200 + honesty envelope wrapping a
// MatchReport" and independence from the deals contract (no dispensaries/meta) — same
// fail-soft posture as /api/products.
describe('GET /api/value/disparities (A1)', () => {
  const app = express()
  app.get('/api/value/disparities', disparitiesRoute)

  it('serves an envelope whose data is a MatchReport with disparities + audit counts', async () => {
    const res = await request(app).get('/api/value/disparities')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data.disparities)).toBe(true)
    expect(typeof res.body.data.totalRecords).toBe('number')
    expect(typeof res.body.data.unmatchedCount).toBe('number')
    expect(typeof res.body.data.excludedFlagCount).toBe('number')
  })

  it('carries the envelope\'s excluded/coverage/generatedAt fields (derivation-1.1)', async () => {
    const res = await request(app).get('/api/value/disparities')
    expect(Array.isArray(res.body.excluded)).toBe(true)
    expect(typeof res.body.coverage).toBe('object')
    expect(typeof res.body.generatedAt).toBe('string')
  })

  it('every disparity row carries the like-for-like shape', async () => {
    const res = await request(app).get('/api/value/disparities')
    for (const d of res.body.data.disparities) {
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
// live by joining the committed data.json + products.json. Contract here is "200 + honesty
// envelope wrapping a DealScopeReport" with the AC5 bookkeeping buckets, and the same
// fail-soft posture.
describe('GET /api/value/deal-scope (ADR-070)', () => {
  const app = express()
  app.get('/api/value/deal-scope', dealScopeRoute)

  it('serves an envelope whose data is a DealScopeReport with links + every AC5 bucket count', async () => {
    const res = await request(app).get('/api/value/deal-scope')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data.links)).toBe(true)
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
      expect(typeof res.body.data[k]).toBe('number')
    }
  })

  it('carries the envelope\'s excluded/coverage/generatedAt fields (derivation-1.1)', async () => {
    const res = await request(app).get('/api/value/deal-scope')
    expect(Array.isArray(res.body.excluded)).toBe(true)
    expect(typeof res.body.coverage).toBe('object')
    expect(typeof res.body.generatedAt).toBe('string')
  })

  it('every link carries same-store deal→SKU shape (AC2)', async () => {
    const res = await request(app).get('/api/value/deal-scope')
    for (const l of res.body.data.links) {
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
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'derived-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('returns the empty envelope when the derived file is missing', () => {
    const missing = path.join(__dirname, '../data/derived/__does_not_exist__.json')
    expect(readDerived(missing, EMPTY_DISPARITIES_ENVELOPE)).toEqual(EMPTY_DISPARITIES_ENVELOPE)
    expect(readDerived(missing, EMPTY_DEAL_SCOPE_ENVELOPE)).toEqual(EMPTY_DEAL_SCOPE_ENVELOPE)
  })

  it('returns the empty envelope when the file is not valid JSON', () => {
    const notJson = path.join(__dirname, 'valueRoute.ts') // not JSON → JSON.parse throws → empty
    expect(readDerived(notJson, EMPTY_DISPARITIES_ENVELOPE)).toEqual(EMPTY_DISPARITIES_ENVELOPE)
  })

  it('returns the empty envelope when the file parses but is a JSON array', () => {
    const arrayFile = path.join(dir, 'array.json')
    writeFileSync(arrayFile, '[1, 2, 3]', 'utf-8')
    expect(readDerived(arrayFile, EMPTY_DISPARITIES_ENVELOPE)).toEqual(EMPTY_DISPARITIES_ENVELOPE)
  })

  it('returns the empty envelope when the file parses but is missing the expected keys', () => {
    const wrongShape = path.join(dir, 'wrong-shape.json')
    writeFileSync(wrongShape, JSON.stringify({ hello: 'world' }), 'utf-8')
    expect(readDerived(wrongShape, EMPTY_DISPARITIES_ENVELOPE)).toEqual(EMPTY_DISPARITIES_ENVELOPE)
    expect(readDerived(wrongShape, EMPTY_DEAL_SCOPE_ENVELOPE)).toEqual(EMPTY_DEAL_SCOPE_ENVELOPE)
  })

  it('returns the empty envelope when the file parses but is a bare (un-enveloped) report', () => {
    const bareReport = path.join(dir, 'bare-report.json')
    writeFileSync(bareReport, JSON.stringify(EMPTY_DISPARITIES_ENVELOPE.data), 'utf-8')
    expect(readDerived(bareReport, EMPTY_DISPARITIES_ENVELOPE)).toEqual(EMPTY_DISPARITIES_ENVELOPE)
  })
})

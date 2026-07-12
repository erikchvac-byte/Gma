import { vi, describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { ApiDataResponse, Deal, Dispensary } from '../../client/src/types/index.js'

// ─────────────────────────────────────────────────────────────────────────────
// Integration coverage for the live ingest → freshness → alert path (ADR-034).
//
// The unit suites prove each piece in isolation with mocks: ingestRoute.test.ts
// mocks applyIngest, dataRoute.test.ts mocks readFileSync, alertGate.test.ts
// feeds evaluateAlert hand-built arrays. None of them prove the pieces compose —
// that a real POST /api/ingest write becomes visible to a real GET /api/data
// read, that the per-store `status` GET emits is the same signal §6's alert gate
// then acts on. This drives the REAL chain (no applyIngest / evaluateAlert mock)
// through a single temp data.json:
//
//   POST /api/ingest → ingestRoute → applyIngest → atomicWrite (temp data.json)
//                    → GET /api/data → filterActiveDeals + deriveStoreStatus
//                    → evaluateAlert over the served payload
//
// Only the data-file LOCATION is redirected: dataRoute and applyIngest both
// resolve a hardcoded <server>/data/data.json. We rewrite reads/writes of that
// path to a per-test temp file so both ends hit the same fixture. Every line of
// app logic (auth, validation, normalize, lock, atomic publish, status, alert)
// runs for real.
// ─────────────────────────────────────────────────────────────────────────────

const holder = vi.hoisted(() => ({ dir: '' }))

// Map any access to the production <…>/data/data.json (and its sibling atomic
// tmp file) onto the active temp directory.
function redirect(p: unknown): unknown {
  if (typeof p !== 'string') return p
  const m = p.match(/[/\\]data[/\\](data(?:\.tmp)?\.json)$/)
  return m ? path.join(holder.dir, m[1]) : p
}

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    // applyIngest + dataRoute reads
    readFileSync: vi.fn((p: Parameters<typeof actual.readFileSync>[0], ...rest: unknown[]) =>
      (actual.readFileSync as (...a: unknown[]) => unknown)(redirect(p), ...rest),
    ),
    // atomicWriteJson: open the tmp file, then rename it over the target
    openSync: vi.fn((p: Parameters<typeof actual.openSync>[0], ...rest: unknown[]) =>
      (actual.openSync as (...a: unknown[]) => number)(redirect(p), ...rest),
    ),
    renameSync: vi.fn((from: unknown, to: unknown) => actual.renameSync(redirect(from) as string, redirect(to) as string)),
    rmSync: vi.fn((p: unknown, ...rest: unknown[]) =>
      (actual.rmSync as (...a: unknown[]) => void)(redirect(p), ...rest),
    ),
  }
})

// Imported AFTER the mock is registered so they pick up the redirected fs.
const { dataRoute } = await import('../routes/dataRoute.js')
const { ingestRoute } = await import('../routes/ingestRoute.js')
const { evaluateAlert } = await import('../scripts/alertGate.js')

const SECRET = 'integration-secret'
const HOUR_MS = 60 * 60 * 1000
const EPOCH = '1970-01-01T00:00:00.000Z' // the seed "never ingested" sentinel

// Survives normalizeDeals AND is always active (all-day, everyday) so the
// GET /api/data filter never drops it regardless of the wall clock.
const liveDeal: Deal = {
  type: 'daily',
  description: '20% off all flower',
  discountPct: 20,
  startTime: null,
  endTime: null,
  daysValid: ['everyday'],
}
// Dropped by normalizeDeals: 'funday' is outside the day vocabulary.
const junkDeal = { ...liveDeal, daysValid: ['funday'] } as Deal

function store(id: string, lastFetchedAt: string, deals: Deal[] = []): Dispensary {
  return { id, name: id, url: 'https://example.test', distanceMiles: 1, stale: false, lastFetchedAt, deals }
}

// Write a fresh data.json into the temp dir and return its parsed contents.
function seed(dispensaries: Dispensary[]): void {
  const ts = new Date().toISOString()
  const file: ApiDataResponse = {
    meta: { lastScraperRun: ts, gasPrice: 4.25, gasPriceUpdatedAt: ts },
    dispensaries,
  }
  writeFileSync(path.join(holder.dir, 'data.json'), JSON.stringify(file))
}

const readData = (): ApiDataResponse => JSON.parse(readFileSync(path.join(holder.dir, 'data.json'), 'utf-8'))

function makeApp() {
  const app = express()
  app.use(express.json())
  app.get('/api/data', dataRoute)
  app.post('/api/ingest', ingestRoute)
  return app
}

const post = (app: express.Express, body: object, secret: string | null = SECRET) => {
  const req = request(app).post('/api/ingest')
  if (secret !== null) req.set('x-ingest-secret', secret)
  return req.send(body)
}

describe('ingest → freshness → alert (integration)', () => {
  beforeEach(() => {
    holder.dir = mkdtempSync(path.join(tmpdir(), 'ingest-fresh-'))
    process.env.INGEST_SECRET = SECRET
  })

  it('a good push is written and immediately visible to GET /api/data as ok + active deals', async () => {
    seed([store('remedy-tulalip', new Date(Date.now() - 7 * HOUR_MS).toISOString())]) // was stale
    const app = makeApp()

    const ingest = await post(app, { stores: [{ dispensaryId: 'remedy-tulalip', deals: [liveDeal] }] })
    expect(ingest.status).toBe(200)
    expect(ingest.body).toEqual({ results: { 'remedy-tulalip': 'ok' } })

    const data = await request(app).get('/api/data')
    expect(data.status).toBe(200)
    const d = data.body.dispensaries.find((x: Dispensary) => x.id === 'remedy-tulalip')
    expect(d.status).toBe('ok') // 7h-stale store flipped fresh by the ingest
    expect(d.deals).toHaveLength(1)
    expect(d.deals[0].description).toBe('20% off all flower')
    expect(Date.now() - Date.parse(d.lastFetchedAt)).toBeLessThan(60 * 1000)
  })

  it('an empty/invalid push keeps last-known-good: deals, status, and run marker unchanged', async () => {
    const fresh = new Date().toISOString()
    seed([store('remedy-tulalip', fresh, [{ ...liveDeal, description: 'prior deal' }])])
    const app = makeApp()
    const runMarkerBefore = readData().meta.lastScraperRun

    const ingest = await post(app, { stores: [{ dispensaryId: 'remedy-tulalip', deals: [junkDeal] }] })
    expect(ingest.status).toBe(200)
    expect(ingest.body).toEqual({ results: { 'remedy-tulalip': 'stale' } }) // rejected, not applied

    const data = await request(app).get('/api/data')
    const d = data.body.dispensaries.find((x: Dispensary) => x.id === 'remedy-tulalip')
    expect(d.deals[0].description).toBe('prior deal') // good data NOT overwritten
    expect(d.status).toBe('ok') // lastFetchedAt untouched, still recent
    expect(readData().meta.lastScraperRun).toBe(runMarkerBefore) // freshness not falsely bumped
  })

  it('a confirmed-empty push clears stale deals and flips a dark store back to ok (ADR-083)', async () => {
    // The happy-time-mt-vernon scenario: expired promos frozen for days because
    // an honest zero-specials store could never advance lastFetchedAt.
    const daysDark = new Date(Date.now() - 10 * 24 * HOUR_MS).toISOString()
    seed([store('remedy-tulalip', daysDark, [{ ...liveDeal, description: 'expired june promo' }])])
    const app = makeApp()

    const ingest = await post(app, {
      stores: [{ dispensaryId: 'remedy-tulalip', deals: [], confirmedEmpty: true }],
    })
    expect(ingest.status).toBe(200)
    expect(ingest.body).toEqual({ results: { 'remedy-tulalip': 'empty' } })

    const data = await request(app).get('/api/data')
    const d = data.body.dispensaries.find((x: Dispensary) => x.id === 'remedy-tulalip')
    expect(d.deals).toEqual([]) // dead promo dropped, not served as current
    expect(d.status).toBe('ok') // freshness advanced → no more persistent-stale alert
    expect(Date.now() - Date.parse(d.lastFetchedAt)).toBeLessThan(60 * 1000)
  })

  it('a rejected push (bad secret) writes nothing — data.json is byte-identical', async () => {
    seed([store('remedy-tulalip', new Date().toISOString(), [liveDeal])])
    const app = makeApp()
    const before = readFileSync(path.join(holder.dir, 'data.json'), 'utf-8')

    const res = await post(app, { stores: [{ dispensaryId: 'remedy-tulalip', deals: [liveDeal] }] }, 'wrong-secret-x')
    expect(res.status).toBe(401)
    expect(readFileSync(path.join(holder.dir, 'data.json'), 'utf-8')).toBe(before)
  })

  it('GET /api/data derives ok / stale / failed per store from the persisted lastFetchedAt', async () => {
    seed([
      store('fresh-store', new Date().toISOString(), [liveDeal]),
      store('stale-store', new Date(Date.now() - 4 * HOUR_MS).toISOString(), [liveDeal]),
      store('failed-store', '', []), // no parseable ingest timestamp → failed (Honest Math)
    ])

    const data = await request(makeApp()).get('/api/data')
    const byId = Object.fromEntries(data.body.dispensaries.map((d: Dispensary) => [d.id, d.status]))
    expect(byId).toEqual({ 'fresh-store': 'ok', 'stale-store': 'stale', 'failed-store': 'failed' })
  })

  it('§6 alert gate over the live /api/data payload: one fresh store + a persistently dark one → targeted alert', async () => {
    seed([
      store('remedy-tulalip', EPOCH), // never ingested → fed by the push below
      store('kush21', new Date(Date.now() - 7 * HOUR_MS).toISOString(), [liveDeal]), // ingested before, now dark
      store('the-joint', EPOCH, []), // never ingested → excluded from the stale check
    ])
    const app = makeApp()

    await post(app, { stores: [{ dispensaryId: 'remedy-tulalip', deals: [liveDeal] }] })
    const data = await request(app).get('/api/data')

    // The alert gate consumes exactly what /api/data serves.
    const verdict = evaluateAlert(data.body.dispensaries, Date.now())
    expect(verdict.freshCount).toBe(1) // only the just-ingested store
    expect(verdict.totalFailure).toBe(false) // something is fresh → pipeline not wholly down
    expect(verdict.staleStores).toEqual(['kush21']) // previously-healthy, now dark
    expect(verdict.alert).toBe(true)
  })

  it('§6 alert gate over the live /api/data payload: nothing fresh → total-failure alert', async () => {
    seed([
      store('kush21', new Date(Date.now() - 8 * HOUR_MS).toISOString(), [liveDeal]),
      store('the-joint', EPOCH, []),
    ])
    const data = await request(makeApp()).get('/api/data')

    const verdict = evaluateAlert(data.body.dispensaries, Date.now())
    expect(verdict.freshCount).toBe(0)
    expect(verdict.totalFailure).toBe(true)
    expect(verdict.alert).toBe(true)
  })
})

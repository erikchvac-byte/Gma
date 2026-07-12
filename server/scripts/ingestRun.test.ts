import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runIngest, parseStoreArg, parseEmitDir, type PostFn } from './ingestRun.js'
import type { Deal } from '../../client/src/types/index.js'
import type { IngestEntry } from '../types/index.js'

// A deal that survives normalizeDeals (both times null = all-day, daysValid valid).
const validDeal: Deal = {
  type: 'daily',
  description: '40% off flower',
  discountPct: 40,
  startTime: null,
  endTime: null,
  daysValid: ['everyday'],
}

const URL = 'https://gmaslist.com/api/ingest'
const SECRET = 'shhh'

// Registry helpers for the ADR-083 outcome shape: `found` = a normal scrape
// (confirmedEmpty false — including plain empties), `confirmedEmpty` = positive
// zero-specials evidence.
const found = (deals: Deal[]) => async () => ({ deals, confirmedEmpty: false })
const confirmedEmptyScrape = async () => ({ deals: [] as Deal[], confirmedEmpty: true })

describe('runIngest', () => {
  it('fresh deals → ok=true and POSTs the correct batch + secret header', async () => {
    const postFn = vi.fn<PostFn>().mockResolvedValue({ 'store-a': 'ok' })
    const out = await runIngest({
      stores: ['store-a'],
      ingestUrl: URL,
      secret: SECRET,
      registry: { 'store-a': found([validDeal]) },
      postFn,
    })

    expect(out).toEqual({ ok: true, results: { 'store-a': 'ok' } })
    expect(postFn).toHaveBeenCalledTimes(1)
    expect(postFn).toHaveBeenCalledWith(
      URL,
      { stores: [{ dispensaryId: 'store-a', deals: [validDeal] }] },
      SECRET,
    )
  })

  it('empty scrape → still POSTs (empty deals), server stale → ok=true (not a hard failure)', async () => {
    const postFn = vi.fn<PostFn>().mockResolvedValue({ 'store-a': 'stale' })
    const out = await runIngest({
      stores: ['store-a'],
      ingestUrl: URL,
      secret: SECRET,
      registry: { 'store-a': found([]) },
      postFn,
    })

    // 'stale' = empty scrape, last-known-good kept — acceptable, not the alert.
    expect(out.ok).toBe(true)
    expect(out.results['store-a']).toBe('stale')
    expect(postFn).toHaveBeenCalledWith(
      URL,
      { stores: [{ dispensaryId: 'store-a', deals: [] }] },
      SECRET,
    )
  })

  it('confirmed-empty scrape → POSTs the flag, server empty → ok=true (ADR-083)', async () => {
    const postFn = vi.fn<PostFn>().mockResolvedValue({ 'store-a': 'empty' })
    const out = await runIngest({
      stores: ['store-a'],
      ingestUrl: URL,
      secret: SECRET,
      registry: { 'store-a': confirmedEmptyScrape },
      postFn,
    })

    // 'empty' = confirmed-empty applied server-side — acceptable, not a failure.
    expect(out.ok).toBe(true)
    expect(out.results['store-a']).toBe('empty')
    expect(postFn).toHaveBeenCalledWith(
      URL,
      { stores: [{ dispensaryId: 'store-a', deals: [], confirmedEmpty: true }] },
      SECRET,
    )
  })

  it('unconfirmed empty never grows a confirmedEmpty flag on the wire', async () => {
    const postFn = vi.fn<PostFn>().mockResolvedValue({ 'store-a': 'stale' })
    await runIngest({
      stores: ['store-a'],
      ingestUrl: URL,
      secret: SECRET,
      registry: { 'store-a': found([]) },
      postFn,
    })
    const [, body] = postFn.mock.calls[0]
    expect(body.stores[0]).toEqual({ dispensaryId: 'store-a', deals: [] })
    expect('confirmedEmpty' in body.stores[0]).toBe(false)
  })

  it('confirmedEmpty is dropped when deals survive normalization (contradictory scraper)', async () => {
    // Defense-in-depth: a scraper claiming confirmedEmpty while returning deals is
    // lying about one of the two — the deals win, the flag is discarded.
    const postFn = vi.fn<PostFn>().mockResolvedValue({ 'store-a': 'ok' })
    await runIngest({
      stores: ['store-a'],
      ingestUrl: URL,
      secret: SECRET,
      registry: { 'store-a': async () => ({ deals: [validDeal], confirmedEmpty: true }) },
      postFn,
    })
    const [, body] = postFn.mock.calls[0]
    expect(body.stores[0]).toEqual({ dispensaryId: 'store-a', deals: [validDeal] })
  })

  it('garbage deals are dropped by normalizeDeals → empty batch → stale → ok=true', async () => {
    const postFn = vi.fn<PostFn>().mockResolvedValue({ 'store-a': 'stale' })
    const bad = [{ type: 'daily', description: 'x', discountPct: 1, startTime: '09:00', endTime: '09:00', daysValid: ['everyday'] }] as Deal[]
    const out = await runIngest({
      stores: ['store-a'],
      ingestUrl: URL,
      secret: SECRET,
      registry: { 'store-a': found(bad) },
      postFn,
    })

    expect(postFn).toHaveBeenCalledWith(URL, { stores: [{ dispensaryId: 'store-a', deals: [] }] }, SECRET)
    expect(out.ok).toBe(true)
  })

  it('mixed batch: one ok + one stale → ok=true (stale alone never fails the run)', async () => {
    const postFn = vi.fn<PostFn>().mockResolvedValue({ good: 'ok', empty: 'stale' })
    const out = await runIngest({
      stores: ['good', 'empty'],
      ingestUrl: URL,
      secret: SECRET,
      registry: { good: found([validDeal]), empty: found([]) },
      postFn,
    })
    expect(out.ok).toBe(true)
    expect(out.results).toEqual({ good: 'ok', empty: 'stale' })
  })

  it('unknown server result (unknown dispensary) → ok=false', async () => {
    const postFn = vi.fn<PostFn>().mockResolvedValue({ 'store-a': 'unknown' })
    const out = await runIngest({
      stores: ['store-a'],
      ingestUrl: URL,
      secret: SECRET,
      registry: { 'store-a': found([validDeal]) },
      postFn,
    })
    expect(out.ok).toBe(false)
    expect(out.results['store-a']).toBe('unknown')
  })

  it('POST throws (401/503/network) → ok=false, all entries error', async () => {
    const postFn = vi.fn<PostFn>().mockRejectedValue(new Error('boom'))
    const out = await runIngest({
      stores: ['store-a'],
      ingestUrl: URL,
      secret: SECRET,
      registry: { 'store-a': found([validDeal]) },
      postFn,
    })
    expect(out.ok).toBe(false)
    expect(out.results['store-a']).toBe('error')
  })

  it('scrape throws → that store errors, others still POSTed', async () => {
    const postFn = vi.fn<PostFn>().mockResolvedValue({ good: 'ok' })
    const out = await runIngest({
      stores: ['bad', 'good'],
      ingestUrl: URL,
      secret: SECRET,
      registry: {
        bad: async () => { throw new Error('scrape failed') },
        good: found([validDeal]),
      },
      postFn,
    })
    expect(out.ok).toBe(false)
    expect(out.results.bad).toBe('error')
    expect(out.results.good).toBe('ok')
    expect(postFn).toHaveBeenCalledWith(URL, { stores: [{ dispensaryId: 'good', deals: [validDeal] }] }, SECRET)
  })

  it('empty stores list → ok=false, no POST (no silent no-op success)', async () => {
    const postFn = vi.fn<PostFn>().mockResolvedValue({})
    const out = await runIngest({ stores: [], ingestUrl: URL, secret: SECRET, registry: {}, postFn })
    expect(out).toEqual({ ok: false, results: {} })
    expect(postFn).not.toHaveBeenCalled()
  })

  it('store not in registry → error, no POST', async () => {
    const postFn = vi.fn<PostFn>().mockResolvedValue({})
    const out = await runIngest({
      stores: ['nope'],
      ingestUrl: URL,
      secret: SECRET,
      registry: {},
      postFn,
    })
    expect(out.ok).toBe(false)
    expect(out.results.nope).toBe('error')
    expect(postFn).not.toHaveBeenCalled()
  })
})

describe('runIngest emit (ADR-047 seed artifacts)', () => {
  it('with emitDir set, writes the normalized IngestEntry shape per store', async () => {
    const emitDir = mkdtempSync(path.join(tmpdir(), 'emit-'))
    const postFn = vi.fn<PostFn>().mockResolvedValue({ 'store-a': 'ok' })
    await runIngest({
      stores: ['store-a'],
      ingestUrl: URL,
      secret: SECRET,
      registry: { 'store-a': found([validDeal]) },
      postFn,
      emitDir,
    })

    const file = path.join(emitDir, 'store-a.json')
    expect(existsSync(file)).toBe(true)
    const written: IngestEntry = JSON.parse(readFileSync(file, 'utf-8'))
    expect(written).toEqual({ dispensaryId: 'store-a', deals: [validDeal] })
  })

  it('emits the confirmedEmpty flag so the commit-back seed clears the store too', async () => {
    const emitDir = mkdtempSync(path.join(tmpdir(), 'emit-'))
    const postFn = vi.fn<PostFn>().mockResolvedValue({ 'store-a': 'empty' })
    await runIngest({
      stores: ['store-a'],
      ingestUrl: URL,
      secret: SECRET,
      registry: { 'store-a': confirmedEmptyScrape },
      postFn,
      emitDir,
    })

    const written: IngestEntry = JSON.parse(readFileSync(path.join(emitDir, 'store-a.json'), 'utf-8'))
    expect(written).toEqual({ dispensaryId: 'store-a', deals: [], confirmedEmpty: true })
  })

  it('emits the post-normalize entry (junk dropped) — empty deals still written', async () => {
    const emitDir = mkdtempSync(path.join(tmpdir(), 'emit-'))
    const postFn = vi.fn<PostFn>().mockResolvedValue({ 'store-a': 'stale' })
    const bad = [{ type: 'daily', description: 'x', discountPct: 1, startTime: '09:00', endTime: '09:00', daysValid: ['everyday'] }] as Deal[]
    await runIngest({
      stores: ['store-a'],
      ingestUrl: URL,
      secret: SECRET,
      registry: { 'store-a': found(bad) },
      postFn,
      emitDir,
    })

    const written: IngestEntry = JSON.parse(readFileSync(path.join(emitDir, 'store-a.json'), 'utf-8'))
    expect(written).toEqual({ dispensaryId: 'store-a', deals: [] }) // normalized, not raw junk
  })

  it('emits before POST: a POST failure still leaves the seed artifact on disk', async () => {
    const emitDir = mkdtempSync(path.join(tmpdir(), 'emit-'))
    const postFn = vi.fn<PostFn>().mockRejectedValue(new Error('boom')) // deploy-cutover race
    const out = await runIngest({
      stores: ['store-a'],
      ingestUrl: URL,
      secret: SECRET,
      registry: { 'store-a': found([validDeal]) },
      postFn,
      emitDir,
    })

    expect(out.ok).toBe(false) // POST failed
    const written: IngestEntry = JSON.parse(readFileSync(path.join(emitDir, 'store-a.json'), 'utf-8'))
    expect(written.deals).toEqual([validDeal]) // but the seed survived
  })

  it('without emitDir, no files are written and behavior is identical to today', async () => {
    const emitDir = mkdtempSync(path.join(tmpdir(), 'emit-'))
    const postFn = vi.fn<PostFn>().mockResolvedValue({ 'store-a': 'ok' })
    const out = await runIngest({
      stores: ['store-a'],
      ingestUrl: URL,
      secret: SECRET,
      registry: { 'store-a': found([validDeal]) },
      postFn,
      // emitDir omitted
    })

    expect(out).toEqual({ ok: true, results: { 'store-a': 'ok' } })
    expect(readdirSync(emitDir)).toEqual([]) // nothing written anywhere
  })
})

describe('parseEmitDir', () => {
  it('prefers the --emit flag over the env var', () => {
    expect(parseEmitDir(['--emit', 'flagdir'], { INGEST_EMIT_DIR: 'envdir' })).toBe('flagdir')
  })
  it('falls back to INGEST_EMIT_DIR when no flag', () => {
    expect(parseEmitDir([], { INGEST_EMIT_DIR: 'envdir' })).toBe('envdir')
  })
  it('returns undefined when neither is set', () => {
    expect(parseEmitDir([], {})).toBeUndefined()
  })
})

describe('parseStoreArg', () => {
  it('extracts the value after --store', () => {
    expect(parseStoreArg(['--store', 'remedy-tulalip'])).toBe('remedy-tulalip')
  })
  it('returns undefined when --store is absent', () => {
    expect(parseStoreArg([])).toBeUndefined()
  })
})

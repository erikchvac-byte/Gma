import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import { trailingSlashRedirect } from './trailingSlashRedirect.js'

// Mount the middleware ahead of a few sentinel routes so we can assert what it
// redirects vs. what it lets through to a real 200 handler.
function makeApp() {
  const app = express()
  app.use(express.json())
  app.use(trailingSlashRedirect)
  app.get('/', (_req, res) => res.send('home'))
  app.get('/about', (_req, res) => res.send('about'))
  app.get('/store/:slug', (_req, res) => res.send('store'))
  app.get('/api/data', (_req, res) => res.send('api'))
  app.post('/about', (_req, res) => res.send('about-post'))
  return app
}

describe('trailingSlashRedirect', () => {
  it('301s a trailing-slash page path to its no-slash canonical', async () => {
    const res = await request(makeApp()).get('/about/')
    expect(res.status).toBe(301)
    expect(res.headers['location']).toBe('/about')
  })

  it('301s a deep trailing-slash path (store profile)', async () => {
    const res = await request(makeApp()).get('/store/remedy-tulalip/')
    expect(res.status).toBe(301)
    expect(res.headers['location']).toBe('/store/remedy-tulalip')
  })

  it('leaves the root / alone (its trailing slash is canonical)', async () => {
    const res = await request(makeApp()).get('/')
    expect(res.status).toBe(200)
    expect(res.text).toBe('home')
  })

  it('never touches /api* (byte-exact API + ingest path)', async () => {
    const res = await request(makeApp()).get('/api/data/')
    // Not a 301 — falls through; no /api/data/ route exists, so Express 404s it,
    // but the point is the middleware did NOT rewrite it.
    expect(res.status).not.toBe(301)
  })

  it('preserves the query string on the redirect target', async () => {
    const res = await request(makeApp()).get('/about/?ref=llms&x=1')
    expect(res.status).toBe(301)
    expect(res.headers['location']).toBe('/about?ref=llms&x=1')
  })

  it('does not redirect non-GET/HEAD methods (POST /about/ passes through)', async () => {
    const res = await request(makeApp()).post('/about/').send({})
    expect(res.status).not.toBe(301)
  })

  it('leaves an already-canonical no-slash path untouched', async () => {
    const res = await request(makeApp()).get('/about')
    expect(res.status).toBe(200)
    expect(res.text).toBe('about')
  })

  it('collapses multiple trailing slashes to one no-slash canonical', async () => {
    const res = await request(makeApp()).get('/about//')
    expect(res.status).toBe(301)
    expect(res.headers['location']).toBe('/about')
  })
})

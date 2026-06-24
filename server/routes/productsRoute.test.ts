import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import { productsRoute } from './productsRoute.js'

// CAP-4: products are reachable via a NEW endpoint. The committed seed dataset is
// empty until the first commit-back scrape, so the live shape is the empty dataset —
// the contract here is "200 + ProductsFile shape", proving reachability + fail-soft.
describe('GET /api/products (CAP-4)', () => {
  const app = express()
  app.get('/api/products', productsRoute)

  it('serves the product dataset with a ProductsFile shape', async () => {
    const res = await request(app).get('/api/products')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('lastUpdated')
    expect(res.body).toHaveProperty('products')
    expect(typeof res.body.products).toBe('object')
  })

  it('is independent of /api/data — it carries no `dispensaries`/`meta` deals shape', async () => {
    const res = await request(app).get('/api/products')
    expect(res.body).not.toHaveProperty('dispensaries')
    expect(res.body).not.toHaveProperty('meta')
  })
})

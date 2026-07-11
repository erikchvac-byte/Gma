import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import express from 'express'
import request from 'supertest'
import { robotsRoute, sitemapRoute, buildSitemapXml, ROBOTS_TXT } from './sitemapRoute.js'
import { categorySlug } from './compareRoute.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROLLUPS_PATH = path.join(__dirname, '../data/derived/disparity-rollups.json')

const app = express()
app.get('/robots.txt', robotsRoute)
app.get('/sitemap.xml', sitemapRoute)

function liveCategories(): string[] {
  const env = JSON.parse(readFileSync(ROLLUPS_PATH, 'utf-8'))
  return (env.data?.byCategory ?? []).map((c: { category: string }) => c.category)
}

describe('GET /robots.txt', () => {
  it('serves plain text that allows crawling, blocks the API, and points at the sitemap', async () => {
    const res = await request(app).get('/robots.txt')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/plain/)
    expect(res.headers['cache-control']).toBe('public, max-age=3600')
    expect(res.text).toContain('User-agent: *')
    expect(res.text).toContain('Allow: /')
    expect(res.text).toContain('Disallow: /api/')
    expect(res.text).toContain('Sitemap: https://gmaslist.com/sitemap.xml')
  })

  it('does not block any AI/search crawler (Phase 3: allow all)', () => {
    // A single catch-all User-agent line, no per-agent Disallow blocks.
    expect((ROBOTS_TXT.match(/User-agent:/g) ?? [])).toHaveLength(1)
    expect(ROBOTS_TXT).not.toMatch(/User-agent:\s*(GPTBot|ClaudeBot|Google-Extended|PerplexityBot)/)
  })
})

describe('GET /sitemap.xml', () => {
  it('serves valid sitemap XML with an hour cache', async () => {
    const res = await request(app).get('/sitemap.xml')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/xml/)
    expect(res.headers['cache-control']).toBe('public, max-age=3600')
    expect(res.text).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(res.text).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    expect(res.text).toContain('</urlset>')
  })

  it('lists the shipped entity + comparison surfaces', async () => {
    const res = await request(app).get('/sitemap.xml')
    expect(res.text).toContain('<loc>https://gmaslist.com/</loc>')
    expect(res.text).toContain('<loc>https://gmaslist.com/about</loc>')
    expect(res.text).toContain('<loc>https://gmaslist.com/compare</loc>')
  })

  it('lists one /compare/<category> URL per live rollup category', async () => {
    const res = await request(app).get('/sitemap.xml')
    for (const cat of liveCategories()) {
      expect(res.text).toContain(`<loc>https://gmaslist.com/compare/${categorySlug(cat)}</loc>`)
    }
  })

  it('does not emit thin per-deal URLs', async () => {
    const res = await request(app).get('/sitemap.xml')
    expect(res.text).not.toMatch(/\/deal\//)
  })
})

describe('buildSitemapXml (pure)', () => {
  const GEN = '2026-07-10T00:00:00.000Z'

  it('always lists the static pages even with zero categories', () => {
    const xml = buildSitemapXml([], GEN)
    expect(xml).toContain('<loc>https://gmaslist.com/</loc>')
    expect(xml).toContain('<loc>https://gmaslist.com/about</loc>')
    expect(xml).toContain('<loc>https://gmaslist.com/compare</loc>')
    expect(xml).not.toContain('/compare/')
  })

  it('stamps data-backed URLs with the artifact generatedAt as lastmod', () => {
    const xml = buildSitemapXml(['Flower'], GEN)
    expect(xml).toContain(`<loc>https://gmaslist.com/compare</loc>\n    <lastmod>${GEN}</lastmod>`)
    expect(xml).toContain(
      `<loc>https://gmaslist.com/compare/flower</loc>\n    <lastmod>${GEN}</lastmod>`,
    )
  })

  it('does not stamp static entity pages with a fabricated lastmod', () => {
    const xml = buildSitemapXml([], GEN)
    // Home entry closes immediately with no lastmod line.
    expect(xml).toContain('<loc>https://gmaslist.com/</loc>\n  </url>')
    expect(xml).toContain('<loc>https://gmaslist.com/about</loc>\n  </url>')
  })

  it('slugifies category names and de-dupes slug collisions', () => {
    const xml = buildSitemapXml(['Pre-Rolls', 'Pre Rolls', 'Flower'], GEN)
    const preRolls = [...xml.matchAll(/\/compare\/pre-rolls</g)]
    expect(preRolls).toHaveLength(1)
    expect(xml).toContain('/compare/flower<')
  })

  it('escapes XML-unsafe characters in a loc', () => {
    // Not reachable via categorySlug (it strips them), but the builder must be safe.
    const xml = buildSitemapXml(['A & B'], GEN)
    expect(xml).not.toContain('/compare/a & b')
    expect(xml).not.toMatch(/<loc>[^<]*&(?!amp;|lt;|gt;|quot;|apos;)/)
  })
})

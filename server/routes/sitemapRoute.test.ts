import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import express from 'express'
import request from 'supertest'
import {
  robotsRoute,
  sitemapRoute,
  llmsTxtRoute,
  buildSitemapXml,
  buildLlmsTxt,
  ROBOTS_TXT,
} from './sitemapRoute.js'
import { categorySlug } from './compareRoute.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROLLUPS_PATH = path.join(__dirname, '../data/derived/disparity-rollups.json')
const DATA_PATH = path.join(__dirname, '../data/data.json')

const app = express()
app.get('/robots.txt', robotsRoute)
app.get('/sitemap.xml', sitemapRoute)
app.get('/llms.txt', llmsTxtRoute)

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

  it('lists one /store/<id> URL per live store', async () => {
    const res = await request(app).get('/sitemap.xml')
    const ids = JSON.parse(readFileSync(DATA_PATH, 'utf-8')).dispensaries.map(
      (d: { id: string }) => d.id,
    )
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) {
      expect(res.text).toContain(`<loc>https://gmaslist.com/store/${id}</loc>`)
    }
  })
})

describe('GET /llms.txt', () => {
  it('serves Markdown as plain text with an hour cache', async () => {
    const res = await request(app).get('/llms.txt')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/plain/)
    expect(res.headers['cache-control']).toBe('public, max-age=3600')
  })

  it('follows llmstxt.org recommendations: H1, blockquote summary, links', async () => {
    const res = await request(app).get('/llms.txt')
    // Required H1 as the FIRST line — the Lighthouse agentic-browsing audit
    // failed exactly this before the route existed (SPA shell served here).
    expect(res.text.startsWith('# Gmas List\n')).toBe(true)
    expect(res.text).toMatch(/^> /m)
    expect(res.text).toMatch(/\[Deal feed\]\(https:\/\/gmaslist\.com\/\)/)
    expect(res.text).toMatch(/\[About Gmas List\]\(https:\/\/gmaslist\.com\/about\)/)
    expect(res.text).toMatch(/\[Compare prices\]\(https:\/\/gmaslist\.com\/compare\)/)
  })

  it('links one /compare/<category> URL per live rollup category', async () => {
    const res = await request(app).get('/llms.txt')
    for (const cat of liveCategories()) {
      expect(res.text).toContain(`(https://gmaslist.com/compare/${categorySlug(cat)})`)
    }
  })
})

describe('buildLlmsTxt (pure)', () => {
  it('degrades to the static pages section with zero categories', () => {
    const txt = buildLlmsTxt([])
    expect(txt.startsWith('# Gmas List\n')).toBe(true)
    expect(txt).toContain('(https://gmaslist.com/about)')
    expect(txt).not.toContain('## Price comparisons')
    expect(txt).not.toContain('/compare/')
  })

  it('de-dupes slug collisions and drops empty slugs', () => {
    const txt = buildLlmsTxt(['Pre-Rolls', 'Pre Rolls', '***', 'Flower'])
    expect([...txt.matchAll(/\/compare\/pre-rolls\)/g)]).toHaveLength(1)
    expect(txt).toContain('/compare/flower)')
    expect(txt).not.toContain('/compare/)')
  })

  it('states the WA-only scope (WAC 314-55-155 posture)', () => {
    expect(buildLlmsTxt([])).toContain('Washington State only')
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

  it('appends one /store/<id> URL per slug, de-duped, with no lastmod', () => {
    const xml = buildSitemapXml([], GEN, ['remedy-tulalip', 'remedy-tulalip', 'kush21-everett'])
    expect([...xml.matchAll(/\/store\/remedy-tulalip</g)]).toHaveLength(1)
    expect(xml).toContain('<loc>https://gmaslist.com/store/kush21-everett</loc>')
    // No fabricated lastmod on store pages (deals churn hourly).
    expect(xml).toContain('<loc>https://gmaslist.com/store/remedy-tulalip</loc>\n  </url>')
  })

  it('omits store URLs entirely when none are supplied', () => {
    expect(buildSitemapXml([], GEN)).not.toContain('/store/')
  })
})

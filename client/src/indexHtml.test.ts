import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Guards the hand-written entity markup in index.html (spec-ai-search-about-faq):
// unlike the server-rendered /about page, nothing executes this JSON-LD, so a
// stray comma or quote would ship silently-broken structured data to every
// page view. This test is the parse-validity + entity-drift tripwire.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const html = readFileSync(path.join(__dirname, '../index.html'), 'utf-8')

function extractJsonLdRaw(): string {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
  expect(match).not.toBeNull()
  return match![1]
}

describe('client/index.html entity markup', () => {
  it('carries a meta description leading with the entity identity', () => {
    expect(html).toMatch(/<meta\s+name="description"/)
    expect(html).toContain('independent information service')
  })

  it('declares a self-referencing homepage canonical (matches the sitemap `/` entry)', () => {
    // The /about, /compare, /store SSR routes emit their own canonicals; this
    // is the homepage's. Trailing slash must match the sitemap + Organization url.
    expect(html).toContain('<link rel="canonical" href="https://gmaslist.com/" />')
  })

  it('carries Open Graph + Twitter Card social meta for the homepage', () => {
    // Mirrors the SSR pages' server/utils/socialMeta.ts output; og:image is the
    // brand art at /og-image.png (small square -> summary card).
    expect(html).toContain('<meta property="og:type" content="website" />')
    expect(html).toContain('<meta property="og:url" content="https://gmaslist.com/" />')
    expect(html).toContain('<meta property="og:image" content="https://gmaslist.com/og-image.png" />')
    expect(html).toContain('<meta name="twitter:card" content="summary" />')
  })

  it('emits parseable WebSite + Organization JSON-LD with no SearchAction', () => {
    const raw = extractJsonLdRaw()
    const jsonLd = JSON.parse(raw) as Record<string, unknown>
    const graph = jsonLd['@graph'] as Array<Record<string, unknown>>

    expect(jsonLd['@context']).toBe('https://schema.org')
    const website = graph.find((n) => n['@type'] === 'WebSite')
    const org = graph.find((n) => n['@type'] === 'Organization')

    expect(website).toBeDefined()
    expect(website!.name).toBe('Gmas List')
    expect(website!['@id']).toBe('https://gmaslist.com/#website')
    expect(org).toBeDefined()
    expect(org!['@id']).toBe('https://gmaslist.com/#organization')
    // Entity copy must stay consistent with the /about entity definition:
    // positive identity first, WA-scoped, non-seller stated once.
    expect(String(org!.description)).toContain('independent information service')
    expect(String(org!.description)).toContain('Washington')
    expect(String(website!.description)).toContain('Washington')
    // The site has no /search endpoint — the schema must not claim one.
    // (Checked on the JSON-LD payload, not the whole file: an HTML comment
    // legitimately names SearchAction to document this rule.)
    expect(raw).not.toContain('SearchAction')
  })
})

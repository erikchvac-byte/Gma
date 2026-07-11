import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import express from 'express'
import request from 'supertest'
import { aboutRoute, FAQ_ITEMS, ENTITY_DESCRIPTION } from './aboutRoute.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
app.get('/about', aboutRoute)

async function fetchAbout() {
  return request(app).get('/about')
}

// Visible text as a crawler's text extractor would see it: scripts/styles
// removed, tags stripped, whitespace collapsed.
function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
}

function extractJsonLdBlocks(html: string): Array<Record<string, unknown>> {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  return blocks.map(([, json]) => JSON.parse(json))
}

describe('GET /about', () => {
  it('serves the entity page as plain HTML with no React mount point', async () => {
    const res = await fetchAbout()

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/html/)
    // Crawlers must get real content here, never the SPA shell.
    expect(res.text).not.toContain('<div id="root">')
    expect(res.text).not.toContain('main.tsx')
    expect(visibleText(res.text)).toContain(ENTITY_DESCRIPTION)
  })

  it('renders every FAQ question and answer as visible text', async () => {
    const res = await fetchAbout()
    const text = visibleText(res.text)

    expect(FAQ_ITEMS.length).toBeGreaterThanOrEqual(8)
    for (const { question, answer } of FAQ_ITEMS) {
      expect(text).toContain(question)
      expect(text).toContain(answer)
    }
  })

  it('covers the intent questions the vault strategy requires', () => {
    const questions = FAQ_ITEMS.map((f) => f.question.toLowerCase())

    expect(questions.some((q) => q.includes('area'))).toBe(true) // WA/Snohomish coverage
    expect(questions.some((q) => q.includes('worth the drive'))).toBe(true)
    expect(questions.some((q) => q.includes('free'))).toBe(true)
    expect(questions.some((q) => q.includes('sell cannabis'))).toBe(true)
  })

  it('emits parseable Service + FAQPage JSON-LD', async () => {
    const res = await fetchAbout()
    const blocks = extractJsonLdBlocks(res.text)

    expect(blocks).toHaveLength(2)
    const service = blocks.find((b) => b['@type'] === 'Service') as Record<string, any>
    const faq = blocks.find((b) => b['@type'] === 'FAQPage') as Record<string, any>

    expect(service).toBeDefined()
    expect(service.name).toContain('Gmas List')
    expect(service.description).toBe(ENTITY_DESCRIPTION)
    // WAC 314-55-155: local targeting only — areaServed must stay Washington.
    expect(service.areaServed).toEqual({ '@type': 'State', name: 'Washington' })

    expect(faq).toBeDefined()
    expect(faq.mainEntity).toHaveLength(FAQ_ITEMS.length)
  })

  it('FAQPage answer text matches the visible FAQ text word-for-word', async () => {
    const res = await fetchAbout()
    const text = visibleText(res.text)
    const faq = extractJsonLdBlocks(res.text).find(
      (b) => b['@type'] === 'FAQPage',
    ) as Record<string, any>

    for (const entity of faq.mainEntity) {
      expect(text).toContain(entity.name)
      expect(text).toContain(entity.acceptedAnswer.text)
    }
  })

  it('is registered before the production SPA fallback in server/index.ts', () => {
    const content = readFileSync(path.join(__dirname, '../index.ts'), 'utf-8')
    const aboutIdx = content.indexOf("app.get('/about', aboutRoute)")
    const fallbackIdx = content.indexOf('express.static')

    expect(aboutIdx).toBeGreaterThan(-1)
    expect(fallbackIdx).toBeGreaterThan(-1)
    expect(aboutIdx).toBeLessThan(fallbackIdx)
  })
})

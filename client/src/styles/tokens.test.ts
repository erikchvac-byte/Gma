/// <reference types="node" />
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Palette regression guard (ADR-041, "Arcade" swap). Token-layer source of
// truth — assert the Arcade values are present and that no superseded palette
// (Synthwave cyan/pink, Tidewater teal/green) survives in the token file. If
// this ever fails, a re-skin reintroduced an old hue or dropped a new one.
// Read off disk with fs (Vite's `?raw` loader returns '' here — the
// @tailwindcss/vite plugin intercepts .css imports). Path is resolved from the
// Vitest cwd (the client/ root); node types come from the triple-slash
// reference since the app tsconfig pins `types: ["vite/client"]`.
const tokens = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8')

describe('tokens.css — Arcade palette (ADR-041)', () => {
  it('declares the Arcade core values on their preserved token names', () => {
    expect(tokens).toMatch(/--accent:\s*#ff3d8b/)   // pink brand/interactive
    expect(tokens).toMatch(/--discount:\s*#ffc83d/)  // amber discount (new token)
    expect(tokens).toMatch(/--warning:\s*#ff5470/)   // red urgency
    expect(tokens).toMatch(/--bg:\s*#050507/)
    expect(tokens).toMatch(/--surface:\s*#121016/)
    expect(tokens).toMatch(/--tw-border:\s*#2a2330/)
  })

  it('mirrors the accent + new discount value into the Tailwind @theme block', () => {
    expect(tokens).toMatch(/--color-accent:\s*#ff3d8b/)
    expect(tokens).toMatch(/--color-discount:\s*#ffc83d/)
  })

  it('retains no superseded palette hues (Synthwave or Tidewater)', () => {
    // Synthwave cyan + hot-pink, Tidewater teal/green — none may remain.
    for (const hex of ['#2de2e6', '#5cebee', '#1bbfc3', '#ff2e88', '#4fd1c5', '#15803d']) {
      expect(tokens.toLowerCase()).not.toContain(hex)
    }
    expect(tokens).not.toContain('--green-700')
  })
})

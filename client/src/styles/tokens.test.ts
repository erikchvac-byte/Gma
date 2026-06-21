/// <reference types="node" />
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Palette regression guard (ADR-042, "Daylight" light theme). Token-layer
// source of truth — assert the Daylight values are present and that no
// superseded palette (Arcade neon, Synthwave cyan/pink, Tidewater teal/green)
// survives in the token file. If this ever fails, a re-skin reintroduced an old
// hue or dropped a new one. Read off disk with fs (Vite's `?raw` loader returns
// '' here — the @tailwindcss/vite plugin intercepts .css imports). Path is
// resolved from the Vitest cwd (the client/ root); node types come from the
// triple-slash reference since the app tsconfig pins `types: ["vite/client"]`.
const tokens = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8')

describe('tokens.css — Daylight palette (ADR-042)', () => {
  it('declares the Daylight core values on their preserved token names', () => {
    expect(tokens).toMatch(/--accent:\s*#18794e/)   // emerald brand/interactive
    expect(tokens).toMatch(/--discount:\s*#b45309/)  // deep amber discount
    expect(tokens).toMatch(/--warning:\s*#c92a44/)   // crimson urgency
    expect(tokens).toMatch(/--bg:\s*#f7f6f3/)        // warm paper canvas
    expect(tokens).toMatch(/--surface:\s*#ffffff/)   // white cards
    expect(tokens).toMatch(/--tw-border:\s*#e4e1d9/)
  })

  it('runs in light mode', () => {
    expect(tokens).toMatch(/color-scheme:\s*light/)
  })

  it('mirrors the accent + discount value into the Tailwind @theme block', () => {
    expect(tokens).toMatch(/--color-accent:\s*#18794e/)
    expect(tokens).toMatch(/--color-discount:\s*#b45309/)
  })

  it('retains no superseded palette hues (Arcade, Synthwave, or Tidewater)', () => {
    // Arcade neon pink/amber/red, Synthwave cyan/hot-pink, Tidewater teal/green.
    for (const hex of [
      '#ff3d8b', '#ffc83d', '#ff5470', '#050507', // Arcade
      '#2de2e6', '#5cebee', '#1bbfc3', '#ff2e88',  // Synthwave
      '#4fd1c5', '#15803d',                        // Tidewater
    ]) {
      expect(tokens.toLowerCase()).not.toContain(hex)
    }
    expect(tokens).not.toContain('--green-700')
    expect(tokens).not.toContain('color-scheme: dark')
  })
})

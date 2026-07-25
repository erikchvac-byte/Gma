import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Keep ALL of Erik's webp art (age-gate mosaic, deal-tag glyphs + rotation
    // pools, location/gas icons) as separate cacheable files instead of inlining
    // it as base64 into the critical JS bundle every visitor must download +
    // execute before first paint. Measured 2026-07-19: the deal/location icons
    // were 40 inlined data URIs = ~127KB uncompressed = ~33% of the entry chunk,
    // sitting on the FCP/LCP critical path (FCP 3.1s past the gate, all network+
    // parse; TTFB 50ms). Externalizing shrinks the entry chunk and — because the
    // deal icons render with fixed width/height AND loading="lazy" (DealCard) —
    // only the above-the-fold icons load on first paint, the rest defer. Fixed
    // dims mean no CLS regression (ADR-090/091/092 kept CLS at 0). Other small
    // assets keep Vite's default inlining. See ADR-093.
    assetsInlineLimit: (filePath: string) =>
      /[\\/](age-icons|deal-icons|location-icons)[\\/]/.test(filePath) ? false : undefined,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
      // /about is server-rendered by Express (spec-ai-search-about-faq); without
      // this rule the dev footer link lands on Vite's SPA fallback instead.
      '/about': 'http://localhost:3001',
      // /compare + /compare/:category are server-rendered too (derivation-3.1);
      // same reason — send them to Express in dev, not the SPA fallback.
      '/compare': 'http://localhost:3001',
      // /store/:slug per-store SSR pages (Phase 1a) — Express in dev, not Vite.
      '/store': 'http://localhost:3001',
      // robots.txt + sitemap.xml are Express routes (ADR-080), not static files;
      // proxy them so dev serves the dynamic sitemap, not Vite's public dir.
      '/robots.txt': 'http://localhost:3001',
      '/sitemap.xml': 'http://localhost:3001',
      // llms.txt is an Express route too (ADR-081) — same rule.
      '/llms.txt': 'http://localhost:3001',
      // /healthz is the Express keep-warm probe — proxy it so dev parity holds.
      '/healthz': 'http://localhost:3001'
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: true
  }
})

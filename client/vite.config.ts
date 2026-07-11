import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Keep the age-gate tile mosaic as separate cacheable files instead of
    // inlining ~150KB of base64 into the critical JS bundle that every visitor
    // loads. Other small assets keep Vite's default inlining behavior.
    assetsInlineLimit: (filePath: string) =>
      filePath.includes('age-icons') ? false : undefined,
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
      // robots.txt + sitemap.xml are Express routes (ADR-080), not static files;
      // proxy them so dev serves the dynamic sitemap, not Vite's public dir.
      '/robots.txt': 'http://localhost:3001',
      '/sitemap.xml': 'http://localhost:3001',
      // llms.txt is an Express route too (ADR-081) — same rule.
      '/llms.txt': 'http://localhost:3001'
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: true
  }
})

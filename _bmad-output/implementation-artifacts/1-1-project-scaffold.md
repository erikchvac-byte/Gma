---
baseline_commit: a33b4fddce3be54d5852646ecd046b9d735b3536
---

# Story 1.1: Project Scaffold

Status: done

## Story

As a **developer**,
I want the project scaffold (Vite + React + TS client, Express + TS server) running concurrently from the repo root,
so that I have a verified, correctly structured foundation every subsequent story builds on.

## Acceptance Criteria

1. **Given** I run `npm install` at the project root and then `npm run dev`, **When** both processes start, **Then** the Vite dev server is available at `localhost:5173` AND Express is available at `localhost:3001`.

2. **Given** Vite's `/api` proxy is configured, **When** the client calls `localhost:5173/api/data`, **Then** the request is forwarded to `localhost:3001/api/data`.

3. **Given** TypeScript strict mode is configured on both client and server, **When** the TypeScript compiler runs, **Then** zero type errors are present.

4. **Given** the project root, **When** I inspect `.gitignore`, **Then** `node_modules/`, `.env`, and `client/dist/` are excluded, and `.env.example` is committed with `EIA_API_KEY`, `NODE_ENV`, `PORT` keys.

5. **Given** `server/index.ts` exists, **When** I read the first executable line, **Then** it is `process.env.TZ = 'America/Los_Angeles'` — before any imports or other statements.

6. **Given** the server package, **When** I check `package.json` dependencies, **Then** `cors` and `dotenv` are present as dependencies, `@types/cors` is a devDependency, and the root has `concurrently` as a devDependency.

7. **Given** Tailwind CSS v4, **When** I inspect `client/vite.config.ts`, **Then** it uses `@tailwindcss/vite` plugin (no `tailwind.config.js`, no PostCSS), and `client/src/index.css` contains `@import "tailwindcss"`.

## Tasks / Subtasks

- [x] Task 1: Create root package.json with workspace scripts (AC: 1, 6)
  - [x] Root `package.json` with `"dev"`, `"build"`, `"start"` scripts using `concurrently`
  - [x] Add `concurrently` as root devDependency
- [x] Task 2: Scaffold client with Vite react-ts template (AC: 1, 3, 7)
  - [x] Run `npm create vite@latest client -- --template react-ts` from project root
  - [x] `cd client && npm install`
  - [x] `npm install -D tailwindcss @tailwindcss/vite`
  - [x] Update `client/vite.config.ts` — add `tailwindcss()` plugin + `/api` proxy to `localhost:3001`
  - [x] Replace `client/src/index.css` contents with `@import "tailwindcss"`
  - [x] Verify `client/tsconfig.json` has `"strict": true`
- [x] Task 3: Scaffold server manually (AC: 1, 3, 5, 6)
  - [x] `mkdir server && cd server && npm init -y`
  - [x] Install production deps: `express@5 cors dotenv axios cheerio`
  - [x] Install dev deps: `typescript @types/node @types/express @types/cors tsx`
  - [x] Create `server/tsconfig.json` with strict mode
  - [x] Create `server/index.ts` — `process.env.TZ` MUST be absolute first executable line, then imports, then Express setup + CORS
  - [x] Create placeholder `GET /api/data` route returning `{ ok: true }` (real route is Story 1.3)
- [x] Task 4: Create root config files (AC: 4)
  - [x] Create `.gitignore` excluding `node_modules/`, `.env`, `client/dist/`
  - [x] Create `.env.example` with keys: `EIA_API_KEY`, `NODE_ENV`, `PORT`
- [x] Task 5: Verify full dev workflow (AC: 1, 2)
  - [x] Run `npm install` at root — all three package.jsons install cleanly
  - [x] Run `npm run dev` — both processes start without errors
  - [x] Confirm Vite at `localhost:5173` and Express at `localhost:3001`
  - [x] Confirm `/api` proxy: `localhost:5173/api/data` forwards to `localhost:3001/api/data`
- [x] Task 6: Write smoke tests (AC: 3)
  - [x] `server/index.test.ts` — verify TZ is set to `America/Los_Angeles` at module load time
  - [x] `client/src/App.test.tsx` — verify App renders without throwing

## Dev Notes

### Critical: Execution Order

`process.env.TZ = 'America/Los_Angeles'` MUST be the **literal first executable line** in `server/index.ts` — before ALL imports. Node evaluates `process.env.TZ` before module loading; any import executed first can cache the wrong timezone. The architecture doc makes this a hard rule.

```ts
// server/index.ts — CORRECT
process.env.TZ = 'America/Los_Angeles'

import express from 'express'
import cors from 'cors'
// ... rest of imports
```

```ts
// WRONG — TZ set too late
import express from 'express'
process.env.TZ = 'America/Los_Angeles'  // too late
```

### Exact Package Versions & Commands

```bash
# Client
npm create vite@latest client -- --template react-ts
cd client && npm install
npm install -D tailwindcss @tailwindcss/vite

# Server (from project root)
mkdir server
cd server && npm init -y
npm install express@5 cors dotenv axios cheerio
npm install -D typescript @types/node @types/express @types/cors tsx
```

**Root devDependencies (add manually):**
```bash
# From project root
npm install -D concurrently
```

### Tailwind v4 — Critical Anti-Patterns

Tailwind v4 uses a **Vite plugin**, not PostCSS. Do NOT create `tailwind.config.js`, `postcss.config.js`, or `autoprefixer` config.

**client/vite.config.ts — correct:**
```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001'
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: true
  }
})
```

**client/src/index.css — correct:**
```css
@import "tailwindcss";
```
Remove all other content the Vite template puts here.

### TypeScript Strict Mode

**server/tsconfig.json:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

Client tsconfig is generated by the Vite template — verify `"strict": true` is present in `client/tsconfig.app.json` (not just `tsconfig.json`).

### Root package.json Scripts

```json
{
  "name": "happy",
  "version": "1.0.0",
  "scripts": {
    "dev": "concurrently \"npm run dev --prefix client\" \"npx tsx watch server/index.ts\"",
    "build": "npm run build --prefix client",
    "start": "node server/dist/index.js"
  },
  "devDependencies": {
    "concurrently": "^9.x"
  }
}
```

### Server Express Setup

```ts
// server/index.ts
process.env.TZ = 'America/Los_Angeles'  // MUST be first

import express from 'express'
import cors from 'cors'
import 'dotenv/config'

const app = express()
const PORT = process.env.PORT || 3001

app.use(express.json())

if (process.env.NODE_ENV !== 'production') {
  app.use(cors({ origin: 'http://localhost:5173' }))
}

// Placeholder — real implementation in Story 1.3
app.get('/api/data', (_req, res) => {
  res.json({ ok: true })
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
```

### CORS Strategy

Dev only — `cors` middleware restricted to `http://localhost:5173` when `NODE_ENV !== 'production'`. In production, Express serves the built Vite SPA via `express.static`, making them same-origin — no CORS needed.

### .gitignore

```
node_modules/
.env
client/dist/
server/dist/
```

### .env.example

```
EIA_API_KEY=
NODE_ENV=development
PORT=3001
```

### Testing Setup

Vitest ships with the `react-ts` Vite template — no extra install needed. Add `vitest` to the test script in `client/package.json` if not already present.

For server tests, add vitest as a dev dependency in `server/package.json`:
```bash
cd server && npm install -D vitest
```

Server test script: `"test": "vitest"`

**Smoke test — `server/index.test.ts`:**
```ts
import { describe, it, expect } from 'vitest'

describe('timezone', () => {
  it('is set to Pacific', () => {
    expect(process.env.TZ).toBe('America/Los_Angeles')
  })
})
```

Note: For the TZ test to work, the test file must import the server module (or the TZ assignment must be in a separate `env.ts` that is imported before the test assertion).

### Project Structure Notes

This story creates the full project structure from scratch. Target layout after completion:

```
happy/
├── package.json             ← root (concurrently, dev/build/start scripts)
├── .env                     ← NOT committed
├── .env.example             ← committed
├── .gitignore
├── client/
│   ├── package.json
│   ├── vite.config.ts       ← tailwindcss() plugin + /api proxy + vitest config
│   ├── tsconfig.json
│   ├── tsconfig.app.json    ← strict: true
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── index.css        ← @import "tailwindcss" only
│       ├── test-setup.ts    ← @testing-library/jest-dom
│       └── App.test.tsx
└── server/
    ├── package.json
    ├── tsconfig.json        ← strict: true, NodeNext modules
    ├── index.ts             ← process.env.TZ first line
    └── index.test.ts
```

Stories 1.2 and 1.3 will add `server/data/`, `server/routes/`, `server/utils/`, etc. Do NOT create those directories in this story.

### References

- Architecture: Starter Template section — exact init commands and Tailwind v4 integration
- Architecture: Enforcement Guidelines — TZ first-line rule, camelCase JSON, CORS dev-only
- Architecture: Infrastructure & Deployment — concurrently dev workflow
- Epics: Story 1.1 Acceptance Criteria — all 7 criteria above
- AR-1, AR-3, AR-8, AR-10, AR-11, AR-13 — Additional Requirements driving this story

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Vite template (create-vite@9.0.7) generates customized Claude Code boilerplate CSS — replaced `client/src/index.css` with `@import "tailwindcss"` only
- `client/tsconfig.app.json` did not include `"strict": true` explicitly — added it alongside existing strict-mode flags
- Imported from `vitest/config` instead of `vite` in vite.config.ts to type the `test` config block correctly
- TZ smoke test uses file content assertion (reads index.ts and finds first non-blank, non-comment line) — avoids starting Express server in tests

### Completion Notes List

- All 7 acceptance criteria satisfied
- Root package.json with `concurrently` dev workflow (`npm run dev` starts both client + server)
- Client: Vite react-ts template + Tailwind v4 (plugin, no config file) + `/api` proxy
- Server: Express v5, cors (dev-only), dotenv, axios, cheerio; TZ first line enforced
- TypeScript strict mode: zero errors on both client and server (`tsc --noEmit`)
- Tests: 3 passing (App renders, TZ first-line assertion, TZ value assertion)
- Server boots cleanly on port 3001

### File List

- `package.json` (new)
- `package-lock.json` (new)
- `.gitignore` (modified — added node_modules/, .env, client/dist/, server/dist/)
- `.env.example` (new)
- `client/` (new — scaffolded via `npm create vite@latest`)
- `client/package.json` (modified — added `"test": "vitest"` script, testing deps)
- `client/vite.config.ts` (modified — tailwindcss() plugin, /api proxy, vitest test config)
- `client/tsconfig.app.json` (modified — added `"strict": true`)
- `client/src/index.css` (modified — replaced with `@import "tailwindcss"`)
- `client/src/App.tsx` (modified — replaced with clean Gma's Helper placeholder)
- `client/src/test-setup.ts` (new)
- `client/src/App.test.tsx` (new)
- `server/package.json` (new)
- `server/package-lock.json` (new)
- `server/tsconfig.json` (new)
- `server/index.ts` (new)
- `server/index.test.ts` (new)

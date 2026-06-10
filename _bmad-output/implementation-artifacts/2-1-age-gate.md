---
baseline_commit: a7fc43bdbe3b7651b5a1e06a0b72382012e50459
---

# Story 2.1: Age Gate

Status: done

## Story

As a **first-time visitor**,
I want a full-page overlay requiring me to confirm I am 21 or older before seeing any content,
so that deal content is only accessible to adults and the site is legally compliant.

## Acceptance Criteria

1. **Given** I visit the app for the first time (no `gma_age_confirmed` in localStorage), **When** the page loads, **Then** a full-page overlay obscures ALL content — the deal feed is not rendered.
2. **Given** the age gate is visible, **When** I click "I am 21 or older", **Then** the overlay disappears, `gma_age_confirmed` is set to `"true"` in localStorage, and the deal feed becomes visible.
3. **Given** `gma_age_confirmed = "true"` is in localStorage, **When** I reload the page or return to the site, **Then** the age gate does NOT appear.
4. **Given** `gma_age_confirmed` exists, **When** I clear localStorage and reload, **Then** the age gate reappears.
5. **Given** the component tree, **When** I inspect it, **Then** `AgeGate.tsx` wraps `App` — no deal content is rendered until confirmed.

## Tasks / Subtasks

- [x] Task 1: Create `useLocalStorage` generic hook (AC: 2, 3, 4)
  - [x] `client/src/hooks/useLocalStorage.ts` — `useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void]`. Lazy-init from `localStorage.getItem(key)` (JSON-parsed, fallback to `initialValue` on missing/invalid), `setValue` writes via `JSON.stringify` and updates state.
  - [x] `client/src/hooks/useLocalStorage.test.ts` — covers: returns `initialValue` when key absent; returns parsed stored value when present; `setValue` updates both React state and `localStorage`; survives invalid JSON in storage by falling back to `initialValue`.
- [x] Task 2: Create `AgeGate.tsx` component (AC: 1, 2, 3, 4, 5)
  - [x] `client/src/components/AgeGate.tsx` — accepts `children: React.ReactNode`. Uses `useLocalStorage('gma_age_confirmed', false)`. If not confirmed, renders a full-page fixed overlay (`fixed inset-0`, high `z-index`) with an "I am 21 or older" button and does NOT render `children`. On click, sets the stored value to `true`. If confirmed, renders `children` directly (no wrapper overlay).
  - [x] `client/src/components/AgeGate.test.tsx` — covers: AC1 (no key → overlay shown, children not in document), AC2 (click button → overlay gone, children visible, `localStorage.getItem('gma_age_confirmed')` is `"true"`), AC3 (`gma_age_confirmed` pre-set to `"true"` → overlay not shown, children visible immediately), AC4 (clear localStorage between renders → overlay reappears).
- [x] Task 3: Wire `AgeGate` into `App.tsx` (AC: 5)
  - [x] Update `client/src/App.tsx` — wrap the existing root `<div>` (current placeholder content) in `<AgeGate>...</AgeGate>` so nothing renders until age is confirmed.
  - [x] Update `client/src/App.test.tsx` — the existing test asserts `"Gma's Helper"` is in the document, which will now be hidden behind the age gate by default. Set `localStorage.setItem('gma_age_confirmed', 'true')` (or click through the gate) before/in the render so the existing assertion still passes; add a new test asserting the age gate overlay renders when localStorage is empty and `"Gma's Helper"` is NOT in the document in that case.
- [x] Task 4: Run validations (AC: 1–5)
  - [x] `cd client && npm test -- --run` — all tests pass, no regressions
  - [x] `cd client && npx tsc -b` — zero type errors (TS strict mode, NFR-9)
  - [x] `cd client && npm run lint` — no new lint errors

### Review Findings

- [x] [Review][Decision] No under-21 decline path — dismissed 2026-06-10: single-button gate is the intended design.
- [x] [Review][Patch] Truthy non-boolean stored value bypasses the gate — fixed: strict `ageConfirmed !== true` check + parameterized bypass tests [client/src/components/AgeGate.tsx:18]
- [x] [Review][Patch] Overlay lacks dialog semantics and focus management — fixed: `role="alertdialog"`, `aria-modal`, labelled heading, focus moved to button on mount; tests switched to role-based queries [client/src/components/AgeGate.tsx:20-27]
- [x] [Review][Patch] Button contrast below WCAG AA — fixed: `bg-green-700`/`hover:bg-green-800` [client/src/components/AgeGate.tsx:34]
- [x] [Review][Patch] Storage error branches untested — fixed: tests stub `getItem`/`setItem` to throw [client/src/hooks/useLocalStorage.test.ts:43-66]
- [x] [Review][Patch] `setValue` identity unstable — fixed: wrapped in `useCallback` keyed on `key`, with stable-identity test [client/src/hooks/useLocalStorage.ts:13]
- [x] [Review][Defer] No cross-tab/multi-instance localStorage sync (no `storage` listener / `useSyncExternalStore`) [client/src/hooks/useLocalStorage.ts] — deferred, out of MVP scope; worst case the gate stays up in a second tab until reload
- [x] [Review][Defer] `setValue` lacks functional-update form; `undefined` serializes to the string `"undefined"` [client/src/hooks/useLocalStorage.ts:3] — deferred, no current consumer needs it
- [x] [Review][Defer] Hook ignores `key` prop changes after mount [client/src/hooks/useLocalStorage.ts:4] — deferred, no consumer changes keys

## Dev Notes

### This is the first client-side feature story — no existing client components yet

`client/src/components/` and `client/src/hooks/` directories do not exist yet; this story creates both. There is no `useDeals`/`DealFeed` yet (Story 2.2) — `App.tsx` currently renders only a placeholder `<h1>Gma's Helper</h1>` (see current content below). `AgeGate` simply wraps whatever `App` currently renders; do not add deal-feed scaffolding — that's out of scope for this story.

**Current `client/src/App.tsx`:**
```tsx
function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <h1 className="text-2xl font-bold p-4">Gma&apos;s Helper</h1>
    </div>
  )
}

export default App
```

### `useLocalStorage` hook — generic, JSON-based

Architecture specifies `hooks/useLocalStorage.ts` as "Generic typed localStorage get/set hook" [Source: architecture.md#Frontend Architecture, #Project Structure & Boundaries]. Implement as:

```ts
import { useState } from 'react'

export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key)
      return item !== null ? (JSON.parse(item) as T) : initialValue
    } catch {
      return initialValue
    }
  })

  const setValue = (value: T) => {
    setStoredValue(value)
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // ignore write errors (e.g. private browsing storage limits)
    }
  }

  return [storedValue, setValue]
}
```

Note: `JSON.stringify(true)` produces the string `"true"`, which satisfies AC2's literal requirement that `gma_age_confirmed` is set to `"true"` in localStorage (a `boolean` value through this hook serializes correctly — no special-casing needed).

### `AgeGate.tsx` — overlay component

```tsx
import type { ReactNode } from 'react'
import { useLocalStorage } from '../hooks/useLocalStorage'

interface AgeGateProps {
  children: ReactNode
}

export default function AgeGate({ children }: AgeGateProps) {
  const [ageConfirmed, setAgeConfirmed] = useLocalStorage('gma_age_confirmed', false)

  if (!ageConfirmed) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-gray-900 p-4 text-center text-white">
        <p className="text-lg">You must be 21 or older to view this content.</p>
        <button
          type="button"
          onClick={() => setAgeConfirmed(true)}
          className="rounded-lg bg-green-600 px-6 py-3 text-lg font-semibold hover:bg-green-700"
        >
          I am 21 or older
        </button>
      </div>
    )
  }

  return <>{children}</>
}
```

`AgeGate` either renders the full-page overlay OR `children` — never both — which satisfies AC1/AC5 ("no deal content is rendered until confirmed") without needing conditional CSS visibility tricks.

### `App.tsx` after wiring

```tsx
import AgeGate from './components/AgeGate'

function App() {
  return (
    <AgeGate>
      <div className="min-h-screen bg-gray-50">
        <h1 className="text-2xl font-bold p-4">Gma&apos;s Helper</h1>
      </div>
    </AgeGate>
  )
}

export default App
```

### Naming & file structure (per architecture)

- Component: `PascalCase.tsx` → `AgeGate.tsx` [Source: architecture.md#Naming Patterns]
- Hook: `camelCase.ts` with `use` prefix → `useLocalStorage.ts` [Source: architecture.md#Naming Patterns]
- localStorage key: `gma_` prefix, snake_case → `gma_age_confirmed` (already defined in architecture's localStorage schema — do not invent a new key name) [Source: architecture.md#Frontend Architecture localStorage Key Schema]
- Test files co-located, `*.test.tsx`/`*.test.ts` suffix [Source: architecture.md#Naming Patterns; NFR-10]

### Testing

- Use `@testing-library/react` (`render`, `screen`, `fireEvent`) + `@testing-library/jest-dom` (already installed — see `client/package.json`). No new dependencies needed; `fireEvent.click` is sufficient for the button click, no need for `@testing-library/user-event`.
- `localStorage` is real (jsdom provides it) — call `localStorage.clear()` in a `beforeEach` in both `AgeGate.test.tsx` and `App.test.tsx` to ensure test isolation (no shared state between tests).
- Run via `cd client && npm test -- --run` (Vitest, non-watch mode).

### Project Structure Notes

This story creates two new directories:
```
client/src/
├── components/
│   ├── AgeGate.tsx       (new)
│   └── AgeGate.test.tsx  (new)
├── hooks/
│   ├── useLocalStorage.ts       (new)
│   └── useLocalStorage.test.ts  (new)
├── App.tsx        (modified — wrap with AgeGate)
└── App.test.tsx   (modified — handle age-gated render)
```
This matches the architecture's planned `client/src/components/` and `client/src/hooks/` directories exactly [Source: architecture.md#Structure Patterns].

### References

- Epics: `_bmad-output/planning-artifacts/epics.md` — Story 2.1: Age Gate (Epic 2), FR-13
- Architecture: `_bmad-output/planning-artifacts/architecture.md` — Frontend Architecture (localStorage Key Schema), Naming Patterns, Structure Patterns, Project Structure & Boundaries (`AgeGate.tsx`, `useLocalStorage.ts`, "AgeGate wraps App — nothing below renders until `gma_age_confirmed` is set")
- Previous story: `1-3-get-api-data-endpoint-with-active-deal-filtering.md` — establishes Vitest test conventions (co-located `*.test.ts(x)`, `npm test -- --run` for non-watch); no client component patterns existed yet at that point (server-only story)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6 (claude-sonnet-4-6)

### Debug Log References

None — implementation followed the Dev Notes prescriptions directly; no failing debug cycles.

### Completion Notes List

- Implemented all 4 tasks per Dev Notes; `useLocalStorage` and `AgeGate` match the prescribed implementations verbatim.
- `useLocalStorage.test.ts`: 4 tests (initial value when absent, parsed value when present, setValue updates state + localStorage, falls back on invalid JSON).
- `AgeGate.test.tsx`: 4 tests covering AC1 (overlay shown, children hidden), AC2 (click confirms, persists `"true"`, reveals children), AC3 (pre-confirmed skips overlay), AC4 (clearing localStorage brings overlay back).
- `App.tsx` wrapped in `<AgeGate>`; `App.test.tsx` updated — original "Gma's Helper" assertion now runs with `gma_age_confirmed` pre-set, plus a new test asserting the gate blocks content on first visit.
- Full client suite: `npm test -- --run` → 3 files, 10 tests, all passing. `npx tsc -b` zero errors. `npm run lint` clean. Server suite re-run for regression check: 3 files, 13 tests, all passing (no server files touched).

### File List

- `client/src/hooks/useLocalStorage.ts` (new)
- `client/src/hooks/useLocalStorage.test.ts` (new)
- `client/src/components/AgeGate.tsx` (new)
- `client/src/components/AgeGate.test.tsx` (new)
- `client/src/App.tsx` (modified — wrapped content in `<AgeGate>`)
- `client/src/App.test.tsx` (modified — age-gate-aware assertions)

## Change Log

- 2026-06-09: Story implemented — `useLocalStorage` generic hook, `AgeGate` full-page overlay component, wired into `App.tsx`. Full unit test coverage for AC1-AC5; client and server suites pass with no regressions.
- 2026-06-10: Adversarial code review (Blind Hunter + Edge Case Hunter + Acceptance Auditor). No AC violations. 5 patches applied: strict `=== true` gate check, alertdialog semantics + initial focus, WCAG AA button contrast, storage-throws tests, `useCallback` on `setValue`. Under-21 decline path dismissed as intended design; 3 hook hardening items deferred to `deferred-work.md`. 18 tests passing, `tsc -b` and lint clean. Status → done.

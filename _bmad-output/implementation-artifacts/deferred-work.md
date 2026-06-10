# Deferred Work

## Deferred from: code review of spec-2-2-deal-feed (2026-06-10)

- **Feed does not re-evaluate deal activity over time** — `sortDeals` is computed once per render with `new Date()` and nothing re-renders on a timer, so a deal whose window closes while the tab is open stays visible; worse, once `endTime` passes, the overnight-wrap heuristic (`diff < 0 → +1440`) ranks it as "ending tomorrow" because `startTime` is ignored. Unreachable today (server strips inactive deals at fetch time) but becomes live the moment Story 2.3 adds the 60s countdown tick — 2.3 MUST make expiry checking startTime-aware (drop expired deals client-side), not just re-sort.

## Deferred from: Story 2.2 spec planning (2026-06-10)

- **Upcoming Happy Hours with "Starts at HH:MM" label** (Story 2.2 AC3, epics.md:293-295) — the server (`server/utils/filterActiveDeals.ts`, ADR-015) strips deals that aren't active right now, so later-today Happy Hours never reach the client. Implementing requires extending the server filter to keep `happy_hour` deals starting later today plus client-side active-vs-upcoming labeling. Deferred by Erik 2026-06-10; Story 2.2 ships active-only.

## Deferred from: code review of 2-1-age-gate (2026-06-10)

- No cross-tab/multi-instance localStorage sync in `useLocalStorage` (no `storage` event listener / `useSyncExternalStore`) — two tabs or two consumers of the same key diverge until reload. Out of MVP scope; worst case the age gate stays up in a second tab.
- `setValue` lacks a functional-update form (`setValue(prev => ...)`), so future read-modify-write consumers risk stale closures; `T` including `undefined` serializes to the literal string `"undefined"`. No current consumer affected.
- `useLocalStorage` ignores `key` prop changes after mount (value read once in the lazy initializer). No consumer changes keys today.

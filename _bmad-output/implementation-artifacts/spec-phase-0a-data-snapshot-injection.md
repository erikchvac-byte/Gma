---
title: 'Phase 0a (perf half): inject /api/data snapshot into the served SPA shell'
type: 'feature'
created: '2026-07-11'
status: 'done'
baseline_commit: '79f27a2b6c857c33025df7ae7a6c3dd0b3ae3c83'
context:
  - '{project-root}/docs/seo-ai-crawler-visibility-plan.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Lighthouse is 100 on 4 of 5 categories (ADR-081); the only weighted failures left are FCP 3.0s / LCP 4.9s, and the live report shows the LCP element is a deal-card `h2` reached via the JS → `/api/data` fetch → render chain. The served shell is an empty React root, so first paint of real content waits on a client fetch.

**Approach:** Express injects the current `/api/data` payload into the shell as a `window.__GMA_DATA__` inline script at serve time (the plan doc's "lightest" 0a option); `useDeals` initializes synchronously from it and skips the fetch, so the first React render paints real cards. The crawler-visible HTML half of Phase 0a is DEFERRED (blocked on the Phase 0b legal call) and logged in deferred-work.md — Erik's pick 2026-07-11.

## Boundaries & Constraints

**Always:**
- Snapshot content must be semantically identical to what `GET /api/data` would return at that instant: same `filterActiveDeals` + `deriveStoreStatus` derivation, one shared builder — never a second derivation path (honest-math rule).
- Client must validate the snapshot with the exact same shape guard + `normalizeDispensaries` boundary the fetch path uses, and fall back to the existing fetch when the snapshot is absent or invalid (dev server, corruption).
- Serialization must be XSS-safe: escape every `<` in the JSON with the JS unicode escape (backslash-u003c) so deal text can never break out of the script tag.
- Shell serving must never 500 because data failed: on any snapshot-build error, serve the un-injected shell (client fetch fallback takes over).
- Backend/markup + client data-plumbing only; zero visual/layout/style change.

**Ask First:**
- Any change to AgeGate, or anything that makes deal content human-visible before the gate (that is Phase 0b, legal-gated).
- Any change to what `/api/data` itself returns.

**Never:**
- No server-rendered human-readable deal HTML in the shell (deferred, legal-gated).
- No SSR framework, no hydration library, no new dependencies.
- Do not touch `/about`, `/compare`, `/robots.txt`, `/sitemap.xml`, `/llms.txt` routes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Prod `GET /` | data.json healthy | Shell HTML with `window.__GMA_DATA__` inline script before `</head>`; payload ≡ `/api/data` response; `Cache-Control: no-cache` | N/A |
| Prod deep link (e.g. `/foo`) | non-API, non-file path | Same injected shell (SPA fallback injects too) | N/A |
| data.json unreadable/malformed | fs error or bad JSON | 200 with plain (un-injected) shell; client falls back to fetch | log server-side, never 500 |
| Snapshot invalid on client | `__GMA_DATA__` missing/wrong shape | `useDeals` ignores it, runs existing fetch path unchanged | existing error states |
| Vite dev server | no injection exists | fetch path unchanged | N/A |
| Deal text contains `</script>` or `<` | hostile/odd scraped text | `<` unicode-escaped (backslash-u003c); script tag intact; parsed data identical | N/A |
| Static assets | `/assets/*.js` etc. | still served by `express.static`, byte-identical | N/A |

</frozen-after-approval>

## Code Map

- `server/index.ts` -- prod block: registers `express.static` + SPA fallback (`res.sendFile` of index.html); injection route goes before static, and the fallback switches to it
- `server/routes/dataRoute.ts` -- current `/api/data` handler; owns the readFileSync + `filterActiveDeals` + `deriveStoreStatus` derivation to extract into a shared builder
- `server/utils/filterActiveDeals.ts`, `server/utils/storeStatus.ts` -- the derivation pieces (do not modify)
- `client/index.html` -- shell template; Vite copies to `client/dist/index.html`; `</head>` is the injection anchor
- `client/src/hooks/useDeals.ts` -- fetch-on-mount hook; gains synchronous snapshot init + fetch fallback
- `client/src/utils/normalizeDispensaries.ts` -- validation boundary both paths must share (do not modify)
- `server/routes/sitemapRoute.ts` -- pattern reference for route + test structure
- `_bmad-output/implementation-artifacts/deferred-work.md` -- gets the deferred crawler-HTML entry

## Tasks & Acceptance

**Execution:**
- [x] `server/utils/buildApiData.ts` -- extract the dataRoute derivation (read data.json → filter → status → `ApiDataResponse`) into an exported `buildApiData(now?)`; throws on bad data -- single source for route + snapshot
- [x] `server/routes/dataRoute.ts` -- consume `buildApiData`; response bytes unchanged -- no second derivation
- [x] `server/routes/shellRoute.ts` -- new `makeShellRoute(clientDistPath)` factory: read `index.html`, inject `<script>window.__GMA_DATA__ = {json}</script>` before `</head>` with `<` unicode-escaped (backslash-u003c), `Cache-Control: no-cache`; on builder error serve un-injected shell -- factory takes the path so tests inject a fixture dir
- [x] `server/index.ts` -- prod block: `app.get('/', shellRoute)` before `express.static(clientDist, { index: false })`; SPA fallback regex handler becomes `shellRoute` -- every shell serve carries the snapshot
- [x] `client/src/hooks/useDeals.ts` (+ global type decl for `window.__GMA_DATA__`) -- lazy `useState` initializer: validate snapshot with the same shape guard + `normalizeDispensaries`; valid → `data` set, `isLoading` false, effect skips fetch; else current behavior -- fetch stays the fallback
- [x] `server/routes/shellRoute.test.ts` -- cover the I/O matrix rows: injection present + payload equals `buildApiData` output, escaping, error → plain shell, no-cache header
- [x] `client/src/hooks/useDeals.test.ts` -- extend: valid snapshot → no fetch call + data present; malformed snapshot → fetch runs; existing tests stay green (no snapshot default)
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- append: crawler-visible deal/store HTML in shell (0a crawler half) deferred pending Phase 0b legal decision
- [x] `ADR.md` -- add ADR: Phase 0a perf half via snapshot injection; crawler half deferred (0b-gated); update change log

**Acceptance Criteria:**
- Given a prod-mode server with healthy data.json, when any non-API page path is requested, then the HTML contains one `__GMA_DATA__` script whose parsed value deep-equals the `/api/data` response at that moment.
- Given a valid injected snapshot, when the app mounts DealFeed, then deal cards render on the first data-bearing render and no `/api/data` request is issued.
- Given no snapshot (dev) or an invalid one, when DealFeed mounts, then behavior is byte-for-byte today's: skeleton → fetch → cards/error.
- Given the full client+server production build (`npm run build`), then it completes clean.

## Design Notes

- `express.static` currently serves `dist/index.html` at `/` by default; without `index: false` the injection route ordering for `/` works but is fragile — disable static index explicitly so `shellRoute` is the only shell server.
- Snapshot staleness ceiling = page-load age (DealFeed may mount minutes later, post-gate). Today's fetch-at-mount is fresher by that gap; accepted — deals filter on a 24h-window granularity, and a reload refreshes.
- `/api/data` is already public and un-gated; embedding the same JSON adds zero new legal exposure. Human-readable HTML would — that's the deferred half.
- Compiled layout: `server/dist/server/...`; `server/index.ts` already resolves `clientDist` from module URL — pass that same resolved path into `makeShellRoute`, don't re-derive it inside the route.

## Verification

**Commands:**
- `npm test --prefix server` -- expected: all green incl. new shellRoute tests (594+ baseline)
- `npm test --prefix client` -- expected: all green incl. extended useDeals tests
- `npm run build` -- expected: client + server compile clean (Render build parity)

**Manual checks (if no CLI):**
- `NODE_ENV=production node server/dist/server/index.js` locally, `curl localhost:3001/` → `__GMA_DATA__` present and JSON-parses; `curl localhost:3001/assets/<bundle>.js` still served.

## Suggested Review Order

**The injection route (design intent)**

- Factory takes the dist path; whole file is the story — escape, inject, degrade
  [`shellRoute.ts:20`](../../server/routes/shellRoute.ts#L20)

- The escape set: `<` + U+2028/9 unicode-escaped so scraped text can't terminate the tag
  [`shellRoute.ts:39`](../../server/routes/shellRoute.ts#L39)

- Function replacement, not string — review-caught `$`-pattern expansion fix
  [`shellRoute.ts:48`](../../server/routes/shellRoute.ts#L48)

- Data failure degrades to plain shell (fetch fallback), never a 500
  [`shellRoute.ts:58`](../../server/routes/shellRoute.ts#L58)

**Single derivation source (honest-math)**

- `/api/data` derivation extracted verbatim; both consumers share it, so they can't disagree
  [`buildApiData.ts:15`](../../server/utils/buildApiData.ts#L15)

- `dataRoute` reduced to builder call + 500 boundary — behavior unchanged
  [`dataRoute.ts:4`](../../server/routes/dataRoute.ts#L4)

**Production wiring**

- `/`, literal `/index.html` (review-caught static leak), and SPA fallback all serve the injected shell
  [`index.ts:84`](../../server/index.ts#L84)

- `index: false` so static never resolves the shell as a directory index
  [`index.ts:88`](../../server/index.ts#L88)

**Client snapshot consumption**

- One `validateApiData` boundary shared by snapshot + fetch paths (drift-proofing)
  [`useDeals.ts:23`](../../client/src/hooks/useDeals.ts#L23)

- Synchronous `useState` init from the snapshot — the LCP round-trip disappears here
  [`useDeals.ts:44`](../../client/src/hooks/useDeals.ts#L44)

- Ref-gated effect: fetch stays the fallback for dev/invalid snapshot
  [`useDeals.ts:52`](../../client/src/hooks/useDeals.ts#L52)

**Tests + docs**

- Hostile fixture: `$$`/`$&`/`` $` ``/`$'`/U+2028 round-trip byte-exact
  [`shellRoute.test.ts:143`](../../server/routes/shellRoute.test.ts#L143)

- Deep-equal parity against `buildApiData` (AC1), exactly-one script
  [`shellRoute.test.ts:115`](../../server/routes/shellRoute.test.ts#L115)

- Snapshot-consumption hook tests: sync data + zero fetch; malformed → fallback
  [`useDeals.test.ts:71`](../../client/src/hooks/useDeals.test.ts#L71)

- ADR-082 + deferred-work entries (crawler-HTML half 0b-gated; remount-TTL + size-bound deferrals)
  [`ADR.md:783`](../../ADR.md#L783)

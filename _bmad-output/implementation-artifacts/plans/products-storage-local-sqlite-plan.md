# Plan: Products storage → local SQLite + push-derived-facts (ADR-077)

**Status:** Approved direction (Erik, 2026-07-06), not yet started. Assessment thread: data-pipeline forensic audit Finding 8. Decision recorded in `ADR.md` → ADR-077.
**Owner:** Erik (solo). **Architect:** Winston.
**Hard deadline:** GitHub 50 MB push-warning ~2026-07-23, 100 MB hard push-block ~2026-08-20 (linear extrapolation from 18.8 MB @ ~1.75 MB/day).

---

## The decision in one paragraph

The raw longitudinal dataset (`products.json`, 18.8 MB and growing ~1.75 MB/day) stops being committed to git. It moves into a **local SQLite database on Erik's home machine** — the same machine that already runs the residential Weedmaps scrape. The public Render site **never queries the home machine**; it serves only small, pre-computed **derived facts** (the disparity + deal-scope reports) that the home machine commits back. Erik owns backup of the raw DB (accepted trade-off — kills the git file-size wall permanently, stays $0, keeps the proprietary raw asset on hardware he controls). This is **local self-host at $0** and is distinct from the paid-Docker self-host parked in ADR-033.

### The load-bearing rule (violate this and it becomes reckless)

> **Render serves derived facts only. It must never open a live connection to the home DB.** If the home machine is off, the site keeps serving the last-pushed facts; only fresh *accrual* pauses. Site availability must never depend on home uptime or the ISP.

### Why the server change is small

The two value routes already serialize exactly the shapes the derivation produces:
- `valueRoute.ts:23` → `res.json(buildMatchReport(readProducts()))` — a `MatchReport`.
- `valueRoute.ts:52` → `res.json(buildDealScopeLinks(...))` — a `DealScopeReport`.

So "serve derived facts" = **precompute those two objects on the home machine, write them to small JSON files, and make the routes read the file instead of computing it.** Honesty gates (Gates 1–5, `EXCLUDED_FLAGS`, fix6) run at derivation time, unchanged. Types (`Disparity`, `DealScope`, `MatchReport`, `DealScopeReport`) are untouched.

---

## Target topology

```
HOME MACHINE (residential IP, already runs a Scheduled Task)
  ├─ Weedmaps scrape  ─┐
  ├─ Dutchie scrape   ─┤→ write raw observations → products.db (local SQLite, append-only)
  │                     │      (full history, unbounded, NEVER in git, NEVER on Render)
  ├─ derive: buildMatchReport(db) + buildDealScopeLinks(db, data.json)
  │            → derived/disparities.json  + derived/deal-scope.json   (small, bounded)
  └─ git commit-back ONLY the derived/*.json  →  push master  →  Render auto-deploys

RENDER (public, free tier)
  └─ /api/value/disparities, /api/value/deal-scope  →  static read of derived/*.json
     /api/products  →  (decision below)
     /api/data (deals)  →  UNCHANGED (ADR-043/053 decoupling honored)

OFFSITE BACKUP (Erik owns)
  └─ scheduled copy of products.db  →  target TBD (Phase 2 decision)
```

---

## Phased plan (deadline-aware)

### Phase 0 — De-risk the memory bug now (~½ day, independent of everything else)
The per-request full-parse OOM risk (audit P2) is a separate, nearer danger than the git wall. Ship it first; it commits to no architecture.
- [ ] `server/utils/productsStore.ts` — memoize `readProducts()` on file **mtime**: parse once, re-parse only when the file changes. Kills the per-request 3–5× heap blow-up on the 512 MB Render instance regardless of file size.
- [ ] `server/routes/productsRoute.ts` — decide `/api/products`: it currently ships the **entire blob** to the client. Options: (a) drop it (private/R&D, no known public consumer), (b) bound it to a small "latest snapshot" derived file. **Open decision** — see below.
- Route: `bmad-quick-dev`. Small, reversible, worth doing even if the rest slips.

### Phase 1 — Kill the wall (before 2026-07-23)
The minimum that removes the deadline: **stop appending raw observations to a single git-tracked file.**
- [ ] **Schema + migration.** New `server/scripts/importProductsToSqlite.ts`: one-time import of the current `products.json` into `products.db`. Schema (minimal, JSON-preserving to start): `product(product_key PK, dispensaryId, productId, name, category, brand, strainType, packCount, thc, cbd, totalTerpenes, effects, subcategory, flags)` + `observation(product_key FK, observedAt, special, options_json)`. Verify: record count = 5,090, observation count = 29,669, **zero loss**.
- [ ] **Local derivation runner.** New `scripts/derive-facts-local.ps1` (mirror `scripts/scrape-weedmaps-local.ps1`: detached worktree, hard-reset to origin/master, run, commit-back `[skip ci]`, push). It runs a new `server/scripts/deriveFactsRun.ts` that reads `products.db`, runs the **existing** `buildMatchReport` + `buildDealScopeLinks` (adapt their input from `ProductsFile` to a DB-backed reader — pure functions stay the same), and writes `server/data/derived/disparities.json` + `server/data/derived/deal-scope.json`.
- [ ] **Repoint the server.** `valueRoute.ts` reads the two derived files (fail-soft, mirrors `readProducts`); no more `buildMatchReport` at request time on Render.
- [ ] **Remove the wall.** `git rm server/data/products.json`; stop the Actions `scrape-products.yml` commit-back of the raw file. Keep the last raw copy locally + first backup before deleting. **This is the step that actually kills the deadline.**
- [ ] **Feed the DB.** Weedmaps local runner → write to SQLite (already local, easy). Dutchie → **sub-decision** (see below): move local now, or bridge for the deadline.
- [ ] **Parity test:** disparities derived from `products.db` at migration == the current live 217 disparities; `MatchReport` counts (excludedFlagCount incl. the new `unreconciled-pack`, nonComparableCategoryCount, unmatchedCount) match. deal-scope buckets still sum to total deals.
- Route: `bmad-create-story` (this is a multi-part story worth a spec), then `bmad-quick-dev`/`bmad-dev-story`.

### Phase 2 — Consolidate & harden (after the deadline is safe)
- [ ] **Move Dutchie scraping fully local** and retire the Actions `scrape-products.yml` cron. One machine owns all raw data. Cost: install the `scraper-svc` (Python + Playwright + Chromium) on the home machine — Dutchie needs the stealth browser (Weedmaps is a static fetch and doesn't). Residential IP is *better* for scraping anyway (the Weedmaps 406 saga).
- [ ] **Backup routine** (the responsibility Erik now owns). Scheduled offsite copy of `products.db`. Target is an **open decision** — candidates: a separate **private repo via git-LFS** (keeps the "it's in git" muscle memory, offsite, free-ish), cheap **object storage** (Backblaze B2 / S3, a few cents/mo), or a simple **external-drive + periodic cloud sync**. Recommend the simplest offsite option; decide when we get here.
- [ ] **Query layer as B1 needs it.** Add SQLite indices on `(dispensaryId, observedAt)` when the vs-own-rolling-median trendline work starts needing time-range queries. Not before — Rule of Three.

---

## Open decisions (flag before/at Phase 1 — don't guess)

1. **Dutchie during Phase 1:** move it local immediately (clean end-state, needs local `scraper-svc` setup) **or** bridge the deadline by having Actions commit a *small daily raw-delta that is overwritten each run* (not appended) which the home machine imports into SQLite. Bridge = less setup under deadline pressure; local = fewer moving parts long-term. **Recommendation:** bridge only if the local Python setup can't land before ~Jul 20; otherwise go straight local.
2. **`/api/products` fate:** drop entirely, or serve a bounded latest-snapshot derived file. Depends on whether anything (yours or a future public page) needs the raw product list. **Recommendation:** drop for now; re-add a bounded derived view if a consumer appears.
3. **deal-scope freshness:** precomputing it daily makes links up to ~24 h stale (today it's live per request against hourly `data.json`). Accept daily staleness (simplest), **or** keep deal-scope live on Render by shipping a *small* per-store `{productId, category, weight}` index instead of full history. **Recommendation:** precompute daily to start; revisit only if banner→SKU freshness proves to matter.
4. **Backup target** (Phase 2) — see above.

## Non-negotiables / invariants
- Deals pipeline (`data.json`, `/api/data`, `filterActiveDeals`) untouched — ADR-043/053 decoupling preserved.
- Full raw history preserved — no pruning (the whole point of the asset; feeds B1 + Phase-4).
- Honesty gates (fix6, `EXCLUDED_FLAGS`, Gates 1–5) run at derivation, behavior-identical.
- Render never queries the home DB (the load-bearing rule).
- Not a contradiction of ADR-033 (that's *paid* Docker self-host; this is *free* local self-host of a data file).

## What "done with the deadline" means
Phase 0 shipped **and** Phase 1's "remove the wall" step merged (`products.json` out of git, derived files served, raw in local SQLite with one backup taken) — before ~2026-07-23. Phase 2 is post-deadline hardening.

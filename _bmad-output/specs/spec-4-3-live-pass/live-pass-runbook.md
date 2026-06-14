# Live Pass Runbook — Story 4.3 Dutchie Verification

Concrete procedure backing the SPEC capabilities. Executor runs these in order. Stop and escalate to Erik at any **HALT** gate. The Python service lives at `C:\Users\erikc\Dev\Scraper` and is **read-only** here — never modify it.

## 0. Pre-flight (CAP-1)

```bash
# Terminal A — bring the service up (Python 3.13)
cd C:\Users\erikc\Dev\Scraper
pip install -r requirements.txt              # first run only
python -m playwright install chromium        # first run only
python -m uvicorn api.server:app --host 0.0.0.0 --port 8000
```

```bash
# Terminal B — confirm reachability
curl http://localhost:8000/health            # expect {"status":"ok"}
```

Smoke-test the path with a known-good store (HANDOFF: Happy Time Mt Vernon) to prove `scraperClient` reaches the service before touching the real stores:

```bash
curl -X POST http://localhost:8000/scrape -H "Content-Type: application/json" -d "{\"url\":\"https://dutchie.com/embedded-menu/happy-time-mt-vernon/\",\"intercept_pattern\":\"dutchie\\\\.com.*(graphql|api-0)\",\"wait_for_pattern\":\"dutchie\\\\.com/graphql\",\"tier\":\"browser\",\"headless\":true,\"timeout\":45000}"
```
Expect `success:true` and a non-empty `intercepted[]`. If `[]`, the service/browser env is broken — **HALT**, fix the service env (not Happy code).

## 1. Resolve the two embed store IDs (CAP-2)

Targets (from `deferred-work.md`):
- `jet-cannabis-everett` — licensed entity "THC Connection"; host `dutchie.com/dispensary/thc-connection`
- `kush21-everett-evergreen` — host `everettshop.kush21.com`

For each, use the service's discovery path. Two routes:

**Route A — `/discover` (load host page, capture all URLs):**
```bash
curl -X POST http://localhost:8000/discover -H "Content-Type: application/json" -d "{\"url\":\"https://everettshop.kush21.com/\",\"tier\":\"browser\",\"headless\":true,\"timeout\":45000}"
```
Scan the returned `urls[]` for `dutchie.com/embedded-menu/<slug>` or a `graphql` call carrying the retailer/store id.

**Route B — raw HTML lookup (HANDOFF method):** load the host page with the browser tier and no intercept pattern, then grep `raw_html` for `dutchie--embed__script` or `dutchie.com/embedded-menu`.

Once a slug/id is found, confirm it loads a real menu (intercept yields a `GetSpecialMenuCards` op), then set the constant in the corresponding file:
- `server/scrapers/jet-cannabis-everett.ts`
- `server/scrapers/kush21-everett-evergreen.ts`

> The embed URL pattern is `https://dutchie.com/embedded-menu/<storeId>/`. `<storeId>` may be a slug (`happy-time-mt-vernon`) or a hash id (`689cd028ea84b6a605458416`) — use whichever form makes the embed URL load.

**If either ID cannot be resolved by any route → HALT and escalate to Erik** (per the "all three stores live" done bar; do not mark the pass done with an unresolved store).

## 2. Reconcile the fixture (CAP-3)

Capture one real `/scrape` response for any resolved store and locate the `GetSpecialMenuCards` entry in `intercepted[]`. Check three points against `server/scrapers/__fixtures__/dutchie-specials.json` and the assumptions in `server/scrapers/_dutchie.ts`:

| Check | Fixture assumes | Verify live |
|-------|-----------------|-------------|
| JSON path | `data.specialMenuCards.specials` | Path to the specials array is identical |
| Discount unit | whole-number percent (`20`) | Not a fraction (`0.2`) — if fraction, transform stores the wrong value |
| Time window | `window:{start,end}` drives `happy_hour` vs `daily` | Field name + presence; calendar sale **dates** are NOT time-of-day windows |

- **Shapes match** → replace `dutchie-specials.json` with a sanitized real capture; note it as the reconciled contract.
- **Any material delta** → document the exact difference and **HALT for Erik**. Do NOT rework `transformSpecials` silently — the 4.3 boundary is frozen (SPEC Constraint 1).

## 3. End-to-end flow (CAP-4)

**There is no standalone `runScrapers` CLI script.** The orchestrator is wired to run automatically **on server boot** (`server/index.ts:32` — `void runScrapers()`), then hourly. So the trigger for the live pass is simply to start the dev server with the Python service already up:

```bash
cd C:\Users\erikc\Dev\Happy\server
npm run dev             # tsx watch index.ts → runs runScrapers() once on boot, then every 60 min
```

Watch the console for the boot scrape, then verify (in another terminal):
- `server/data/data.json` — all three Dutchie dispensaries (`the-joint-everett`, `jet-cannabis-everett`, `kush21-everett-evergreen`) have non-empty `deals`, `stale: false`.
- Deals satisfy the contract: `daysValid` ∈ full-lowercase day names or `everyday`; `startTime`/`endTime` are 24h `HH:MM` or both `null`; `discountPct` is a number or `null`.
- `GET http://localhost:3001/api/data` returns those deals (default `PORT` 3001).
- `logs.json` shows `ok` for each store.

> **Reading the logs is load-bearing.** `runScrapers.ts:42` treats an empty/normalized-away return as `error: scraper returned no deals` + `stale: true` — a store with **genuinely zero active specials** looks identical to a scrape failure in `data.json`; only the `logs.json` message distinguishes them (`scraper returned no deals` vs a connection/`ECONNREFUSED` error). Also note `normalizeDeals` (data-hardening) drops degenerate deals (zero-length/unparseable windows, bad `daysValid`) **before** the count, so a transform that returns junk can still land a store in stale. If a store goes stale with `scraper returned no deals` despite the embed loading specials live, suspect a transform/normalize mismatch — that is a CAP-3 shape delta → **HALT for Erik**.

> If a repeatable headless one-off trigger (without booting the full server + hourly loop) is wanted, that's a new `scrape` npm script / runner — **out of scope for this pass; ask Erik before adding one.**

## 4. Graceful-degradation check (CAP-5)

Stop the Python service (Ctrl-C in Terminal A) and re-run the scrape:
- Express process does **not** crash.
- Each Dutchie store → `stale: true`, previous `deals` preserved (not overwritten with `[]`).
- `logs.json` records the per-store error.

Restart the service afterward if continuing.

## 5. Close-out

- `cd server && npx tsc --noEmit` clean; `npm test` green (offline fixtures unchanged except a reconciled `dutchie-specials.json`).
- Update `_bmad-output/implementation-artifacts/deferred-work.md`: strike the two cleared live-pass items (IDs resolved, fixture reconciled); leave the evidence-fixture relocation item.
- Update `sprint-status.yaml`: `4-3-live-pass` done (and note it the same session per Erik's standing rule).
- If anything was re-deferred (e.g. an unresolvable ID Erik chose to punt), record it explicitly in `deferred-work.md` with findings.

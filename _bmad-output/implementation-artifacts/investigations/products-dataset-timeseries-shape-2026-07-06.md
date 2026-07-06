# Products Dataset — Time-Series Shape & Readiness

**Date:** 2026-07-06
**Scope:** What the `products.json` longitudinal record actually contains, what the system derives from it today, and where it strains.

---

## What the data actually is

It has **real time-depth**. 5,219 products, 33,169 observations across 11.7 days (Jun 24 → Jul 6). Averages 6.4 observations per product, and **90.7% of products have been seen on more than one day** — median history span of 5 days. This is a genuine longitudinal price record, not a one-time snapshot.

Two sources feed it, at two reliability tiers:

- **Dutchie** — 16 stores, an observation every single day with **no gaps**, ~1,800–2,900/day. Reliable.
- **Weedmaps** — 8 stores, feeding since Jun 30, but **uneven**: it missed Jul 3 entirely and its daily volume swings (418 → 838 → 591). The series has holes.

Two stores produce nothing:
- `the-vault-silvana` — genuinely empty.
- `caravan-cannabis-burlington` — appears to be a **silent extraction failure worth chasing**.

---

## What the system does with it

It **normalizes and matches, in batch**. Incoming records become product entities with timestamped observations; a cross-store matcher groups them by product identity + weight + category and computes honesty-gated price disparities across stores.

That derivation runs on a **full re-read of the entire dataset per request** — there's no query layer and no incremental computation.

The **time dimension is captured but not yet mined**. The observations carry timestamps and now span two weeks, so price-change-over-time and cross-store correlation are computable — but nothing computes them yet. The current output is **point-in-time disparities only**.

---

## Where it's straining

The store is a **single growing file**. It's 21.7 MB and climbing ~2–3 MB/day, committed to git each run. That trajectory runs into git's file-size limits within weeks — **the first warnings land around Jul 23**.

And any time-series work is blocked by the same shape: you can't compute incremental deltas on a file you re-parse whole every time.

---

## The one honest caveat for anything time-based

The time series is real but **not uniformly dense** — Dutchie is daily-clean, Weedmaps is gappy. Any trend or delta logic **has to tolerate missing days**, or the gappy source will manufacture false "price held / dropped" signals.

---

## Implications / next moves

1. **Storage shape is the near-term blocker.** ~Jul 23 git-size warnings; time-series derivation is impossible on a whole-file re-parse. A query/incremental layer is prerequisite to mining the time dimension.
2. **Chase the silent failure.** `caravan-cannabis-burlington` yields nothing but isn't confirmed-empty like `the-vault-silvana`.
3. **Gap-tolerance is a hard requirement** for any trend/delta feature — model missing days explicitly rather than inferring "unchanged."

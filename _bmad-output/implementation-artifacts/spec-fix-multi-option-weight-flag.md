---
title: 'Flag multi-option per-unit packs so the disparity engine excludes them'
type: 'bugfix'
created: '2026-07-06'
status: 'done'
baseline_commit: '339f358a033abeb881b3786741f42a19d2fb6578'
context: ['{project-root}/_bmad-output/implementation-artifacts/investigations/data-pipeline-forensic-audit-2026-07-05-investigation.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `normalizeProduct` runs its weight-reconciliation sanity check only when `raw.options.length === 1` (`server/utils/normalizeProduct.ts:137`), so a multi-option pack whose option labels state PER-UNIT weight computes a wrong `pricePerGram` with NO flag, slips the disparity poison-gate (`crossStoreValue.ts` `EXCLUDED_FLAGS`), and can seed false cross-store disparities. Two records are live today (e.g. "Fire Bros | NYC Vapor | Pre-Roll 2 Pack": option `1g` stored as $12/g when 2×1g = 2g total → true $6/g), unflagged.

**Approach:** In the normalization chokepoint, flag any weight-based record that is BOTH multi-option AND a real pack (`packCount > 1`) with a new `'unreconciled-pack'` flag — its per-option weights cannot be reconciled against a single `netWeight`, so it must be flagged rather than silently trusted. Add that flag to `EXCLUDED_FLAGS` so the disparity engine drops it exactly like its single-option `weight-mismatch` siblings.

## Boundaries & Constraints

**Always:** Preserve the honesty posture — flag-don't-silently-trust. Keep stored `pricePerGram`/`pricePerItem` computed as they are today (do not attempt to guess-correct per-unit vs total; flagging + exclusion is the honest move). TypeScript strict mode. New behavior is unit-tested. The flag is additive; existing flags (`weight-mismatch`, `assumed-single`, `unparseable-weight`, `unparseable-pack`) are untouched.

**Ask First:** Any change that would ALTER stored economics of existing records rather than just adding a flag (e.g. retroactively multiplying weightGrams by packCount) — that is a data-semantics change, not this fix.

**Never:** Do NOT flag honest multi-option size ladders — single joints offered at 1g/¼oz (`packCount === 1`) and the 355 multi-option Flower size-ladder records (`packCount` null or 1) must stay unflagged. Do NOT rewrite history in `products.json` (the flag applies on the next scrape's identity refresh; no data migration). Do NOT touch the Deal pipeline, `data.json`, or `/api/data`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Per-unit 2-pack | Pre-Roll, `name` "…2 Pack", 2 options (`1g`,`1/4oz`), `packCount=2` | record `flags` contains `'unreconciled-pack'` | N/A |
| Honest size ladder (single) | Pre-Roll, 2 options (`1g`,`1/4oz`), no pack word, `packCount=1` | `flags` does NOT contain `'unreconciled-pack'` | N/A |
| Multi-option flower | Flower, 3 options (`1g`,`3.5g`,`7g`), `packCount=null` | `flags` does NOT contain `'unreconciled-pack'` | N/A |
| Single-option pack (existing path) | 1 option, weight contradiction | `flags` contains `'weight-mismatch'` only (unchanged) | N/A |
| Non-weight multi-option pack | Edible, 2 options, `packCount=20` | NOT flagged `'unreconciled-pack'` (not weight-based; already category-excluded) | N/A |
| Disparity exclusion | a record carrying `'unreconciled-pack'` | excluded from `buildMatchReport` output, counted in `excludedFlagCount` | N/A |

</frozen-after-approval>

## Code Map

- `server/utils/normalizeProduct.ts` -- normalization chokepoint; add the `'unreconciled-pack'` flag beside the existing single-option reconciliation block (`:136-151`). `packCount` is resolved at `:106`; `weightBased` at `:96`.
- `server/utils/crossStoreValue.ts` -- add `'unreconciled-pack'` to `EXCLUDED_FLAGS` (`:31`) so the flag actually causes exclusion (gate 1, `:81`).
- `server/utils/normalizeProduct.test.ts` -- flag-assertion conventions (`.toContain`/`.not.toContain` on `rec.flags`).
- `server/utils/crossStoreValue.test.ts` -- existing "EXCLUDES weight-mismatch" test (`:95`) is the pattern for the exclusion test.

## Tasks & Acceptance

**Execution:**
- [x] `server/utils/normalizeProduct.ts` -- after the single-option reconciliation block, add: `if (weightBased && raw.options.length > 1 && packCount !== null && packCount > 1) flags.push('unreconciled-pack')`. Add a comment explaining the multi-option reconciliation gap this closes (reference the single-option-only limitation).
- [x] `server/utils/crossStoreValue.ts` -- add `'unreconciled-pack'` to the `EXCLUDED_FLAGS` set; update the header honesty-gate comment (`:14-31`) to name the new flag.
- [x] `server/utils/normalizeProduct.test.ts` -- unit-test the I/O matrix rows: per-unit 2-pack flagged; honest single size-ladder NOT flagged; multi-option flower NOT flagged; non-weight multi-option pack NOT flagged.
- [x] `server/utils/crossStoreValue.test.ts` -- test that a record carrying `'unreconciled-pack'` is excluded and counted in `excludedFlagCount`.

**Acceptance Criteria:**
- Given a multi-option weight-based record with `packCount > 1`, when normalized, then `flags` includes `'unreconciled-pack'`.
- Given a multi-option weight-based record with `packCount` null or 1 (size ladder), when normalized, then `flags` does NOT include `'unreconciled-pack'`.
- Given a record carrying `'unreconciled-pack'`, when `buildMatchReport` runs, then that record contributes to `excludedFlagCount` and to zero disparities.
- Given the existing single-option reconciliation path, when normalized, then its behavior and flags are byte-for-byte unchanged.

## Design Notes

The discriminator `packCount > 1` is exact: it isolates the 2 real per-unit packs from the 368 honest multi-option records (355 Flower ladders + 13 single-joint pre-roll ladders at `packCount=1` + Vaporizer/Concentrate ladders). `packCount` is never null for pre-rolls (`isPreRoll ? parsedPack ?? 1`), and the `!== null` guard keeps it strict-safe for other categories. A distinct flag name (`'unreconciled-pack'`) — not reusing `'weight-mismatch'` — records the honest reason: we did not DETECT a contradiction, we could not RECONCILE a multi-option pack (no per-option `netWeight`). Both live in `EXCLUDED_FLAGS`, so exclusion is identical.

## Verification

**Commands:**
- `cd server && npx vitest run utils/normalizeProduct.test.ts utils/crossStoreValue.test.ts` -- expected: all pass, including the 5 new cases.
- `cd server && npm run build` -- expected: `tsc` clean (strict mode).
- `cd server && npx vitest run` -- expected: full server suite green (no regression).

## Suggested Review Order

- The fix itself: the new guard that flags a multi-option pack whose labels are per-unit.
  [`normalizeProduct.ts:152`](../../server/utils/normalizeProduct.ts#L152)

- The exclusion wiring: the new flag joins the disparity poison-gate set.
  [`crossStoreValue.ts:31`](../../server/utils/crossStoreValue.ts#L31)

- Flag behavior tests: fires @ packCount=2 pack; silent @ size-ladders / edibles.
  [`normalizeProduct.test.ts:300`](../../server/utils/normalizeProduct.test.ts#L300)

- Exclusion test: a flagged record is dropped and counted in excludedFlagCount.
  [`crossStoreValue.test.ts:104`](../../server/utils/crossStoreValue.test.ts#L104)

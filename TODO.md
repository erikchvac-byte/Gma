# TODO

Operator / counsel follow-ups that are deliberately NOT code-blocking.

## Tune `DESCRIPTION_BLOCKLIST` as real listings warrant

**File:** `server/utils/sanitizeDescription.ts` — the exported `DESCRIPTION_BLOCKLIST` constant.

**What it is:** the operator-owned list of whole-word, case-insensitive terms that
**suppress** a scraped `deal.description` (blank the field, keep the deal) at the ingest
chokepoint (`normalizeDeals` ← `applyIngest` ← `POST /api/ingest`). It is a *tuning
surface*, not logic — edit the array, never the matching code below it.

**When to revisit:** once real Dutchie listings are flowing, watch for —
- **False positives** (legit copy wrongly blanked) → remove the offending term.
  Precedent: `candy` was already dropped because it killed "Cotton Candy" / "Candy Kush".
  `kid` / `cartoon` are the next most likely to collide with real product/strain names.
- **False negatives** (a youth-appeal or therapeutic-claim phrasing the list misses) → add the term.

**Context:** introduced by story `compliance-launch-gate` (ADR-035). This is the Track-A
operator/counsel half of that work; the Track-B engineering posture already shipped.
See `_bmad-output/implementation-artifacts/compliance-launch-gate.md`.

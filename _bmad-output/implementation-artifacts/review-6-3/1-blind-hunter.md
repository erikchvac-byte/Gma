# Review Role 1 — Blind Hunter (diff only)

Run this in a **fresh session**, ideally a **different LLM** than the one that wrote the code. Invoke the `bmad-review-adversarial-general` skill.

## What you get
- **ONLY** the diff at `_bmad-output/implementation-artifacts/review-6-3/diff.patch`.
- Do **NOT** open the rest of the project. Do **NOT** read the spec. You are blind on purpose — judge the change purely on what the diff shows.

## Your job
Hunt for defects introduced by this change, reasoning only from the diff:
- Logic errors, broken conditionals, off-by-one, inverted booleans.
- React pitfalls: stale closures, effect dependency bugs, missing cleanup, focus/scroll leaks, key collisions, controlled/uncontrolled drift.
- Accessibility regressions visible in the markup (roles, labels, aria, focus order).
- Anything that looks like it would fail at runtime, leak state, or surprise a user.
- Test quality: assertions that would pass even if the code were wrong (tautological/over-loose matchers).

## Output
A deduplicated list of findings. For each: **severity** (critical/high/medium/low), **file:line or symbol**, **what's wrong**, **why it matters**. If you find nothing in a category, say so briefly. Be adversarial but precise — no speculation about code you cannot see.

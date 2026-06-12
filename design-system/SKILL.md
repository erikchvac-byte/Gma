---
name: gmas-helper-design
description: Use this skill to generate well-branded interfaces and assets for Gma's Helper (a cannabis happy-hour deals web app — "is it worth the drive?"), either for production or throwaway prototypes/mocks. Contains design guidelines, tokens, fonts, icons, and UI kit components.
user-invocable: true
---

Read `readme.md` and `CLAUDE.md` in this folder, then explore the files you need.

For visual artifacts (mocks, prototypes, slides): copy assets out and create static HTML. For production code: link `styles.css`, load `_ds_bundle.js`, and read components off `window.GmaSHelperDesignSystem_45dd11` — or import the `.jsx` sources directly (plain React).

If invoked without other guidance, ask what to build, then act as an expert designer producing HTML artifacts or production code as needed.

## Fast orientation
- **What it is:** a single-purpose tool answering "is this happy-hour deal worth the drive, right now?" — honest gas-vs-discount math, a 21+ age gate, a distance slider. Budget-aware adults; **not** a stoner brand.
- **Authority:** the finalized UX spines (`Happy/_bmad-output/planning-artifacts/ux-designs/ux-Happy-2026-06-11/DESIGN.md` + `EXPERIENCE.md`) win on conflict with anything in this folder.
- **Foundations:** link `styles.css` (the only entry point). Tokens in `tokens/`; self-hosted Public Sans + IBM Plex Mono in `assets/fonts/`; self-hosted Lucide icons + helpers in `assets/icons/` and `assets/icons.js`.
- **Components:** Button, IconButton, Badge, Card, RangeSlider, TextField, Select, Skeleton/SkeletonFeed, Notice. The `.d.ts` files are the authoritative prop contracts; `.prompt.md` files show usage.
- **Full app reference:** `ui_kits/app/` is a clickable recreation (age gate → feed → settings sheet).

## Non-negotiables
- One action color: green-700. Amber = urgency/expiring only. Red = errors.
- Cards are a 1px gray-200 hairline on white — **flat, not shadowed**.
- Money / distance / time are always tabular IBM Plex Mono.
- Form-field borders use `--border-field` (gray-500) — never gray-300.
- Voice: say it straight. Sentence case. No hype, no cannabis slang, **no emoji**.
- 8px corners (`--radius-lg`), 4px spacing grid, 44px hit targets (slider included), always-visible focus rings.
- Discount + gas cost side by side, never a net-savings figure (ADR-009). No Save buttons — selections apply immediately (FR-8).

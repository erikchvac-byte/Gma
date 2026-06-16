---
baseline_commit: a4a3c68cf8eb9cf6df65d5e4bcd31f12dfd3a65c
---

# Story 6.2: Primitive Component Library — 10 UI Primitives + Lucide Icon Component

Status: done

## Story

As the operator of Gma's Helper,
I want the Gma's Helper Design System's **ten reusable primitive components** (Button, IconButton, Badge, Card, RangeSlider, TextField, Select, Skeleton/SkeletonFeed, Notice) built as typed React components in the client, plus a **self-hosted Lucide icon component** — each implemented to their `.d.ts` contracts and styled by a ported `components.css` — so that 6-3's surface re-skin can consume them without inventing any styles, props, or accessibility patterns.

## Context & Scope

This is **Story 2 of Epic 6**. The token layer from 6-1 is live: `client/src/styles/tokens.css` defines all `gma-*` CSS custom properties; `@theme` wires them to Tailwind utilities; Public Sans + IBM Plex Mono are self-hosted. The `components.css` from the design system import (`imports/gmas-helper-design-system/components/components.css`) is the reference: every `gma-btn`, `gma-card`, `gma-badge`, etc. class resolves exclusively through `var(--token-name)` — no hardcoded hexes.

**What this story builds:**
- `client/src/styles/components.css` — verbatim port of the design system's `components.css` (wired to the 6-1 token layer)
- `client/src/components/ui/` — new directory of 10 TSX primitive components + `Icon.tsx` + barrel `index.ts`
- Colocated `*.test.tsx` files for every component
- `index.css` update — add `@import "./styles/components.css"` after the tokens import

**What this story does NOT do (scope boundary):**
- Does NOT modify AgeGate, DealCard, DealFeed, DistanceFilter, StaleIndicator, or VehicleSelector — those are 6-3
- Does NOT add any npm runtime dependency (Lucide is vendored as a const of SVG paths — no `lucide-react` package)
- Does NOT modify `client/src/styles/tokens.css` (6-1 output is final unless a token is found missing from the file)

## Acceptance Criteria

1. **`client/src/styles/components.css` exists and is imported.** The file contains the design system's component styles verbatim — all `gma-btn`, `gma-iconbtn`, `gma-card`, `gma-badge`, `gma-field`, `gma-input`, `gma-select`, `gma-range`, `gma-skeleton`, `gma-notice` class declarations, values referencing only token `var()` references. `index.css` imports it after `@import "./styles/tokens.css"`. Zero hardcoded hex values anywhere in the file.

2. **All 10 primitive TSX components exist in `client/src/components/ui/`.** Files: `Button.tsx`, `IconButton.tsx`, `Badge.tsx`, `Card.tsx`, `RangeSlider.tsx`, `TextField.tsx`, `Select.tsx`, `Skeleton.tsx` (exports both `Skeleton` and `SkeletonFeed`), `Notice.tsx`, and a barrel `index.ts` exporting all of them. Every component implements its `.d.ts` contract exactly — same props, same defaults, same TypeScript types (see Dev Notes: Contracts).

3. **Lucide icon component exists and covers the required icon set.** `client/src/components/ui/Icon.tsx` exports an `<Icon name="..." size={n} strokeWidth={n} />` typed React component (no runtime npm package). The icon paths are vendored from `assets/icons.js` as a TypeScript const. The required icon names are: `settings`, `navigation`, `clock`, `fuel`, `x`, `car`, `shield-check`, `triangle-alert`, `info`, `chevron-down`. Additional icons from the import may be included. Every `<Icon>` renders `aria-hidden="true"` (callers provide accessible labels on the control, not the icon).

4. **RangeSlider accessibility contract fulfilled.** When `valueText` is provided (`"25 miles"` / `"1 mile"`), the underlying `<input type="range">` carries `aria-valuetext` mirroring `valueText`; when not provided, `aria-valuetext` is omitted (the numeric value speaks for itself). The accessible name comes from the `label` association via `htmlFor`/`id`.

5. **No new test failures and no regressions.** `tsc -b && vite build` clean. `vitest run` — all 198 pre-existing tests pass unchanged. New primitive tests all green.

6. **Primitives are tested.** Each primitive has a colocated `*.test.tsx` with tests covering: renders with default props, renders each variant/state combination, applies extra `className` props, and for controlled components (RangeSlider, Select, TextField) fires the correct callback with the correct value. Minimum: one test per AC-relevant behavior. Total new tests: ≥ 30.

7. **`barrel index.ts` exports all.** `import { Button, IconButton, Badge, Card, RangeSlider, TextField, Select, Skeleton, SkeletonFeed, Notice, Icon } from '../components/ui'` compiles cleanly in TypeScript strict mode.

8. **Scope boundary holds.** No existing surface component (AgeGate, DealCard, DealFeed, DistanceFilter, StaleIndicator, VehicleSelector) is modified. The primitives are a new parallel layer; the existing components continue to use their current Tailwind utility classes.

## Pre-conditions

- [x] Story 6-1 complete: `client/src/styles/tokens.css` present; 7 woff2 fonts vendored; `index.css` = `@import "tailwindcss"` + `@import "./styles/tokens.css"`; build clean; 198 tests green.
- [x] Design system import present at `_bmad-output/planning-artifacts/ux-designs/ux-Happy-2026-06-11/imports/gmas-helper-design-system/`

## Tasks / Subtasks

- [x] **Task 0 — Pre-flight check** (guards AC 5)
  - [x] Run `cd client && npm run build` — confirm clean before touching anything.
  - [x] Run `cd client && npx vitest run` — confirm 198/198 green.
  - [x] Confirm `client/src/styles/tokens.css` exists. Confirm `client/src/index.css` contains both `@import "tailwindcss"` and `@import "./styles/tokens.css"`.

- [x] **Task 1 — Port `components.css`** (AC 1)
  - [x] Read `_bmad-output/planning-artifacts/ux-designs/ux-Happy-2026-06-11/imports/gmas-helper-design-system/components/components.css` in full.
  - [x] Write it verbatim to `client/src/styles/components.css`. Zero changes to values — every value must reference a `var(--*)` token; the file is already written this way; do not reconstruct from memory.
  - [x] Add `@import "./styles/components.css";` to `client/src/index.css` after the tokens import line. The final order: `@import "tailwindcss"` → `@import "./styles/tokens.css"` → `@import "./styles/components.css"`.
  - [x] Grep `client/src/styles/components.css` for any hex literal (`#[0-9a-fA-F]{3,6}`) — confirm zero hits. (The token layer already defines every hex; components only reference `var()`.)

- [x] **Task 2 — Vendor Lucide icon set + build `<Icon>` component** (AC 3)
  - [x] Read `_bmad-output/planning-artifacts/ux-designs/ux-Happy-2026-06-11/imports/gmas-helper-design-system/assets/icons.js` for all SVG inner-path strings.
  - [x] Create `client/src/components/ui/Icon.tsx`. Use a `const ICONS: Record<IconName, string>` typed with a string union of all icon names. The component renders an `<svg>` with `dangerouslySetInnerHTML={{ __html: ICONS[name] }}` — safe because the inner HTML is a compile-time constant, never user input. Props: `name: IconName` (required), `size?: number` (default 20), `strokeWidth?: number` (default 2), `className?: string`. Always renders `aria-hidden="true"`. Full SVG attrs: `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `strokeLinecap="round"`, `strokeLinejoin="round"`.
  - [x] Required icon names at minimum (see AC 3): `settings`, `navigation`, `clock`, `fuel`, `x`, `car`, `shield-check`, `triangle-alert`, `info`, `chevron-down`. Include all remaining icons from the import as well — they cost nothing.
  - [x] Write `client/src/components/ui/Icon.test.tsx` — tests: renders with correct size attribute, renders `aria-hidden="true"`, renders a known icon path, TypeScript rejects unknown icon name at compile time (type test — use `// @ts-expect-error` to assert).

- [x] **Task 3 — Button and IconButton components** (AC 2, 6)
  - [x] Create `client/src/components/ui/Button.tsx` implementing `ButtonProps` (from Dev Notes: Contracts). Applies classes: `gma-btn gma-btn--{variant}` + optional `gma-btn--sm` + optional `gma-btn--block`. When `href` is provided and `disabled` is false, renders `<a href={href}>` instead of `<button>`. Spreads remaining props. Default: `variant="primary"`, `size="md"`, `block=false`.
  - [x] Create `client/src/components/ui/Button.test.tsx` — tests: renders primary button, renders each variant class, sm size class, block class, renders as anchor when href provided, disabled prevents anchor (renders button instead), forwards className, renders iconLeft/iconRight.
  - [x] Create `client/src/components/ui/IconButton.tsx` implementing `IconButtonProps`. Class: `gma-iconbtn` + optional `gma-iconbtn--sm` + optional `gma-iconbtn--outlined`. `aria-label` is required in the type — enforced by the `.d.ts` contract.
  - [x] Create `client/src/components/ui/IconButton.test.tsx` — tests: renders with aria-label, applies sm class, applies outlined class, forwards extra props.

- [x] **Task 4 — Badge and Card components** (AC 2, 6)
  - [x] Create `client/src/components/ui/Badge.tsx` implementing `BadgeProps`. Class: `gma-badge gma-badge--{variant}`. Show the `gma-badge__dot` span (aria-hidden) when `dot === true` OR `variant === 'fresh'` OR `variant === 'stale'`. Default: `variant="neutral"`, `dot=false`.
  - [x] Create `client/src/components/ui/Badge.test.tsx` — tests: renders neutral badge, renders urgent badge class, renders fresh badge with dot, renders stale badge with dot, renders dot=true forces dot on neutral, discount variant class.
  - [x] Create `client/src/components/ui/Card.tsx` implementing `CardProps`. Class: `gma-card` + optional `gma-card--flush` / `gma-card--roomy` + optional `gma-card--interactive` + optional `gma-card--urgent`. Renders as `as` element (default `div`). Spreads remaining props. Default: `padding="default"`, `interactive=false`, `urgent=false`, `as="div"`.
  - [x] Create `client/src/components/ui/Card.test.tsx` — tests: renders div by default, renders as article when `as="article"`, flush/roomy padding classes, interactive class, urgent class, forwards className.

- [x] **Task 5 — RangeSlider component** (AC 2, 4, 6)
  - [x] Create `client/src/components/ui/RangeSlider.tsx` implementing `RangeSliderProps`. Structure per the import reference (see Dev Notes: RangeSlider anatomy): outer `div.gma-range`, top row `div.gma-range__top` with `label.gma-range__label` (associated via `htmlFor`/`useId`) and `span.gma-range__value`, then `input.gma-range__input[type=range]`, then optional ticks `div.gma-range__ticks`. The `<input>` carries `aria-valuetext` only when `valueText` is a string (see AC 4).
  - [x] Create `client/src/components/ui/RangeSlider.test.tsx` — tests: renders label and value, calls onChange with numeric value, aria-valuetext present when valueText provided, aria-valuetext absent when no valueText, showTicks renders min/max labels, min/max/step attributes forwarded.

- [x] **Task 6 — TextField and Select components** (AC 2, 6)
  - [x] Create `client/src/components/ui/TextField.tsx` implementing `TextFieldProps`. Structure: `div.gma-field`, optional `label.gma-field__label`, `input.gma-input` (+ `gma-input--mono` when `mono`), then error `span.gma-field__error[id]` or hint `span.gma-field__hint[id]`. Set `aria-invalid="true"` and `aria-describedby` when error provided; `aria-describedby` hint id when hint provided. Uses `useId()` to associate label/error/hint.
  - [x] Create `client/src/components/ui/TextField.test.tsx` — tests: renders with label, renders error state with aria-invalid, renders hint, mono class applied, no aria-describedby when neither hint nor error, error overrides hint.
  - [x] Create `client/src/components/ui/Select.tsx` implementing `SelectProps`. Structure: `div.gma-field` (when label present) else plain `div`, optional `label.gma-field__label`, `select.gma-select`. Supports both `options` array and `children`. `placeholder` renders as a disabled `<option value="">`. Uses `useId()`.
  - [x] Create `client/src/components/ui/Select.test.tsx` — tests: renders with label, renders options array, renders with placeholder, renders children when no options, fires onChange with value, forwarded disabled attribute.

- [x] **Task 7 — Skeleton and SkeletonFeed components** (AC 2, 6)
  - [x] Create `client/src/components/ui/Skeleton.tsx` exporting both `Skeleton` and `SkeletonFeed`. `Skeleton`: `div.gma-skeleton` with inline `style={{ width, height, borderRadius }}` (number values converted to `${n}px`), `aria-hidden="true"`. `SkeletonFeed`: `div[role="status"][aria-label="Loading deals"]` wrapping `rows` (default 3) `<Skeleton height={64} />` items in a `style={{ display: 'grid', gap: 'var(--gap-feed)' }}` grid.
  - [x] Create `client/src/components/ui/Skeleton.test.tsx` — tests: renders with correct width/height style, numeric values convert to px, custom radius applied, aria-hidden present, SkeletonFeed renders 3 rows default, SkeletonFeed rows prop honored, SkeletonFeed has role="status".

- [x] **Task 8 — Notice component** (AC 2, 6)
  - [x] Create `client/src/components/ui/Notice.tsx` implementing `NoticeProps`. Class: `gma-notice gma-notice--{variant}`. Renders as `<p>`. Icon (when provided) in `span.gma-notice__icon[aria-hidden="true"]`, content in `<span>`. Spreads `role` and other props. Default: `variant="default"`.
  - [x] Create `client/src/components/ui/Notice.test.tsx` — tests: renders default notice, muted class, error class, urgent class, renders icon when provided, no icon span when not provided, forwarded role prop.

- [x] **Task 9 — Barrel export and TypeScript validation** (AC 7)
  - [x] Create `client/src/components/ui/index.ts` re-exporting everything: `Button`, `ButtonProps`, `IconButton`, `IconButtonProps`, `Badge`, `BadgeProps`, `Card`, `CardProps`, `RangeSlider`, `RangeSliderProps`, `TextField`, `TextFieldProps`, `Select`, `SelectProps`, `SelectOption`, `Skeleton`, `SkeletonFeed`, `SkeletonProps`, `SkeletonFeedProps`, `Notice`, `NoticeProps`, `Icon`, `IconName`.
  - [x] Confirm `tsc -b` compiles the barrel cleanly with zero errors.

- [x] **Task 10 — Final validation** (AC 5, 8)
  - [x] Run `cd client && npm run build` (`tsc -b && vite build`) — clean. Fix any TS errors before proceeding.
  - [x] Run `cd client && npx vitest run` — all tests green. Pre-existing 198 pass unchanged; new primitive tests green.
  - [x] Grep `client/src/components` for any import of the ui primitives from existing surface components (AgeGate, DealCard, DealFeed, DistanceFilter, StaleIndicator, VehicleSelector) — confirm zero. Scope boundary holds.

## Dev Notes

### File map — what to create

```
client/src/styles/components.css               NEW — verbatim port of components/components.css
client/src/index.css                           UPDATE — add @import "./styles/components.css"
client/src/components/ui/Button.tsx            NEW
client/src/components/ui/Button.test.tsx       NEW
client/src/components/ui/IconButton.tsx        NEW
client/src/components/ui/IconButton.test.tsx   NEW
client/src/components/ui/Badge.tsx             NEW
client/src/components/ui/Badge.test.tsx        NEW
client/src/components/ui/Card.tsx              NEW
client/src/components/ui/Card.test.tsx         NEW
client/src/components/ui/RangeSlider.tsx       NEW
client/src/components/ui/RangeSlider.test.tsx  NEW
client/src/components/ui/TextField.tsx         NEW
client/src/components/ui/TextField.test.tsx    NEW
client/src/components/ui/Select.tsx            NEW
client/src/components/ui/Select.test.tsx       NEW
client/src/components/ui/Skeleton.tsx          NEW (exports Skeleton + SkeletonFeed)
client/src/components/ui/Skeleton.test.tsx     NEW
client/src/components/ui/Notice.tsx            NEW
client/src/components/ui/Notice.test.tsx       NEW
client/src/components/ui/Icon.tsx              NEW
client/src/components/ui/Icon.test.tsx         NEW
client/src/components/ui/index.ts              NEW (barrel)
```

**Do NOT modify:** AgeGate, DealCard, DealFeed, DistanceFilter, StaleIndicator, VehicleSelector, tokens.css, App.tsx.

---

### TypeScript contracts — implement these exactly

The `.d.ts` files in the import are the specification. Below is the binding contract for each component. Do not add props not in the contract; do not drop props in the contract.

**Button** (`ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>`):
```ts
variant?: 'primary' | 'secondary' | 'ghost' | 'danger'   // default: 'primary'
size?: 'md' | 'sm'                                         // default: 'md'
block?: boolean                                             // default: false
iconLeft?: React.ReactNode
iconRight?: React.ReactNode
href?: string        // renders <a> when provided and not disabled
children?: React.ReactNode
```

**IconButton** (`IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>`):
```ts
size?: 'md' | 'sm'           // default: 'md'
outlined?: boolean            // default: false
'aria-label': string          // REQUIRED — enforced by type
children?: React.ReactNode
```

**Badge** (`BadgeProps extends React.HTMLAttributes<HTMLSpanElement>`):
```ts
variant?: 'neutral' | 'fresh' | 'stale' | 'urgent' | 'discount'  // default: 'neutral'
dot?: boolean                                                        // default: false
children?: React.ReactNode
```

**Card** (`CardProps extends React.HTMLAttributes<HTMLElement>`):
```ts
padding?: 'default' | 'flush' | 'roomy'   // default: 'default'
interactive?: boolean                       // default: false
urgent?: boolean                            // default: false
as?: keyof JSX.IntrinsicElements           // default: 'div'
children?: React.ReactNode
```

**RangeSlider** (`RangeSliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'>`):
```ts
label?: React.ReactNode
value: number                           // controlled — required
onChange?: (value: number) => void     // receives the numeric value
min?: number                            // default: 0
max?: number                            // default: 100
step?: number                           // default: 1
valueText?: React.ReactNode            // override the display; also drives aria-valuetext when string
showTicks?: boolean                     // default: false
minLabel?: React.ReactNode
maxLabel?: React.ReactNode
```

**TextField** (`TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement>`):
```ts
label?: React.ReactNode
hint?: React.ReactNode
error?: React.ReactNode     // also sets aria-invalid + red border
mono?: boolean              // default: false
```

**Select** (`SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement>`):
```ts
label?: React.ReactNode
options?: { value: string; label: string }[]   // convenience array
placeholder?: string                             // disabled leading <option value="">
```

**Skeleton**:
```ts
// Skeleton
width?: number | string   // default: '100%'; number → px
height?: number | string  // default: 16; number → px
radius?: number | string  // overrides border-radius; number → px
// SkeletonFeed
rows?: number             // default: 3
```

**Notice** (`NoticeProps extends React.HTMLAttributes<HTMLParagraphElement>`):
```ts
variant?: 'default' | 'muted' | 'error' | 'urgent'   // default: 'default'
icon?: React.ReactNode
children?: React.ReactNode
```

**Icon** (new component — not in the import .d.ts, we define the contract):
```ts
name: IconName             // string union of all vendored icon names
size?: number              // default: 20
strokeWidth?: number       // default: 2
className?: string
```

---

### CSS class system — `gma-*` BEM

The primitives use class-based styling (not Tailwind utilities). Copy the CSS class logic from the import's `.jsx` files exactly. The class map for each component:

| Component | Base class | Modifiers |
|---|---|---|
| Button | `gma-btn gma-btn--{variant}` | `gma-btn--sm`, `gma-btn--block` |
| IconButton | `gma-iconbtn` | `gma-iconbtn--sm`, `gma-iconbtn--outlined` |
| Badge | `gma-badge gma-badge--{variant}` | (dot span: `gma-badge__dot`) |
| Card | `gma-card` | `gma-card--flush`, `gma-card--roomy`, `gma-card--interactive`, `gma-card--urgent` |
| RangeSlider | `gma-range` | inner: `__top`, `__label`, `__value`, `__input`, `__ticks` |
| TextField | `gma-field` | `gma-field__label`, `gma-input`, `gma-input--mono`, `gma-field__hint`, `gma-field__error` |
| Select | `gma-field` (with label) or bare `div` | `gma-field__label`, `gma-select` |
| Skeleton | `gma-skeleton` | (inline style for size/radius) |
| Notice | `gma-notice gma-notice--{variant}` | `gma-notice__icon` |

Extra `className` props are appended after the component's own classes (filter-Boolean + join pattern from the import JSX).

---

### Icon component — vendored SVG paths

Extract all inner SVG paths from `assets/icons.js`'s `window.GMA_ICONS` object and put them in a TypeScript const. The full path data is in that file. Key icons for the surfaces in 6-3 (these MUST be present):

| Name | Where used |
|---|---|
| `settings` | Header gear (VehicleSelector) |
| `navigation` | Wordmark mark |
| `clock` | Countdown in deal cards |
| `fuel` | Settings sheet resolved-MPG Notice |
| `car` | Settings sheet title |
| `x` | Sheet close IconButton |
| `shield-check` | Age gate |
| `triangle-alert` | Notice error/alert |
| `info` | Notice info |
| `chevron-down` | Fallback for Select (already drawn in CSS) — include for reference |

The Icon component renders:
```tsx
<svg
  xmlns="http://www.w3.org/2000/svg"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  strokeWidth={strokeWidth}
  strokeLinecap="round"
  strokeLinejoin="round"
  aria-hidden="true"
  className={className}
  dangerouslySetInnerHTML={{ __html: ICONS[name] }}
/>
```

**Security note:** `dangerouslySetInnerHTML` is safe here because `ICONS` is a compile-time constant object, never populated from user input or external data.

---

### RangeSlider: aria-valuetext rule (AC 4)

The `<input type="range">` needs `aria-valuetext` only when `valueText` is a string. The contract passes `valueText?: React.ReactNode` — but `aria-valuetext` must be a string. If `valueText` is a string, set `aria-valuetext={valueText}`; if it's ReactNode (JSX) or undefined, omit the attribute.

```tsx
aria-valuetext={typeof valueText === 'string' ? valueText : undefined}
```

This ensures "25 miles" / "1 mile" (from DistanceFilter in 6-3) is announced correctly by screen readers.

---

### `--border-field` discrepancy note (do not block on this)

`DESIGN.md` frontmatter defines `border-field: #6b7280` (gray-500, 4.83:1 on white) for form field borders and says TextField uses `{colors.border-field}`. However, `components.css` (the source of truth for this story) uses `var(--border-strong)` on `.gma-input` and `.gma-select`. Since there is **no `--border-field` token in `tokens.css`** (6-1 ported the import's token files verbatim and that token is not there), port `components.css` as-is: `.gma-input` and `.gma-select` use `var(--border-strong)`. If DESIGN.md's higher-contrast border-field intent is ever enforced, the token `--border-field: var(--gray-500)` needs to be added to `tokens.css` and `components.css` updated — a 6-3 concern.

---

### Testing standards

- **Framework:** Vitest + React Testing Library. `@testing-library/jest-dom` matchers. Strict TypeScript.
- **Colocate** tests beside the component: `Button.tsx` → `Button.test.tsx`.
- **No snapshot tests** — query by role/text/class as the existing tests do.
- **Controlled components** (RangeSlider, Select): use `fireEvent.change` and assert the callback was called with the correct value.
- **Class application**: use `.toHaveClass('gma-btn--primary')` etc.
- **Icon type check**: use `// @ts-expect-error` above a call with an invalid name to assert type safety.
- **Do not test CSS rendering** — visual correctness is a manual smoke (6-3 does the live pass when surfaces are re-skinned). Test props → DOM structure and attribute output only.

---

### Previous story learnings (6-1)

- **Copy verbatim, don't reconstruct.** The biggest risk in 6-1 was token name typos (CSS custom properties aren't caught by `tsc`). For 6-2, CSS class names in JSX ARE caught by nothing — match the class names in `components.css` character-for-character.
- **Vite deduplicated identical source files** (all 4 Public Sans woff2 were identical → one asset). Not relevant here but shows Vite's asset pipeline is fine.
- **198 tests passed unchanged** after 6-1. The token layer is CSS-only; React tests don't test CSS. Same should hold for 6-2 — primitives are new files, no changes to existing components.
- **Build clean:** `tsc -b && vite build` was the validation gate. Same gate applies here.

---

### Current client state (before 6-2 starts)

```
client/src/index.css       — @import "tailwindcss"; @import "./styles/tokens.css";
client/src/styles/tokens.css — token layer from 6-1 (all gma tokens + @theme + base.css)
client/src/components/     — AgeGate, DealCard, DealFeed, DistanceFilter, StaleIndicator, VehicleSelector (DO NOT MODIFY)
client/src/assets/fonts/   — 7 woff2 files
```

The `client/src/components/ui/` directory does **not exist yet** — create it.

---

### References

- `_bmad-output/planning-artifacts/ux-designs/ux-Happy-2026-06-11/imports/gmas-helper-design-system/components/components.css` — port verbatim as `client/src/styles/components.css`
- `…/components/core/Button.{jsx,d.ts,prompt.md}` — Button reference implementation + contract
- `…/components/core/IconButton.{jsx,d.ts}` — IconButton reference implementation + contract
- `…/components/core/Badge.{jsx,d.ts}` — Badge reference
- `…/components/core/Card.{jsx,d.ts}` — Card reference
- `…/components/feedback/Notice.{jsx,d.ts}` — Notice reference
- `…/components/feedback/Skeleton.{jsx,d.ts}` — Skeleton reference
- `…/components/forms/RangeSlider.{jsx,d.ts}` — RangeSlider reference
- `…/components/forms/Select.{jsx,d.ts}` — Select reference
- `…/components/forms/TextField.{jsx,d.ts}` — TextField reference
- `…/assets/icons.js` — SVG path data for `<Icon>` component
- `_bmad-output/planning-artifacts/ux-designs/ux-Happy-2026-06-11/DESIGN.md` — visual specs (components section)
- `_bmad-output/planning-artifacts/ux-designs/ux-Happy-2026-06-11/EXPERIENCE.md` — behavioral specs (Component Patterns, Accessibility Floor)
- `_bmad-output/implementation-artifacts/6-1-design-system-foundation.md` — previous story context

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References
None — clean implementation, no debugging required.

### Completion Notes List
- **TypeScript fixes:** Three TS errors fixed before final build: (1) removed unused `React` import from `Icon.tsx` (modern JSX transform doesn't need it), (2) changed `keyof JSX.IntrinsicElements` → `keyof React.JSX.IntrinsicElements` in `Card.tsx` to avoid ambient namespace reference, (3) removed unused `screen` import from `Badge.test.tsx`.
- **Card `as` prop:** Used `const Tag = as as React.ElementType` pattern — simple cast avoids complex polymorphic generic overhead while remaining type-safe at the call site.
- **Icon component:** Used `as const` on the ICONS object so TypeScript derives the exact string union type for `IconName` without a manual union declaration. All 19 icons from `icons.js` included.
- **Select placeholder:** Added `disabled` attribute to the placeholder `<option>` (the reference JSX did not include it, but AC 3 + story spec say "disabled leading option").
- **Test count:** 71 new tests (total 269 = 198 pre-existing + 71 new). Minimum was 30; delivered 71.
- **Scope boundary confirmed:** Zero imports of `components/ui` in any existing surface component.

### File List
**Created:**
- `client/src/styles/components.css` — verbatim port of design system component styles
- `client/src/components/ui/Icon.tsx`
- `client/src/components/ui/Icon.test.tsx`
- `client/src/components/ui/Button.tsx`
- `client/src/components/ui/Button.test.tsx`
- `client/src/components/ui/IconButton.tsx`
- `client/src/components/ui/IconButton.test.tsx`
- `client/src/components/ui/Badge.tsx`
- `client/src/components/ui/Badge.test.tsx`
- `client/src/components/ui/Card.tsx`
- `client/src/components/ui/Card.test.tsx`
- `client/src/components/ui/RangeSlider.tsx`
- `client/src/components/ui/RangeSlider.test.tsx`
- `client/src/components/ui/TextField.tsx`
- `client/src/components/ui/TextField.test.tsx`
- `client/src/components/ui/Select.tsx`
- `client/src/components/ui/Select.test.tsx`
- `client/src/components/ui/Skeleton.tsx`
- `client/src/components/ui/Skeleton.test.tsx`
- `client/src/components/ui/Notice.tsx`
- `client/src/components/ui/Notice.test.tsx`
- `client/src/components/ui/index.ts`

**Modified:**
- `client/src/index.css` — added `@import "./styles/components.css"` as third import

## Change Log

| Date | Description |
|------|-------------|
| 2026-06-16 | Story drafted (create-story). Epic 6 story 2 of 3: build the primitive component library on the 6-1 token layer. Scope: 10 TSX primitives + Icon component + components.css port + tests. No surface re-skin (6-3). |
| 2026-06-16 | Implemented (agent: claude-sonnet-4-6). All 11 tasks done, 71 new tests, 269/269 green. Review patch: RangeSlider label != null guard. 8 findings deferred. |

## Suggested Review Order

**CSS layer — foundation of the component system**

- Verbatim design system port; all values are `var(--token-*)`, zero hex literals.
  [`components.css:1`](../../client/src/styles/components.css#L1)

- Third import completing the chain: tailwindcss → tokens → components.
  [`index.css:3`](../../client/src/index.css#L3)

**Barrel — compile gate for the entire primitive layer**

- 24 exported symbols; a clean `tsc -b` here proves the whole layer is type-sound.
  [`index.ts:1`](../../client/src/components/ui/index.ts#L1)

**Accessibility — form controls (highest-risk area)**

- AC 4 core rule: `aria-valuetext` set only when `valueText` is a `string`, omitted for ReactNode.
  [`RangeSlider.tsx:53`](../../client/src/components/ui/RangeSlider.tsx#L53)

- Review patch: `label != null` (not `label &&`) so numeric label `0` is not silently suppressed.
  [`RangeSlider.tsx:38`](../../client/src/components/ui/RangeSlider.tsx#L38)

- `useId`-based label/error/hint association; `aria-invalid` + `aria-describedby` wiring.
  [`TextField.tsx:1`](../../client/src/components/ui/TextField.tsx#L1)

**Polymorphism — Button and Card**

- `href`-present path renders `<a>`; `type` is destructured before `rest` so it never leaks to anchor.
  [`Button.tsx:42`](../../client/src/components/ui/Button.tsx#L42)

- `as as React.ElementType` cast enables any intrinsic element without complex generics.
  [`Card.tsx:20`](../../client/src/components/ui/Card.tsx#L20)

**Icon component — vendored SVG approach**

- `as const` derives `IconName` union from the object keys; `dangerouslySetInnerHTML` is safe (compile-time only).
  [`Icon.tsx:1`](../../client/src/components/ui/Icon.tsx#L1)

**Display / feedback primitives**

- `showDot` logic: `dot || variant === 'fresh' || variant === 'stale'` — OR, not AND.
  [`Badge.tsx:16`](../../client/src/components/ui/Badge.tsx#L16)

- `role="status"` live region wraps `rows` skeleton shimmer items.
  [`Skeleton.tsx:41`](../../client/src/components/ui/Skeleton.tsx#L41)

**Tests — key patterns**

- Aria-valuetext present/absent assertions validate AC 4.
  [`RangeSlider.test.tsx:1`](../../client/src/components/ui/RangeSlider.test.tsx#L1)

- `// @ts-expect-error` type test asserts `IconName` rejects unknown strings at compile time.
  [`Icon.test.tsx:1`](../../client/src/components/ui/Icon.test.tsx#L1)

- Anchor path, disabled-prevents-anchor, className forwarding.
  [`Button.test.tsx:1`](../../client/src/components/ui/Button.test.tsx#L1)

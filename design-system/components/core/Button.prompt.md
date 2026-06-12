**Button** — the action affordance; `primary` is the single confident green "go" button, everything else stays quiet.

```jsx
<Button variant="primary" block>I am 21 or older</Button>
<Button variant="secondary" size="sm">Cancel</Button>
<Button variant="ghost" iconLeft={<i data-lucide="settings" />}>Settings</Button>
```

Variants: `primary` (green, default), `secondary` (neutral outline), `ghost` (quiet), `danger` (red).
Sizes: `md` (44px, default), `sm` (36px). Use `block` for full-width mobile CTAs. Pass `href` to render an `<a>`.

**Notice** — an inline message line. `muted` is the app's non-intrusive footnote ("N sources unavailable", "Last updated …"); the others get tinted boxes.

```jsx
<Notice variant="muted" role="status">2 sources unavailable</Notice>
<Notice variant="error" role="alert">Couldn't load deals. Please try again later.</Notice>
<Notice variant="urgent" icon={<i data-lucide="clock" />}>Ends in 24 min</Notice>
```

Variants: `default`, `muted`, `error`, `urgent`. Set `role="status"`/`"alert"` as appropriate.

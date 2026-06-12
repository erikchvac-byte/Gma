**Card** — the house surface: a 1px gray-200 border on white, flat (no shadow). This is what a deal listing sits in.

```jsx
<Card as="article">
  <h3>Remedy Tulalip</h3>
  <p>Top-shelf flower, 30% off all day</p>
</Card>
<Card interactive>Clickable card with a quiet hover lift</Card>
<Card urgent>Happy hour ending soon</Card>
```

`padding`: `default` (12px) / `flush` / `roomy`. `interactive` for clickable, `urgent` for amber time-sensitive tint.

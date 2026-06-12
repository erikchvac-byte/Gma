**TextField** — labelled input with optional hint/error; `mono` for numeric entry.

```jsx
<TextField label="Your vehicle MPG" type="number" mono hint="Leave blank to use the national average (28)." />
<TextField label="ZIP code" error="Enter a 5-digit ZIP." />
```

`error` sets `aria-invalid` and a red border and replaces the hint.

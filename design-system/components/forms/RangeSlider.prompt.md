**RangeSlider** — labelled slider with a live mono value; this is the app's distance filter, generalized.

```jsx
<RangeSlider
  label="Within"
  value={miles}
  onChange={setMiles}
  min={1} max={50}
  valueText={`${miles} ${miles === 1 ? 'mile' : 'miles'}`}
  showTicks minLabel="1 mi" maxLabel="50 mi"
/>
```

Controlled (`value` + `onChange(number)`). Use `valueText` for unit formatting; `showTicks` adds min/max labels.

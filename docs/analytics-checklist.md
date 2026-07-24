# GA4 Analytics Checklist — Gmas List

GA4 property: **Eriks Gmas (1125)** · Measurement ID `G-Z3EH6D5C89`

What's instrumented (both LIVE as of 2026-07-24):
- `store_click` custom event — fires when a user clicks a store's name/link on a deal card through to the retailer's site. Params: `store_id`, `store_name`, `link_url`. (`DealCard.tsx` → `client/src/utils/analytics.ts`)
- Pageview tag on the server-rendered SEO pages `/about` and `/compare*` — previously invisible to GA. (`server/routes/gaSnippet.ts`)

---

## One-time setup (do once, ~24h after 2026-07-24 deploy)

- [ ] **Mark `store_click` as a Key event.** GA4 → Admin → Data display → Events → wait for `store_click` to appear in the list → toggle **Mark as key event**. Turns it into a tracked conversion; until then the "Key events" card reads "No data available."

## Live deploy verification (once, right after a deploy)

- [ ] `curl -s https://gmaslist.com/compare | grep gtag` → shows the GA tag.
- [ ] `curl -s https://gmaslist.com/about | grep gtag` → shows the GA tag.
- [ ] GA4 → Reports → Realtime: load the homepage, click a store name → a `store_click` event appears within ~30s.
- [ ] Realtime: load `/compare` in a browser → a `page_view` with page path `/compare` appears.

## Weekly check (the numbers that matter)

- [ ] **Acquisition → Traffic acquisition:** is `google / organic` holding or growing vs `(direct)/(none)`? (Baseline 2026-07-23: first ever organic = 2 sessions. Before that: 100% direct.)
- [ ] **Engagement → Pages and screens:** are `/compare` and `/about` now showing rows? Which page earns the organic traffic — homepage vs `/compare` vs `/about`?
- [ ] **Engagement → Events → `store_click`:** how many? This is the real product question — of the people who arrive, does anyone click through to a store?
- [ ] **Reports snapshot → Active users by City:** discount the bot/datacenter cities (Ashburn = AWS, Council Bluffs = Google, Columbus, Herford/DE). Real target-market signal = Mount Vernon / Seattle / Everett / Marysville.

## Interpreting it honestly

- Single-digit numbers are noise, not trends. Wait for a consistent week before concluding anything.
- A high Lighthouse score says nothing about crawler visibility or real traffic — different measurement.
- `store_click` only fires from the deal-card header link (the only real click-through). The `/compare` pages and the price-drops strip name stores as text, not links — nothing to click there.

## Baselines (last-28-days snapshots)

| Date range        | Active users | Events | Organic sessions | Notes |
|-------------------|-------------:|-------:|-----------------:|-------|
| Jun 25 – Jul 22   | 18           | 645    | 0                | 100% direct |
| Jun 26 – Jul 23   | 18           | 684    | 2                | first organic; crawler-visible homepage shipped 7/23 |

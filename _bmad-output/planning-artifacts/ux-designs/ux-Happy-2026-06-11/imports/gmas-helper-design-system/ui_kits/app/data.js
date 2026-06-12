/* Gma's Helper — sample deal data for the UI kit.
   Shape mirrors the real API (server/data/data.json): a meta block
   plus dispensaries, each with deals. Distances are real R&D values;
   gas cost is computed live from the honest formula, not hardcoded. */

window.GMA_DATA = {
  meta: {
    gasPrice: 4.25,        // $/gal — EIA daily (ADR-012)
    nationalMpg: 28,       // US fleet average (ADR-013)
    lastUpdated: 'Jun 10, 7:45 AM',
  },
  // staleCount derives from the full API array, independent of the radius (ADR-026)
  staleCount: 2,
  dispensaries: [
    {
      id: 'remedy-tulalip', name: 'Remedy Tulalip', distanceMiles: 2.5, stale: false,
      deals: [{ type: 'happy_hour', description: 'Top-shelf flower, every gram', discountPct: 30, window: '8:00 PM – 10:00 PM', countdownMin: 24 }],
    },
    {
      id: 'kush21-everett', name: 'Kush21 Everett (Evergreen Way)', distanceMiles: 9.8, stale: false,
      deals: [{ type: 'happy_hour', description: 'House pre-rolls & vape carts', discountPct: 20, window: '9:00 PM – close', countdownMin: null }],
    },
    {
      id: 'the-joint-everett', name: 'The Joint — Everett', distanceMiles: 10.5, stale: false,
      deals: [{ type: 'happy_hour', description: 'Live resin, select brands', discountPct: 35, window: '7:00 PM – 9:30 PM', countdownMin: 96 }],
    },
    {
      id: 'jet-cannabis', name: 'Jet Cannabis', distanceMiles: 12.5, stale: false,
      deals: [{ type: 'daily', description: 'Edibles — brand of the day', discountPct: 25, window: 'Active today', countdownMin: null }],
    },
    {
      id: 'wild-seed', name: 'Wild Seed Wellness', distanceMiles: 31.0, stale: false,
      deals: [{ type: 'daily', description: 'Storewide flower', discountPct: 40, window: 'Active today', countdownMin: null }],
    },
  ],
};

/* roundTripGasCost — the ONE home of the formula (mirrors gasCost.ts, ADR-024):
   (distanceMiles × 2) × (gasPrice / mpg). null on any non-finite/≤0 input. */
window.roundTripGasCost = function (distanceMiles, gasPrice, mpg) {
  if (![distanceMiles, gasPrice, mpg].every((n) => typeof n === 'number' && isFinite(n) && n > 0)) return null;
  const cost = distanceMiles * 2 * (gasPrice / mpg);
  return isFinite(cost) ? cost : null;
};
window.formatGasCost = function (cost) {
  return cost == null ? null : '$' + cost.toFixed(2);
};

/* sortDeals — flatten to rows, then tier (mirrors sortDeals.ts, ADR-022):
   timed happy hours by countdown asc, then null-window happy hours,
   then daily deals by discount desc. */
window.sortGmaRows = function (dispensaries) {
  const rows = [];
  dispensaries.forEach((d) => d.deals.forEach((deal) => rows.push({ dispensary: d, deal })));
  const tier = (r) => (r.deal.type === 'happy_hour' && r.deal.countdownMin != null ? 0 : r.deal.type === 'happy_hour' ? 1 : 2);
  return rows.sort((a, b) => {
    const ta = tier(a), tb = tier(b);
    if (ta !== tb) return ta - tb;
    if (ta === 0) return a.deal.countdownMin - b.deal.countdownMin;
    if (ta === 2) return b.deal.discountPct - a.deal.discountPct;
    return 0;
  });
};

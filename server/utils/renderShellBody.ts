import type { ApiDataResponse } from '../../client/src/types/index.js'

// WA WAC 314-55-155 age/health notice, rendered into the crawler-visible server
// HTML so a non-JS crawler (and the sub-second pre-hydration DOM) sees an age
// statement alongside the deal facts. Kept as a server-side literal because the
// client TS constant (client/src/constants/legal.ts AGE_GATE_WARNINGS) is not
// importable across the server tsconfig — if the statute text changes, update
// BOTH. (Story AC8, ratified 2026-07-23.)
const AGE_NOTICE =
  'For use only by adults 21 and older. Keep out of the reach of children. ' +
  'This product has intoxicating effects and may be habit forming.'

// Text-node escaping only (& < >) — mirrors compareRoute.ts / aboutRoute.ts.
// Every interpolated store/deal string is scraped and hostile-by-premise.
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Build crawler-visible, human-readable HTML of the CURRENT active deals/stores
// for the homepage shell body (SEO Phase 0a-HTML). The caller splices this INSIDE
// `<div id="root">`, a crawler-only sink React's createRoot wipes on hydration —
// so humans never see it in steady state, only non-JS crawlers (GPTBot, Perplexity,
// OAI-/Claude-SearchBot) and the brief pre-hydration DOM. Built from the SAME
// buildApiData() payload already injected as window.__GMA_DATA__ (no new data path,
// no new exposure; /api/data and /compare already publish this un-gated).
//
// Only stores that currently have ≥1 active deal are rendered (buildApiData already
// filtered each store's deals to the active set). Description is the sanitized,
// length-capped, blocklisted deal text from the normalizeDeals chokepoint
// (compliance-launch-gate) — escaped here, never re-sanitized. String coercion on
// `description` is defensive fail-soft so one odd record can never throw a 500.
export function renderShellBody(data: ApiDataResponse): string {
  const sections = data.dispensaries
    .filter((store) => store.deals.length > 0)
    .map((store) => {
      const deals = store.deals
        .map((deal) => `<li>${escapeHtml(String(deal.description ?? ''))}</li>`)
        .join('')
      const address =
        typeof store.address === 'string' && store.address.length > 0
          ? `<p>${escapeHtml(store.address)}</p>`
          : ''
      return `<section><h2>${escapeHtml(store.name)}</h2>${address}<ul>${deals}</ul></section>`
    })
    .join('')

  return (
    '<h1>Cannabis deals worth the drive at licensed Washington retailers</h1>' +
    `<p>${escapeHtml(AGE_NOTICE)}</p>` +
    sections
  )
}

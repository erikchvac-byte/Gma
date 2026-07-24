// Minimal GA4 event helper. gtag.js is loaded (deferred to idle) in
// client/index.html with config G-Z3EH6D5C89; the inline stub defines a global
// `gtag()` that queues into `dataLayer` until the script arrives, so events
// fired before load are not lost. This wrapper fail-soft no-ops whenever the
// runtime is absent — SSR shell, an ad/analytics blocker, a non-JS crawler, or
// tests — so a missing analytics layer can never break a click or a render.

declare global {
  interface Window {
    gtag?: (command: 'event', name: string, params?: GtagEventParams) => void
  }
}

// GA4 event params are flat scalars; undefined values are simply omitted by gtag.
export type GtagEventParams = Record<string, string | number | boolean | undefined>

export function trackEvent(name: string, params: GtagEventParams = {}): void {
  if (typeof window === 'undefined') return
  // optional-chain both the property and the call: gtag may be undefined until
  // (or if) gtag.js loads, and we never want a throw to reach the caller.
  window.gtag?.('event', name, params)
}

// Fire when a user clicks through from a store's deal card to that store's own
// website — the product's core conversion (did a surfaced deal actually move
// someone toward the retailer?). Custom GA4 event; mark `store_click` as a Key
// event in GA4 Admin to track it as a conversion.
export function trackStoreClick(store: { id: string; name: string; url: string }): void {
  trackEvent('store_click', {
    store_id: store.id,
    store_name: store.name,
    link_url: store.url,
  })
}

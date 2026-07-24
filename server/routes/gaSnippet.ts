// Shared GA4 tag for the server-rendered SEO pages (/about, /compare*).
//
// The SPA loads gtag from client/index.html, but these Express-rendered pages
// are separate documents that never mount React — so without this tag GA never
// fires on them and their pageviews are INVISIBLE in Analytics (which is why the
// GA "Top pages" report only ever shows the SPA homepage title). These are the
// site's SEO/AI-search entry points, so their human traffic is exactly what we
// need to see as organic search grows.
//
// Same measurement ID as the SPA → every pageview lands in the one property.
// Plain async snippet (not the SPA's idle-deferred load): these are lightweight
// text pages with no hydration to compete with, so there's nothing to defer for.
export const GA_MEASUREMENT_ID = 'G-Z3EH6D5C89'

export const GA_HEAD_SNIPPET = `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${GA_MEASUREMENT_ID}');
    </script>`

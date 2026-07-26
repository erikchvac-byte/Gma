// Open Graph + Twitter Card meta tags, shared by the server-rendered pages
// (aboutRoute, compareRoute, storeRoute) and mirrored statically in
// client/index.html for the homepage. Facebook / LinkedIn / iMessage / Slack read
// the og:* tags; X/Twitter reads twitter:*. Keeping one generator means every
// surface emits the same tag set and the same escaping.
//
// og:image points at the brand art served at /og-image.png. It is ~square and
// small, so the card type is `summary` (small thumbnail), NOT `summary_large_image`
// — swap to a 1200x630 asset + `summary_large_image` when a wide OG image exists.

const SITE_NAME = 'Gmas List'
export const OG_IMAGE_URL = 'https://gmaslist.com/og-image.png'
const OG_IMAGE_ALT = 'Gmas List — cannabis deals worth the drive'

// Self-contained attribute escaping so callers can pass raw, untrusted strings
// (e.g. a store name in an og:title) without pre-escaping.
function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export interface SocialMetaOpts {
  title: string
  description: string
  url: string
  type?: 'website' | 'article'
  image?: string
  imageAlt?: string
}

// Returns the OG + Twitter meta block, newline-joined with head indentation.
export function socialMetaTags(opts: SocialMetaOpts): string {
  const type = opts.type ?? 'website'
  const t = esc(opts.title)
  const d = esc(opts.description)
  const u = esc(opts.url)
  const img = esc(opts.image ?? OG_IMAGE_URL)
  const alt = esc(opts.imageAlt ?? OG_IMAGE_ALT)
  return [
    `<meta property="og:type" content="${type}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:url" content="${u}" />`,
    `<meta property="og:image" content="${img}" />`,
    `<meta property="og:image:alt" content="${alt}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${img}" />`,
    `<meta name="twitter:image:alt" content="${alt}" />`,
  ].join('\n    ')
}

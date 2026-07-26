import { describe, it, expect } from 'vitest'
import { socialMetaTags, OG_IMAGE_URL } from './socialMeta.js'

describe('socialMetaTags', () => {
  const tags = socialMetaTags({
    title: 'Store & Co',
    description: 'Deals "worth" the drive',
    url: 'https://gmaslist.com/store/x',
  })

  it('emits the core Open Graph tags', () => {
    expect(tags).toContain('<meta property="og:type" content="website" />')
    expect(tags).toContain('<meta property="og:site_name" content="Gmas List" />')
    expect(tags).toContain('<meta property="og:title" content="Store &amp; Co" />')
    expect(tags).toContain('<meta property="og:url" content="https://gmaslist.com/store/x" />')
    expect(tags).toContain(`<meta property="og:image" content="${OG_IMAGE_URL}" />`)
  })

  it('emits the Twitter Card tags (summary_large_image — wide banner art)', () => {
    expect(tags).toContain('<meta name="twitter:card" content="summary_large_image" />')
    expect(tags).toContain('<meta name="twitter:title" content="Store &amp; Co" />')
    expect(tags).toContain(`<meta name="twitter:image" content="${OG_IMAGE_URL}" />`)
  })

  it('escapes untrusted title/description into attributes', () => {
    // The store name / description are raw input — a quote or & must not break out.
    expect(tags).toContain('content="Deals &quot;worth&quot; the drive"')
    expect(tags).not.toContain('content="Deals "worth" the drive"')
  })

  it('allows overriding the type', () => {
    const article = socialMetaTags({ title: 'x', description: 'y', url: 'z', type: 'article' })
    expect(article).toContain('<meta property="og:type" content="article" />')
  })
})

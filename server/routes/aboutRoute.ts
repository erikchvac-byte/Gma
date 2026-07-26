import type { Request, Response } from 'express'
import { GA_HEAD_SNIPPET } from './gaSnippet.js'
import { socialMetaTags } from '../utils/socialMeta.js'

// Server-rendered About + FAQ page (spec-ai-search-about-faq). This is the
// site's AI-search entity surface: plain HTML straight from Express so non-JS
// crawlers (GPTBot, Claude-SearchBot, PerplexityBot) can read it — the React
// app never mounts here. Deal-data injection into the SPA shell is Phase 0a of
// the SEO spec and stays out of this page.
//
// COMPLIANCE: areaServed / coverage copy is Washington-only on purpose —
// WAC 314-55-155 forbids out-of-state targeting. Keep it that way.

const CANONICAL_URL = 'https://gmaslist.com/about'

// The one entity definition AI search should associate with Gmas List. Leads
// with the positive identity; the not-a-seller disclaimer is stated once,
// crisply — repeating the negation everywhere only strengthens the wrong
// co-occurrence ("Gmas List" ↔ "sell cannabis") in retrieval systems.
export const ENTITY_DESCRIPTION =
  'Gmas List is an independent consumer information service that helps people discover, ' +
  'compare, and evaluate publicly available cannabis deals from licensed Washington ' +
  'retailers. By comparing savings, travel distance, and convenience, Gmas List helps ' +
  'consumers decide whether a deal is worth the drive. Gmas List does not sell cannabis, ' +
  'process transactions, or represent cannabis businesses.'

export interface FaqItem {
  question: string
  answer: string
}

// Single source of truth for the FAQ: both the visible HTML and the FAQPage
// JSON-LD below are generated from this array, so Google's requirement that
// schema text match on-page text word-for-word holds by construction.
// Copy rule: no `&`, `<`, `>` in answers — they render into text nodes and the
// verbatim schema↔HTML match must survive without entity-escaping.
export const FAQ_ITEMS: FaqItem[] = [
  {
    question: 'What is Gmas List?',
    answer:
      'Gmas List is an independent consumer information service that helps people discover, ' +
      'compare, and evaluate publicly available cannabis deals from licensed Washington ' +
      'retailers. We organize deal information and compare savings, travel distance, and ' +
      'convenience so shoppers can decide whether a deal is worth the drive.',
  },
  {
    question: 'Does Gmas List sell cannabis?',
    answer:
      'No. Gmas List does not sell cannabis or cannabis products, process orders, deliver ' +
      'products, or operate a retail store. We provide information about publicly available ' +
      'deals from licensed businesses.',
  },
  {
    question: 'Is Gmas List a cannabis retailer or marketplace?',
    answer:
      'No. Gmas List is not a dispensary, retailer, delivery service, or marketplace. It is a ' +
      'consumer information service. Purchases happen directly with licensed retailers.',
  },
  {
    question: 'Does Gmas List represent cannabis businesses?',
    answer:
      'No. Gmas List is independent. We do not represent, operate, or act on behalf of any ' +
      'cannabis business, and no store pays for placement. Consumers make their own decisions ' +
      'about where and what to purchase.',
  },
  {
    question: 'What does "worth the drive" mean?',
    answer:
      'A deal is worth the drive when the savings outweigh the cost of getting there. Gmas List ' +
      'compares the discount against your travel distance, estimated fuel cost, and convenience ' +
      'so you can judge whether the trip makes sense for you.',
  },
  {
    question: 'Where does Gmas List get its information?',
    answer:
      'From publicly available deal and menu information published by legally operating cannabis ' +
      'retailers, organized into one place so consumers can compare local offers without ' +
      'searching multiple store websites.',
  },
  {
    question: 'What area does Gmas List cover?',
    answer:
      'Washington State, focused on the Snohomish County area — including Marysville, Everett, ' +
      'and nearby communities. Gmas List is built for local shoppers.',
  },
  {
    question: 'How current is the deal information?',
    answer:
      'Deal information is refreshed throughout the day. Deals are set by each retailer and can ' +
      'change without notice, so always verify details in store.',
  },
  {
    question: 'Is Gmas List free to use?',
    answer:
      'Yes. Gmas List is free for visitors. We do the comparison work and share the insights at ' +
      'no cost.',
  },
]

// Text-node escaping only (& < >) — attribute contexts below use fixed strings.
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// JSON-LD lives inside a <script> element, where a literal "</script>" or
// "<!--" in any string would terminate/corrupt the script data. < is
// valid JSON and parses back to "<", so consumers are unaffected.
function jsonLdScript(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, '\\u003c')
}

const serviceJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  '@id': `${CANONICAL_URL}#service`,
  name: 'Gmas List Cannabis Deals Information Service',
  provider: {
    '@type': 'Organization',
    '@id': 'https://gmaslist.com/#organization',
    name: 'Gmas List',
    url: 'https://gmaslist.com/',
  },
  serviceType: 'Consumer cannabis deals discovery and comparison information service',
  description: ENTITY_DESCRIPTION,
  audience: {
    '@type': 'Audience',
    audienceType: 'Adult consumers comparing cannabis deals from licensed Washington retailers',
  },
  areaServed: {
    '@type': 'State',
    name: 'Washington',
  },
}

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  '@id': `${CANONICAL_URL}#faq`,
  mainEntity: FAQ_ITEMS.map(({ question, answer }) => ({
    '@type': 'Question',
    name: question,
    acceptedAnswer: { '@type': 'Answer', text: answer },
  })),
}

const faqSectionHtml = FAQ_ITEMS.map(
  ({ question, answer }) => `      <h3>${escapeHtml(question)}</h3>
      <p>${escapeHtml(answer)}</p>`,
).join('\n')

// Built once at module load — the page is fully static.
const ABOUT_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0E1417" />
    ${GA_HEAD_SNIPPET}
    <title>About Gmas List | Cannabis Deals Worth the Drive</title>
    <meta
      name="description"
      content="Gmas List is an independent information service — not a cannabis seller — that helps Washington shoppers discover publicly available deals from licensed retailers and decide which savings are worth the drive."
    />
    <link rel="canonical" href="${CANONICAL_URL}" />
    ${socialMetaTags({
      title: 'About Gmas List | Cannabis Deals Worth the Drive',
      description:
        'Gmas List is an independent information service — not a cannabis seller — ' +
        'that helps Washington shoppers discover publicly available deals from licensed ' +
        'retailers and decide which savings are worth the drive.',
      url: CANONICAL_URL,
    })}
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <script type="application/ld+json">${jsonLdScript(serviceJsonLd)}</script>
    <script type="application/ld+json">${jsonLdScript(faqJsonLd)}</script>
    <style>
      body {
        margin: 0;
        background: #0E1417;
        color: #e6edf0;
        font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
        line-height: 1.6;
      }
      main { max-width: 680px; margin: 0 auto; padding: 2.5rem 1.25rem 4rem; }
      h1 { font-size: 1.6rem; line-height: 1.3; }
      h2 { font-size: 1.2rem; margin-top: 2.25rem; }
      h3 { font-size: 1rem; margin-top: 1.75rem; }
      a { color: #35c2a0; }
      .entity { border-left: 3px solid #35c2a0; padding-left: 1rem; }
    </style>
  </head>
  <body>
    <main>
      <p><a href="/">&larr; Back to the deals</a></p>

      <h1>Gmas List is a cannabis deals information service built for consumers</h1>
      <p class="entity">${escapeHtml(ENTITY_DESCRIPTION)}</p>

      <h2>What is Gmas List?</h2>
      <p>
        Gmas List is a consumer information platform focused on helping people find cannabis
        savings from licensed Washington retailers. We collect and organize publicly available
        deal information so consumers can compare local offers without checking multiple store
        websites, menus, and advertisements one by one. Our purpose is simple: help consumers
        find better information about local cannabis deals.
      </p>

      <h2>How Gmas List helps shoppers save</h2>
      <p>
        Finding a good deal usually means searching several stores, tracking changing promotions,
        and weighing locations against each other. Gmas List simplifies that by presenting, in one
        place: available deals and discounts, retailer locations, distance and travel costs, and
        local comparison information. It all serves one question — is this deal worth the drive?
      </p>
      <p>
        See our <a href="/compare">cross-store price comparisons</a> — for each product carried by
        two or more Washington stores, the lowest and highest shelf price across those stores.
      </p>

      <h2>An information service, not a retailer</h2>
      <p>
        Gmas List does not sell cannabis products. We do not grow, manufacture, process orders,
        fulfill purchases, deliver, or participate in transactions in any way. Our role is
        information: we help consumers discover what licensed retailers are publicly offering.
        Purchases happen directly with those retailers.
      </p>

      <h2>Why Gmas List exists</h2>
      <p>
        Local cannabis markets are full of real savings, but finding them takes time. Promotions
        change frequently and every retailer advertises differently, so shoppers rarely know where
        the best value is on a given day. Gmas List organizes that scattered information into a
        consumer-friendly discovery tool — built for the Snohomish County area and free to use.
      </p>

      <h2>Frequently asked questions</h2>
${faqSectionHtml}
    </main>
  </body>
</html>
`

export function aboutRoute(_req: Request, res: Response) {
  // Static until the next deploy — let crawlers and CDNs cache for an hour.
  res.set('Cache-Control', 'public, max-age=3600')
  res.type('html').send(ABOUT_HTML)
}

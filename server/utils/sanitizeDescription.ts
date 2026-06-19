// Sanitizes third-party retailer deal copy before it is published to the site
// (compliance-launch-gate, regulated-content review finding #1). The aggregator
// republishes scraped descriptions it does not control; an imported youth-appeal
// or therapeutic-claim string would land verbatim on the surface and could pull a
// WAC 314-55-155 violation onto Erik's page. This runs at the single ingestion
// chokepoint (normalizeDeals <- applyIngest <- POST /api/ingest); ADR-034 retired
// the in-process scraper, so this is the only path inbound deals travel.
//
// Posture, NOT a legal conclusion: descriptions are never rewritten or embellished
// -- only stripped (markup/emoji/length) and, on a blocklist hit, SUPPRESSED
// (replaced with '') so DealCard renders the deal with badge + discount + window
// only. The deal itself is never dropped.

const MAX_LENGTH = 80

// Operator-maintained. Matched as WHOLE WORDS (word boundaries) and
// case-insensitively, so legit cannabis vocabulary is not false-flagged:
// 'cure' will NOT suppress "cured resin", 'kid' will NOT suppress "kidding".
// Note: 'gummy'/'gummies' are intentionally ABSENT -- gummies are a lawful product
// category, not inherently youth-appeal. 'candy' is likewise ABSENT: it collides with
// very common legit strain names ("Cotton Candy", "Candy Kush") -- the false-positive
// cost outweighs the youth-appeal signal (operator decision, code review 2026-06-18).
// Add product-specific terms here only if a real listing warrants it; this list is
// tuned by the operator, not by code.
export const DESCRIPTION_BLOCKLIST: readonly string[] = [
  // therapeutic / curative claims -- prohibited in licensee advertising (WAC 314-55-155)
  'cure',
  'cures',
  'heals',
  'healing',
  'relieves pain',
  'pain relief',
  'treats anxiety',
  'medical benefit',
  'therapeutic',
  'medicinal',
  // youth appeal
  'kid',
  'kids',
  'cartoon',
]

// Pre-compiled whole-word matchers. Each term is escaped, then wrapped in \b...\b
// so it only fires on a standalone word/phrase, never inside a longer word.
const BLOCKLIST_PATTERNS = DESCRIPTION_BLOCKLIST.map(
  (term) => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
)

const HTML_TAG = /<[^>]*>/g
// Strip pictographic emoji and default-ignorable code points (variation selectors,
// zero-width joiners, etc.) -- pure-ASCII Unicode property classes, no literals.
const EMOJI = /[\p{Extended_Pictographic}\p{Default_Ignorable_Code_Point}]/gu
const WHITESPACE = /\s+/g

// Both markup and emoji are replaced with a SPACE (not ''), so a blocked term can't
// be reassembled by gluing the surrounding text together: "pain<emoji>relief" and
// "pain<b>relief" both normalize to "pain relief" and are caught, rather than joining
// into an unmatchable "painrelief" (code review 2026-06-18). The trailing WHITESPACE
// collapse then removes the doubled spaces this introduces.

// Replace C0 control chars (code point < 0x20) and DEL (0x7F) with a space.
// Done by code point rather than a regex literal so no control byte ever appears
// in this source file.
function stripControlChars(text: string): string {
  let out = ''
  for (const ch of text) {
    const code = ch.codePointAt(0) as number
    out += code < 0x20 || code === 0x7f ? ' ' : ch
  }
  return out
}

function containsBlockedTerm(text: string): boolean {
  return BLOCKLIST_PATTERNS.some((re) => re.test(text))
}

// Returns the display-safe description, or '' to signal "suppress the description"
// (blocklist hit, or nothing legible survived stripping).
export function sanitizeDescription(raw: unknown): string {
  if (typeof raw !== 'string') return ''

  // De-ALL-CAPS (AC#1c) is intentionally NOT applied: the spec gates it on "only if
  // trivially safe", and any safe heuristic (e.g. title-casing) would corrupt the many
  // legitimately-capitalized tokens in retailer copy (brand names, "OG", "THC", "20% OFF").
  // The stripping + blocklist below already neutralize the actual compliance risk.
  const cleaned = stripControlChars(raw.replace(HTML_TAG, ' ').replace(EMOJI, ' '))
    .replace(WHITESPACE, ' ')
    .trim()

  if (cleaned === '') return ''
  // Check the FULL cleaned text before truncating -- a blocked term past char 80
  // must still suppress the whole description.
  if (containsBlockedTerm(cleaned)) return ''
  if (cleaned.length <= MAX_LENGTH) return cleaned

  // Truncate on a word boundary: cut at the cap, then back off to the last space.
  const cut = cleaned.slice(0, MAX_LENGTH)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()
}

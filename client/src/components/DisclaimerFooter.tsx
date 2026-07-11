import { Notice } from './ui'

// Standing disclaimers for the aggregator (compliance-launch-gate, regulated-content
// review finding #2). Single source of truth — rendered once below the feed, present
// on every load. Two lines always show (accuracy/affiliation + gas-estimate
// qualifier). The WA mandatory-warning text is STAGED but gated.
//
// COUNSEL: WAC 314-55-155 warning statements attach to *licensee* advertising;
// whether they reach a non-commerce informational aggregator is unsettled. The exact
// statutory text is staged below and surfaces with a single flag flip — do not assert
// applicability in code. Flip to true only on counsel instruction.
export const WA_WARNING_ENABLED = false

export const WA_WARNING_TEXT =
  'This product has intoxicating effects and may be habit forming. Cannabis can impair ' +
  'concentration, coordination, and judgment. Do not operate a vehicle or machinery under ' +
  'the influence of this drug. For use only by adults twenty-one and older. Keep out of the ' +
  'reach of children.'

interface DisclaimerFooterProps {
  // Defaults to the WA_WARNING_ENABLED const so production behavior is driven by the
  // single flag above; the prop exists only so tests can exercise both states.
  showWaWarning?: boolean
}

export default function DisclaimerFooter({ showWaWarning = WA_WARNING_ENABLED }: DisclaimerFooterProps = {}) {
  return (
    <footer
      style={{
        maxWidth: 640,
        margin: '0 auto',
        padding: 'var(--space-6) var(--space-4)',
        display: 'grid',
        gap: 'var(--space-2)',
      }}
    >
      <Notice>
        Deals are set by each retailer and may change without notice — verify in store. Gma's Helper
        is not affiliated with any dispensary and sells nothing.
      </Notice>
      <Notice>
        Gas costs are estimates based on average fuel prices and rated MPG.
      </Notice>
      {/* Site-wide entity identity (spec-ai-search-about-faq): one quiet line,
          every page view, linking to the server-rendered /about entity page. */}
      <Notice>
        Gmas List is an independent information service. We don't sell cannabis — we help you
        find deals from licensed WA retailers worth the drive.{' '}
        <a href="/about" style={{ color: 'var(--accent)' }}>About Gmas List</a>
      </Notice>
      {showWaWarning && <Notice>{WA_WARNING_TEXT}</Notice>}
    </footer>
  )
}

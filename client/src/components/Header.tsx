// Persistent banner: the static wordmark. The wordmark text is the page's only
// <h1> (EXPERIENCE.md document semantics); the nav mark beside it is decorative.
// Renders above the feed at App level — it must outlive DealFeed's loading/error
// early-returns, so it lives here. Vehicle settings now open from the labeled
// VehicleBar below the header (CAP-5), not a gear in here.
export default function Header() {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-3)',
        padding: 'var(--space-4)',
        borderBottom: 'var(--border-hairline) solid var(--border-default)',
        background: 'var(--surface-card)',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}
    >
      {/* Wordmark + a one-line positioning subtitle. The subtitle keeps the
          site's "independent guide, not a seller" positioning visible above the
          fold (a positioning audit found it lived only in the footer/about). It
          is a <p>, never a heading — the wordmark stays the page's only <h1>
          (EXPERIENCE.md document semantics). */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        {/* Locked wordmark: lowercase "gmas list" in Space Grotesk Medium + the
            pink "set-dot" brand signature. Never capitalized, never a pictorial
            icon (DESIGN.md → Brand & Style; legal: no cannabis imagery). */}
        <h1
          style={{
            display: 'inline-flex',
            alignItems: 'flex-end',
            fontFamily: 'var(--font-head)',
            fontSize: 'var(--text-xl)',
            fontWeight: 'var(--weight-medium)',
            letterSpacing: '-0.01em',
            color: 'var(--text-strong)',
            margin: 0,
          }}
        >
          gmas list
          <span
            aria-hidden="true"
            style={{
              width: '0.21em',
              height: '0.21em',
              borderRadius: 'var(--radius-dot)',
              background: 'var(--accent)',
              marginLeft: '0.14em',
              marginBottom: '0.16em',
              flex: 'none',
            }}
          />
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: 'var(--text-sm)',
            color: 'var(--text-muted)',
            letterSpacing: '-0.005em',
          }}
        >
          Independent guide to WA cannabis deals worth the drive
        </p>
      </div>
    </header>
  )
}

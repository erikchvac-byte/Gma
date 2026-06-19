import { Icon, IconButton } from './ui'

interface HeaderProps {
  onOpenSettings: () => void
}

// Persistent banner: static wordmark + the single entry to vehicle settings.
// The wordmark text is the page's only <h1> (EXPERIENCE.md document semantics);
// the nav mark beside it is decorative. Renders above the feed at App level —
// it must outlive DealFeed's loading/error early-returns, so it lives here.
export default function Header({ onOpenSettings }: HeaderProps) {
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
      {/* Locked wordmark: lowercase "gmas list" in Space Grotesk Medium + the
          teal "set-dot" brand signature. Never capitalized, never a pictorial
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
      <IconButton aria-label="Vehicle & settings" onClick={onOpenSettings}>
        <Icon name="settings" size={20} />
      </IconButton>
    </header>
  )
}

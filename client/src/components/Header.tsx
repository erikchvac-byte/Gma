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
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <span
          aria-hidden="true"
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            background: 'var(--green-700)',
            color: 'var(--white)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 'none',
          }}
        >
          <Icon name="navigation" size={18} strokeWidth={2.25} />
        </span>
        <h1
          style={{
            fontSize: 'var(--text-xl)',
            fontWeight: 'var(--weight-bold)',
            letterSpacing: '-0.01em',
            color: 'var(--text-strong)',
            margin: 0,
          }}
        >
          Gma&apos;s Helper
        </h1>
      </div>
      <IconButton aria-label="Vehicle & settings" onClick={onOpenSettings}>
        <Icon name="settings" size={20} />
      </IconButton>
    </header>
  )
}

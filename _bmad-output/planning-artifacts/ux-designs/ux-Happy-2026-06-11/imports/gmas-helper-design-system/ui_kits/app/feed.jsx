/* Gma's Helper — UI kit app components.
   Composes the design-system primitives (window.GmaSHelperDesignSystem_45dd11)
   into the real product surfaces: age gate, header, deal feed, deal card,
   distance filter, and the vehicle-precision settings sheet.
   This is a faithful recreation of the app in Happy/client/src — simplified
   for presentation, not production. */

const DS = window.GmaSHelperDesignSystem_45dd11;
const { Button, IconButton, Badge, Card, RangeSlider, Notice, Select, TextField, SkeletonFeed } = DS;

/* ---------------------------------------------------------------
   Age gate — full-screen attestation (AgeGate.tsx / ADR-021)
   --------------------------------------------------------------- */
function AgeGate({ onConfirm }) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="age-gate-heading"
      style={{
        position: 'absolute', inset: 0, zIndex: 50,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 'var(--space-6)', padding: 'var(--space-6)', textAlign: 'center',
        background: 'var(--surface-inverse)', color: 'var(--text-on-inverse)',
      }}
    >
      <span style={{ color: 'var(--green-300)' }}><Icon name="shield-check" size={36} /></span>
      <h1 id="age-gate-heading" style={{
        color: '#fff', fontWeight: 'var(--weight-regular)', fontSize: 'var(--text-lg)',
        lineHeight: 'var(--leading-snug)', maxWidth: 320,
      }}>
        You must be 21 or older to view this content.
      </h1>
      <Button variant="primary" onClick={onConfirm} autoFocus>I am 21 or older</Button>
    </div>
  );
}

/* ---------------------------------------------------------------
   Header — wordmark + settings gear
   --------------------------------------------------------------- */
function Header({ onOpenSettings }) {
  return (
    <header style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 'var(--space-3)', padding: 'var(--space-4)',
      borderBottom: '1px solid var(--border-default)', background: 'var(--surface-card)',
      position: 'sticky', top: 0, zIndex: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <span style={{
          width: 32, height: 32, borderRadius: 9, background: 'var(--green-700)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
        }}><Icon name="navigation" size={18} strokeWidth={2.25} /></span>
        <span style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-bold)', letterSpacing: '-0.01em', color: 'var(--text-strong)' }}>
          Gma's Helper
        </span>
      </div>
      <IconButton aria-label="Vehicle &amp; settings" onClick={onOpenSettings}>
        <Icon name="settings" size={20} />
      </IconButton>
    </header>
  );
}

/* ---------------------------------------------------------------
   Deal card — presentational (DealCard.tsx / ADR-009, ADR-023)
   --------------------------------------------------------------- */
function DealCard({ row, gasCostText }) {
  const { dispensary, deal } = row;
  const isHappyHour = deal.type === 'happy_hour';
  return (
    <Card as="article" urgent={isHappyHour} style={{ display: 'grid', gap: 'var(--space-1)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
        <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--weight-semibold)' }}>{dispensary.name}</h2>
        <span data-figure style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {dispensary.distanceMiles.toFixed(1)} mi
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 2 }}>
        {isHappyHour
          ? <Badge variant="urgent"><Icon name="clock" size={12} /> Happy hour</Badge>
          : <Badge variant="neutral">Daily deal</Badge>}
      </div>
      <p style={{ color: 'var(--text-body)' }}>{deal.description}</p>
      {/* Side-by-side Discount Display (ADR-009) */}
      <p style={{ fontWeight: 'var(--weight-medium)', color: 'var(--text-strong)' }}>
        <span style={{ color: 'var(--green-700)', fontWeight: 'var(--weight-semibold)' }}>{deal.discountPct}% off</span>
        {gasCostText && (
          <span style={{ color: 'var(--text-body)' }}>
            {' '}— <span data-figure style={{ fontFamily: 'var(--font-mono)' }}>{gasCostText}</span> to get there
          </span>
        )}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', marginTop: 2 }}>
        {deal.window && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{deal.window}</span>}
        {deal.countdownMin != null && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-urgent)' }}>
            <Icon name="clock" size={14} /><span data-figure style={{ fontFamily: 'var(--font-mono)' }}>{formatCountdown(deal.countdownMin)}</span> left
          </span>
        )}
      </div>
    </Card>
  );
}

function formatCountdown(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

/* ---------------------------------------------------------------
   Deal feed — distance filter + sorted rows + footnotes
   --------------------------------------------------------------- */
function DealFeed({ data, maxDistance, setMaxDistance, mpg, loading }) {
  const fresh = data.dispensaries.filter((d) => !d.stale);
  const nearby = fresh.filter((d) => d.distanceMiles <= maxDistance);
  const rows = window.sortGmaRows(nearby);
  const gasText = (miles) => window.formatGasCost(window.roundTripGasCost(miles, data.meta.gasPrice, mpg));

  return (
    <section aria-label="Deal feed" style={{ padding: 'var(--space-4)', display: 'grid', gap: 'var(--space-4)' }}>
      <RangeSlider
        label="Within"
        value={maxDistance}
        onChange={setMaxDistance}
        min={1} max={50}
        valueText={`${maxDistance} ${maxDistance === 1 ? 'mile' : 'miles'}`}
        showTicks minLabel="1 mi" maxLabel="50 mi"
      />
      {loading ? (
        <SkeletonFeed rows={3} />
      ) : rows.length === 0 ? (
        <Notice variant="muted" role="status" aria-live="polite">No active deals right now</Notice>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--gap-feed)' }}>
          {rows.map((row) => (
            <li key={`${row.dispensary.id}|${row.deal.description}`}>
              <DealCard row={row} gasCostText={gasText(row.dispensary.distanceMiles)} />
            </li>
          ))}
        </ul>
      )}
      {!loading && (
        <div style={{ display: 'grid', gap: 'var(--space-1)' }}>
          <Notice variant="muted">Last updated {data.meta.lastUpdated}</Notice>
          {data.staleCount > 0 && (
            <Notice variant="muted" role="status">{data.staleCount} {data.staleCount === 1 ? 'source' : 'sources'} unavailable</Notice>
          )}
        </div>
      )}
    </section>
  );
}

Object.assign(window, { AgeGate, Header, DealCard, DealFeed, formatCountdown });

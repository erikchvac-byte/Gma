/* Gma's Helper — vehicle precision settings sheet.
   The optional "dial it in to your car" flow (brief / ADR-003): pick
   year / make / model once, persisted. Default path needs zero setup —
   gas cost uses the national average until a vehicle is chosen. */

const SDS = window.GmaSHelperDesignSystem_45dd11;

function SettingsSheet({ open, onClose, vehicle, setVehicle, nationalMpg }) {
  const { Button, IconButton, Select, Notice } = SDS;
  const [draft, setDraft] = React.useState(vehicle);
  React.useEffect(() => { if (open) setDraft(vehicle); }, [open]);

  if (!open) return null;

  const years = ['2024', '2023', '2022', '2021', '2020'];
  const makes = ['Toyota', 'Honda', 'Ford', 'Subaru', 'Chevrolet'];
  const models = { Toyota: ['Corolla', 'RAV4', 'Tacoma'], Honda: ['Civic', 'CR-V', 'Accord'], Ford: ['F-150', 'Escape', 'Maverick'], Subaru: ['Outback', 'Forester', 'Crosstrek'], Chevrolet: ['Silverado', 'Equinox', 'Malibu'] };
  // toy MPG estimate just for the mock
  const estMpg = draft.year && draft.make && draft.model ? mockMpg(draft.make, draft.model) : null;
  const complete = draft.year && draft.make && draft.model;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 40 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(17,24,39,0.45)' }} />
      <div role="dialog" aria-modal="true" aria-label="Vehicle settings" style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        background: 'var(--surface-card)', borderTopLeftRadius: 'var(--radius-2xl)', borderTopRightRadius: 'var(--radius-2xl)',
        boxShadow: 'var(--shadow-lg)', padding: 'var(--space-5)', display: 'grid', gap: 'var(--space-4)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ color: 'var(--green-700)' }}><Icon name="car" size={20} /></span>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-semibold)' }}>Your vehicle</h2>
          </div>
          <IconButton aria-label="Close" size="sm" onClick={onClose}><Icon name="x" size={18} /></IconButton>
        </div>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          Set it once for exact gas math. Skip it and we use the national average ({nationalMpg} MPG).
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-2)' }}>
          <Select label="Year" placeholder="Year" value={draft.year} options={years.map((y) => ({ value: y, label: y }))}
            onChange={(e) => setDraft({ ...draft, year: e.target.value })} />
          <Select label="Make" placeholder="Make" value={draft.make} options={makes.map((m) => ({ value: m, label: m }))}
            onChange={(e) => setDraft({ ...draft, make: e.target.value, model: '' })} />
          <Select label="Model" placeholder="Model" value={draft.model} disabled={!draft.make}
            options={(models[draft.make] || []).map((m) => ({ value: m, label: m }))}
            onChange={(e) => setDraft({ ...draft, model: e.target.value })} />
        </div>
        {estMpg && (
          <Notice variant="default" icon={<Icon name="fuel" size={16} />}>
            Estimated <strong>{estMpg} MPG</strong> — gas cost will use your vehicle.
          </Notice>
        )}
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Button variant="ghost" block onClick={() => { setVehicle({ year: '', make: '', model: '', mpg: null }); onClose(); }}>
            Use national average
          </Button>
          <Button variant="primary" block disabled={!complete}
            onClick={() => { setVehicle({ ...draft, mpg: estMpg }); onClose(); }}>
            Save vehicle
          </Button>
        </div>
      </div>
    </div>
  );
}

function mockMpg(make, model) {
  const heavy = ['F-150', 'Silverado', 'Tacoma'];
  if (heavy.includes(model)) return 21;
  if (['RAV4', 'CR-V', 'Escape', 'Forester', 'Outback', 'Equinox', 'Crosstrek'].includes(model)) return 29;
  return 34;
}

Object.assign(window, { SettingsSheet, mockMpg });

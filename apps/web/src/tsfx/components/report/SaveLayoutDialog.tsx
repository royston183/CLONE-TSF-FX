// src/components/report/SaveLayoutDialog.tsx
import { useState } from 'react';
import type { LayoutMeta, LayoutScope, SavedLayout } from '@tsfx/lib/report/types';
import { ConfirmDialog } from '@tsfx/components/ui/ConfirmDialog';
import { Modal } from '@tsfx/components/ui/Modal';
import { DialogSection } from '@tsfx/components/ui/DialogSection';

/** ALV "Save Layout" (spec §4.2): name, description, shared or only me, default; an existing name asks before it is replaced. */
export function SaveLayoutDialog({ initial, layouts, canShare, browserLocal = false, onSave, onClose }: {
  initial: LayoutMeta | null; layouts: SavedLayout[]; canShare: boolean; browserLocal?: boolean; onSave: (meta: LayoutMeta) => Promise<void>; onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [scope, setScope] = useState<LayoutScope>(initial?.scope === 'personal' || !canShare ? 'personal' : 'shared');
  const [isDefault, setDefault] = useState(Boolean(initial?.isDefault));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const existing = layouts.find(l => l.scope === scope && l.name.toLowerCase() === name.trim().toLowerCase());
  async function save() {
    setBusy(true);
    setError('');
    try { await onSave({ name: name.trim(), description: description.trim(), scope, isDefault }); }
    catch (e) { setError((e as Error).message); setBusy(false); setConfirm(false); }
  }
  const submit = () => {
    if (!name.trim() || busy) return;
    if (existing && !confirm) { setConfirm(true); return; }
    void save();
  };
  return (
    <>
      <Modal title="Save Layout" subtitle={browserLocal ? 'Saved layouts are available in this browser.' : 'Shared layouts are for everyone; “Only me” layouts belong to your user.'} busy={busy} onClose={onClose}
        footer={<>
          <button className="button secondary small" disabled={busy} onClick={onClose}>Cancel</button>
          <button className="button small" disabled={busy || !name.trim()} onClick={submit}>{busy ? 'Saving…' : existing ? 'Replace Layout' : 'Save Layout'}</button>
        </>}>
        <form className="trm-lo-save" onSubmit={e => { e.preventDefault(); submit(); }}>
          <DialogSection title="Layout details" description="Give this layout a name so it is easy to find again.">
          <label className="field"><span>Layout name</span><input data-autofocus maxLength={40} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. By company" /></label>
          <label className="field"><span>Description</span><input maxLength={60} value={description} onChange={e => setDescription(e.target.value)} /></label>
          </DialogSection>
          <DialogSection title="Visibility and defaults">
          {!browserLocal && <div className="trm-seg" role="radiogroup" aria-label="Saved for">
            {([['shared', 'Shared with everyone'], ['personal', 'Only me']] as const).map(([v, text]) => (
              <button key={v} type="button" role="radio" aria-checked={scope === v} className={scope === v ? 'on' : ''} disabled={v === 'shared' && !canShare} onClick={() => setScope(v)}>{text}</button>
            ))}
          </div>}
          <label className="md-toggle"><input type="checkbox" checked={isDefault} onChange={e => setDefault(e.target.checked)} />Default layout (opens with the screen)</label>
          </DialogSection>
          {existing && <p className="trm-lo-hint">A layout named “{existing.name}” exists and will be replaced.</p>}
          {error && <p className="trm-lo-hint bad" role="alert">{error}</p>}
        </form>
      </Modal>
      {confirm && existing && <ConfirmDialog title="Replace layout" message={`Replace layout “${existing.name}”?`} confirmLabel="Yes, Replace" busy={busy}
        onClose={() => setConfirm(false)} onConfirm={() => void save()} />}
    </>
  );
}

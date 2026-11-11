// src/components/report/LayoutControls.tsx
import { useState } from 'react';
import { Columns3, Save, Trash2 } from 'lucide-react';
import type { AlvLayout } from '@tsfx/lib/layout/alv-types';
import type { LayoutTarget } from '@tsfx/lib/layout/layout';
import type { LayoutState, Unit } from '@tsfx/lib/report/types';
import { ConfirmDialog } from '@tsfx/components/ui/ConfirmDialog';
import { ChangeLayoutDialog, type LayoutColumn } from './ChangeLayoutDialog';
import { LayoutPicker } from './LayoutPicker';
import { SaveLayoutDialog } from './SaveLayoutDialog';

type Dialog = null | { kind: 'change' } | { kind: 'save'; layout: LayoutState } | { kind: 'delete' };

/** The ALV layout toolbar (spec §4.2): picker, Change Layout, Save Layout and Delete, with their dialogs. */
export function LayoutControls({ alv, target, units, canShare, browserLocal = false }: { alv: AlvLayout; target: LayoutTarget; units: Unit[] | null; canShare: boolean; browserLocal?: boolean }) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const column = (id: string): LayoutColumn => ({ id, label: target.labels[id] ?? id });
  const saved = alv.active ? alv.layouts.find(l => l.scope === alv.active?.scope && l.name === alv.active?.name) : undefined;
  const remove = () => { setBusy(true); void alv.remove().finally(() => { setBusy(false); setDialog(null); }); };
  // A shared layout is deleted only by those who may share (the server refuses everyone else with 403).
  const deletable = alv.active !== null && (alv.active.scope === 'personal' || canShare);
  return (
    <div className="kit-layout-controls" role="group" aria-label="Layout options">
      <LayoutPicker layouts={alv.layouts} active={alv.active} modified={alv.modified} onSelect={alv.select} />
      <button type="button" className="button secondary small" onClick={() => setDialog({ kind: 'change' })}><Columns3 size={14} />Change Layout</button>
      <button type="button" className="button secondary small" onClick={() => setDialog({ kind: 'save', layout: alv.layout })}><Save size={14} />Save Layout</button>
      {alv.active && deletable && <button type="button" className="button secondary small" aria-label="Delete layout" title={`Delete the layout “${alv.active.name}”`} onClick={() => setDialog({ kind: 'delete' })}><Trash2 size={14} /></button>}
      {dialog?.kind === 'change' && <ChangeLayoutDialog layout={alv.layout} columns={target.columns.map(column)} sortOptions={target.sortColumns.map(column)} maxSort={target.maxSort}
        subtotalOptions={target.subtotalColumns.length ? target.subtotalColumns.map(column) : null} maxSubtotals={target.maxSubtotals} units={units} pageSizes={target.pageSizes}
        onClose={() => setDialog(null)} onApply={next => { alv.change(next); setDialog(null); }} onSave={next => setDialog({ kind: 'save', layout: next })} />}
      {dialog?.kind === 'save' && <SaveLayoutDialog initial={saved ? { name: saved.name, description: saved.description, scope: saved.scope, isDefault: saved.isDefault } : null}
        layouts={alv.layouts} canShare={canShare} browserLocal={browserLocal} onClose={() => setDialog(null)} onSave={async meta => { await alv.save(meta, dialog.layout); setDialog(null); }} />}
      {dialog?.kind === 'delete' && alv.active && <ConfirmDialog title="Delete layout" message={`Delete the layout “${alv.active.name}”${alv.active.scope === 'shared' ? ' for everyone' : ''}?`}
        confirmLabel="Yes, Delete" danger busy={busy} onClose={() => setDialog(null)} onConfirm={remove} />}
    </div>
  );
}

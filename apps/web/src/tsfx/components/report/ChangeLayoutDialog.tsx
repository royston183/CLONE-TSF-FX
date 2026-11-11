// src/components/report/ChangeLayoutDialog.tsx
import { useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Plus, X } from 'lucide-react';
import type { LayoutState } from '@tsfx/lib/report/types';
import { Modal } from '@tsfx/components/ui/Modal';
import { DialogSection } from '@tsfx/components/ui/DialogSection';

export interface LayoutColumn { id: string; label: string }
type Tab = 'columns' | 'sort' | 'subtotals' | 'display';
type Criterion = { col: string; desc: boolean };

function move<T>(list: T[], i: number, d: number): T[] {
  const j = i + d;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

function ColumnList({ title, items, selected, onSelect, onOpen }: { title: string; items: LayoutColumn[]; selected: string | null; onSelect: (id: string) => void; onOpen: (id: string) => void }) {
  return (
    <div className="trm-lo-list"><b>{title}<span>{items.length}</span></b>
      <ul role="listbox" aria-label={title}>
        {items.map(c => (
          <li key={c.id} role="option" aria-selected={selected === c.id} tabIndex={0} className={selected === c.id ? 'on' : ''}
            onClick={() => onSelect(c.id)} onDoubleClick={() => onOpen(c.id)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onOpen(c.id); } }}>{c.label}</li>
        ))}
        {!items.length && <li className="trm-lo-none">No columns</li>}
      </ul>
    </div>
  );
}

/** Ordered criteria (sort or subtotal columns): one row per column with direction, up, down and remove, plus an add picker. */
function Criteria({ rows, options, max, withDirection, onChange }: { rows: Criterion[]; options: LayoutColumn[]; max: number; withDirection: boolean; onChange: (rows: Criterion[]) => void }) {
  const [pick, setPick] = useState('');
  const free = options.filter(o => !rows.some(r => r.col === o.id));
  const labelOf = (id: string) => options.find(o => o.id === id)?.label ?? id;
  return (
    <div className="trm-lo-criteria">
      {rows.map((r, i) => (
        <div key={r.col} className="trm-lo-row">
          <span className="trm-lo-n">{i + 1}</span><span className="trm-lo-name">{labelOf(r.col)}</span>
          {withDirection && <div className="trm-seg" role="radiogroup" aria-label={`Direction of ${labelOf(r.col)}`}>
            {([[false, 'Ascending'], [true, 'Descending']] as const).map(([desc, text]) => (
              <button key={text} type="button" role="radio" aria-checked={r.desc === desc} className={r.desc === desc ? 'on' : ''} onClick={() => onChange(rows.map(x => (x.col === r.col ? { ...x, desc } : x)))}>{text}</button>
            ))}
          </div>}
          <button type="button" className="icon-button" aria-label={`Move ${labelOf(r.col)} up`} disabled={!i} onClick={() => onChange(move(rows, i, -1))}><ChevronUp size={15} /></button>
          <button type="button" className="icon-button" aria-label={`Move ${labelOf(r.col)} down`} disabled={i === rows.length - 1} onClick={() => onChange(move(rows, i, 1))}><ChevronDown size={15} /></button>
          <button type="button" className="icon-button" aria-label={`Remove ${labelOf(r.col)}`} onClick={() => onChange(rows.filter(x => x.col !== r.col))}><X size={15} /></button>
        </div>
      ))}
      {!rows.length && <p className="trm-lo-hint">None.</p>}
      {rows.length < max && (
        <div className="trm-lo-add">
          <select aria-label="Column to add" value={pick} onChange={e => setPick(e.target.value)}>
            <option value="">Select a column…</option>
            {free.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <button type="button" className="button secondary small" disabled={!pick} onClick={() => { onChange([...rows, { col: pick, desc: false }]); setPick(''); }}><Plus size={14} />Add</button>
        </div>
      )}
    </div>
  );
}

export interface ChangeLayoutDialogProps {
  layout: LayoutState;
  /** Every column the layout may show, in standard order. */
  columns: LayoutColumn[];
  sortOptions: LayoutColumn[];
  maxSort: number;
  /** Columns that may be subtotalled; null hides the Subtotals tab and "subtotal lines only" (large lists). */
  subtotalOptions: LayoutColumn[] | null;
  maxSubtotals: number;
  /** Display units; null hides the unit choice. */
  units: { id: string; label: string }[] | null;
  /** Large lists: the page sizes; null hides the choice. */
  pageSizes: number[] | null;
  onApply: (layout: LayoutState) => void;
  onSave: (layout: LayoutState) => void;
  onClose: () => void;
}

/** ALV "Change Layout" (spec §4.2, ALM LayoutDialogs): columns, sort, subtotals and display; OK applies, Cancel discards. */
export function ChangeLayoutDialog({ layout, columns, sortOptions, maxSort, subtotalOptions, maxSubtotals, units, pageSizes, onApply, onSave, onClose }: ChangeLayoutDialogProps) {
  const [tab, setTab] = useState<Tab>('columns');
  const [draft, setDraft] = useState<LayoutState>(layout);
  const [selected, setSelected] = useState<string | null>(null);
  const set = (patch: Partial<LayoutState>) => setDraft(d => ({ ...d, ...patch }));
  const shown = draft.columns.map(id => columns.find(c => c.id === id)).filter((c): c is LayoutColumn => Boolean(c));
  const hidden = columns.filter(c => !draft.columns.includes(c.id));
  const show = (id: string | null) => { if (id && !draft.columns.includes(id)) { set({ columns: [...draft.columns, id] }); setSelected(id); } };
  const hide = (id: string | null) => { if (id && draft.columns.length > 1 && draft.columns.includes(id)) { set({ columns: draft.columns.filter(c => c !== id) }); setSelected(id); } };
  const at = selected ? draft.columns.indexOf(selected) : -1;
  const tabs: { id: Tab; label: string }[] = [
    { id: 'columns', label: 'Displayed Columns' }, { id: 'sort', label: 'Sort Order' },
    ...(subtotalOptions ? [{ id: 'subtotals' as const, label: 'Subtotals' }] : []),
    ...(units?.length || subtotalOptions || pageSizes?.length ? [{ id: 'display' as const, label: 'Display' }] : [])
  ];
  return (
    <Modal title="Change Layout" subtitle={subtotalOptions ? 'Choose, order, sort and subtotal the columns, as in an SAP list layout.' : 'Choose the displayed columns, their order and sorting.'} wide onClose={onClose}
      footer={<>
        <button className="button secondary small" onClick={onClose}>Cancel</button>
        <button className="button secondary small" onClick={() => onSave(draft)}>Save Layout…</button>
        <button className="button small" onClick={() => onApply(draft)}>OK</button>
      </>}>
      <div className="trm-lo-tabs" role="tablist">
        {tabs.map(t => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>
      <DialogSection title={tabs.find(t => t.id === tab)?.label ?? 'Layout settings'}>
      {tab === 'columns' && (
        <div className="trm-lo-columns">
          <ColumnList title="Displayed Columns" items={shown} selected={selected} onSelect={setSelected} onOpen={hide} />
          <div className="trm-lo-moves">
            <button type="button" className="button secondary small" aria-label="Show the selected column" disabled={!hidden.some(c => c.id === selected)} onClick={() => show(selected)}><ChevronLeft size={15} /></button>
            <button type="button" className="button secondary small" aria-label="Hide the selected column" disabled={at < 0 || draft.columns.length < 2} onClick={() => hide(selected)}><ChevronRight size={15} /></button>
            <button type="button" className="button secondary small" aria-label="Move the selected column up" disabled={at <= 0} onClick={() => set({ columns: move(draft.columns, at, -1) })}><ChevronUp size={15} /></button>
            <button type="button" className="button secondary small" aria-label="Move the selected column down" disabled={at < 0 || at === draft.columns.length - 1} onClick={() => set({ columns: move(draft.columns, at, 1) })}><ChevronDown size={15} /></button>
          </div>
          <ColumnList title="Column Set" items={hidden} selected={selected} onSelect={setSelected} onOpen={show} />
          <p className="trm-lo-hint">Select a column and use the arrows, or double-click it to move it between the lists.</p>
        </div>
      )}
      {tab === 'sort' && <Criteria rows={draft.sort} options={sortOptions} max={maxSort} withDirection onChange={sort => set({ sort })} />}
      {tab === 'subtotals' && subtotalOptions && <>
        <Criteria rows={draft.subtotals.map(col => ({ col, desc: false }))} options={subtotalOptions} max={maxSubtotals} withDirection={false}
          onChange={rows => set({ subtotals: rows.map(r => r.col), subtotalsOnly: rows.length ? draft.subtotalsOnly : false })} />
        <p className="trm-lo-hint">Rows are grouped by these columns in order, each group closed by a subtotal line per currency; the direction comes from Sort Order.</p>
      </>}
      {tab === 'display' && (
        <div className="trm-lo-display">
          {units && <label className="field"><span>Amounts in</span>
            <select value={draft.unit ?? ''} onChange={e => set({ unit: e.target.value || null })}>
              <option value="">Keep the current unit</option>
              {units.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
            </select></label>}
          {subtotalOptions && <label className="md-toggle"><input type="checkbox" checked={draft.subtotalsOnly} disabled={!draft.subtotals.length} onChange={e => set({ subtotalsOnly: e.target.checked })} />Show subtotal lines only</label>}
          {pageSizes && <label className="field"><span>Rows per page</span>
            <select value={draft.pageSize ?? pageSizes[0]} onChange={e => set({ pageSize: Number(e.target.value) })}>
              {pageSizes.map(n => <option key={n} value={n}>{n}</option>)}
            </select></label>}
        </div>
      )}
      </DialogSection>
    </Modal>
  );
}

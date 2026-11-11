import { DataTable } from '@tsfx/components/table/DataTable';
import { useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Search } from 'lucide-react';
import type { LookupItem } from '@tsfx/lib/grid/types';
import { Modal } from './Modal';
import { DialogSection } from './DialogSection';

export const filterItems = (items: LookupItem[], q: string): LookupItem[] => {
  const t = q.trim().toLowerCase();
  return t ? items.filter(i => `${i.CODE} ${i.TEXT}`.toLowerCase().includes(t)) : items;
};

/** F4 value help: search, arrow keys, Enter or double-click picks. Esc closes only this dialog. */
export function ValueHelpDialog({ title, items, extraColumns = [], onPick, onClose }: {
  title: string; items: LookupItem[]; extraColumns?: { field: string; label: string }[]; onPick: (code: string) => void; onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const rows = useMemo(() => filterItems(items, q).slice(0, 500) as (LookupItem & Record<string, string>)[], [items, q]);
  const key = (e: ReactKeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, rows.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && rows[active]) { e.preventDefault(); onPick(String(rows[active].CODE)); }
  };
  return (
    <Modal title={title} subtitle={`${rows.length} of ${items.length} entries`} wide onClose={onClose} footer={<button className="button secondary" onClick={onClose}>Cancel</button>}>
      <DialogSection title="Find an entry" description="Search by code or text. Press Enter or double-click a row to select it.">
      <label className="search ds-search"><Search size={15} /><input aria-label="Search code or text" data-autofocus placeholder="Search code or text" value={q} onKeyDown={key} onChange={e => { setQ(e.target.value); setActive(0); }} /></label>
      <div className="kit-vh-table"><DataTable className="ds-table">
        <thead><tr><th>Code</th><th>Text</th>{extraColumns.map(c => <th key={c.field}>{c.label}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={String(r.CODE)} className={i === active ? 'kit-active' : ''} onClick={() => setActive(i)} onDoubleClick={() => onPick(String(r.CODE))}>
            <td className="ds-code">{r.CODE}</td><td>{r.TEXT}</td>{extraColumns.map(c => <td key={c.field}>{r[c.field]}</td>)}
          </tr>
        ))}</tbody>
      </DataTable>{!rows.length && <div className="ds-drop-empty">Nothing matches that search.</div>}</div>
      </DialogSection>
    </Modal>
  );
}

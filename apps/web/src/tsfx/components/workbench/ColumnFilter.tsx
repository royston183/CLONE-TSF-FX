import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { tsfxPortalRoot } from '@tsfx/lib/portal-root';
import { createPortal } from 'react-dom';

/** Excel-style value filter for one column. */
export function ColumnFilter({ anchor, values, active, onApply, onClose }: { anchor: HTMLElement; values: string[]; active: string[]; onApply: (selected: string[]) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [checked, setChecked] = useState(() => new Set(active.length ? active : values));
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const place = (e?: Event) => {
      if (e?.target instanceof Node && ref.current?.contains(e.target)) return;
      const r = anchor.getBoundingClientRect();
      setBox({ top: r.bottom + 4, left: Math.max(4, Math.min(r.left - 200, innerWidth - 270)) });
    };
    const frame = requestAnimationFrame(() => place());
    addEventListener('scroll', place, true);
    return () => { cancelAnimationFrame(frame); removeEventListener('scroll', place, true); };
  }, [anchor]);
  useEffect(() => {
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc, true);
    addEventListener('resize', onClose);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc, true); removeEventListener('resize', onClose); };
  }, [anchor, onClose]);
  const list = values.filter(v => v.toLowerCase().includes(q.toLowerCase()));
  const toggle = (v: string) => setChecked(s => { const n = new Set(s); if (n.has(v)) n.delete(v); else n.add(v); return n; });
  if (!box) return null;
  return createPortal(
    <div className="ds-colfilter" ref={ref} style={box} role="dialog" aria-label="Column filter">
      <input autoFocus placeholder="Search values…" value={q} onChange={e => setQ(e.target.value)} />
      <label className="ds-check all"><input type="checkbox" checked={checked.size === values.length} onChange={e => setChecked(new Set(e.target.checked ? values : []))} />Select All</label>
      <div className="ds-colfilter-list">{list.map(v => <label className="ds-check" key={v}><input type="checkbox" checked={checked.has(v)} onChange={() => toggle(v)} />{v === '' ? '(blank)' : v}</label>)}</div>
      <div className="ds-colfilter-foot">
        <button className="button secondary small" onClick={() => onApply([])}>Clear</button>
        <button className="button small" onClick={() => onApply(checked.size === values.length ? [] : [...checked])}>Apply</button>
      </div>
    </div>,
    tsfxPortalRoot()
  );
}

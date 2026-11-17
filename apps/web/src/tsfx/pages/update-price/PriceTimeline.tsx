// The date-wise price timeline of one commodity (opened by double-clicking it on Update Price): future dates on top,
// today in view, earlier dates below, so scrolling down goes back in time. A day with a price shows it; a day without one
// shows "No Price", or, from today on, a field to enter one. Saving uses the page's own save (the same create / update
// of the commodity-price module and its checks); earlier days are read-only here, as nothing else lets a past price be
// typed over without choosing that day first.
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { Modal } from '@tsfx/components/ui/Modal';
import { formatDate } from '@tsfx/lib/fields/parse';
import { isoDay, str } from '@tsfx/lib/grid/grid';
import type { Row } from '@tsfx/lib/grid/types';
import type { SheetLine } from './logic';

const FUTURE_DAYS = 14, PAST_DAYS = 30, MAX_DAYS = 600;
const shown = (v: unknown) => (str(v) ? Number(str(v)).toFixed(4) : '');
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export function PriceTimeline({ line, prices, today, busy, onSave, onClose }: {
  line: SheetLine; prices: Row[]; today: string; busy: boolean;
  /** Saves the typed price for that day (the page's create / update with its checks and messages). */
  onSave: (day: string, typed: string) => Promise<void>; onClose: () => void;
}) {
  const byDay = useMemo(() => new Map(prices.filter(p => str(p.commodity) === line.commodity).map(p => [isoDay(p.effectiveFrom), p])), [prices, line.commodity]);
  const days = useMemo(() => {
    const keys = [...byDay.keys()].sort();
    const top = [addDays(today, FUTURE_DAYS), keys[keys.length - 1] ?? ''].sort().pop() as string;
    const bottom = [addDays(today, -PAST_DAYS), keys[0] ?? top].sort()[0];
    const out: string[] = [];
    for (let d = top; d >= bottom && out.length < MAX_DAYS; d = addDays(d, -1)) out.push(d);
    return out;
  }, [byDay, today]);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const box = useRef<HTMLDivElement>(null);
  const now = useRef<HTMLTableRowElement>(null);

  // Open on today, with a little of the future above it.
  useLayoutEffect(() => {
    const el = box.current, row = now.current;
    if (el && row) el.scrollTop = Math.max(0, row.offsetTop - el.clientHeight / 2 + row.offsetHeight / 2);
  }, []);

  const save = async (day: string) => { await onSave(day, typed[day] ?? ''); setTyped(t => { const n = { ...t }; delete n[day]; return n; }); };

  return (
    <Modal title={`${line.commodity}${line.description ? ` · ${line.description}` : ''}`} eyebrow="Price timeline"
      subtitle={`${line.currency} per ${line.unit || 'unit'} · scroll down for earlier days, up for coming days`} onClose={onClose} busy={busy}
      footer={<button className="button secondary" disabled={busy} onClick={onClose}><X size={14} />Close</button>}>
      <div className="mc-timeline" ref={box} tabIndex={0} aria-label={`Prices of ${line.commodity} by date`}>
        <table>
          <thead><tr><th>Date</th><th className="num">Price ({line.currency})</th><th>Price for the day</th></tr></thead>
          <tbody>{days.map(d => {
            const rec = byDay.get(d);
            const open = d >= today;                       // today and later may be priced here
            const future = d > today;
            const value = typed[d] ?? shown(rec?.price);
            const changed = typed[d] !== undefined && (!rec || Number(typed[d]) !== Number(str(rec.price)));
            return (
              <tr key={d} ref={d === today ? now : undefined} className={`${d === today ? 'today' : ''}${future ? ' future' : ''}`}>
                <td className="mono">{formatDate(d)}{d === today && <span className="pill mc-today">Today</span>}</td>
                <td className="num">{open
                  ? <input className="input tsf-price__input" inputMode="decimal" aria-label={`Price on ${formatDate(d)}`} placeholder="Enter price" value={value} disabled={busy}
                      onChange={e => setTyped(t => ({ ...t, [d]: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter' && changed) void save(d); }} />
                  : rec ? shown(rec.price) : <span className="mc-none">No Price</span>}</td>
                <td>{open
                  ? <button className="button small" disabled={busy || !changed} onClick={() => void save(d)}><Check size={13} />{rec ? 'Update' : future ? 'Add Future Price' : 'Add Price'}</button>
                  : rec ? <span className="mc-set">Price set</span> : <span className="mc-none">—</span>}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </Modal>
  );
}

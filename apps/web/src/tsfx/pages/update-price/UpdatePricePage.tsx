// Update Price (Trade Flows) from the perspective of a date: pick a day, see every commodity with its price for that
// day (or Missing), type the prices and save them with Effective From = the day. Reads and writes the commodity-price
// module (SAP ZFS_SB_TRADEFLOW_O4_API, CommodityPrice) through the data client, so its check() and ETags apply.
import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Copy, RotateCcw, Save, Search, Trash2 } from 'lucide-react';
import { DataTable } from '@tsfx/components/table/DataTable';
import { TrafficLightTag } from '@tsfx/components/ui/Badge';
import { ConfirmDialog } from '@tsfx/components/ui/ConfirmDialog';
import { Loading } from '@tsfx/components/ui/Loading';
import { Notice } from '@tsfx/components/ui/Notice';
import { Toast, useToast } from '@tsfx/components/ui/Toast';
import { moduleChange, moduleView, onSampleData, SAMPLE_DATA_NOTE } from '@tsfx/lib/client/data';
import { formatDate } from '@tsfx/lib/fields/parse';
import { isoDay, str } from '@tsfx/lib/grid/grid';
import type { Row, View } from '@tsfx/lib/grid/types';
import { savePlan, sheetFigures, sheetFor, type SheetLine } from './logic';
import './update-price.css';

const ID = 'commodity-price';
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const shownPrice = (v: unknown) => (str(v) ? Number(str(v)).toFixed(4) : '');

export default function UpdatePricePage() {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [day, setDay] = useState(today);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [show, setShow] = useState<'all' | 'Missing' | 'Set'>('all');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [remove, setRemove] = useState<{ line: SheetLine; row: Row } | null>(null);
  // The commodity whose price history shows on the right.
  const [picked, setPicked] = useState('');
  const [toast, notify] = useToast();

  useEffect(() => {
    let live = true;
    moduleView(ID).then(v => { if (live) { setView(v); setError(''); } }, (e: Error) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [reload]);

  const lines = useMemo(() => (view ? sheetFor(day, view.lookups.commodities ?? [], view.tables.prices ?? []) : []), [view, day]);
  const figures = sheetFigures(lines);
  const query = q.trim().toLowerCase();
  const shown = lines.filter(l => (show === 'all' || l.status === show) && (!query || `${l.commodity} ${l.description}`.toLowerCase().includes(query)));
  const plan = savePlan(day, lines, edits);
  const pending = plan.creates.length + plan.updates.length;
  const changeDay = (d: string) => { setDay(d); setEdits({}); };
  const valueOf = (l: SheetLine) => edits[l.commodity] ?? shownPrice(l.onDate?.price);

  const save = async () => {
    if (plan.problems.length) { notify(plan.problems[0].message, 'error'); return; }
    if (!pending) return;
    setBusy(true);
    try {
      if (plan.creates.length) await moduleChange(ID, 'prices', 'create', plan.creates);
      if (plan.updates.length) await moduleChange(ID, 'prices', 'update', plan.updates);
      notify(`${plan.creates.length ? `${plan.creates.length} price${plan.creates.length > 1 ? 's' : ''} added` : ''}${plan.creates.length && plan.updates.length ? ', ' : ''}${plan.updates.length ? `${plan.updates.length} updated` : ''} for ${formatDate(day)}.`, 'success');
      setEdits({});
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setBusy(false);
      setReload(r => r + 1);
    }
  };
  const doRemove = async (row: Row) => {
    setBusy(true);
    try {
      await moduleChange(ID, 'prices', 'delete', [row]);
      notify(`The ${formatDate(isoDay(row.effectiveFrom))} price of ${str(row.commodity)} was deleted.`, 'success');
      setEdits(e => { const n = { ...e }; delete n[str(row.commodity)]; return n; });
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setBusy(false); setRemove(null); setReload(r => r + 1);
    }
  };
  const fillMissing = () => setEdits(e => ({ ...e, ...Object.fromEntries(lines.filter(l => l.status === 'Missing' && l.last && e[l.commodity] === undefined).map(l => [l.commodity, shownPrice(l.last!.price)])) }));

  const focus = lines.find(l => l.commodity === picked) ?? shown[0] ?? lines[0] ?? null;
  const history = focus ? (view?.tables.prices ?? []).filter(r => str(r.commodity) === focus.commodity)
    .sort((a, b) => isoDay(b.effectiveFrom).localeCompare(isoDay(a.effectiveFrom))) : [];
  const step = (days: number) => { const d = new Date(`${day}T00:00:00`); d.setDate(d.getDate() + days); changeDay(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`); };

  return (
    <section className="tsf-price">
      {view?.mode === 'local' && onSampleData(ID) && <Notice>{SAMPLE_DATA_NOTE}</Notice>}
      {error && <Notice error><AlertCircle size={16} />{error}<button className="text-button" onClick={() => setReload(r => r + 1)}>Retry</button></Notice>}
      {!view && !error && <div className="panel"><Loading text="Loading commodities and prices…" /></div>}
      {view && <>
        <div className="tsf-price__layout">
          <div className="panel tsf-price__list">
            {/* The date the list is for, right above it, with Save. */}
            <div className="tsf-price__bar">
              <span className="top-asof">As of
                <button type="button" className="top-step" aria-label="Previous day" onClick={() => step(-1)}><ChevronLeft size={14} /></button>
                <input type="date" aria-label="Price date" value={day} onChange={e => changeDay(e.target.value)} />
                <button type="button" className="top-step" aria-label="Next day" onClick={() => step(1)}><ChevronRight size={14} /></button>
              </span>
              <button className="button small" disabled={busy || !pending || plan.problems.length > 0} onClick={() => { void save(); }}><Save size={13} />{busy ? 'Saving…' : pending ? `Save ${pending} price${pending > 1 ? 's' : ''}` : 'Save'}</button>
            </div>
            <div className="tsf-price__tools">
              <div className="trm-seg tsf-tabs" role="radiogroup" aria-label="Show">
                {([['all', 'All'], ['Missing', 'Missing'], ['Set', 'Price set']] as const).map(([id, label]) => (
                  <button key={id} type="button" role="radio" aria-checked={show === id} className={show === id ? 'on' : ''} onClick={() => setShow(id)}>{label} <span className="count">{id === 'all' ? figures.total : id === 'Set' ? figures.set : figures.missing}</span></button>
                ))}
              </div>
              <label className="search ds-search"><Search size={15} /><input aria-label="Search" placeholder="Search commodity…" value={q} onChange={e => setQ(e.target.value)} />{q && <button aria-label="Clear search" onClick={() => setQ('')}>×</button>}</label>
              <button className="text-button" disabled={busy || !figures.missing} onClick={fillMissing} title="Put the last earlier price into every Missing commodity (you can change them before saving)"><Copy size={13} />Use last prices</button>
              {Object.keys(edits).length > 0 && <button className="text-button" disabled={busy} onClick={() => setEdits({})}><RotateCcw size={13} />Undo</button>}
            </div>
            {plan.problems.map(p => <Notice key={p.commodity} error><AlertCircle size={16} />{p.message}</Notice>)}
            <div className="table-wrap ds-table-wrap">
              <DataTable nativeLayout aria-label={`Commodity prices on ${formatDate(day)}`} className="ds-table tsf-price__table"
                columns={[{ kind: 'code' }, { kind: 'amount' }, { kind: 'status' }, { kind: 'text' }]}>
                <thead><tr><th>Commodity</th><th className="num">Price</th><th>Status</th><th>Last earlier price</th></tr></thead>
                <tbody>{shown.map(l => {
                  const v = valueOf(l);
                  const changed = edits[l.commodity] !== undefined && v !== shownPrice(l.onDate?.price);
                  return (
                    <tr key={l.commodity} data-table-row="" className={`${changed ? 'tsf-price__changed' : ''}${focus?.commodity === l.commodity ? ' selected' : ''}`} onClick={() => setPicked(l.commodity)}>
                      <td><button className="tsf-price__pick" onClick={e => { e.stopPropagation(); setPicked(l.commodity); }} aria-pressed={focus?.commodity === l.commodity} aria-label={`Open ${l.commodity}`}>{l.description ? `${l.commodity} · ${l.description}` : l.commodity}</button></td>
                      <td className="num" onClick={e => e.stopPropagation()}><input className="input tsf-price__input" inputMode="decimal" aria-label={`Price of ${l.commodity} on ${formatDate(day)}`}
                        placeholder="Enter price" value={v} onChange={e => setEdits(x => ({ ...x, [l.commodity]: e.target.value }))} /></td>
                      <td>{changed ? <TrafficLightTag tone="amber">{l.onDate ? 'Changed' : 'New'}</TrafficLightTag> : <TrafficLightTag tone={l.status === 'Set' ? 'green' : 'red'}>{l.status === 'Set' ? 'Price set' : 'Missing'}</TrafficLightTag>}</td>
                      <td className="td-muted">{l.last ? `${shownPrice(l.last.price)} ${l.currency} from ${formatDate(str(l.last.effectiveFrom).slice(0, 10))}` : 'None'}</td>
                    </tr>
                  );
                })}</tbody>
              </DataTable>
              {!shown.length && <div className="empty">{lines.length ? 'No commodity matches.' : 'No commodity is maintained yet. Add commodities in Maintain Commodity first.'}</div>}
            </div>
          </div>

          <div className="tsf-price__detail">
            {focus ? <>
              <div className="tsf-price__detail-head">
                <h2>{focus.description || focus.commodity}</h2>
                <p className="td-muted">Prices of commodity <b className="mono">{focus.commodity}</b> · {focus.currency} per {focus.unit || 'unit'} · {history.length} price{history.length === 1 ? '' : 's'}</p>
                <p className="tsf-price__net">On {formatDate(day)}: {focus.onDate ? <b>{shownPrice(focus.onDate.price)} {focus.currency} (set on this date)</b>
                  : focus.last ? <b>{shownPrice(focus.last.price)} {focus.currency} (from {formatDate(str(focus.last.effectiveFrom).slice(0, 10))}; none set on this date)</b> : <b>no price</b>}</p>
              </div>
              <div className="panel">
                <DataTable nativeLayout nativeExport aria-label={`Price history of ${focus.commodity}`} className="ds-table">
                  <thead><tr><th>Effective From</th><th className="num">Price ({focus.currency}/{focus.unit || 'unit'})</th><th>Applies</th><th className="actions">Actions</th></tr></thead>
                  <tbody>{history.map(r => {
                    const d = isoDay(r.effectiveFrom);
                    const applies = (focus.onDate && isoDay(focus.onDate.effectiveFrom) === d) || (!focus.onDate && focus.last && isoDay(focus.last.effectiveFrom) === d);
                    return (
                      <tr key={d} data-table-row="">
                        <td>{formatDate(d)}</td>
                        <td className="num">{shownPrice(r.price)}</td>
                        <td>{applies ? <TrafficLightTag tone="green">Applies</TrafficLightTag> : d > isoDay(day) ? <span className="td-muted">later</span> : <span className="td-muted">earlier</span>}</td>
                        <td className="actions"><button className="button small secondary" disabled={busy} aria-label={`Delete the ${formatDate(d)} price of ${focus.commodity}`} onClick={() => setRemove({ line: focus, row: r })}><Trash2 size={14} />Delete</button></td>
                      </tr>
                    );
                  })}</tbody>
                </DataTable>
                {!history.length && <div className="empty">No price yet for {focus.commodity}. Type one on the left and choose Save.</div>}
              </div>
            </> : <div className="panel empty">Choose a commodity on the left.</div>}
          </div>
        </div>
        <p className="panel-note">Type a price for each commodity on {formatDate(day)} and choose Save. A Missing commodity is priced at its last earlier price until a price is set for this date. Every change is validated before it is saved to SAP.</p>
      </>}
      {remove && <ConfirmDialog danger title={`Delete the ${formatDate(isoDay(remove.row.effectiveFrom))} price of ${remove.line.commodity}?`} busy={busy} confirmLabel="Delete"
        message={`${shownPrice(remove.row.price)} ${remove.line.currency} effective from ${formatDate(isoDay(remove.row.effectiveFrom))} is removed from SAP.`}
        onClose={() => setRemove(null)} onConfirm={() => { void doRemove(remove.row); }} />}
      <Toast toast={toast} />
    </section>
  );
}


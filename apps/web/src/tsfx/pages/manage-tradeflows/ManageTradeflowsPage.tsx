// Manage Tradeflows: the trade flows (as Tradeflows List shows them), and per trade flow its BLs. A BL can be split
// into several, new BLs can take the trade flow's open quantity, and a BL can be deleted (flagged, never removed).
// BLs with a Deal ID are locked here (an assignment is final). Saves go through the data client to
// `tradeflow-manage` (SAP numbers each new BL).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, ArrowLeft, Plus, Scissors, Server, Trash2, X } from 'lucide-react';
import { LargeList } from '@tsfx/components/list/LargeList';
import { DataTable } from '@tsfx/components/table/DataTable';
import { TrafficLightTag } from '@tsfx/components/ui/Badge';
import { ConfirmDialog } from '@tsfx/components/ui/ConfirmDialog';
import { Loading } from '@tsfx/components/ui/Loading';
import { Notice } from '@tsfx/components/ui/Notice';
import { useRowDrag } from '@tsfx/components/ui/McKpi';
import { Modal } from '@tsfx/components/ui/Modal';
import { Toast, useToast } from '@tsfx/components/ui/Toast';
import { moduleView, objectRead, objectWrite, onSampleData, SAMPLE_DATA_NOTE, sourceLabel } from '@tsfx/lib/client/data';
import { usePathname, useRouter, useSearchParams } from '@tsfx/lib/client/nav';
import { formatAmount4, formatDate } from '@tsfx/lib/fields/parse';
import { str } from '@tsfx/lib/grid/grid';
import type { Row, View } from '@tsfx/lib/grid/types';
import { keyFromParam, openParam } from '@tsfx/lib/object/object';
import { openQuantity } from '@tsfx/modules/tradeflow-manage/split';
import { tradeflowManage } from '@tsfx/modules/tradeflow-manage/definition';
import { valueOf } from '@tsfx/modules/tradeflow/pricing';
import { applyDelete, applySplit, blStatus, fmtQty, isDeleted } from './logic';
import { SplitDialog } from './SplitDialog';
import './manage.css';

const ID = 'tradeflow-manage';
const def = tradeflowManage;
interface Stored { header: Row; items: Record<string, Row[]> }
type Dialog = { kind: 'split'; source: Row } | { kind: 'add' } | { kind: 'delete'; bl: Row } | null;

export default function ManageTradeflowsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const openValue = params.get('open');
  const openKey = keyFromParam(def.list.keys, openValue);
  const [view, setView] = useState<View | null>(null);
  const [viewError, setViewError] = useState('');
  const [version, setVersion] = useState(0);
  const [toast, notify] = useToast();
  const lk = useMemo(() => def.lookups(view?.lookups), [view]);

  useEffect(() => {
    let live = true;
    moduleView(ID).then(v => { if (live) setView(v); }, (e: Error) => { if (live) setViewError(e.message); });
    return () => { live = false; };
  }, []);

  // Opening adds a history entry; closing a dialog opened here steps back over it, so the browser's Back (and the page's
  // Back button) never lands on the same dialog again. A dialog opened by a link has no such entry: it is replaced.
  const pushed = useRef(false);
  const open = (row: Row) => { pushed.current = true; router.push(`${pathname}?open=${encodeURIComponent(openParam(def.list.keys, row))}`); };
  const close = () => { if (pushed.current) { pushed.current = false; router.back(); } else router.replace(pathname); };

  return (
    <section className="tsf-manage">
      {/* The trade flows, full width; the open one, with its BLs, in a dialog over them. */}
      <div className="panel ds-app tsf-manage__list">
        <div className="ds-toolbar">
          <div className="ds-title">
            <h2>Trade flows</h2>
            {view && <TrafficLightTag tone={onSampleData(ID) ? 'amber' : 'green'}><Server size={11} />{sourceLabel(ID, view)}</TrafficLightTag>}
          </div>
        </div>
        {view?.mode === 'local' && onSampleData(ID) && <Notice>{SAMPLE_DATA_NOTE}</Notice>}
        {viewError && <Notice error><AlertCircle size={16} />{viewError}</Notice>}
        {!view && !viewError && <Loading text="Loading trade flows…" />}
        {view && <LargeList moduleId={ID} list={def.list} lk={lk} version={version} noun="trade flows" onOpen={open} />}
        <p className="panel-note">Open a trade flow to split its BLs, add BLs or delete one.</p>
      </div>
      {openKey && <Record key={openValue ?? ''} tfKey={openKey} onBack={close} onSaved={text => { setVersion(v => v + 1); notify(text, 'success'); }} onError={text => notify(text, 'error')} />}
      <Toast toast={toast} />
    </section>
  );
}

function Record({ tfKey, onBack, onSaved, onError }: { tfKey: Row; onBack: () => void; onSaved: (text: string) => void; onError: (text: string) => void }) {
  const [obj, setObj] = useState<Stored | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [showDeleted, setShowDeleted] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const drag = useRowDrag<Row>();

  useEffect(() => {
    let live = true;
    objectRead(ID, tfKey).then(o => { if (live) setObj(o); }, (e: Error) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [tfKey, reload]);

  const [detail, setDetail] = useState<Row | null>(null);
  const tfNoTitle = str(tfKey.tfNo);
  const shell = (body: ReactNode, footerStart?: ReactNode) => (
    <Modal size="wide" title={`Trade Flow Details – ${tfNoTitle}`} onClose={onBack} closeOnBackdrop={false} busy={busy}
      footerStart={footerStart} footer={<button className="button secondary" disabled={busy} onClick={onBack}>Close</button>}>{body}</Modal>
  );
  if (error) return shell(<Notice error><AlertCircle size={16} />{error}</Notice>);
  if (!obj) return shell(<Loading text="Loading the trade flow…" />);

  const tf = obj.header;
  const bls = obj.items.bl ?? [];
  const shown = bls.filter(b => showDeleted || !isDeleted(b));
  const deletedCount = bls.filter(isDeleted).length;
  const open = openQuantity(str(tf.quantity), bls);
  const price = Number(tf.price) > 0 ? str(tf.price) : '';
  const cur = str(tf.currency) || 'USD', unit = str(tf.unit);

  const save = async (next: Row[], done: string) => {
    setBusy(true);
    try {
      await objectWrite(ID, 'update', { key: tfKey, etag: tf.__etag, header: tf, items: { bl: next } });
      setDialog(null);
      setReload(r => r + 1);
      onSaved(done);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const dialogs = <>
    {dialog?.kind === 'split' && <SplitDialog tf={tf} source={dialog.source} open={open} busy={busy} onClose={() => setDialog(null)}
      onSave={q => save(applySplit(bls, dialog.source, q, tf), `BL ${str(dialog.source.blNo)} split into ${q.length} BLs`)} />}
    {dialog?.kind === 'add' && <SplitDialog tf={tf} source={null} open={open} busy={busy} onClose={() => setDialog(null)}
      onSave={q => save(applySplit(bls, null, q, tf), `${q.length} BL${q.length > 1 ? 's' : ''} added`)} />}
    {dialog?.kind === 'delete' && <ConfirmDialog title={`Delete BL ${str(dialog.bl.blNo)}?`} danger busy={busy} confirmLabel="Delete BL"
      message={`The BL stays in the list, flagged as deleted; its ${fmtQty(str(dialog.bl.quantity))} ${unit} become open quantity of the trade flow.`}
      onClose={() => setDialog(null)} onConfirm={() => save(applyDelete(bls, str(dialog.bl.blNo)), `BL ${str(dialog.bl.blNo)} deleted`)} />}
  </>;

  // One BL in full, inside the same dialog; Back returns to the trade flow and its BL list.
  if (detail) {
    const b = bls.find(x => str(x.blNo) === str(detail.blNo)) ?? detail;
    const st = blStatus(b);
    const rows: [string, ReactNode][] = [
      ['BL Number', <span className="mono">{str(b.blNo)}</span>],
      ['Trade Flow', `${str(tf.tfNo)} · ${formatDate(str(tf.tfDate))}`],
      ['Record Date', formatDate(str(b.blRecordDate))],
      ['Commodity', str(tf.commodity) || '—'],
      ['Quantity', `${fmtQty(str(b.quantity))} ${unit}`],
      ['Assigned Deal ID', str(b.dealId) ? <span className="mono">{str(b.dealId)}</span> : '—'],
      ['Value', price ? `${formatAmount4(valueOf(price, str(b.quantity)))} ${cur}` : '—'],
      ['Assignment Status', <TrafficLightTag tone={st.tone}>{st.label}</TrafficLightTag>],
      ...(isDeleted(b) ? [['Deleted By', `${str(b.deletedBy)} ${str(b.deletedAt)}`.trim() || '—'] as [string, ReactNode]] : [])
    ];
    return <>
      {shell(<>
        <h3 className="mc-section">BL {str(b.blNo)}</h3>
        <dl className="mc-facts">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      </>, <button className="button secondary" onClick={() => setDetail(null)}><ArrowLeft size={14} />Back to Trade Flow</button>)}
      {dialogs}
    </>;
  }

  const facts: [string, ReactNode][] = [
    ['Trade Flow No', <span className="mono">{str(tf.tfNo)}</span>],
    ['Trade Flow Date', formatDate(str(tf.tfDate))],
    ['BL Number / Reference', str(tf.blNumber) || '—'],
    ['Main Commodity', str(tf.commodity) || '—'],
    ['Goods Description', str(tf.goods) || '—'],
    ['Quantity', `${fmtQty(str(tf.quantity))} ${unit}`],
    ['Open Quantity', <span className={Number(open) > 0 ? 'mc-open' : ''}>{fmtQty(open)} {unit}</span>],
    ['Price', price ? `${formatAmount4(price)} ${cur}` : <TrafficLightTag tone="amber">No price</TrafficLightTag>],
    ['Total Value', price ? `${formatAmount4(valueOf(price, str(tf.quantity)))} ${cur}` : '—'],
    ['Active BLs', String(bls.length - deletedCount)]
  ];

  return (
    <>
      {shell(<>
        <h3 className="mc-section">Trade Flow Summary</h3>
        <dl className="mc-facts">{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        <div className="ds-toolbar tsf-manage__bar">
          <div className="ds-title"><h3 className="mc-section">Bills of Lading</h3><span className="tsf-manage__count">{bls.length - deletedCount} active{deletedCount ? ` · ${deletedCount} deleted` : ''}</span></div>
          <div className="ds-actions">
            <label className="tsf-manage__toggle"><input type="checkbox" checked={showDeleted} onChange={e => setShowDeleted(e.target.checked)} /> Show deleted BLs</label>
            <span className={`mc-dropzone${drag.over === 'split' ? ' drag-over' : ''}`} {...drag.target('split', b => setDialog({ kind: 'split', source: b }))}><Scissors size={13} />Drop a BL to split</span>
            <span className={`mc-dropzone${drag.over === 'delete' ? ' drag-over' : ''}`} {...drag.target('delete', b => setDialog({ kind: 'delete', bl: b }))}><Trash2 size={13} />Drop a BL to delete</span>
            <button className="button small" disabled={Number(open) <= 0} title={Number(open) <= 0 ? 'No open quantity: split a BL or delete one first.' : undefined} onClick={() => setDialog({ kind: 'add' })}><Plus size={15} />Add BLs</button>
          </div>
        </div>
        <div className="tsf-manage__table">
          <DataTable nativeLayout aria-label="Bills of lading">
            <thead><tr><th>BL No</th><th>Record date</th><th>Status</th><th>Deal ID</th><th className="num">Quantity ({unit})</th><th className="num">Value ({cur})</th><th>Deleted by</th><th className="actions">Actions</th></tr></thead>
            <tbody>{shown.map(b => {
              const s = blStatus(b);
              const locked = s.label !== 'Active';
              const why = s.label === 'Assigned' ? `Assigned to ${str(b.dealId)}: an assigned BL cannot be changed.` : s.label === 'Deleted' ? 'This BL is deleted.' : undefined;
              return (
                <tr key={`${b.blNo}|${b.blRecordDate}`} className={isDeleted(b) ? 'deleted' : ''} title={locked ? undefined : 'Drag onto Split or Delete'} {...drag.source(b, `BL ${str(b.blNo)}`, !locked)}>
                  <td><button type="button" className="mc-link mono" onClick={() => setDetail(b)} aria-label={`Open BL ${str(b.blNo)}`}>{str(b.blNo)}</button></td>
                  <td>{formatDate(str(b.blRecordDate))}</td>
                  <td><TrafficLightTag tone={s.tone}>{s.label}</TrafficLightTag></td>
                  <td className="mono">{str(b.dealId) || '—'}</td>
                  <td className="num">{fmtQty(str(b.quantity))}</td>
                  <td className="num">{price ? formatAmount4(valueOf(price, str(b.quantity))) : '—'}</td>
                  <td>{isDeleted(b) ? `${str(b.deletedBy)} ${str(b.deletedAt)}`.trim() : ''}</td>
                  <td className="actions">
                    <button className="button small secondary" disabled={locked} title={why} aria-label={`Split BL ${str(b.blNo)}`} onClick={() => setDialog({ kind: 'split', source: b })}><Scissors size={14} />Split</button>
                    <button className="button small secondary danger" disabled={locked} title={why} aria-label={`Delete BL ${str(b.blNo)}`} onClick={() => setDialog({ kind: 'delete', bl: b })}><Trash2 size={14} />Delete</button>
                  </td>
                </tr>
              );
            })}</tbody>
          </DataTable>
          {!shown.length && <p className="tsf-manage__empty">No active BLs. Use Add BLs to give the trade flow's open quantity new BLs.</p>}
        </div>
      </>)}
      {dialogs}
    </>
  );
}

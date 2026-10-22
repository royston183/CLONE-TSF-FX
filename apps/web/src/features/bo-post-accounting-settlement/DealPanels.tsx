import type { DragEvent, MouseEvent } from 'react'
import { fxTxnStatusLabel } from '../../shared/fx/txn-status.ts'
import { TRANSFER_TYPES } from '../mo-execute-settlement-deal-id/logic.ts'
import { fmtAmt, fmtMoney, fmtRate } from './format.ts'
import { detailCells, isFxPosted, isInvPosted, isRowDraggable, statusInfo, toolbarState } from './logic.ts'
import type { Deal, DragKind, DragState, DocPreview } from './types.ts'

const DASH = <span className="muted-dash">{'–'}</span>
const PENDING = <span className="doc-link-pending">not posted</span>
/** A posted leg whose document SAP did not return, and none references the transaction. */
const DOC_UNKNOWN = <span className="doc-link-pending" title="Posted in TBB1, but no FI document number was returned or found for this transaction">not recorded</span>

export function StatusBadge({ deal }: { deal: Deal }) {
  const si = statusInfo(deal.status, deal.statusCode, deal.statusText)
  return (
    <span className={`status-cell ${si.cls}`}>
      <span className="dot"></span>
      {si.label}
    </span>
  )
}

export function DetailGrid({ deal }: { deal: Deal }) {
  return (
    <div className="detail-grid">
      {detailCells(deal).map((c) => (
        <div className="detail-cell" key={c.label}>
          <div className="detail-lbl">{c.label}</div>
          <div className={`detail-val ${c.cls}`}>{c.value}</div>
        </div>
      ))}
    </div>
  )
}

export type DropHandlers = {
  over: DragKind | null
  onDragOver: (e: DragEvent<HTMLButtonElement>) => void
  onDragEnter: (e: DragEvent<HTMLButtonElement>, kind: DragKind) => void
  onDragLeave: (kind: DragKind) => void
  onDrop: (e: DragEvent<HTMLButtonElement>, kind: DragKind) => void
}

/** The "common actions" bar under the header panel. */
export function Toolbar({
  deal,
  drop,
  onRefresh,
  onViewInvoice,
  onPostFx,
  onPostInvoice,
  onAccounting,
  onInitiate,
}: {
  deal: Deal
  drop: DropHandlers
  onRefresh: () => void
  onViewInvoice: () => void
  onPostFx: () => void
  onPostInvoice: () => void
  onAccounting: () => void
  onInitiate: () => void
}) {
  const t = toolbarState(deal)
  const dropClass = (kind: DragKind) => (drop.over === kind ? 'drag-target drag-over' : 'drag-target')
  return (
    <div className="common-actions">
      <button type="button" className="common-btn btn-ref" onClick={onRefresh}>
        <span className="ic">{'↻'}</span>Refresh
      </button>
      <button type="button" className="common-btn btn-inv" onClick={onViewInvoice}>
        <span className="ic">{'👁'}</span>View Trade Invoice
      </button>
      <button
        type="button"
        className={`common-btn btn-postfx ${dropClass('fx')}`}
        disabled={t.postFxDisabled}
        onClick={onPostFx}
        onDragOver={drop.onDragOver}
        onDragEnter={(e) => drop.onDragEnter(e, 'fx')}
        onDragLeave={() => drop.onDragLeave('fx')}
        onDrop={(e) => drop.onDrop(e, 'fx')}
      >
        <span className="ic">{'💾'}</span>Post FX Deal
      </button>
      <button
        type="button"
        className={`common-btn btn-postti ${dropClass('inv')}`}
        disabled={t.postInvDisabled}
        onClick={onPostInvoice}
        onDragOver={drop.onDragOver}
        onDragEnter={(e) => drop.onDragEnter(e, 'inv')}
        onDragLeave={() => drop.onDragLeave('inv')}
        onDrop={(e) => drop.onDrop(e, 'inv')}
      >
        <span className="ic">{'💾'}</span>Post Trade Invoice
      </button>
      <button type="button" className="common-btn btn-acc approve" disabled={t.accountingDisabled} onClick={onAccounting}>
        <span className="ic">{'✅'}</span>Accounting Completed
      </button>
      {t.showInitiate && (
        <button type="button" className="common-btn btn-init primary" onClick={onInitiate}>
          <span className="ic">{'▶'}</span>Initiate Settlement
        </button>
      )}
    </div>
  )
}

type RowDrag = {
  dragging: DragState | null
  onDragStart: (e: DragEvent<HTMLTableRowElement>, kind: DragKind, idx: number) => void
  onDragEnd: () => void
}

const stop = (e: MouseEvent, fn: () => void) => {
  e.stopPropagation()
  fn()
}

function DocLink({ docNo, entity, onPreview }: { docNo: string; entity: string; onPreview: (p: DocPreview) => void }) {
  return (
    <button
      type="button"
      className="tbl-link"
      onClick={(e) => stop(e, () => onPreview({ kind: 'FI', docNo, entity }))}
    >
      {docNo}
    </button>
  )
}

export function FxTable({
  deal,
  drag,
  onOpen,
  onPreview,
}: {
  deal: Deal
  drag: RowDrag
  onOpen: (idx: number) => void
  onPreview: (p: DocPreview) => void
}) {
  return (
    <div className="table-wrap">
      <table className="list-table">
        <thead>
          <tr>
            <th className="left">Sequence</th>
            <th className="left">CoCode</th>
            <th className="left">Deal Type</th>
            <th className="left">DSS Deal</th>
            <th className="left">FI Doc 1</th>
            <th className="left">FI Doc 2</th>
            <th className="left">Transaction No</th>
            <th className="left">Txn Type</th>
            <th className="left">Trade Date</th>
            <th className="left">Value Date</th>
            <th className="num">Buy</th>
            <th className="num">Sell</th>
            <th className="num">All-in Rate</th>
            <th className="num">Spot</th>
            <th className="num">Swap Rate</th>
            <th className="left">Partner Name</th>
            <th className="left">Txn Status</th>
            <th className="left">Txn Status Desc</th>
            <th className="left">Profit Center</th>
            <th className="left">Counterparty</th>
            <th className="left">Bus. Area</th>
            <th className="left">Status</th>
          </tr>
        </thead>
        <tbody>
          {deal.top.length === 0 ? (
            <tr className="empty-row">
              <td colSpan={23}>{deal.fxWaiting ?? 'No FX deal legs found for this Deal ID.'}</td>
            </tr>
          ) : (
            deal.top.map((r, idx) => {
              const posted = isFxPosted(r)
              const draggable = isRowDraggable(deal, posted)
              const isDragging = drag.dragging?.kind === 'fx' && drag.dragging.idx === idx
              return (
                <tr
                  key={r.rfha}
                  className={[posted ? 'posted' : '', isDragging ? 'dragging-row' : ''].filter(Boolean).join(' ')}
                  draggable={draggable}
                  onDragStart={draggable ? (e) => drag.onDragStart(e, 'fx', idx) : undefined}
                  onDragEnd={draggable ? drag.onDragEnd : undefined}
                  onDoubleClick={() => onOpen(idx)}
                  title="Double-click to open posting details"
                >
                  <td className="left">{r.seq || DASH}</td>
                  <td className="left">{r.entity}</td>
                  <td className="left">
                    <span className="deal-type-chip">{r.dealType}</span>
                  </td>
                  <td className="left">{r.dssDeal || DASH}</td>
                  <td className="left">
                    {r.doc1 ? <DocLink docNo={r.doc1} entity={r.entity} onPreview={onPreview} /> : posted ? DOC_UNKNOWN : PENDING}
                  </td>
                  <td className="left">
                    {r.doc2 ? <DocLink docNo={r.doc2} entity={r.entity} onPreview={onPreview} /> : posted && !r.doc1 ? DOC_UNKNOWN : posted ? DASH : PENDING}
                  </td>
                  <td className="left">
                    <button
                      type="button"
                      className="tbl-link"
                      onClick={(e) => stop(e, () => onPreview({ kind: 'TXN', docNo: r.rfha, entity: r.entity }))}
                    >
                      {r.rfha}
                    </button>
                  </td>
                  <td className="left">{r.txnType ? `${r.txnType}${r.txnTypeDesc ? ` - ${r.txnTypeDesc}` : ''}` : DASH}</td>
                  <td className="left">{r.tradeDate || DASH}</td>
                  <td className="left">{r.valueDate || DASH}</td>
                  <td className="num">{fmtMoney(r.buyCurr, r.buyAmt)}</td>
                  <td className="num">{fmtMoney(r.sellCurr, r.sellAmt)}</td>
                  <td className="num">{fmtRate(r.rate)}</td>
                  <td className="num">{r.spot ? fmtRate(r.spot) : DASH}</td>
                  <td className="num">{r.swap ? fmtRate(r.swap) : DASH}</td>
                  <td className="left">{r.partner ? `${r.partner}${r.partnerName ? ` - ${r.partnerName}` : ''}` : DASH}</td>
                  <td className="left">{r.txnStatus || DASH}</td>
                  <td className="left">{r.txnStatus ? fxTxnStatusLabel(r.txnStatus) : DASH}</td>
                  <td className="left">{r.profitCenter || DASH}</td>
                  <td className="left">{r.partner || DASH}</td>
                  <td className="left">{r.busArea || DASH}</td>
                  <td className="left">{r.status}</td>
                </tr>
              )
            })
          )}
          {deal.top.length > 0 && deal.fxWaiting ? (
            <tr className="empty-row">
              <td colSpan={23}>{deal.fxWaiting}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}

export function InvTable({
  deal,
  drag,
  onOpen,
  onPreview,
}: {
  deal: Deal
  drag: RowDrag
  onOpen: (idx: number) => void
  onPreview: (p: DocPreview) => void
}) {
  return (
    <div className="table-wrap">
      <table className="list-table">
        <thead>
          <tr>
            <th>Post</th>
            <th className="chk-col">Settle</th>
            <th className="left">Sequence</th>
            <th className="left">CoCode</th>
            <th className="left">Trade Type</th>
            <th className="left">Seller</th>
            <th className="left">Receipt/Pay</th>
            <th className="left">Buyer</th>
            <th className="left">Settlement Desc</th>
            <th className="left">Posting Date</th>
            <th className="left">Due Date</th>
            <th className="left">Linked FX Deal</th>
            <th className="left">DSS Deal</th>
            <th className="left">Transfer Desc</th>
            <th className="left">Transfer Type</th>
            <th className="left">Posting Type</th>
            <th className="num">Invoice Amount</th>
            <th className="num">Payment Amount</th>
            <th className="num">Premium</th>
            <th className="left">FI Document</th>
            <th className="left">Doc Msg</th>
          </tr>
        </thead>
        <tbody>
          {deal.inv.length === 0 ? (
            <tr className="empty-row">
              <td colSpan={21}>{deal.invWaiting ?? 'No trade invoice legs found for this Deal ID.'}</td>
            </tr>
          ) : (
            deal.inv.map((r, idx) => {
              const posted = isInvPosted(r)
              const draggable = isRowDraggable(deal, posted)
              const isDragging = drag.dragging?.kind === 'inv' && drag.dragging.idx === idx
              return (
                <tr
                  key={r.tType}
                  className={[posted ? 'posted' : '', isDragging ? 'dragging-row' : ''].filter(Boolean).join(' ')}
                  draggable={draggable}
                  onDragStart={draggable ? (e) => drag.onDragStart(e, 'inv', idx) : undefined}
                  onDragEnd={draggable ? drag.onDragEnd : undefined}
                  onDoubleClick={() => onOpen(idx)}
                  title="Double-click to open posting details"
                >
                  <td>
                    <input className="chk" type="checkbox" checked={r.postCheck} disabled readOnly />
                  </td>
                  <td className="chk-col">
                    <input className="chk" type="checkbox" checked={r.setCheck} disabled readOnly />
                  </td>
                  <td className="left">{r.seq || DASH}</td>
                  <td className="left">{r.bukrs || DASH}</td>
                  <td className="left">{r.tradeType}</td>
                  <td className="left">{r.sell || DASH}</td>
                  <td className="left">{r.tType.charAt(3) === 'P' ? 'Payment' : r.tType.charAt(3) === 'S' ? 'Receipt' : DASH}</td>
                  <td className="left">{r.buy || DASH}</td>
                  <td className="left">{r.setDesc}</td>
                  <td className="left">{r.postDate || DASH}</td>
                  <td className="left">{r.dueDate || DASH}</td>
                  <td className="left">{r.dMap ? <span className="deal-type-chip">{r.dMap}</span> : DASH}</td>
                  <td className="left">{r.dssDeal || r.dssDealType || DASH}</td>
                  <td className="left">{TRANSFER_TYPES[r.trfType] ?? DASH}</td>
                  <td className="left">{r.trfType}</td>
                  <td className="left">{r.postDesc || DASH}</td>
                  <td className="num emph-amt">{fmtMoney(r.invCurr, r.invAmt)}</td>
                  <td className="num emph-pay">{fmtMoney(r.payCurr, r.payAmt)}</td>
                  <td className="num">{r.preAmt ? fmtAmt(r.preAmt) : DASH}</td>
                  <td className="left">
                    {r.fiDoc ? <DocLink docNo={r.fiDoc} entity={r.buy} onPreview={onPreview} /> : PENDING}
                  </td>
                  <td className="left">{r.docMsg || DASH}</td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

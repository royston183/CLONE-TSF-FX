import { fmtNdfCash, fmtNdfDate, fmtNdfRate } from '../../shared/fx/ndf-columns.ts'
import { formatAmount } from './format.ts'
import type { FxDeal, Indexed, ToastKind, TradeInvoice } from './types.ts'

const Dash = () => <span className="mut">-</span>

function Pager({ label }: { label: string }) {
  return (
    <div className="pager-row">
      <span>{label}</span>
      <div className="pager-ctrl">
        <button type="button" disabled>
          &lsaquo;
        </button>
        <button type="button" className="active">
          1
        </button>
        <button type="button" disabled>
          &rsaquo;
        </button>
      </div>
    </div>
  )
}

function Tools({
  placeholder,
  search,
  onSearch,
  onToast,
  exportMessage,
}: {
  placeholder: string
  search: string
  onSearch: (v: string) => void
  onToast: (message: string, kind: ToastKind) => void
  exportMessage: string
}) {
  return (
    <div className="panel-tools">
      <div className="mini-search">
        <input type="text" placeholder={placeholder} value={search} onChange={(e) => onSearch(e.target.value)} />
      </div>
      <button
        className="btn-icon"
        type="button"
        title="Filter"
        onClick={() => onToast('Filter panel - not needed for a single Deal ID view.', 'info')}
      >
        &#9776;
      </button>
      <button className="btn-icon" type="button" title="Download" onClick={() => onToast(exportMessage, 'success')}>
        &#8681;
      </button>
    </div>
  )
}

export function FxGrid({
  rows,
  total,
  search,
  selectedIdx,
  onSearch,
  onSelect,
  onOpen,
  onViewTxn,
  onViewDoc,
  onToast,
  emptyText,
  note,
}: {
  rows: readonly Indexed<FxDeal>[]
  total: number
  search: string
  selectedIdx: number | null
  onSearch: (v: string) => void
  onSelect: (idx: number) => void
  onOpen: (idx: number) => void
  onViewTxn: (idx: number) => void
  onViewDoc: (doc: string) => void
  onToast: (message: string, kind: ToastKind) => void
  /** Shown when there are no rows, e.g. the WAITING FOR API reason. */
  emptyText?: string | undefined
  /** What is still WAITING FOR API under rows that did load (the option legs). */
  note?: string | undefined
}) {
  const docCell = (doc: string) =>
    doc ? (
      <span
        className="hotspot"
        onClick={(e) => {
          e.stopPropagation()
          onViewDoc(doc)
        }}
      >
        {doc}
      </span>
    ) : (
      <Dash />
    )

  return (
    <div className="panel">
      <div className="panel-title">
        <div className="panel-title-left">
          <span className="dot-bullet"></span>
          <h2>FX Deal Settlement</h2>
          <span className="panel-sub">{rows.length} record(s)</span>
        </div>
        <Tools
          placeholder="Search FX deals..."
          search={search}
          onSearch={onSearch}
          onToast={onToast}
          exportMessage="Exporting FX Deal Settlement grid..."
        />
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th className="left">Seq</th>
              <th className="left">Deal Type</th>
              <th className="left">Transaction</th>
              <th className="left">Counterparty</th>
              <th className="left">Txn Date</th>
              <th className="left">Value Date</th>
              <th className="left">Entity</th>
              <th className="left">B/S 1</th>
              <th className="left">Curr 1</th>
              <th>Amount 1</th>
              <th className="left">B/S 2</th>
              <th className="left">Curr 2</th>
              <th>Amount 2</th>
              <th>Spot</th>
              <th>All-in Rate</th>
              <th className="left">NDF Fixing Date</th>
              <th className="left">NDF Ref</th>
              <th>NDF Settlement Rate</th>
              <th>Cash Settlement Amount</th>
              <th className="left">Cash Currency</th>
              <th className="left">MC Ref No</th>
              <th className="left">Status</th>
              <th className="left">Doc No 1</th>
              <th className="left">Doc No 2</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="empty-row">
                <td colSpan={24}>{emptyText ?? 'No FX deal transactions for this Deal ID.'}</td>
              </tr>
            ) : (
              rows.map(({ row: r, idx }) => (
                <tr
                  key={r.rfha}
                  className={selectedIdx === idx ? 'row-sel' : ''}
                  onClick={() => onSelect(idx)}
                  onDoubleClick={() => onOpen(idx)}
                >
                  <td className="left">{r.seq}</td>
                  <td className="left">
                    <span className={`chip ${r.dealTypeChip}`}>{r.dealType}</span>
                  </td>
                  <td className="left">
                    <span
                      className="hotspot"
                      onClick={(e) => {
                        e.stopPropagation()
                        onViewTxn(idx)
                      }}
                    >
                      {r.rfha}
                    </span>
                  </td>
                  <td className="left">{r.bp}</td>
                  <td className="left">{r.txnDate}</td>
                  <td className="left">{r.valDate}</td>
                  <td className="left">{r.entity}</td>
                  <td className="left">{r.bs1}</td>
                  <td className="left">{r.curr1}</td>
                  <td className="num">{formatAmount(r.amt1)}</td>
                  <td className="left">{r.bs2}</td>
                  <td className="left">{r.curr2}</td>
                  <td className="num">{formatAmount(r.amt2)}</td>
                  <td className="num">{r.spot}</td>
                  <td className="num">{r.rate}</td>
                  <td className="left">{fmtNdfDate(r.ndf?.ndfDate ?? '')}</td>
                  <td className="left">{r.ndf?.ndfRef ?? ''}</td>
                  <td className="num">{fmtNdfRate(r.ndf?.ndfRate)}</td>
                  <td className="num">{fmtNdfCash(r.ndf?.cashAmount)}</td>
                  <td className="left">{r.ndf?.cashCurrency ?? ''}</td>
                  <td className="left">{r.mcRefNo}</td>
                  <td className="left">
                    <span className={`chip ${r.statusChip}`}>{r.status}</span>
                  </td>
                  <td className="left">{docCell(r.doc1)}</td>
                  <td className="left">{docCell(r.doc2)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {note ? <div className="panel-sub" style={{ padding: '6px 14px' }}>{note}</div> : null}
      <Pager label={`Showing ${rows.length} of ${total}`} />
    </div>
  )
}

export function InvGrid({
  rows,
  total,
  hidden,
  search,
  selectedIdx,
  onSearch,
  onSelect,
  onOpen,
  onViewDoc,
  onToast,
  emptyText,
}: {
  rows: readonly Indexed<TradeInvoice>[]
  total: number
  hidden: boolean
  search: string
  selectedIdx: number | null
  onSearch: (v: string) => void
  onSelect: (idx: number) => void
  onOpen: (idx: number) => void
  onViewDoc: (doc: string) => void
  onToast: (message: string, kind: ToastKind) => void
  /** Shown when there are no rows, e.g. the WAITING FOR API reason. */
  emptyText?: string | undefined
}) {
  return (
    <div className={hidden ? 'panel hidden' : 'panel'}>
      <div className="panel-title">
        <div className="panel-title-left">
          <span className="dot-bullet"></span>
          <h2>Trade Invoice Settlement</h2>
          <span className="panel-sub">{rows.length} record(s)</span>
        </div>
        <Tools
          placeholder="Search invoice legs..."
          search={search}
          onSearch={onSearch}
          onToast={onToast}
          exportMessage="Exporting Trade Invoice Settlement grid..."
        />
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th className="left">Sequence</th>
              <th className="left">Leg</th>
              <th className="left">Transfer Desc</th>
              <th className="left">Doc Type</th>
              <th className="left">Reference</th>
              <th className="left">Debit Posting</th>
              <th className="left">Credit Posting</th>
              <th className="left">Due Date</th>
              <th className="left">Posting Date</th>
              <th>Invoice Amt</th>
              <th className="left">Curr</th>
              <th>Payment Amt</th>
              <th className="left">Rec/Pay</th>
              <th className="left">Transfer Type</th>
              <th className="left">FI Doc</th>
              <th className="left">Settled</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="empty-row">
                <td colSpan={16}>{emptyText ?? 'No trade invoice legs for this Deal ID.'}</td>
              </tr>
            ) : (
              rows.map(({ row: r, idx }) => (
                <tr
                  key={r.leg}
                  className={selectedIdx === idx ? 'row-sel' : ''}
                  onClick={() => onSelect(idx)}
                  onDoubleClick={() => onOpen(idx)}
                >
                  <td className="left">{r.seq ? Number(r.seq) || r.seq : <Dash />}</td>
                  <td className="left">
                    <span className="chip chip-t">{r.leg}</span>
                  </td>
                  <td className="left">{r.trfDesc}</td>
                  <td className="left">{r.docType}</td>
                  <td className="left">{r.xblnr}</td>
                  <td className="left">{r.drPost}</td>
                  <td className="left">{r.crPost}</td>
                  <td className="left">{r.dueDate}</td>
                  <td className="left">{r.postDate || <Dash />}</td>
                  <td className="num">{formatAmount(r.invAmt)}</td>
                  <td className="left">{r.curr}</td>
                  <td className="num">{formatAmount(r.payAmt)}</td>
                  <td className="left">{r.recPay}</td>
                  <td className="left">{r.trfType}</td>
                  <td className="left">
                    {r.fiDoc ? (
                      <span
                        className="hotspot"
                        onClick={(e) => {
                          e.stopPropagation()
                          onViewDoc(r.fiDoc)
                        }}
                      >
                        {r.fiDoc}
                      </span>
                    ) : (
                      <Dash />
                    )}
                  </td>
                  <td className="left">
                    {r.setCo ? <span className="chip chip-done">Yes</span> : <span className="chip chip-open">No</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pager label={`Showing ${rows.length} of ${total}`} />
    </div>
  )
}

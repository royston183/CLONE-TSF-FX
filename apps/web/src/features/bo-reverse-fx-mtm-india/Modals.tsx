import type { ReactNode } from 'react'
import { INITIAL_KEY_DATE } from './data.ts'
import { addDays, formatDate, formatNumber } from './format.ts'
import { docInfo } from './logic.ts'
import type { DocField, ModalState, PostLog, Row } from './types.ts'

function Detail({ k, v }: { k: string; v: string }) {
  return (
    <div className="detail">
      <div className="k">{k}</div>
      <div className="v" title={v}>
        {v}
      </div>
    </div>
  )
}

function TransactionBody({ r }: { r: Row }) {
  return (
    <>
      <div className="detail-grid">
        <Detail k="Transaction" v={r.rfha} />
        <Detail k="Company Code" v={r.bukrs} />
        <Detail k="Company Name" v={r.butxt} />
        <Detail k="Product Type" v={r.sgsart} />
        <Detail k="Transaction Type" v={r.xtext} />
        <Detail k="Business Partner" v={r.kontrh} />
        <Detail k="Partner Name" v={r.bpName} />
        <Detail k="Currency Pair" v={r.cpair} />
        <Detail k="Trade Date" v={formatDate(r.tradeDate)} />
        <Detail k="Value Date" v={formatDate(r.valueDate)} />
        <Detail k="USD Buy/Sell" v={r.buySell} />
        <Detail k="External Reference" v={r.externalRef} />
      </div>
      <div className="section-label">Valuation</div>
      <div className="detail-grid">
        <Detail k="USD Amount" v={formatNumber(r.fAmt, 2)} />
        <Detail k="Contract Rate" v={formatNumber(r.cRate, 4)} />
        <Detail k="Contract Amount (INR)" v={formatNumber(r.ccAmt, 2)} />
        <Detail k="Valuation Spot" v={formatNumber(r.vSpot, 4)} />
        <Detail k="Valuation Swap" v={formatNumber(r.vSwap, 4)} />
        <Detail k="Valuation Rate" v={formatNumber(r.vRate, 4)} />
        <Detail k="Valuation Amount (INR)" v={formatNumber(r.vAmt, 2)} />
        <Detail k="Valuation G/L (INR)" v={r.vGl === null ? '—' : formatNumber(r.vGl, 2)} />
        <Detail k="MTM Document 1" v={r.mtmDoc || '—'} />
        <Detail k="MTM Document 2" v={r.mtmDoc2 || '—'} />
      </div>
    </>
  )
}

function DocumentBody({ r, field }: { r: Row; field: DocField }) {
  const { isRev, ledger } = docInfo(field)
  return (
    <>
      <div className="detail-grid">
        <Detail k="Document Number" v={r[field]} />
        <Detail k="Company Code" v={r.bukrs} />
        <Detail k="Fiscal Year" v={INITIAL_KEY_DATE.slice(0, 4)} />
        <Detail k="Transaction" v={r.rfha} />
        <Detail k="Document Type" v="TR" />
        <Detail k="Ledger" v={`Ledger ${ledger}`} />
        <Detail k="Posting Date" v={formatDate(isRev ? addDays(INITIAL_KEY_DATE, 1) : INITIAL_KEY_DATE)} />
        <Detail k="Reference" v={r.rfha} />
        <Detail k="Currency" v="INR" />
      </div>
      <div className="section-label">Navigation</div>
      <div style={{ color: '#5D7287', lineHeight: 1.6 }}>In SAP, this hotspot opens the accounting document in FB03.</div>
    </>
  )
}

function LogBody({ logs }: { logs: PostLog[] }) {
  return (
    <table className="mini-table">
      <thead>
        <tr>
          <th>Status</th>
          <th>Transaction</th>
          <th>Document</th>
          <th>Type</th>
          <th className="num">Difference</th>
          <th className="num">Contract Rate</th>
          <th>Message</th>
        </tr>
      </thead>
      <tbody>
        {logs.map((l) => (
          <tr key={l.kind}>
            <td className="center">
              <span className={l.ok ? 'ok-icon' : 'err-icon'}>{l.ok ? '✓' : '!'}</span>
            </td>
            <td>{l.rfha}</td>
            <td>{l.doc}</td>
            <td>{l.kind}</td>
            <td className="num">{formatNumber(l.diff, 2)}</td>
            <td className="num">{formatNumber(l.rate, 4)}</td>
            <td>{l.message}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * The single modal backdrop of the original. The content depends on what was opened; the
 * backdrop stays mounted (hidden) and a click on it, but not on the card, closes it.
 */
export function ModalHost({
  modal,
  rows,
  onClose,
}: {
  modal: ModalState | null
  rows: Row[]
  onClose: () => void
}) {
  let title = ''
  let size = ''
  let body: ReactNode = null
  if (modal) {
    if (modal.kind === 'log') {
      title = 'Message Log'
      size = ' wide'
      body = <LogBody logs={modal.logs} />
    } else {
      const r = rows.find((x) => x.rfha === modal.rfha)
      if (r && modal.kind === 'txn') {
        title = 'Transaction Details'
        body = <TransactionBody r={r} />
      } else if (r && modal.kind === 'doc') {
        title = docInfo(modal.field).isRev ? 'Reversal FI Document' : 'MTM FI Document'
        size = ' small'
        body = <DocumentBody r={r} field={modal.field} />
      }
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      style={{ display: modal ? 'flex' : 'none' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className={`modal${size}`}>
        <div className="modal-head">
          <div className="modal-title">{title}</div>
          <button className="close-btn" type="button" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">{body}</div>
        <div className="modal-foot">
          <button className="btn compact" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

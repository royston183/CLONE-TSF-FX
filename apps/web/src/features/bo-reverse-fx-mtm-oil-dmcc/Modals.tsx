import type { ReactNode } from 'react'
import { documentDetails, documentTitle, transactionDetails } from './logic.ts'
import { formatNumber } from './format.ts'
import type { DetailCell, DocField, LogEntry, Row } from './types.ts'

type FrameProps = {
  title: string
  size?: 'small' | 'wide'
  onClose: () => void
  children: ReactNode
}

/** Backdrop + box shared by every popup; clicking the backdrop itself closes it. */
function Frame({ title, size, onClose, children }: FrameProps) {
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      style={{ display: 'flex' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className={`modal${size ? ` ${size}` : ''}`}>
        <div className="modal-head">
          <div className="modal-title">{title}</div>
          <button type="button" className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-foot">
          <button type="button" className="btn compact" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function DetailGrid({ cells }: { cells: DetailCell[] }) {
  return (
    <div className="detail-grid">
      {cells.map((c) => (
        <div key={c.label} className="detail">
          <div className="k">{c.label}</div>
          <div className="v" title={c.value}>
            {c.value}
          </div>
        </div>
      ))}
    </div>
  )
}

export function TransactionModal({ row, onClose }: { row: Row; onClose: () => void }) {
  const d = transactionDetails(row)
  return (
    <Frame title="Transaction Details" onClose={onClose}>
      <DetailGrid cells={d.top} />
      <div className="section-label">Valuation</div>
      <DetailGrid cells={d.valuation} />
    </Frame>
  )
}

export function DocumentModal({ row, field, onClose }: { row: Row; field: DocField; onClose: () => void }) {
  return (
    <Frame title={documentTitle(field)} size="small" onClose={onClose}>
      <DetailGrid cells={documentDetails(row, field)} />
      <div className="section-label">Navigation</div>
      <div style={{ color: '#5D7287', lineHeight: 1.6 }}>In SAP, this hotspot opens the accounting document in FB03.</div>
    </Frame>
  )
}

export function MessageLogModal({ logs, onClose }: { logs: LogEntry[]; onClose: () => void }) {
  return (
    <Frame title="Message Log" size="wide" onClose={onClose}>
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
    </Frame>
  )
}

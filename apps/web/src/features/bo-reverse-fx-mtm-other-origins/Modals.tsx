import type { ReactNode } from 'react'
import { formatNumber } from './format.ts'
import {
  documentDetails,
  documentTitle,
  transactionHeaderDetails,
  transactionValuationDetails,
} from './logic.ts'
import type { Detail, DocField, LogEntry, Row } from './types.ts'

type ModalProps = {
  title: string
  size?: 'small' | 'wide'
  onClose: () => void
  children: ReactNode
}

/** The original's single modal box: backdrop click or Close dismisses it. */
export function Modal({ title, size, onClose, children }: ModalProps) {
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
            &times;
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

function DetailGrid({ items }: { items: Detail[] }) {
  return (
    <div className="detail-grid">
      {items.map((d) => (
        <div key={d.k} className="detail">
          <div className="k">{d.k}</div>
          <div className="v" title={d.v}>
            {d.v}
          </div>
        </div>
      ))}
    </div>
  )
}

export function TransactionModal({ row, onClose }: { row: Row; onClose: () => void }) {
  return (
    <Modal title="Transaction Details" onClose={onClose}>
      <DetailGrid items={transactionHeaderDetails(row)} />
      <div className="section-label">Valuation</div>
      <DetailGrid items={transactionValuationDetails(row)} />
    </Modal>
  )
}

export function DocumentModal({ row, field, onClose }: { row: Row; field: DocField; onClose: () => void }) {
  return (
    <Modal title={documentTitle(field)} size="small" onClose={onClose}>
      <DetailGrid items={documentDetails(row, field)} />
      <div className="section-label">Navigation</div>
      <div style={{ color: '#5D7287', lineHeight: 1.6 }}>In SAP, this hotspot opens the accounting document in FB03.</div>
    </Modal>
  )
}

export function MessageLogModal({ logs, onClose }: { logs: readonly LogEntry[]; onClose: () => void }) {
  return (
    <Modal title="Message Log" size="wide" onClose={onClose}>
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
            <tr key={l.doc}>
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
    </Modal>
  )
}

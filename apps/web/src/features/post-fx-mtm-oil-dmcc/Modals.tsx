import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { formatAmount, formatRate } from './format.ts'
import { confirmBody, logCounts } from './logic.ts'
import type { DetailItem, DocView, LogMsg, PendingRun, TxnView } from './types.ts'

type FrameProps = {
  /** Extra classes on the box ("modal-wide" ...). */
  boxClass: string
  boxStyle?: CSSProperties
  titleId: string
  title: string
  /** Closes the popup from the x button and from a press on the dimmed backdrop. */
  onClose: () => void
  children: ReactNode
}

/**
 * The original's .modal-overlay / .modal box: left-aligned, header row with a close x, backdrop
 * press closes. On opening the primary button (else the first button) takes focus.
 */
function Frame({ boxClass, boxStyle, titleId, title, onClose, children }: FrameProps) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const t = setTimeout(() => {
      const el = ref.current
      const btn = el?.querySelector<HTMLElement>('.btn-primary') ?? el?.querySelector<HTMLElement>('.btn')
      btn?.focus()
    }, 30)
    return () => clearTimeout(t)
  }, [])
  return (
    <div
      className="modal-overlay open"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className={`modal modal-left ${boxClass}`.trim()} style={boxStyle} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <div className="modal-head-row">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="modal-close-btn" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

const CLOSE_BTN_STYLE: CSSProperties = { flex: '0 0 auto', minWidth: 110 }

function CloseFooter({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
      <button type="button" className="btn btn-secondary" style={CLOSE_BTN_STYLE} onClick={onClose}>
        Close
      </button>
    </div>
  )
}

function DetailGrid({ cols, items }: { cols: 3 | 4; items: DetailItem[] }) {
  return (
    <div className={`detail-grid cols-${cols}`}>
      {items.map((d) => (
        <div key={d.label} className={`detail-item${d.full ? ' full' : ''}`}>
          <span className="detail-label">{d.label}</span>
          <span className="detail-value">{d.value}</span>
        </div>
      ))}
    </div>
  )
}

/** Confirm mass posting (View With FI Posting). */
export function ConfirmModal({
  run,
  onPost,
  onCancel,
}: {
  run: PendingRun
  onPost: () => void
  onCancel: () => void
}) {
  return (
    <Frame boxClass="" boxStyle={{ width: 420 }} titleId="confirmTitle" title="Post MTM Documents" onClose={onCancel}>
      <p className="confirm-body" id="confirmBody">
        {confirmBody(run.params.keyDate)}
      </p>
      <div className="confirm-count" id="confirmCounts">
        <div className="cc">
          <div className="l">Transactions listed</div>
          <div className="v">{run.listed}</div>
        </div>
        <div className="cc">
          <div className="l">To be posted</div>
          <div className="v">{run.eligible.length}</div>
        </div>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={onPost}>
          Post
        </button>
      </div>
    </Frame>
  )
}

/** Message Log (screen 9000): one row per document posted or error. */
export function MessageLogModal({ msgs, onClose }: { msgs: LogMsg[]; onClose: () => void }) {
  const { ok, err } = logCounts(msgs)
  return (
    <Frame boxClass="modal-scrollable modal-wide" titleId="logTitle" title="Message Log" onClose={onClose}>
      <div className="modal-body-scroll" id="logBody">
        <div className="log-summary">
          <span>
            Documents posted: <b>{ok}</b>
          </span>
          <span>
            Errors: <b>{err}</b>
          </span>
        </div>
        <div className="popup-table-wrap">
          <table className="popup-table">
            <thead>
              <tr>
                <th style={{ width: 90 }}>Status</th>
                <th>Transaction</th>
                <th>Document</th>
                <th className="num">Gain/Loss (USD)</th>
                <th>Message</th>
                <th className="num">All-in Rate</th>
              </tr>
            </thead>
            <tbody>
              {msgs.map((m, i) => (
                <tr key={i}>
                  <td>
                    {m.type === 'S' ? (
                      <span className="log-icon log-ok">
                        <span className="ic" aria-hidden="true">
                          ✓
                        </span>
                        Success
                      </span>
                    ) : (
                      <span className="log-icon log-err">
                        <span className="ic" aria-hidden="true">
                          ✕
                        </span>
                        Error
                      </span>
                    )}
                  </td>
                  <td className="mono">{m.rfha}</td>
                  <td className="mono">{m.doc ? m.doc : <span className="dash">—</span>}</td>
                  <td className="num mono">{formatAmount(m.diff)}</td>
                  <td className="wrap">{m.message}</td>
                  <td className="num mono">{formatRate(m.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <CloseFooter onClose={onClose} />
    </Frame>
  )
}

/** Accounting document (hotspot MTM Doc / Rev Doc, FB03 in SAP): header and the two line items. */
export function DocumentModal({ view, onClose }: { view: DocView; onClose: () => void }) {
  return (
    <Frame boxClass="modal-scrollable modal-doc" titleId="docTitle" title={view.title} onClose={onClose}>
      <div className="modal-body-scroll" id="docBody">
        <div className={`doc-banner${view.reversal ? ' rev' : ''}`}>{view.banner}</div>
        <div className="detail-section">
          <div className="detail-section-title">Document Header</div>
          <DetailGrid cols={4} items={view.header} />
        </div>
        <div className="detail-section">
          <div className="detail-section-title">Line Items</div>
          <div className="popup-table-wrap">
            <table className="popup-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>G/L Account</th>
                  <th>D/C</th>
                  <th className="num">Amount (USD)</th>
                  <th>Profit Center</th>
                  <th>Business Area</th>
                  <th>Item Text</th>
                </tr>
              </thead>
              <tbody>
                {view.items.map((it) => {
                  const dr = it.amount >= 0
                  return (
                    <tr key={it.item}>
                      <td>{it.item}</td>
                      <td className="mono">{it.gl}</td>
                      <td>
                        <span className={`dc-tag ${dr ? 'dr' : 'cr'}`}>{dr ? 'Dr' : 'Cr'}</span>
                      </td>
                      <td className="num mono">{formatAmount(it.amount)}</td>
                      <td>{it.pc}</td>
                      <td>{it.ba}</td>
                      <td className="wrap">{it.text}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <CloseFooter onClose={onClose} />
    </Frame>
  )
}

/** Transaction details (hotspot Transaction, ZSGSLCFM_DISPLAY in SAP). */
export function TransactionModal({ view, onClose }: { view: TxnView; onClose: () => void }) {
  return (
    <Frame boxClass="modal-scrollable modal-txn" titleId="txnTitle" title={view.title} onClose={onClose}>
      <div className="modal-body-scroll" id="txnBody">
        <div className="detail-section">
          <div className="detail-section-title">General</div>
          <DetailGrid cols={3} items={view.general} />
        </div>
        <div className="detail-section">
          <div className="detail-section-title">Legs</div>
          <div className="txn-legs">
            {view.legs.map((l) => (
              <div key={l.head} className="leg-card">
                <div className="lc-h">{l.head}</div>
                <div className="lc-v">{l.value}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="detail-section">
          <div className="detail-section-title">Accounting Assignment</div>
          <DetailGrid cols={3} items={view.assignment} />
        </div>
      </div>
      <CloseFooter onClose={onClose} />
    </Frame>
  )
}

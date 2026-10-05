import type { ReactNode } from 'react'
import { formatNumber } from './format.ts'
import { documentHeaderItems, documentTitle, transactionSections } from './logic.ts'
import { Overlay, type Modal } from './modal.tsx'
import type { DetailItem, DocKind, DocumentView, LogMessage, Row } from './types.ts'

/** The shared shell: title row with a close cross, a scrolling body and a Close button. */
function ModalBox({
  modal,
  id,
  boxClass,
  title,
  children,
}: {
  modal: Modal
  id: string
  boxClass: string
  title: string
  children: ReactNode
}) {
  return (
    <Overlay modal={modal} id={id}>
      <div className={`modal modal-left modal-scrollable ${boxClass}`}>
        <div className="modal-head-row">
          <h2>{title}</h2>
          <button type="button" className="modal-close-btn" aria-label="Close" onClick={modal.close}>
            &times;
          </button>
        </div>
        <div className="modal-body-scroll">{children}</div>
        <div className="modal-actions right">
          <button type="button" className="btn btn-secondary" onClick={modal.close}>
            Close
          </button>
        </div>
      </div>
    </Overlay>
  )
}

function Detail({ item }: { item: DetailItem }) {
  return (
    <div className={`detail-item${item.full ? ' full' : ''}`}>
      <span className="detail-label">{item.label}</span>
      <span className="detail-value">{item.value || '\u2014'}</span>
    </div>
  )
}

function signClass(n: number): string {
  return n < 0 ? 'neg' : n > 0 ? 'pos' : ''
}

export function MessageLogModal({ modal, msgs }: { modal: Modal; msgs: readonly LogMessage[] }) {
  return (
    <ModalBox modal={modal} id="msgLogModal" boxClass="msglog-modal" title="Message Log">
      <div className="popup-table-wrap">
        <table className="popup-table">
          <thead>
            <tr>
              <th style={{ width: 44 }}>Status</th>
              <th>Transaction</th>
              <th>Document</th>
              <th className="num">Difference (USD)</th>
              <th>Message</th>
              <th className="num">Contract Rate</th>
            </tr>
          </thead>
          <tbody>
            {msgs.map((m, i) => (
              <tr key={`${m.rfha}-${m.doc}-${i}`}>
                <td>
                  <span className={`msg-ico ${m.ok ? 'ok' : 'err'}`} title={m.ok ? 'Success' : 'Error'}>
                    {m.ok ? '\u2713' : '\u2715'}
                  </span>
                  <span className="sr-only" style={{ position: 'absolute', left: -9999 }}>
                    {m.ok ? 'Success' : 'Error'}
                  </span>
                </td>
                <td>{m.rfha}</td>
                <td>{m.doc}</td>
                <td className={`num ${signClass(m.diff)}`}>{formatNumber(m.diff, 2)}</td>
                <td className={m.ok ? 'msg-ok-text' : 'msg-err-text'}>{m.message}</td>
                <td className="num">{formatNumber(m.cRate, 6)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ModalBox>
  )
}

export function DocumentModal({
  modal,
  view,
  row,
  which,
}: {
  modal: Modal
  view: DocumentView | null
  row: Row | null
  which: DocKind
}) {
  return (
    <ModalBox
      modal={modal}
      id="docModal"
      boxClass="doc-modal"
      title={view ? documentTitle(which, view.docNo) : 'Accounting Document'}
    >
      {view && row ? (
        <>
          <div className="detail-section">
            <div className="detail-section-title">Document Header</div>
            <div className="detail-grid cols-3">
              {documentHeaderItems(view, row).map((it) => (
                <Detail key={it.label} item={it} />
              ))}
            </div>
          </div>
          <div className="detail-section">
            <div className="detail-section-title">Line Items</div>
            <div className="popup-table-wrap">
              <table className="popup-table doc-items">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>G/L Account</th>
                    <th>Profit Center</th>
                    <th>Business Area</th>
                    <th>Item Text</th>
                    <th className="num">Amount ({view.currency})</th>
                  </tr>
                </thead>
                <tbody>
                  {view.items.map((it) => (
                    <tr key={it.item}>
                      <td>{it.item}</td>
                      <td>{it.gl}</td>
                      <td>{it.pc}</td>
                      <td>{it.ba}</td>
                      <td>{it.text}</td>
                      <td className="num">{formatNumber(it.amount, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </ModalBox>
  )
}

export function TransactionModal({ modal, row, keyIso }: { modal: Modal; row: Row | null; keyIso: string }) {
  return (
    <ModalBox modal={modal} id="txnModal" boxClass="txn-modal" title="Transaction Details">
      {row
        ? transactionSections(row, keyIso).map((sec) => (
            <div key={sec.title} className="detail-section">
              <div className="detail-section-title">{sec.title}</div>
              <div className="detail-grid cols-3">
                {sec.items.map((it) => (
                  <Detail key={it.label} item={it} />
                ))}
              </div>
            </div>
          ))
        : null}
    </ModalBox>
  )
}

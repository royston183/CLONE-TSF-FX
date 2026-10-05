import type { ReactNode } from 'react'
import { NAMES, STATUS_LABEL } from './data.ts'
import { fmtAmt, fmtRate } from './format.ts'
import { actionTitles, dealDetailCells, fiDocCells } from './logic.ts'
import type { ActionKind, Deal, DetailCell, FiDocWhich } from './types.ts'

type ShellProps = {
  open: boolean
  onClose: () => void
  id?: string
  size?: 'narrow' | 'wide'
  title: ReactNode
  subtitle: ReactNode
  children: ReactNode
  footer: ReactNode
}

/** The page's .modal-overlay / .modal-card frame. Always mounted so the fade transition plays. */
function Modal({ open, onClose, id, size, title, subtitle, children, footer }: ShellProps) {
  return (
    <div
      id={id}
      className={open ? 'modal-overlay open' : 'modal-overlay'}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className={size ? `modal-card ${size}` : 'modal-card'}>
        <div className="modal-header">
          <div className="modal-header-text">
            <div className="modal-title">{title}</div>
            <div className="modal-subtitle">{subtitle}</div>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">{footer}</div>
      </div>
    </div>
  )
}

function Cells({ cells }: { cells: DetailCell[] }) {
  return (
    <div className="detail-grid">
      {cells.map((c) => (
        <div key={c.label} className="detail-cell">
          <div className="detail-lbl">{c.label}</div>
          <div className={c.accent ? 'detail-val accent' : 'detail-val'}>{c.value}</div>
        </div>
      ))}
    </div>
  )
}

function CloseFooter({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" className="btn-cancel" onClick={onClose}>
      Close
    </button>
  )
}

/** Transaction Display (hotspot on Transaction / ZSGTBFM_DISPLAY). */
export function DealModal({ open, deal, onClose }: { open: boolean; deal: Deal | null; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Transaction Display"
      subtitle={deal ? `ZSGTBFM_DISPLAY · Transaction ${deal.rfha}` : 'ZSGTBFM_DISPLAY'}
      footer={<CloseFooter onClose={onClose} />}
    >
      {deal && (
        <>
          <Cells cells={dealDetailCells(deal, NAMES, STATUS_LABEL[deal.status])} />
          <div className="hint">
            Opens the FX Deal in transaction <strong>ZSGTBFM_DISPLAY</strong> in the live system.
          </div>
        </>
      )}
    </Modal>
  )
}

/** Accounting Document Display (hotspot on FI Doc 1 / 2 -> FB03). */
export function FiDocModal({
  open,
  deal,
  which,
  onClose,
}: {
  open: boolean
  deal: Deal | null
  which: FiDocWhich
  onClose: () => void
}) {
  const cells = deal ? fiDocCells(deal, which) : null
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="narrow"
      title="Accounting Document Display"
      subtitle="Transaction FB03"
      footer={<CloseFooter onClose={onClose} />}
    >
      {cells && (
        <>
          <Cells cells={cells} />
          <div className="hint">
            This is a simulated document viewer for the demo. The live system opens this document in transaction{' '}
            <strong>FB03</strong>.
          </div>
        </>
      )}
    </Modal>
  )
}

/** Bank Settlement Letter preview (PRINT -> screen 9001 / BS01). */
export function LetterModal({
  open,
  deal,
  onClose,
  onPrint,
  onDownload,
}: {
  open: boolean
  deal: Deal | null
  onClose: () => void
  onPrint: () => void
  onDownload: () => void
}) {
  const company = deal ? (NAMES.company[deal.bukrs] ?? deal.bukrs) : ''
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="wide"
      title="Preview Bank Settlement Letter"
      subtitle={deal ? `FWD/SPOT Bank Settlement · Deal ${deal.dealId}` : 'FWD/SPOT Bank Settlement'}
      footer={
        <>
          <button type="button" className="btn-cancel" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn-cancel" onClick={onPrint}>
            Print
          </button>
          <button type="button" className="btn-confirm" onClick={onDownload}>
            Download PDF
          </button>
        </>
      }
    >
      {deal && (
        <div className="letter-box">
          Date: <strong>{deal.valueDate}</strong>
          <br />
          <br />
          To,
          <br />
          <strong>{NAMES.partner[deal.kontrh] ?? deal.kontrh}</strong>
          <br />
          Treasury &amp; Trade Finance Department
          <br />
          Mumbai, India
          <br />
          <br />
          Attn: Settlements Desk
          <br />
          <br />
          RE: <strong>FWD/SPOT Bank Settlement</strong> &mdash; Value Date {deal.valueDate}
          <br />
          <br />
          Dear Sir/Madam,
          <br />
          Please find below our confirmed settlement instruction for the deal referenced below:
          <table>
            <tbody>
              <tr>
                <td>Company</td>
                <td>{company}</td>
              </tr>
              <tr>
                <td>Deal / Transaction</td>
                <td>
                  {deal.dealId} / {deal.rfha}
                </td>
              </tr>
              <tr>
                <td>{deal.bs1}</td>
                <td>
                  {deal.curr1} {fmtAmt(deal.amt1)}
                </td>
              </tr>
              <tr>
                <td>{deal.bs2}</td>
                <td>
                  {deal.curr2} {fmtAmt(deal.amt2)}
                </td>
              </tr>
              <tr>
                <td>All-in Rate</td>
                <td>{fmtRate(deal.allIn)}</td>
              </tr>
            </tbody>
          </table>
          <br />
          Authorized Signatories
          <br />
          <br />
          Yours Faithfully,
          <br />
          <strong>{company}</strong>
        </div>
      )}
    </Modal>
  )
}

/** Test Run / Post (TBB1) confirmation. */
export function ActionModal({
  open,
  kind,
  deals,
  onClose,
  onConfirm,
}: {
  open: boolean
  kind: ActionKind
  deals: Deal[]
  onClose: () => void
  onConfirm: () => void
}) {
  const t = actionTitles(kind)
  return (
    <Modal
      open={open}
      onClose={onClose}
      id="action-overlay"
      size="narrow"
      title={t.title}
      subtitle={t.subtitle}
      footer={
        <>
          <button type="button" className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={kind === 'post' ? 'btn-confirm is-warn' : 'btn-confirm'} onClick={onConfirm}>
            {t.confirm}
          </button>
        </>
      }
    >
      {kind === 'test' ? (
        <div className="hint">
          This will simulate the settlement posting run for the selected deal(s). No accounting documents will be created.
        </div>
      ) : (
        <div className="hint">
          <strong>This will create real accounting documents</strong> for the selected deal(s) and mark them as settled.
        </div>
      )}
      <div className="mini-list">
        {deals.map((d) => (
          <div key={d.rfha} className="mi-row">
            <span>
              <b>{d.dealId}</b> &middot; {d.rfha}
            </span>
            <span>
              {d.valueDate} &middot; {d.curr1} {fmtAmt(d.amt1)}
            </span>
          </div>
        ))}
      </div>
    </Modal>
  )
}

import type { ReactNode } from 'react'
import { REPLACEMENT_POOL } from './data.ts'
import { fmtAmt, fmtRate } from './format.ts'
import { canUpdatePair } from './logic.ts'
import type { Deal, DmsDoc, EditDraft, Leg, Premium } from './types.ts'

/** One .modal card: header with its × close, then the popup's own body and footer. */
function ModalCard({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal">
      <div className="modal-head">
        <h3>{title}</h3>
        <button type="button" className="modal-close" onClick={onClose}>
          &times;
        </button>
      </div>
      {children}
    </div>
  )
}

export function ChangeConfirmModal({
  deal,
  invoicePlan,
  mcRef,
  alert,
  onInvoicePlan,
  onMcRef,
  onConfirm,
  onClose,
}: {
  deal: Deal
  invoicePlan: string
  mcRef: string
  alert: string | null
  onInvoicePlan: (v: string) => void
  onMcRef: (v: string) => void
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <ModalCard title="Change / Confirm" onClose={onClose}>
      <div className="modal-body">
        <div className="modal-form-grid">
          <div className="field full">
            <label>Deal ID</label>
            <div className="readonly-field">
              {deal.dealId} — {deal.dealDesc}
            </div>
          </div>
          <div className="field full">
            <label htmlFor="ccInvoicePlan">Invoice Plan</label>
            <select id="ccInvoicePlan" value={invoicePlan} onChange={(e) => onInvoicePlan(e.target.value)}>
              <option value="STD">Standard Invoice Plan</option>
              <option value="REV">Revised Invoice Plan</option>
            </select>
          </div>
          <div className="field full">
            <label htmlFor="ccMcRef">MC Ref No</label>
            <input
              id="ccMcRef"
              placeholder="Master Contract reference no."
              value={mcRef}
              onChange={(e) => onMcRef(e.target.value)}
            />
          </div>
        </div>
        {alert !== null && <div className="inline-alert err">{alert}</div>}
      </div>
      <div className="modal-foot">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={onConfirm}>
          Confirm
        </button>
      </div>
    </ModalCard>
  )
}

export function EditDealPairModal({
  deal,
  leg,
  draft,
  onToggleEdit,
  onChoose,
  onUpdate,
  onClose,
}: {
  deal: Deal
  leg: Leg
  draft: EditDraft
  onToggleEdit: () => void
  onChoose: (rfha: string) => void
  onUpdate: () => void
  onClose: () => void
}) {
  return (
    <ModalCard title="Edit Deal Pair" onClose={onClose}>
      <div className="modal-body">
        <div className="modal-form-grid">
          <div className="field">
            <label>Deal Type</label>
            <div className="readonly-field">{leg.dealType}</div>
          </div>
          <div className="field">
            <label>Company Code</label>
            <div className="readonly-field">{deal.bukrs}</div>
          </div>
          <div className="field full">
            <label>Old Transaction</label>
            <div className="readonly-field">{draft.oldRfha}</div>
          </div>
          <div className="field full">
            <label htmlFor="edNewRfha">New Transaction</label>
            <select
              id="edNewRfha"
              disabled={!draft.editing}
              value={draft.newRfha}
              onChange={(e) => onChoose(e.target.value)}
            >
              <option value="">Select ...</option>
              {REPLACEMENT_POOL.map((r) => (
                <option key={r.rfha} value={r.rfha}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {!draft.editing && (
          <div className="inline-alert info">
            Click <strong>Edit</strong> to choose a replacement transaction.
          </div>
        )}
      </div>
      <div className="modal-foot">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-secondary" onClick={onToggleEdit}>
          {draft.editing ? 'Editing…' : 'Edit'}
        </button>
        <button type="button" className="btn btn-primary" disabled={!canUpdatePair(draft)} onClick={onUpdate}>
          Deal Update
        </button>
      </div>
    </ModalCard>
  )
}

/** Premium Adjustments (PRE) — read-only. */
export function PremiumModal({ premium, onClose }: { premium: Premium | null; onClose: () => void }) {
  const rows: [string, string][] = premium
    ? [
        ['Deal Value', `${fmtAmt(premium.dealValue)} ${premium.dealCurr}`],
        ['Net Premium', `${fmtAmt(premium.netPremium)} ${premium.netPremiumCurr}`],
        ['RBI Rate', fmtRate(premium.rbiRate)],
        ['RBI Rate Date', premium.rbiDate],
        ['Net Premium (Fwd)', `${fmtAmt(premium.netPremiumFwd)} ${premium.netPremiumFwdCurr}`],
        ['Net Premium per USD', fmtRate(premium.netPremiumPerUsd)],
        ['Strike Rate', fmtRate(premium.strikeRate)],
        ['Invoice Rate', fmtRate(premium.invoiceRate)],
      ]
    : []
  return (
    <ModalCard title="Premium Adjustments" onClose={onClose}>
      <div className="modal-body">
        <div className="modal-form-grid">
          {premium ? (
            rows.map(([k, v]) => (
              <div className="field" key={k}>
                <label>{k}</label>
                <div className="readonly-field">{v}</div>
              </div>
            ))
          ) : (
            <div className="full modal-msg">No premium adjustment data for this deal.</div>
          )}
        </div>
      </div>
      <div className="modal-foot">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </ModalCard>
  )
}

/** The icon + message confirmations: Cancel Deal ID, Reverse MO Confirmation, SS Deal. */
export function PromptModal({
  title,
  icon,
  message,
  noLabel,
  yesLabel,
  yesClass,
  onYes,
  onClose,
}: {
  title: string
  icon: 'warn' | 'info'
  message: string
  noLabel: string
  yesLabel: string
  yesClass: 'btn-danger' | 'btn-primary'
  onYes: () => void
  onClose: () => void
}) {
  return (
    <ModalCard title={title} onClose={onClose}>
      <div className="modal-body">
        <div className="modal-icon-row">
          <div className={`modal-icon icon-${icon}`}>{icon === 'warn' ? '⚠' : 'ℹ'}</div>
          <p className="modal-msg">{message}</p>
        </div>
      </div>
      <div className="modal-foot">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          {noLabel}
        </button>
        <button type="button" className={`btn ${yesClass}`} onClick={onYes}>
          {yesLabel}
        </button>
      </div>
    </ModalCard>
  )
}

export function DmsModal({
  docs,
  onUpload,
  onClose,
}: {
  docs: readonly DmsDoc[]
  onUpload: () => void
  onClose: () => void
}) {
  return (
    <ModalCard title="Document Management" onClose={onClose}>
      <div className="modal-body">
        <div>
          {docs.length ? (
            docs.map((d, i) => (
              <div className="dms-row" key={`${i}-${d.name}`}>
                <span className="name">
                  &#128196; {d.name}
                  <span className="table-note">({d.type})</span>
                </span>
                <button type="button" className="btn btn-secondary btn-sm">
                  View
                </button>
              </div>
            ))
          ) : (
            <p className="table-note" style={{ marginBottom: 12 }}>
              No documents attached yet.
            </p>
          )}
        </div>
        <div className="dms-upload" onClick={onUpload}>
          &#8593; Click to attach a supporting document (mock upload)
        </div>
      </div>
      <div className="modal-foot">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </ModalCard>
  )
}

import { useState, type ReactNode } from 'react'
import { fmtAmt, fmtRate } from './format.ts'

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

/** The icon + message confirmation: Cancel Deal ID. */
export function PromptModal({
  title,
  icon,
  message,
  noLabel,
  yesLabel,
  yesClass,
  busy = false,
  onYes,
  onClose,
}: {
  title: string
  icon: 'warn' | 'info'
  message: string
  noLabel: string
  yesLabel: string
  yesClass: 'btn-danger' | 'btn-primary'
  /** True while the SAP call runs: both buttons wait. */
  busy?: boolean
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
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>
          {noLabel}
        </button>
        <button type="button" className={`btn ${yesClass}`} disabled={busy} onClick={onYes}>
          {busy ? 'Working…' : yesLabel}
        </button>
      </div>
    </ModalCard>
  )
}

/** The eligible replacement transactions for one leg, as Edit Deal Pair offers them. */
export type PairCandidate = {
  bukrs: string
  rfha: string
  description: string
  valueDate: string
  amount: number
  txnStatus: string
  linkedDealId: string
}

/** Edit Deal Pair: the deal type (slot), company code and old transaction are fixed; the new one is picked. */
export function EditPairModal({
  slot,
  bukrs,
  oldRfha,
  candidates,
  loading,
  error,
  busy,
  onApply,
  onClose,
}: {
  slot: string
  bukrs: string
  oldRfha: string
  candidates: readonly PairCandidate[]
  loading: boolean
  error: string | null
  busy: boolean
  onApply: (rfha: string) => void
  onClose: () => void
}) {
  const [picked, setPicked] = useState('')
  return (
    <ModalCard title="Edit Deal Pair" onClose={onClose}>
      <div className="modal-body">
        <p className="modal-msg">
          Deal type <b>{slot}</b> · Company code <b>{bukrs}</b> · Old transaction <b>{oldRfha}</b>
        </p>
        {error && <div className="inline-alert info">{error}</div>}
        {loading ? (
          <p className="table-note">Loading replacement transactions…</p>
        ) : candidates.length === 0 ? (
          <p className="table-note">No transaction matches this one (same type, value date, side, currency and amount, status 03 or 07).</p>
        ) : (
          <div className="field">
            <label htmlFor="pair-new">New transaction</label>
            <select id="pair-new" value={picked} onChange={(e) => setPicked(e.target.value)}>
              <option value="">Select…</option>
              {candidates.map((c) => (
                <option key={c.rfha} value={c.rfha}>
                  {`${c.rfha} · ${c.description} · ${c.valueDate} · status ${c.txnStatus}${c.linkedDealId ? ` · on Deal ID ${c.linkedDealId}` : ''}`}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="modal-foot">
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>
          Close
        </button>
        <button type="button" className="btn btn-primary" disabled={busy || !picked} onClick={() => onApply(picked)}>
          {busy ? 'Working…' : 'Replace transaction'}
        </button>
      </div>
    </ModalCard>
  )
}

/** What Change / Confirm calculated, shown before anything is saved. */
export type ConfirmPreview = {
  mcRef: string
  contracts: ReadonlyArray<{ ref: string; desc: string }>
  rate: number
  rateDate: string
  lines: ReadonlyArray<{ ttype: string; link: string; seller: string; buyer: string; currency: string; amount: number; rate: number; invAmount: number; reused: boolean }>
  pl: { amount: number; localAmount: number; localCurrency: string }
}

export function ConfirmModal({
  loading,
  reason,
  preview,
  busy,
  onChangeMc,
  onConfirm,
  onClose,
}: {
  loading: boolean
  /** Why the confirmation cannot proceed; shown instead of the preview. */
  reason: string | null
  preview: ConfirmPreview | null
  busy: boolean
  onChangeMc: (mcRef: string) => void
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <ModalCard title="Change / Confirm" onClose={onClose}>
      <div className="modal-body">
        {loading && <p className="table-note">Calculating the invoice plan and P&amp;L…</p>}
        {!loading && reason && <div className="inline-alert info">{reason}</div>}
        {!loading && preview && (
          <>
            {preview.contracts.length > 1 && (
              <div className="field">
                <label htmlFor="confirm-mc">Master Contract</label>
                <select id="confirm-mc" value={preview.mcRef} disabled={busy} onChange={(e) => onChangeMc(e.target.value)}>
                  {preview.contracts.map((c) => (
                    <option key={c.ref} value={c.ref}>{`${c.ref} · ${c.desc}`}</option>
                  ))}
                </select>
              </div>
            )}
            <table className="data-table">
              <thead>
                <tr>
                  <th>Trade</th>
                  <th>Deal</th>
                  <th>Seller → Buyer</th>
                  <th>Curr</th>
                  <th>Amount (USD)</th>
                  <th>Rate</th>
                  <th>Invoice amount</th>
                </tr>
              </thead>
              <tbody>
                {preview.lines.map((l) => (
                  <tr key={l.ttype}>
                    <td>{l.ttype}{l.reused ? ' (saved)' : ''}</td>
                    <td>{l.link || '—'}</td>
                    <td>{`${l.seller} → ${l.buyer}`}</td>
                    <td>{l.currency}</td>
                    <td>{fmtAmt(l.amount)}</td>
                    <td>{fmtRate(l.rate)}</td>
                    <td>{fmtAmt(l.invAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="table-note">
              P&amp;L: USD {fmtAmt(preview.pl.amount)} · {preview.pl.localCurrency || '—'} {fmtAmt(preview.pl.localAmount)} · rate {fmtRate(preview.rate)} (TCURR M, {preview.rateDate})
            </p>
          </>
        )}
      </div>
      <div className="modal-foot">
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>
          Close
        </button>
        <button type="button" className="btn btn-primary" disabled={busy || loading || !preview} onClick={onConfirm}>
          {busy ? 'Working…' : 'Confirm Deal ID'}
        </button>
      </div>
    </ModalCard>
  )
}

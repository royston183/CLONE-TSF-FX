import { ResultDialog } from '../../shared/ui/ResultDialog.tsx'
import { TXN_STATUS_META } from './data.ts'
import { fmtAmt } from './format.ts'
import { invoicesEditable, legForInvoice } from './logic.ts'
import { Field, ModalHeader, Overlay, type Modal } from './modal.tsx'
import { fmtNdfCash, fmtNdfDate, fmtNdfRate } from '../../shared/fx/ndf-columns.ts'
import { ICON_UPLOAD, TxnStatusBadge } from './parts.tsx'
import type { BadgeMeta, Deal, DmsDoc, Leg, ReplacementTxn } from './types.ts'

/** Invoice Plan Change/Confirm (screen 9001). The rate inputs are controlled by the screen. */
export function InvoicePlanModal({
  modal,
  deal,
  rateTexts,
  onRateChange,
  unreadyRfha,
  onRecalc,
  onConfirm,
}: {
  modal: Modal
  deal: Deal | null
  rateTexts: readonly string[]
  onRateChange: (index: number, value: string) => void
  unreadyRfha: string | null
  onRecalc: () => void
  onConfirm: () => void
}) {
  const editable = deal ? invoicesEditable(deal) : false
  return (
    <Overlay modal={modal}>
      <div className="modal modal-wide">
        <ModalHeader
          title="Invoice Plan — Change / Confirm"
          sub={deal ? `${deal.dealId} — ${deal.dealRef}` : 'Deal ID —'}
          onClose={modal.close}
        />
        <div className="modal-body">
          <div className="form-grid" style={{ marginBottom: 16 }}>
            <Field label="Invoice Plan" value={deal?.fxInvModel ?? '—'} />
            <Field label="MC Ref No" value={deal?.mcRefNo ?? '—'} />
          </div>
          <div>
            {unreadyRfha !== null ? (
              // Same DOM as the original (text and <b> straight inside the flex banner).
              <div className="banner banner-error">
                Transaction <b>{unreadyRfha}</b> is not yet settlement-ready. All legs must reach status 07 before the
                invoice plan can be confirmed.
              </div>
            ) : null}
          </div>
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Trade Type</th>
                  <th>Buy</th>
                  <th>Sell</th>
                  <th>Invoice Ccy</th>
                  <th className="num">Exchange Rate</th>
                  <th className="num">Invoice Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {deal?.invoices.map((inv, i) => {
                  const leg = legForInvoice(deal, inv)
                  return (
                    <tr key={i}>
                      <td>{inv.ttype}</td>
                      <td>{inv.buy}</td>
                      <td>{inv.sell}</td>
                      <td>{inv.currency}</td>
                      <td className="num">
                        <input
                          className="mini-input ip-rate-input"
                          type="number"
                          step="0.0001"
                          value={rateTexts[i] ?? ''}
                          disabled={!editable}
                          // Rates carry at most 4 decimals.
                          onChange={(e) => {
                            if (/^\d*\.?\d{0,4}$/.test(e.target.value)) onRateChange(i, e.target.value)
                          }}
                        />
                      </td>
                      <td className="num">{fmtAmt(inv.invAmt)}</td>
                      <td>{leg ? <TxnStatusBadge code={leg.txnStatus} /> : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="modal-footer">
          <div className="mf-left">Confirm requires every leg to be settlement-ready</div>
          <button type="button" className="btn btn-secondary" onClick={modal.close}>
            Cancel
          </button>
          <button type="button" className="btn btn-secondary" onClick={onRecalc}>
            Change
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm}>
            Confirm
          </button>
        </div>
      </div>
    </Overlay>
  )
}

/**
 * Premium Adjustments (screen 9003), read-only. Its figures come from ZSGTSFCL_GET_PRE_ADJUSTMENT
 * and the FX legs, neither of which is served, so every value is '—' and `waiting` says why.
 */
export function PremiumModal({ modal, deal, waiting }: { modal: Modal; deal: Deal | null; waiting: string }) {
  return (
    <Overlay modal={modal}>
      <div className="modal">
        <ModalHeader
          title="Premium Adjustments"
          sub={deal ? `${deal.dealId} — ${deal.dealRef}` : 'Deal ID —'}
          onClose={modal.close}
        />
        <div className="modal-body">
          <div className="form-grid">
            <Field label="Deal Value" value="—" />
            <Field label="Net Premium" value="—" />
            <Field label="RBI Rate (as of)" value="—" />
            <Field label="Net Premium (USD)" value="—" />
            <Field label="Net Premium per USD" value="—" />
            <Field label="Strike Rate" value="—" />
            <Field label="Invoice Rate" value="—" calc wide />
          </div>
          <div style={{ marginTop: 14 }}>
            {waiting ? <div className="banner banner-warn">{waiting}</div> : null}
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={modal.close}>
            Close
          </button>
        </div>
      </div>
    </Overlay>
  )
}

/** Edit Deal Pair (screen 9004): swap the selected leg for a replacement transaction. */
export function EditPairModal({
  modal,
  leg,
  replacements,
  replacementsWaiting,
  newTxn,
  onNewTxnChange,
  inputEnabled,
  onToggleInput,
  showError,
  onUpdate,
}: {
  modal: Modal
  leg: Leg | null
  /** MODULE f4_rfha_help: ZSGTSFV_FX candidates for the selected leg. */
  replacements: readonly ReplacementTxn[]
  /** Why the F4 has no candidates ('' when it is served). */
  replacementsWaiting: string
  newTxn: string
  onNewTxnChange: (v: string) => void
  inputEnabled: boolean
  onToggleInput: () => void
  showError: boolean
  onUpdate: () => void
}) {
  return (
    <Overlay modal={modal}>
      <div className="modal">
        <ModalHeader title="Edit Deal Pair" sub={leg ? `Old Transaction ${leg.rfha}` : 'Old Transaction —'} onClose={modal.close} />
        <div className="modal-body">
          <div className="form-grid">
            <Field label="Deal Type" value={leg?.dealType ?? '—'} />
            <Field label="Company Code" value={leg?.bukrs || '—'} />
            <Field label="Old Transaction" value={leg?.rfha ?? '—'} />
            <div className="form-field">
              <label>
                New Transaction<span className="req">*</span>
              </label>
              <select value={newTxn} disabled={!inputEnabled} onChange={(e) => onNewTxnChange(e.target.value)}>
                <option value="">Select …</option>
                {replacements.map((r) => (
                  <option key={r.rfha} value={r.rfha}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            {showError ? (
              <div className="banner banner-error">Please enter a new transaction before updating the deal pair.</div>
            ) : replacementsWaiting ? (
              <div className="banner banner-warn">{replacementsWaiting}</div>
            ) : null}
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={modal.close}>
            Cancel
          </button>
          <button type="button" className="btn btn-secondary" onClick={onToggleInput}>
            {inputEnabled ? 'Editing…' : 'Edit'}
          </button>
          <button type="button" className="btn btn-primary" onClick={onUpdate}>
            Deal Update
          </button>
        </div>
      </div>
    </Overlay>
  )
}

/** Cancel Deal ID (screen 9005) and SS Deallocation (screen 9006) share this summary layout. */
export function DealSummaryModal({
  modal,
  title,
  deal,
  actionLabel,
  onAction,
}: {
  modal: Modal
  title: string
  deal: Deal | null
  actionLabel: string
  onAction: () => void
}) {
  return (
    <Overlay modal={modal}>
      <div className="modal">
        <ModalHeader title={title} onClose={modal.close} />
        <div className="modal-body">
          <div className="form-grid">
            <Field label="Deal ID" value={deal?.dealId ?? '—'} />
            <Field label="MC Ref No" value={deal?.mcRefNo ?? '—'} />
            <Field label="FX Model ID" value={deal?.fxModel ?? '—'} />
            <Field label="Trader" value={deal?.traderCode ?? '—'} />
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={modal.close}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={onAction}>
            {actionLabel}
          </button>
        </div>
      </div>
    </Overlay>
  )
}

/** The generic POPUP_TO_CONFIRM: Yes closes it and then runs the pending callback. */
export function ConfirmModal({
  modal,
  title,
  message,
  details,
  onYes,
}: {
  modal: Modal
  title: string
  message: string
  /** What is being confirmed (the loaded deal). */
  details?: ReadonlyArray<{ label: string; value: string }> | undefined
  onYes: () => void
}) {
  if (!modal.isOpen) return null
  return (
    <ResultDialog
      tone="info"
      title={title}
      message={message}
      details={details}
      actions={[
        { label: 'No', kind: 'secondary', onClick: modal.close },
        { label: 'Yes', kind: 'primary', onClick: onYes },
      ]}
    />
  )
}

/** Document Management: the deal's attachments, with a mock upload and remove. */
export function DmsModal({
  modal,
  docs,
  onUpload,
  onRemove,
}: {
  modal: Modal
  docs: readonly DmsDoc[]
  onUpload: () => void
  onRemove: (index: number) => void
}) {
  return (
    <Overlay modal={modal}>
      <div className="modal">
        <ModalHeader title="Document Management" sub="Attachments for this Deal ID" onClose={modal.close} />
        <div className="modal-body">
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Category</th>
                  <th>Uploaded By</th>
                  <th>Date</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {docs.length ? (
                  docs.map((d, i) => (
                    <tr key={i}>
                      <td>{d.name}</td>
                      <td>{d.cat}</td>
                      <td>{d.by}</td>
                      <td>{d.date}</td>
                      <td>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onRemove(i)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5}>
                      <div className="empty-state" style={{ padding: 16 }}>
                        No documents attached
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="divider" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={onUpload}>
            {ICON_UPLOAD}
            Upload document
          </button>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={modal.close}>
            Close
          </button>
        </div>
      </div>
    </Overlay>
  )
}

/** Transaction quick view, opened from a leg's transaction-number hotspot. */
export function TxnViewModal({ modal, deal, leg }: { modal: Modal; deal: Deal | null; leg: Leg | null }) {
  const items: [string, string][] = leg
    ? [
        ['Instrument', leg.instrument],
        ['Leg', leg.dealType],
        ['Business Partner', leg.bpName],
        ['MC Ref No', leg.mcRef],
        ['Trade Date', leg.tradeDate],
        ['Value Date', leg.valueDate],
        ['Buy', `${leg.bs1} ${leg.curr1} ${fmtAmt(leg.amt1)}`],
        ['Sell', `${leg.bs2} ${leg.curr2} ${fmtAmt(leg.amt2)}`],
        ['All-in Rate / Strike', fmtAmt(leg.strike || leg.allInRate, 4)],
        ['NDF Fixing Date', fmtNdfDate(leg.ndf?.ndfDate ?? '')],
        ['NDF Ref', leg.ndf?.ndfRef ?? ''],
        ['NDF Settlement Rate', fmtNdfRate(leg.ndf?.ndfRate)],
        ['Cash Settlement Amount', fmtNdfCash(leg.ndf?.cashAmount)],
        ['Cash Currency', leg.ndf?.cashCurrency ?? ''],
        ['Txn Status', (TXN_STATUS_META as Record<string, BadgeMeta | undefined>)[leg.txnStatus]?.text || leg.txnStatus],
        ['Premium', `${fmtAmt(leg.premAmt)} ${leg.premCurr}`],
        ['Total P&L', fmtAmt(leg.totPl)],
      ]
    : []
  return (
    <Overlay modal={modal}>
      <div className="modal">
        <ModalHeader
          title="Transaction Details"
          sub={leg && deal ? `Transaction ${leg.rfha} · ${deal.dealId}` : '—'}
          onClose={modal.close}
        />
        <div className="modal-body">
          <div className="form-grid">
            {items.map(([k, v]) => (
              <Field key={k} label={k} value={v} />
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={modal.close}>
            Close
          </button>
        </div>
      </div>
    </Overlay>
  )
}

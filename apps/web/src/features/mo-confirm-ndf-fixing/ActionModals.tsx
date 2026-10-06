import { DealSummary, Overlay } from './modal.tsx'
import type { InfoMessage, NdfDeal } from './types.ts'

const NOT_SAVED = 'SAP gap: the FxTransaction service has no field for this, so it cannot be saved.'

/**
 * Match & Release. Confirming settles the deal in SAP (BAPI_FTR_FXT_SETTLE through the Settle
 * action). The External Ref, Internal Ref and MO Remarks boxes are kept as the screen has
 * them but are read-only: nothing in SAP can hold them yet, and typing into a box that is
 * silently discarded would mislead.
 */
export function MatchReleaseModal({
  open,
  deal,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean
  /** The deal as it was when the dialog opened. */
  deal: NdfDeal | null
  /** True while the Settle call is running. */
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <Overlay id="matchReleaseOverlay" open={open} onClose={busy ? () => {} : onClose}>
      <div className="modal">
        <div className="modal-header">
          <h3>Match &amp; Release</h3>
          <button className="modal-close" type="button" disabled={busy} onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <DealSummary id="mrDealSummary" deal={deal} />
          <div className="validation-msg" id="mrSettleNote">
            This settles the deal in SAP (BAPI_FTR_FXT_SETTLE) and commits immediately; it cannot be undone from this screen.
          </div>
          <div className="field">
            <label>Deal / Cover No</label>
            <input type="text" id="mrDealCover" className="input" readOnly value={deal?.dealId ?? ''} placeholder="—" />
          </div>
          <div className="field">
            <label>External Ref</label>
            <input type="text" id="mrExternalRef" className="input" readOnly title={NOT_SAVED} placeholder="Not saved — SAP gap" />
          </div>
          <div className="field">
            <label>Internal Ref</label>
            <input type="text" id="mrInternalRef" className="input" readOnly title={NOT_SAVED} placeholder="Not saved — SAP gap" />
          </div>
          <div className="field">
            <label>MO Remarks</label>
            <textarea id="mrRemarks" readOnly title={NOT_SAVED} placeholder="Not saved — SAP gap" />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" id="mrConfirmBtn" type="button" disabled={busy} onClick={onConfirm}>
            {busy ? 'Settling…' : 'Match & Release'}
          </button>
        </div>
      </div>
    </Overlay>
  )
}

/** The success / warning notice shown after an action, a refresh or a SAP error. */
export function InfoModal({ open, info, onClose }: { open: boolean; info: InfoMessage; onClose: () => void }) {
  const warn = info.variant === 'warn'
  return (
    <Overlay id="infoOverlay" open={open} onClose={onClose}>
      <div className={`modal modal-sm info-modal ${warn ? 'warn' : 'success'}`} id="infoModal">
        <div className="modal-body">
          <div className="info-icon" id="infoIcon">
            {warn ? '!' : '✓'}
          </div>
          <div className="info-title" id="infoTitle">
            {info.title}
          </div>
          <div className="info-desc" id="infoDesc">
            {info.desc}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-primary" id="infoOkBtn" type="button" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </Overlay>
  )
}

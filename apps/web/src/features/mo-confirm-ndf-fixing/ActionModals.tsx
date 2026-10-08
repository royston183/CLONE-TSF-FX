import { MO_REMARK_MAX } from './data.ts'
import { ResultDialog } from '../../shared/ui/ResultDialog.tsx'
import { DealSummary, Overlay } from './modal.tsx'
import type { InfoMessage, NdfDeal } from './types.ts'

export type MatchReleaseValues = { remarks: string }

/**
 * Match & Release: the deal, its Deal / Cover No and references (as SAP holds them — no service can
 * change them), and the optional MO remark.
 */
export function MatchReleaseModal({
  open,
  deal,
  values,
  busy,
  onChange,
  onClose,
  onConfirm,
}: {
  open: boolean
  /** The deal as it was when the dialog opened. */
  deal: NdfDeal | null
  values: MatchReleaseValues
  /** While the action posts: the buttons are disabled. */
  busy: boolean
  onChange: (patch: Partial<MatchReleaseValues>) => void
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <Overlay id="matchReleaseOverlay" open={open} onClose={onClose}>
      <div className="modal">
        <div className="modal-header">
          <h3>Match &amp; Release</h3>
          <button className="modal-close" type="button" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <DealSummary id="mrDealSummary" deal={deal} />
          <div className="field">
            <label>Deal / Cover No</label>
            <input type="text" id="mrDealCover" className="input" readOnly value={deal?.dealId ?? ''} />
          </div>
          <div className="field">
            <label>External Ref</label>
            <input type="text" id="mrExternalRef" className="input" readOnly value={deal?.externalRef ?? ''} />
          </div>
          <div className="field">
            <label>Internal Ref</label>
            <input type="text" id="mrInternalRef" className="input" readOnly value={deal?.internalRef ?? ''} />
          </div>
          <div className="field">
            <label>MO Remarks</label>
            <textarea
              id="mrRemarks"
              placeholder="Enter remarks (optional)"
              maxLength={MO_REMARK_MAX}
              value={values.remarks}
              onChange={(e) => onChange({ remarks: e.target.value })}
            />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" id="mrConfirmBtn" type="button" disabled={busy} onClick={onConfirm}>
            {busy ? 'Posting to SAP…' : 'Match & Release'}
          </button>
        </div>
      </div>
    </Overlay>
  )
}

/** Correction Required: sends the deal back to FO; the MO remark is mandatory. */
export function CorrectionModal({
  open,
  deal,
  remarks,
  remarksError,
  busy,
  onRemarksChange,
  onClose,
  onConfirm,
}: {
  open: boolean
  deal: NdfDeal | null
  busy: boolean
  remarks: string
  /** Stays on until the dialog is reopened, as in the original — typing does not clear it. */
  remarksError: boolean
  onRemarksChange: (remarks: string) => void
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <Overlay id="correctionOverlay" open={open} onClose={onClose}>
      <div className="modal modal-sm">
        <div className="modal-header">
          <h3>Correction Required</h3>
          <button className="modal-close" type="button" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <DealSummary id="crDealSummary" deal={deal} />
          <div className="field">
            <label>Deal / Cover No</label>
            <input type="text" id="crDealCover" className="input" readOnly value={deal?.dealId ?? ''} />
          </div>
          <div className="field">
            <label>
              MO Remarks<span className="req">*</span>
            </label>
            <textarea
              id="crRemarks"
              className={remarksError ? 'error' : ''}
              placeholder="e.g. Incorrect fixing rate"
              maxLength={MO_REMARK_MAX}
              value={remarks}
              onChange={(e) => onRemarksChange(e.target.value)}
            />
            <div id="crRemarksError" className={`validation-msg${remarksError ? '' : ' hidden'}`}>
              MO Remarks is required.
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-danger" id="crConfirmBtn" type="button" disabled={busy} onClick={onConfirm}>
            {busy ? 'Posting to SAP…' : 'Correction Required'}
          </button>
        </div>
      </div>
    </Overlay>
  )
}

/** The success / warning notice shown after an action or a refresh. */
export function InfoModal({ open, info, onClose }: { open: boolean; info: InfoMessage; onClose: () => void }) {
  if (!open) return null
  return (
    <ResultDialog
      tone={info.variant === 'warn' ? 'warning' : 'success'}
      title={info.title}
      message={info.desc}
      actions={[{ label: 'OK', kind: 'primary', onClick: onClose }]}
    />
  )
}

import { DealSummary, Overlay } from './modal.tsx'
import type { InfoMessage, NdfDeal } from './types.ts'

export type MatchReleaseValues = { externalRef: string; internalRef: string; remarks: string }

/** Match & Release: the deal, its Deal / Cover No, and the optional references and remark. */
export function MatchReleaseModal({
  open,
  deal,
  values,
  onChange,
  onClose,
  onConfirm,
}: {
  open: boolean
  /** The deal as it was when the dialog opened. */
  deal: NdfDeal | null
  values: MatchReleaseValues
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
            <input
              type="text"
              id="mrExternalRef"
              className="input"
              placeholder="Enter external reference"
              value={values.externalRef}
              onChange={(e) => onChange({ externalRef: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Internal Ref</label>
            <input
              type="text"
              id="mrInternalRef"
              className="input"
              placeholder="Enter internal reference"
              value={values.internalRef}
              onChange={(e) => onChange({ internalRef: e.target.value })}
            />
          </div>
          <div className="field">
            <label>MO Remarks</label>
            <textarea
              id="mrRemarks"
              placeholder="Enter remarks (optional)"
              value={values.remarks}
              onChange={(e) => onChange({ remarks: e.target.value })}
            />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" id="mrConfirmBtn" type="button" onClick={onConfirm}>
            Match &amp; Release
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
  onRemarksChange,
  onClose,
  onConfirm,
}: {
  open: boolean
  deal: NdfDeal | null
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
          <button className="btn btn-danger" id="crConfirmBtn" type="button" onClick={onConfirm}>
            Correction Required
          </button>
        </div>
      </div>
    </Overlay>
  )
}

/** The success / warning notice shown after an action or a refresh. */
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

import { Backdrop, ModalHeader, type Modal } from './modal.tsx'
import type { DealSummary } from './types.ts'

/** Correction Required: sends the deal(s) back to FO; a remark is mandatory. */
export function CorrectionModal({
  modal,
  summary,
  remarks,
  remarksError,
  onRemarksChange,
  onConfirm,
}: {
  modal: Modal
  summary: DealSummary
  remarks: string
  remarksError: boolean
  onRemarksChange: (value: string) => void
  onConfirm: () => void
}) {
  return (
    <Backdrop id="correctionBackdrop" modal={modal}>
      <div className="modal">
        <ModalHeader title="Correction Required" onClose={modal.close} />
        <div className="modal-body">
          <div className="modal-info-strip">
            <div className="row">
              <span>Deal ID</span>
              <span id="crDealId">{summary.dealId}</span>
            </div>
            <div className="row">
              <span>Partner</span>
              <span id="crPartner">{summary.partner}</span>
            </div>
          </div>
          <div className="field">
            <label htmlFor="crCoverNo">Cover No</label>
            <input className="input" id="crCoverNo" readOnly value={summary.coverNo} />
          </div>
          <div className={`field${remarksError ? ' has-error' : ''}`} id="crRemarksField">
            <label htmlFor="crRemarks">
              MO Remarks <span className="req">*</span>
            </label>
            <textarea
              className="input"
              id="crRemarks"
              placeholder="Enter reason for correction"
              value={remarks}
              onChange={(e) => onRemarksChange(e.target.value)}
            />
            <span className="field-error">MO Remarks is required.</span>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" type="button" onClick={modal.close}>
            Cancel
          </button>
          <button className="btn btn-solid-danger" id="crConfirmBtn" type="button" onClick={onConfirm}>
            Correction Required
          </button>
        </div>
      </div>
    </Backdrop>
  )
}

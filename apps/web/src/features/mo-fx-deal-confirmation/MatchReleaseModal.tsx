import { Backdrop, ModalHeader, type Modal } from './modal.tsx'
import type { DealSummary } from './types.ts'

export type MatchReleaseValues = { externalRef: string; internalRef: string; remarks: string }

/** Match & Release: the deal(s) being released, their Cover No, and the optional references. */
export function MatchReleaseModal({
  modal,
  summary,
  values,
  onChange,
  onConfirm,
}: {
  modal: Modal
  summary: DealSummary
  values: MatchReleaseValues
  onChange: (patch: Partial<MatchReleaseValues>) => void
  onConfirm: () => void
}) {
  return (
    <Backdrop id="matchReleaseBackdrop" modal={modal}>
      <div className="modal">
        <ModalHeader title="Match & Release" onClose={modal.close} />
        <div className="modal-body">
          <div className="modal-info-strip">
            <div className="row">
              <span>Deal ID</span>
              <span id="mrDealId">{summary.dealId}</span>
            </div>
            <div className="row">
              <span>Partner</span>
              <span id="mrPartner">{summary.partner}</span>
            </div>
          </div>
          {summary.warning && (
            <div className="field" role="alert" id="mrLimitWarning">
              {summary.warning}
            </div>
          )}
          <div className="field">
            <label htmlFor="mrCoverNo">Cover No</label>
            <input className="input" id="mrCoverNo" readOnly value={summary.coverNo} />
          </div>
          <div className="field">
            <label htmlFor="mrExternalRef">External Ref</label>
            <input
              className="input"
              id="mrExternalRef"
              placeholder="Enter external reference"
              value={values.externalRef}
              onChange={(e) => onChange({ externalRef: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="mrInternalRef">Internal Ref</label>
            <input
              className="input"
              id="mrInternalRef"
              placeholder="Enter internal reference"
              value={values.internalRef}
              onChange={(e) => onChange({ internalRef: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="mrRemarks">MO Remarks</label>
            <textarea
              className="input"
              id="mrRemarks"
              placeholder="Enter remarks"
              value={values.remarks}
              onChange={(e) => onChange({ remarks: e.target.value })}
            />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" type="button" onClick={modal.close}>
            Cancel
          </button>
          <button className="btn btn-primary" id="mrConfirmBtn" type="button" onClick={onConfirm}>
            Match &amp; Release
          </button>
        </div>
      </div>
    </Backdrop>
  )
}

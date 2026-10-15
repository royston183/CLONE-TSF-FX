import type { Modal } from './modal.tsx'
import { MasterContractConfirmation } from '../../shared/master-contract/Confirmation.tsx'
import { ContractReview } from './ContractReview.tsx'
import type { MasterContract, McAction } from './types.ts'

/** The bulk (or single, from the child modal) Confirm / Reject confirmation dialog. */
export function ActionDialog({
  modal,
  action,
  mcs,
  remark,
  remarkError,
  onRemarkChange,
  onProceed,
}: {
  modal: Modal
  action: McAction
  /** The contracts as they were when the dialog opened. */
  mcs: MasterContract[]
  remark: string
  remarkError: boolean
  onRemarkChange: (remark: string) => void
  onProceed: () => void | Promise<void>
}) {
  const isReject = action === 'reject'
  const many = mcs.length > 1
  return <MasterContractConfirmation open={modal.isOpen} danger={isReject} review eyebrow="Master Contract Review"
    title={`${isReject ? 'Reject' : 'Confirm'} Master Contract${many ? 's' : ''}`}
    subtitle={<div className="std-pop-message" id="action-subtitle">Review {many ? `all ${mcs.length} selected contracts` : 'the contract details'} before {isReject ? 'rejecting' : 'confirming'}.</div>}
    iconId="action-icon" ids={{ overlay: 'action-overlay', title: 'action-title', body: 'action-body', confirm: 'action-confirm-btn', close: 'action-close-btn' }}
    confirmLabel={`${isReject ? 'Reject' : 'Confirm'} ${many ? `${mcs.length} Contracts` : 'Contract'}`} onCancel={modal.close} onConfirm={onProceed}>
          {mcs.map((mc, index) => (
            <ContractReview key={mc.mcNumber} contract={mc} open={index === 0} />
          ))}
          {isReject ? (
            <div className="confirmation-review-form">
              <div>
              <label htmlFor="action-remark">
                Rejection Remark <span style={{ color: 'var(--sp-error)' }}>*</span>
              </label>
              <textarea
                id="action-remark"
                rows={2}
                maxLength={80}
                aria-invalid={remarkError}
                placeholder="Why is this Master Contract being rejected? This is recorded as the MO Remark."
                value={remark}
                onChange={(e) => onRemarkChange(e.target.value)}
                style={{
                  width: '100%',
                  resize: 'vertical',
                  padding: '9px 12px',
                  // The original's "border:1px solid var(--sp-border-strong)", split so the error colour
                  // can replace just the colour without React warning about the shorthand.
                  borderWidth: 1,
                  borderStyle: 'solid',
                  borderColor: remarkError ? 'var(--sp-error)' : 'var(--sp-border-strong)',
                  borderRadius: '4px',
                  fontSize: '12.5px',
                  fontFamily: 'inherit',
                  color: 'var(--sp-text)',
                }}
              />
              <div
                id="action-remark-error"
                style={{ display: remarkError ? 'block' : 'none', color: 'var(--sp-error)', fontSize: 11, fontWeight: 600, marginTop: 4 }}
              >
                Please fill the MO Remarks and Update.
              </div>
              </div>
            </div>
          ) : null}

  </MasterContractConfirmation>
}

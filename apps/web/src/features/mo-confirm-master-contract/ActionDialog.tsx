import { ResultDialog } from '../../shared/ui/ResultDialog.tsx'
import type { Modal } from './modal.tsx'
import type { MasterContract, McAction } from './types.ts'

/** How many contracts the dialog lists by name before summarising the rest. */
const LISTED = 8

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
  onProceed: () => void
}) {
  const isReject = action === 'reject'
  const many = mcs.length > 1
  if (!modal.isOpen) return null
  return (
    <ResultDialog
      tone={isReject ? 'warning' : 'info'}
      title={`${isReject ? 'Reject' : 'Confirm'} Master Contract${many ? 's' : ''}`}
      message={`${mcs.length} contract${many ? 's' : ''} selected`}
      actions={[
        { label: 'Cancel', kind: 'secondary', onClick: modal.close },
        { label: `Yes, ${isReject ? 'reject' : 'confirm'}`, kind: isReject ? 'danger' : 'primary', onClick: onProceed },
      ]}
    >
      <div style={{ textAlign: 'left', marginTop: 14 }}>
        <div className="detail-grid">
          {mcs.slice(0, LISTED).map((mc) => (
            <div className="detail-cell" key={mc.mcNumber}>
              <div className="detail-lbl">MC {mc.mcNumber}</div>
              <div className="detail-val accent">{mc.mcDescription}</div>
            </div>
          ))}
        </div>
        {mcs.length > LISTED ? <div className="note">...and {mcs.length - LISTED} more.</div> : null}
        <div className="note">
          Are you sure you want to <strong>{isReject ? 'reject' : 'confirm'}</strong>{' '}
          {many ? 'these Master Contracts' : 'this Master Contract'}?
        </div>
        {isReject ? (
          <div className="filter-field" style={{ width: '100%', marginTop: 12 }}>
            <label htmlFor="action-remark">
              Rejection Remark <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <textarea
              id="action-remark"
              rows={3}
              placeholder="Why is this Master Contract being rejected? This is recorded as the MO Remark."
              value={remark}
              onChange={(e) => onRemarkChange(e.target.value)}
              style={{
                width: '100%',
                resize: 'vertical',
                padding: '9px 12px',
                // The original's "border:1px solid var(--border)", split so the error colour
                // can replace just the colour without React warning about the shorthand.
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: remarkError ? 'var(--red)' : 'var(--border)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '12.5px',
                fontFamily: 'inherit',
                color: 'var(--ink)',
              }}
            />
            <div
              id="action-remark-error"
              style={{ display: remarkError ? 'block' : 'none', color: 'var(--red)', fontSize: 11, fontWeight: 600, marginTop: 4 }}
            >
              Please fill the MO Remarks and Update.
            </div>
          </div>
        ) : null}
      </div>
    </ResultDialog>
  )
}

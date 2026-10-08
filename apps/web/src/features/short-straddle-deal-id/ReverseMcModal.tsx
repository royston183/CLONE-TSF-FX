import { MasterContractConfirmation } from '../../shared/master-contract/Confirmation.tsx'
import type { MasterContract } from './types.ts'

/** Reverse Master Contract — dynpro 9000 (USER_COMMAND_9000). */
export function ReverseMcModal({
  open,
  contract: mc,
  remark,
  error,
  onRemarkChange,
  onClose,
  onReverse,
}: {
  open: boolean
  contract: MasterContract | undefined
  remark: string
  /** The inline "Please enter remarks." message and red border. */
  error: boolean
  onRemarkChange: (value: string) => void
  onClose: () => void
  onReverse: () => void | Promise<void>
}) {
  return <MasterContractConfirmation open={open} danger title="Reverse Master Contract"
   message={mc ? `MC ${mc.mcRef} - ${mc.mcDesc}` : undefined}
   ids={{ overlay: 'reverse-overlay' }} confirmLabel="Update" onCancel={onClose} onConfirm={onReverse}>
          <p>Reversing sets the Master Contract status to Reversed by MO and requires a remark.</p>
          <div className="filter-field" style={{ width: '100%' }}>
            <label htmlFor="ssdid-reverse-remark">
              MO Remarks <span style={{ color: 'var(--sp-error)' }}>*</span>
            </label>
            <textarea
              id="ssdid-reverse-remark"
              className="remarks-box"
              rows={4}
              aria-invalid={error}
              placeholder="Reason for reversing this Master Contract..."
              value={remark}
              style={error ? { borderColor: 'var(--sp-error)' } : undefined}
              onChange={(e) => onRemarkChange(e.target.value)}
            />
            <div className="field-error" style={{ display: error ? 'block' : 'none', color: 'var(--sp-error)', fontSize: 11 }}>
              Please enter remarks.
            </div>
          </div>

  </MasterContractConfirmation>
}

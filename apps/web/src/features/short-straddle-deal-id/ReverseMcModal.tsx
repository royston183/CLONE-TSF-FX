import { ModalHeader, Overlay } from './modal.tsx'
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
  onReverse: () => void
}) {
  return (
    <Overlay id="reverse-overlay" open={open} onClose={onClose}>
      <div className="modal-card" style={{ maxWidth: 520 }}>
        <ModalHeader title="Reverse Master Contract" subtitle={mc ? `MC ${mc.mcRef} - ${mc.mcDesc}` : ''} onClose={onClose} />
        <div className="modal-body">
          <div className="note" style={{ margin: '0 0 14px' }}>
            Reversing sets MC Status to <b>21 – Reversed by MO</b> and requires a remark, matching the ABAP validation{' '}
            <code>IF gv_rem IS INITIAL … MESSAGE &apos;Please enter remarks&apos;</code>.
          </div>
          <div className="filter-field" style={{ width: '100%' }}>
            <label htmlFor="ssdid-reverse-remark">
              MO Remarks <span style={{ color: 'var(--error)' }}>*</span>
            </label>
            <textarea
              id="ssdid-reverse-remark"
              className="remarks-box"
              rows={4}
              placeholder="Reason for reversing this Master Contract..."
              value={remark}
              style={error ? { borderColor: 'var(--red)' } : undefined}
              onChange={(e) => onRemarkChange(e.target.value)}
            />
            <div className="field-error" style={error ? { display: 'block' } : undefined}>
              Please enter remarks.
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-confirm is-reject" type="button" onClick={onReverse}>
            Update
          </button>
        </div>
      </div>
    </Overlay>
  )
}

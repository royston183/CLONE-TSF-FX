import { reverseConfirmText } from './logic.ts'
import { Overlay, type Modal } from './modal.tsx'
import type { ErrorRow } from './types.ts'

/** "Reverse Master Contract?" — shared by the toolbar Reverse and the one in the correction modal. */
export function ReverseModal({
  modal,
  row,
  onCancel,
  onConfirm,
}: {
  modal: Modal
  row: ErrorRow | undefined
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Overlay modal={modal} id="reverseModal" onBackdrop={onCancel}>
      <div className="modal">
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: 'var(--error-tint)',
            color: 'var(--error)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 24,
            margin: '0 auto 14px',
          }}
        >
          ↩
        </div>
        <h2 style={{ fontSize: 17, margin: '0 0 6px' }}>Reverse Master Contract?</h2>
        <p style={{ margin: '0 0 16px', color: 'var(--text-muted)', fontSize: 13.5 }}>
          {row ? reverseConfirmText(row) : 'This action cannot be undone.'}
        </p>
        <div className="modal-actions stretch">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm}>
            Reverse
          </button>
        </div>
      </div>
    </Overlay>
  )
}

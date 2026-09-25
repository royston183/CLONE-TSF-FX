import { MANUAL_CONFIRM_HEADING } from './logic.ts'
import { Overlay, type Modal } from './modal.tsx'
import type { ExpiryConfirm } from './types.ts'

/**
 * Confirm Expiry Update, shared by manual selection and "MC View with Expiry Posting".
 * Nothing is expired until Expire is pressed.
 */
export function ConfirmExpiryModal({
  modal,
  confirm,
  onCancel,
  onExpire,
}: {
  modal: Modal
  confirm: ExpiryConfirm | null
  onCancel: () => void
  onExpire: () => void
}) {
  return (
    <Overlay modal={modal} onBackdrop={onCancel}>
      <div className="modal">
        <div className="modal-header">
          <h3>Confirm Expiry Update</h3>
          <button className="modal-close" type="button" onClick={onCancel}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="confirm-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 9V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <circle cx="12" cy="16.5" r="1" fill="currentColor" />
              <path
                d="M10.6 3.9L2.7 18.1C2.2 19 2.9 20 3.9 20H20.1C21.1 20 21.8 19 21.3 18.1L13.4 3.9C12.9 3 11.1 3 10.6 3.9Z"
                stroke="currentColor"
                strokeWidth="1.8"
              />
            </svg>
          </div>
          <p style={{ fontWeight: 700, fontSize: '15.5px' }}>{confirm?.heading ?? MANUAL_CONFIRM_HEADING}</p>
          <p className="muted">
            {confirm?.subtext ??
              'This will update the status of the selected Master Contract(s) to Expired. This action cannot be undone in this session.'}
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-danger" type="button" onClick={onExpire}>
            Expire
          </button>
        </div>
      </div>
    </Overlay>
  )
}

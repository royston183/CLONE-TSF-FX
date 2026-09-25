import { rejectConfirmText } from './logic.ts'
import { Overlay, type Modal } from './modal.tsx'

/** #confirmOverlay — the last stop before the selected contracts become Rejected. */
export function RejectConfirmModal({
  modal,
  ids,
  onCancel,
  onReject,
}: {
  modal: Modal
  ids: readonly string[]
  onCancel: () => void
  onReject: () => void
}) {
  const { heading, subtext } = rejectConfirmText(ids)
  return (
    <Overlay modal={modal} id="confirmOverlay" onBackdrop={onCancel}>
      <div className="modal">
        <div className="modal-header">
          <h3>Confirm MC Rejection</h3>
          <button className="modal-close" id="confirmCloseBtn" onClick={onCancel}>
            &times;
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
          <p style={{ fontWeight: 700, fontSize: '15.5px' }} id="confirmHeading">
            {heading}
          </p>
          <p className="muted" id="confirmSubtext">
            {subtext}
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" id="confirmCancelBtn" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-danger" id="confirmRejectBtn" onClick={onReject}>
            Reject
          </button>
        </div>
      </div>
    </Overlay>
  )
}

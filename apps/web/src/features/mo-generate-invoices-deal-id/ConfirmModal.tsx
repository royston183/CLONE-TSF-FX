import type { ConfirmDialogState } from './types.ts'

/** Generic Yes/No confirm: the legacy #confirmModal, reused for Cancel/Amend Deal Status/Generate Invoice. */
export function ConfirmModal({ state, onClose }: { state: ConfirmDialogState; onClose: () => void }) {
  return (
    <div className="modal-overlay open" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal sm">
        <div className="modal-head">
          <div className="modal-title">{state.title}</div>
          <button className="modal-close" type="button" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div className="confirm-icon">?</div>
          <div className="confirm-text">{state.text}</div>
          {state.note ? <div className="confirm-note">{state.note}</div> : null}
        </div>
        <div className="modal-footer">
          <button className="action-btn" type="button" onClick={onClose}>
            No
          </button>
          <button
            className="action-btn primary"
            type="button"
            onClick={() => {
              state.onYes()
            }}
          >
            {state.yesLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

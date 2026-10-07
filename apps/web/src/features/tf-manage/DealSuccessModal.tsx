export type DealSuccessModalProps = {
  /** Empty means closed — the caller clears it back to '' once the popup is dismissed. */
  message: string
  onClose: () => void
}

/**
 * Shown once Update has finished writing a Deal ID assignment to every BL it targeted — never
 * before that write is confirmed, so it cannot claim success a later error actually undid.
 */
export function DealSuccessModal({ message, onClose }: DealSuccessModalProps) {
  if (!message) return null

  return (
    <div
      className="modal-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="modal-dialog narrow" role="dialog" aria-modal="true" aria-labelledby="dealSuccessModalTitle">
        <div className="modal-head">
          <div className="modal-title" id="dealSuccessModalTitle">
            Deal ID Assigned
          </div>
          <button type="button" className="modal-close-btn" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">{message}</div>
        <div className="modal-footer">
          <span />
          <div className="modal-actions">
            <button type="button" className="hdr-btn primary" onClick={onClose}>
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

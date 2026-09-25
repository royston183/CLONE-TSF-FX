import { Overlay, type Modal } from './modal.tsx'

/** Shown after a create or copy; deliberately has no backdrop or Escape dismissal. */
export function SuccessModal({
  modal,
  mcNumber,
  onDone,
  onSendToMO,
}: {
  modal: Modal
  mcNumber: number | null
  onDone: () => void
  onSendToMO: () => void
}) {
  return (
    <Overlay modal={modal}>
      <div className="modal">
        <div className="check-circle">✓</div>
        <h2>Master Contract Created</h2>
        <p>The Master Contract has been created successfully.</p>
        <div className="deal-id-box">
          <div className="label">Deal ID / MC Number</div>
          <div className="value mono">{mcNumber ?? '—'}</div>
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" type="button" onClick={onDone}>
            Close
          </button>
          <button className="btn btn-danger" type="button" onClick={onSendToMO}>
            Send to M.O.
          </button>
        </div>
      </div>
    </Overlay>
  )
}

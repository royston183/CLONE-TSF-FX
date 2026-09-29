import { useState } from 'react'

/** "BL De-Assign Status": the legacy #remarkModal, the final step of the de-assign workflow. */
export function RemarkModal({ onClose, onUpdate }: { onClose: () => void; onUpdate: (remark: string) => void }) {
  const [remark, setRemark] = useState('')

  return (
    <div className="modal-overlay open" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal sm">
        <div className="modal-head">
          <div className="modal-title">BL De-Assign Status</div>
          <button className="modal-close" type="button" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Remark</label>
            <textarea className="control" placeholder="Enter de-assignment remark..." value={remark} onChange={(e) => setRemark(e.target.value)} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="action-btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="action-btn primary" type="button" onClick={() => onUpdate(remark)}>
            Update
          </button>
        </div>
      </div>
    </div>
  )
}

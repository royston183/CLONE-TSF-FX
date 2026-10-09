import { useState } from 'react'

/** "BL De-Assign Status" (screen 9003): a mandatory remark before a BL is de-assigned. */
export function RemarkModal({ blNo, onClose, onConfirm }: { blNo: string; onClose: () => void; onConfirm: (remark: string) => void }) {
  const [remark, setRemark] = useState('')

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <div className="modal-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M4 20l1-4L16 5l3 3L8 19l-4 1Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              <path d="M13 7l3 3" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </div>
          <div className="modal-header-text">
            <div className="modal-title">BL De-Assign Status</div>
            <div className="modal-subtitle">{blNo}</div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div className="modal-body">
          <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-soft)', display: 'block', marginBottom: 6 }}>
            Remark<span className="req">*</span>
          </label>
          <textarea className="remark-box" placeholder="Reason for de-assigning this BL..." value={remark} onChange={(e) => setRemark(e.target.value)} />
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-confirm" onClick={() => onConfirm(remark)}>
            Update
          </button>
        </div>
      </div>
    </div>
  )
}

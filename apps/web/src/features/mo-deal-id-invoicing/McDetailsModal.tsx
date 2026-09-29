import { mcDetailItems } from './logic.ts'
import type { Deal } from './types.ts'

/** "Master Contract Details": the legacy #mc-overlay, opened from the MC Ref No hyperlink. */
export function McDetailsModal({ deal, onClose }: { deal: Deal; onClose: () => void }) {
  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card" style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <div className="modal-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M7 3h7l4 4v14H7V3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              <path d="M14 3v4h4M9 13h6M9 17h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </div>
          <div className="modal-header-text">
            <div className="modal-title">Master Contract Details</div>
            <div className="modal-subtitle">
              {deal.mcRef} — {deal.mcDesc}
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div className="detail-grid">
            {mcDetailItems(deal).map(([label, value]) => (
              <div className="detail-item" key={label}>
                <label>{label}</label>
                <div className="val">{value}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

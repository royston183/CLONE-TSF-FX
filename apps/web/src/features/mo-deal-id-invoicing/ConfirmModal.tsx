/** The generic Yes/No popup (mirrors ABAP POPUP_TO_CONFIRM) — Amend Deal Status and Reverse use it. */
export function ConfirmModal({ title, text, yesLabel, onYes, onClose }: { title: string; text: string; yesLabel: string; onYes: () => void; onClose: () => void }) {
  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card" style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <div className="modal-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
              <path d="M9.5 9.3a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .8-1 1.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <circle cx="12" cy="17" r=".9" fill="currentColor" />
            </svg>
          </div>
          <div className="modal-header-text">
            <div className="modal-title">{title}</div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: 13, color: 'var(--ink-soft)', whiteSpace: 'pre-line' }}>{text}</div>
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose}>
            No
          </button>
          <button
            className="btn-confirm"
            onClick={() => {
              onClose()
              onYes()
            }}
          >
            {yesLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

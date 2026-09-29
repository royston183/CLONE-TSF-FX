import { useState } from 'react'
import type { Deal, InvoiceLeg } from './types.ts'

/** "Update House Bank/Account ID" (screen 9005): per-leg settlement bank, editable until invoiced is final. */
export function HouseBankModal({ deal, leg, onClose, onSave }: { deal: Deal; leg: InvoiceLeg; onClose: () => void; onSave: (hb: string, acct: string, ptnr: string) => void }) {
  const [hb, setHb] = useState(leg.hb)
  const [acct, setAcct] = useState(leg.acct)
  const [ptnr, setPtnr] = useState(leg.ptnr)

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <div className="modal-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M4 10l8-5 8 5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              <path d="M5 10v9h14v-9M9 13v4M12 13v4M15 13v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <path d="M3 19h18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </div>
          <div className="modal-header-text">
            <div className="modal-title">Update House Bank/Account ID</div>
            <div className="modal-subtitle">
              {deal.dealId} / {leg.ttype}
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div className="detail-grid" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))', marginBottom: 14 }}>
            <div className="detail-item">
              <label>Trade Type</label>
              <div className="val">{leg.ttype}</div>
            </div>
            <div className="detail-item">
              <label>Inv Type</label>
              <div className="val">{leg.invoiced ? 'Final' : 'Draft'}</div>
            </div>
            <div className="detail-item">
              <label>Seller</label>
              <div className="val">{leg.seller}</div>
            </div>
            <div className="detail-item">
              <label>Buyer</label>
              <div className="val">{leg.buyer}</div>
            </div>
          </div>
          <div className="filter-bar" style={{ flexWrap: 'wrap' }}>
            <div className="filter-field" style={{ width: 140 }}>
              <label>House Bank</label>
              <input className="mini-input" type="text" maxLength={5} value={hb} onChange={(e) => setHb(e.target.value)} />
            </div>
            <div className="filter-field" style={{ width: 140 }}>
              <label>Account ID</label>
              <input className="mini-input" type="text" maxLength={5} value={acct} onChange={(e) => setAcct(e.target.value)} />
            </div>
            <div className="filter-field" style={{ width: 140 }}>
              <label>Partner Bank</label>
              <input className="mini-input" type="text" maxLength={4} value={ptnr} onChange={(e) => setPtnr(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-confirm" onClick={() => onSave(hb, acct, ptnr)}>
            Update
          </button>
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import type { Deal } from './types.ts'

/** "View List of BL's" (screen 9001): a Deal ID's attached Bills of Lading, one de-assignable at a time. */
export function BlListModal({ deal, onClose, onDeAssign }: { deal: Deal; onClose: () => void; onDeAssign: (idx: number) => void }) {
  const [selected, setSelected] = useState<number | null>(null)

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card" style={{ maxWidth: 820 }}>
        <div className="modal-header">
          <div className="modal-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              <path d="M4.5 7.5L12 12l7.5-4.5M12 12v9" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="modal-header-text">
            <div className="modal-title">View List of BL's</div>
            <div className="modal-subtitle">Deal ID {deal.dealId}</div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div className="table-wrap">
            <table className="list-table">
              <thead>
                <tr>
                  <th className="left">&nbsp;</th>
                  <th className="left">BL No</th>
                  <th className="left">Vessel</th>
                  <th className="left">Load Port</th>
                  <th className="left">Discharge Port</th>
                  <th>Shipment Date</th>
                  <th>Qty (MT)</th>
                  <th className="left">Status</th>
                </tr>
              </thead>
              <tbody>
                {deal.bls.length === 0 ? (
                  <tr className="empty-row">
                    <td colSpan={8}>No Bill of Lading has been attached to this Deal ID yet. Trade Flow attaches a BL once the physical shipment matches this deal&apos;s Master Contract window.</td>
                  </tr>
                ) : (
                  deal.bls.map((b, i) => (
                    <tr key={b.blNo} style={{ cursor: 'pointer', background: selected === i ? '#f7faff' : undefined }} onClick={() => setSelected(i)}>
                      <td className="left">
                        <input type="radio" name="blsel" checked={selected === i} onChange={() => setSelected(i)} />
                      </td>
                      <td className="left">{b.blNo}</td>
                      <td className="left">{b.vessel}</td>
                      <td className="left">{b.loadPort}</td>
                      <td className="left">{b.dischargePort}</td>
                      <td className="num">{b.shipDate}</td>
                      <td className="num">{b.qty.toLocaleString()}</td>
                      <td className="left">{b.status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="tbtn danger" disabled={selected === null} onClick={() => selected !== null && onDeAssign(selected)}>
            De-assign
          </button>
        </div>
      </div>
    </div>
  )
}

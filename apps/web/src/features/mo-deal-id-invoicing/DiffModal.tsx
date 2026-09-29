import { fmtAmt } from './format.ts'
import { invoiceDiffRows } from './logic.ts'
import type { Deal } from './types.ts'

/** "Invoice Difference" (screen 9004): planned vs invoiced amount, one row per Entity String leg. */
export function DiffModal({ deal, onClose }: { deal: Deal; onClose: () => void }) {
  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card" style={{ maxWidth: 760 }}>
        <div className="modal-header">
          <div className="modal-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M4 20V10M12 20V4M20 20v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <div className="modal-header-text">
            <div className="modal-title">Invoice Difference</div>
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
                  <th className="left">Leg</th>
                  <th>Planned Amt (USD)</th>
                  <th>Invoiced Amt (USD)</th>
                  <th>Difference</th>
                  <th>Diff %</th>
                </tr>
              </thead>
              <tbody>
                {invoiceDiffRows(deal).map((r) => (
                  <tr key={r.leg}>
                    <td className="left">
                      <b>{r.leg}</b>
                    </td>
                    <td className="num">{fmtAmt(r.planned)}</td>
                    <td className="num">{fmtAmt(r.actual)}</td>
                    <td className="num">{fmtAmt(r.diff)}</td>
                    <td className="num">{r.pct.toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
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

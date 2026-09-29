import { money } from './format.ts'
import { getDealUsdAmount } from './logic.ts'
import type { Deal } from './types.ts'

/** "Invoice Difference": the legacy #diffModal, comparing each invoice row against planned and FX deal amounts. */
export function DiffModal({ deal, onClose }: { deal: Deal; onClose: () => void }) {
  const dealAmt = getDealUsdAmount(deal)

  return (
    <div className="modal-overlay open" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal md">
        <div className="modal-head">
          <div className="modal-title">Invoice Difference</div>
          <button className="modal-close" type="button" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div className="mini-grid" style={{ maxHeight: 430 }}>
            <table>
              <thead>
                <tr>
                  <th>Trade Type</th>
                  <th className="num">Final Inv Amt</th>
                  <th>Currency</th>
                  <th className="num">Planned Inv Amt</th>
                  <th className="num">Diff1 Amt</th>
                  <th>Deal Type</th>
                  <th className="num">FX Deal Amt</th>
                  <th className="num">Diff2 Amt</th>
                </tr>
              </thead>
              <tbody>
                {deal.inv.map((r) => {
                  const diff1 = r.amtUsd - r.planned
                  const diff2 = r.amtUsd - dealAmt
                  return (
                    <tr key={r.ttype}>
                      <td>{r.ttype}</td>
                      <td className="num">{money(r.amtUsd, 2)}</td>
                      <td>USD</td>
                      <td className="num">{money(r.planned, 2)}</td>
                      <td className="num">{money(diff1, 2)}</td>
                      <td>D1</td>
                      <td className="num">{money(dealAmt, 2)}</td>
                      <td className="num">{money(diff2, 2)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="modal-footer">
          <button className="action-btn" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

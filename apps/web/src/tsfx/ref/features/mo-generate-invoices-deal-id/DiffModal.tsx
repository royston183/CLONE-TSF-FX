import { DataTable as UniversalTable } from '@tsfx/components/table/DataTable';
import { money } from './format.ts'
import type { DiffRow } from './types.ts'

/**
 * "Invoice Difference": the legacy #diffModal (screen 9004, FORM fetch_invoice_diff) — one row per
 * ZSGTSFTR_INV_REF of the deal against the saved ZSGTSFTR_BIL_ADJ amounts and the FX deal amount.
 */
export function DiffModal({ rows, fxReason, onClose }: { rows: DiffRow[]; fxReason: string; onClose: () => void }) {
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
            <UniversalTable>
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
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="empty">
                      No Deal ID-Trade Invoice rows (ZSGTSFTR_INV_REF) for this Deal ID.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.ttype}>
                      <td>{r.ttype}</td>
                      <td className="num">{money(r.finalAmt, 4)}</td>
                      <td>{r.currency}</td>
                      <td className="num">{money(r.planned, 4)}</td>
                      <td className="num">{money(r.diff1, 4)}</td>
                      <td>{r.dealType}</td>
                      <td className="num">{r.dealAmt === null ? '—' : money(r.dealAmt, 4)}</td>
                      <td className="num">{r.diff2 === null ? '—' : money(r.diff2, 4)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </UniversalTable>
          </div>
          {fxReason ? <div className="hint">FX Deal Amt / Diff2 Amt: {fxReason}</div> : null}
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

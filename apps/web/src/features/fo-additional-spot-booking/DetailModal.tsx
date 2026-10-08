import { detailItems } from './logic.ts'
import type { DetailKind, SpotRow } from './types.ts'

/** "Transaction Details": the legacy #detailOverlay, opened from either the Original Txn or Spot Txn link. */
export function DetailModal({ row, kind, onClose }: { row: SpotRow; kind: DetailKind; onClose: () => void }) {
  return (
    <div className="overlay" style={{ display: 'flex' }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal small">
        <div className="modal-head">
          <div className="modal-title">Transaction Details</div>
          <button className="modal-close" type="button" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="detail-grid">
            {detailItems(row, kind).map(([label, value]) => (
              <div className="detail-item" key={label}>
                <div className="k">{label}</div>
                <div className="v">{value || '—'}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

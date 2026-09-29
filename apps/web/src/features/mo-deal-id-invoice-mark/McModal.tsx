import type { DealRow } from './types.ts'

/** "Master Contract Details": the legacy #detailOverlay in its plain (non deal-workspace) form. */
export function McModal({ row, onClose }: { row: DealRow; onClose: () => void }) {
  const fields: Array<[string, string]> = [
    ['MC Ref No', row.mcRef],
    ['Origin Entity', row.origin],
    ['Commodity', row.commodity],
    ['FX Model', row.model],
    ['FX Model Description', row.modelDesc],
    ['Region', row.region],
    ['MC Shipment Start', row.shipStart],
    ['MC Shipment End', row.shipEnd],
    ['Earliest Shipment Start', row.earliestStart],
  ]
  return (
    <div className="modal-overlay show" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <div className="modal-title-row">
            <div className="modal-title">Master Contract Details</div>
            <span className="modal-tag">{row.mcRef}</span>
          </div>
          <button className="modal-close" type="button" aria-label="Close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div className="info-grid">
            {fields.map(([label, value]) => (
              <div className="info-item" key={label}>
                <div className="info-card">
                  <div className="info-label">{label}</div>
                  <div className="info-value">{value || '—'}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-foot">
          <button className="secondary-btn" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

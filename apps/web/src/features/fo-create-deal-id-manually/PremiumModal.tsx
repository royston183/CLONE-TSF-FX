import { money } from './format.ts'
import type { Premium } from './types.ts'

/** "Premium Adjustment": the legacy #premiumModal, a readonly summary of the deal's premium. */
export function PremiumModal({ premium, onClose }: { premium: Premium; onClose: () => void }) {
  return (
    <div className="modal-overlay open" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <div className="modal-title">Premium Adjustment</div>
          <button className="modal-close" type="button" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div className="form-grid two">
            <div className="field">
              <label>Deal Value</label>
              <input className="input" readOnly value={money(premium.dealValue)} />
            </div>
            <div className="field">
              <label>Deal Currency</label>
              <input className="input" readOnly value={premium.dealCurr} />
            </div>
            <div className="field">
              <label>Net Premium</label>
              <input className="input" readOnly value={money(premium.localNet)} />
            </div>
            <div className="field">
              <label>Premium Currency</label>
              <input className="input" readOnly value={premium.localCurr} />
            </div>
            <div className="field">
              <label>RBI Rate</label>
              <input className="input" readOnly value={money(premium.rbi, 4)} />
            </div>
            <div className="field">
              <label>RBI Rate Date</label>
              <input className="input" readOnly value={premium.rbiDate} />
            </div>
            <div className="field">
              <label>Net Premium</label>
              <input className="input" readOnly value={money(premium.foreignNet)} />
            </div>
            <div className="field">
              <label>Foreign Currency</label>
              <input className="input" readOnly value={premium.foreignCurr} />
            </div>
            <div className="field">
              <label>Net Premium per USD</label>
              <input className="input" readOnly value={money(premium.perUsd, 4)} />
            </div>
            <div className="field">
              <label>Strike Rate</label>
              <input className="input" readOnly value={money(premium.strike, 4)} />
            </div>
            <div className="field">
              <label>Invoice Rate</label>
              <input className="input" readOnly value={money(premium.invoiceRate, 4)} />
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

import { fmtNum, fmtRate } from './format.ts'
import { DetailCell, ModalHeader, Overlay } from './modal.tsx'
import type { Deal } from './types.ts'

/** Premium Adjustment (ABAP screen 9003): re-prices the D2 leg's T2 invoice at an adjusted rate. */
export function PremiumModal({
  open,
  deal,
  rate,
  onRateChange,
  onClose,
  onApply,
}: {
  open: boolean
  deal: Deal | null
  rate: string
  onRateChange: (v: string) => void
  onClose: () => void
  onApply: () => void
}) {
  const d2 = deal?.fxLegs[1]
  const t2 = deal && deal.invLegs.length > 1 ? deal.invLegs[1] : undefined
  return (
    <Overlay id="premium-modal" open={open} onClose={onClose}>
      <div className="modal-card">
        <ModalHeader title="Premium Adjustment" subtitle="Adjust the option premium rate used for the D2 leg's invoicing" onClose={onClose} />
        <div className="modal-body">
          <div className="detail-grid" id="pm-detailgrid">
            {deal && (
              <>
                <DetailCell label="Deal ID" value={deal.dealId} />
                <DetailCell label="FX Model" value={deal.model} />
                <DetailCell label="D2 Leg Strike / Rate" value={fmtRate(d2?.rate)} />
                <DetailCell label="Current Premium Rate" value={deal.premiumRate ? fmtRate(deal.premiumRate) : '– (not adjusted)'} />
              </>
            )}
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>Premium Amount</label>
              <input type="text" id="pm-amt" disabled value={deal ? fmtNum(t2 ? t2.amt : 0) : ''} readOnly />
            </div>
            <div className="form-field">
              <label>Adjusted Rate (IRate)</label>
              <input type="text" id="pm-rate" placeholder="e.g. 88.4500000" value={rate} onChange={(e) => onRateChange(e.target.value)} />
            </div>
          </div>
          <div className="warn-box">
            Applying an adjusted rate re-prices the <strong>D2</strong> invoice leg (T2) only. Use <strong>Calculate</strong> on the Trade Invoices grid
            afterwards to refresh the invoice amounts and P&amp;L.
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-confirm" type="button" onClick={onApply}>
            Apply Adjustment
          </button>
        </div>
      </div>
    </Overlay>
  )
}

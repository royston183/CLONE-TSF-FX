import { fmtDate, fmtNum, fmtRate } from './format.ts'
import { editPairCandidates } from './logic.ts'
import { DetailCell, ModalHeader, Overlay } from './modal.tsx'
import type { Deal } from './types.ts'

/**
 * Edit Deal Pair (ABAP screen 9004): re-point a leg to an already-booked transaction that
 * matches it exactly. Choosing another leg offers that leg's candidates, first one selected.
 */
export function EditPairModal({
  open,
  deal,
  legIdx,
  candidate,
  onLegChange,
  onCandidateChange,
  onClose,
  onApply,
}: {
  open: boolean
  deal: Deal | null
  legIdx: number
  candidate: string
  onLegChange: (idx: number) => void
  onCandidateChange: (rfha: string) => void
  onClose: () => void
  onApply: () => void
}) {
  const leg = deal?.fxLegs[legIdx]
  const cands = editPairCandidates(leg)
  return (
    <Overlay id="editpair-modal" open={open} onClose={onClose}>
      <div className="modal-card">
        <ModalHeader title="Edit Deal Pair" subtitle="Re-point a leg of this Deal ID to a different, already-booked FX transaction" onClose={onClose} />
        <div className="modal-body">
          <div className="form-field">
            <label>Leg to re-assign</label>
            <select id="ep-leg" value={legIdx} onChange={(e) => onLegChange(parseInt(e.target.value || '0', 10))}>
              {deal?.fxLegs.map((l, i) => (
                <option key={l.leg} value={i}>
                  {`${l.leg} – ${l.curr1}/${l.curr2} ${fmtNum(l.amt1)}`}
                </option>
              ))}
            </select>
          </div>
          <div className="detail-grid" id="ep-currentgrid">
            {leg && (
              <>
                <DetailCell label="CoCode" value={leg.coCode} />
                <DetailCell label="Value Date" value={fmtDate(leg.valueDate)} />
                <DetailCell label="Buy/Sell" value={`${leg.buy1} ${leg.curr1}`} />
                <DetailCell label="Amount" value={fmtNum(leg.amt1)} />
                <DetailCell label="Txn Type" value={leg.txnType} />
                <DetailCell label="All-in Rate" value={fmtRate(leg.rate)} />
              </>
            )}
          </div>
          <div className="form-field">
            <label>Matching open transactions (same CoCode / txn type / value date / buy-sell / currency / amount)</label>
            <select id="ep-candidate" value={candidate} onChange={(e) => onCandidateChange(e.target.value)}>
              {cands.length ? (
                cands.map((c) => (
                  <option key={c.rfha} value={c.rfha}>
                    {`${c.rfha} – ${c.desc}`}
                  </option>
                ))
              ) : (
                <option value="">No matching open transactions found</option>
              )}
            </select>
          </div>
          <div className="hint" style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
            Only transactions that exactly match this leg's booking criteria are offered, so the swap is always risk-neutral.
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-confirm" type="button" onClick={onApply}>
            Update Deal Pair
          </button>
        </div>
      </div>
    </Overlay>
  )
}

import type { ReactNode } from 'react'
import { FO_REMARK_MAX } from '../../shared/fx/ndf.ts'
import { StatusPopup } from '../../shared/popup/Popup.tsx'
import { money, rate } from './format.ts'
import { calcCashSettlement, type Tcurf } from './logic.ts'
import type { NdfDeal } from './types.ts'

function SummaryStrip({ deal }: { deal: NdfDeal }) {
  return (
    <div className="deal-strip">
      <div className="mini">
        <b>Transaction No</b>
        <span>{deal.id}</span>
      </div>
      <div className="mini">
        <b>Company Code</b>
        <span>{deal.company}</span>
      </div>
      <div className="mini">
        <b>Currency Pair</b>
        <span>{deal.pair}</span>
      </div>
      <div className="mini">
        <b>Forward Rate</b>
        <span>{rate(deal.fwd)}</span>
      </div>
    </div>
  )
}

function Overlay({ show, onBackdrop, children }: { show: boolean; onBackdrop: () => void; children: ReactNode }) {
  return (
    <div
      className={`overlay${show ? ' show' : ''}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onBackdrop()
      }}
    >
      {children}
    </div>
  )
}

export function NdfFixModal({
  open,
  deal,
  fixRate,
  fixRef,
  fixRefText,
  tcurf,
  foRemarks,
  invalidRate,
  blockedReason,
  busy,
  onFixRateChange,
  onFoRemarksChange,
  onClose,
  onConfirm,
}: {
  open: boolean
  deal: NdfDeal | null
  fixRate: string
  /** GV_NDF_REF: the transaction's NDF_REF — display-only on screen 9001. */
  fixRef: string
  /** GV_REF_NAME: FTRT_FIX_DEF_T-FIX_ID_TEXT for it ('' when not found). */
  fixRefText: string
  /** TCURF kurst MTM, for CHECK_RATE. */
  tcurf: Tcurf
  foRemarks: string
  invalidRate: boolean
  /** Why Save Fixing cannot post; the button is disabled and the reason shown. */
  blockedReason: string
  /** While the fixing posts: Save is disabled and says so. */
  busy: boolean
  onFixRateChange: (v: string) => void
  onFoRemarksChange: (v: string) => void
  onClose: () => void
  onConfirm: () => void
}) {
  if (!deal) return null
  const fix = parseFloat(fixRate)
  // FORM cash_settelment: only once a fixing rate is entered (IF gv_ndf_rate IS NOT INITIAL).
  const cashSettlement = fixRate && isFinite(fix) && fix ? money(calcCashSettlement(deal, fix, tcurf)) : ''
  return (
    <Overlay show={open} onBackdrop={onClose}>
      <div className="modal">
        <div className="modal-head">
          <h2>NDF Rate Fixing</h2>
          <button className="x" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <SummaryStrip deal={deal} />
          <div className="form-grid">
            <div className="field">
              <label>Fixing Date</label>
              <input className="control readonly" readOnly value={deal.date} />
            </div>
            <div className={`field${invalidRate ? ' invalid' : ''}`}>
              <label>
                Fixing Rate <span className="req">*</span>
              </label>
              <input
                className="control num"
                inputMode="decimal"
                placeholder="Enter fixing rate"
                value={fixRate}
                onChange={(e) => onFixRateChange(e.target.value)}
              />
              <div className="error-msg">Fixing Rate is required.</div>
            </div>
            <div className="field">
              <label>Cash Settlement</label>
              <input className="control readonly num" readOnly value={cashSettlement} />
            </div>
            <div className="field">
              <label>Fixing Reference</label>
              {/* Display-only on screen 9001: the transaction's own reference, described from FTRT_FIX_DEF_T. */}
              <select className="control" value={fixRef} disabled title={fixRefText || fixRef}>
                <option value="">{fixRef ? fixRef : 'No fixing reference on the transaction'}</option>
                {fixRef ? <option value={fixRef}>{fixRefText ? `${fixRef} — ${fixRefText}` : fixRef}</option> : null}
              </select>
            </div>
            <div className="field full">
              <label>FO Remarks</label>
              <textarea
                className="control"
                placeholder="Enter FO remarks"
                maxLength={FO_REMARK_MAX}
                value={foRemarks}
                onChange={(e) => onFoRemarksChange(e.target.value)}
              />
            </div>
          </div>
          {blockedReason ? <div className="note" role="note" style={{ marginTop: 12 }}>{blockedReason}</div> : null}
        </div>
        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={onConfirm} disabled={!!blockedReason || busy} title={blockedReason || undefined}>
            {busy ? 'Posting to SAP…' : 'Save Fixing'}
          </button>
        </div>
      </div>
    </Overlay>
  )
}

export function ViewTxnModal({ open, deal, onClose }: { open: boolean; deal: NdfDeal | null; onClose: () => void }) {
  if (!deal) return null
  return (
    <Overlay show={open} onBackdrop={onClose}>
      <div className="modal">
        <div className="modal-head">
          <h2>View Transaction</h2>
          <button className="x" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <SummaryStrip deal={deal} />
          <div className="form-grid">
            <div className="field">
              <label>Business Partner</label>
              <input className="control readonly" readOnly value={deal.partner} />
            </div>
            <div className="field">
              <label>Value Date</label>
              <input className="control readonly" readOnly value={deal.valueDate} />
            </div>
            <div className="field">
              <label>Trader</label>
              <input className="control readonly" readOnly value={deal.trader} />
            </div>
            <div className="field">
              <label>Buy / Sell</label>
              <input className="control readonly" readOnly value={deal.side} />
            </div>
            <div className="field">
              <label>Currency 1</label>
              <input className="control readonly" readOnly value={deal.c1} />
            </div>
            <div className="field">
              <label>Amount 1</label>
              <input className="control readonly num" readOnly value={money(deal.amt1)} />
            </div>
            <div className="field">
              <label>Currency 2</label>
              <input className="control readonly" readOnly value={deal.c2} />
            </div>
            <div className="field">
              <label>Amount 2</label>
              <input className="control readonly num" readOnly value={money(deal.amt2)} />
            </div>
            <div className="field">
              <label>Original Spot</label>
              <input className="control readonly num" readOnly value={rate(deal.spot)} />
            </div>
            <div className="field">
              <label>Swap</label>
              <input className="control readonly num" readOnly value={rate(deal.swap)} />
            </div>
            <div className="field">
              <label>Forward Rate</label>
              <input className="control readonly num" readOnly value={rate(deal.fwd)} />
            </div>
            <div className="field">
              <label>Fixing Date</label>
              <input className="control readonly" readOnly value={deal.date} />
            </div>
            <div className="field">
              <label>NDF Value</label>
              <input className="control readonly num" readOnly value={money(deal.ndf)} />
            </div>
            <div className="field">
              <label>Status</label>
              <input className="control readonly" readOnly value={deal.status} />
            </div>
            <div className="field full">
              <label>Fixing Reference</label>
              <input className="control readonly" readOnly value={deal.ref || '—'} />
            </div>
            <div className="field full">
              <label>FO Remarks</label>
              <input className="control readonly" readOnly value={deal.foRemarks || '—'} />
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Overlay>
  )
}

/** "Refresh": the standard success popup (same text, one "OK"). */
export function RefreshModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <StatusPopup
      open={open}
      tone="success"
      title="Screen refreshed successfully"
      message="The NDF deals were reloaded from SAP; search, filters, sorting and row selection have been reset."
      actions={[{ label: 'OK', onClick: onClose, variant: 'secondary', autoFocus: true }]}
      onClose={onClose}
    />
  )
}

import { useEffect, useState } from 'react'
import { WAITING_FX_LEGS_OPTION, loadDealFxRows } from './dealLegs.ts'
import { formatAmount, formatPoints, formatRate } from './format.ts'
import { WAITING_VIEW_DEAL, buildViewDealData } from './logic.ts'
import type { DealRow, FxRow, InvoiceRow } from './types.ts'

function DealField({ label, value, sub, wide, status }: { label: string; value: string; sub?: string; wide?: boolean; status?: boolean }) {
  return (
    <div className={wide ? 'deal-field wide' : 'deal-field'}>
      <span className="deal-field-label">{label}</span>
      <div className={status ? 'deal-field-box deal-status-box' : 'deal-field-box'}>
        <span>{value}</span>
        {sub ? <span className="muted-value">{'— ' + sub}</span> : null}
      </div>
    </div>
  )
}

function FxDealsTable({ rows, onOpenTxn }: { rows: FxRow[]; onOpenTxn: (fx: FxRow) => void }) {
  return (
    <div className="deal-table-scroll">
      <table className="deal-table">
        <thead>
          <tr>
            <th>Company Code</th>
            <th>Deal Type</th>
            <th>Transaction No</th>
            <th>Start Date</th>
            <th>End Date</th>
            <th>Text</th>
            <th>Entity</th>
            <th>B/S 1</th>
            <th>Curr 1</th>
            <th>Amount 1</th>
            <th>B/S 2</th>
            <th>Curr 2</th>
            <th>Amount 2</th>
            <th>Spot</th>
            <th>Swap</th>
            <th>All in Rate</th>
            <th>Strike</th>
            <th>MC Ref No</th>
            <th>Txn Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((fx) => (
            <tr key={fx.rfha}>
              <td>{fx.bukrs}</td>
              <td className="deal-type-cell">{fx.dealType}</td>
              <td>
                <button className="hotspot-link" type="button" onClick={() => onOpenTxn(fx)}>
                  {fx.rfha}
                </button>
              </td>
              <td>{fx.start}</td>
              <td>{fx.end}</td>
              <td>{fx.text}</td>
              <td>{fx.entity}</td>
              <td>{fx.side1}</td>
              <td>{fx.curr1}</td>
              <td className="num">{formatAmount(fx.amt1)}</td>
              <td>{fx.side2}</td>
              <td>{fx.curr2}</td>
              <td className="num">{formatAmount(fx.amt2)}</td>
              <td className="num">{formatRate(fx.spot)}</td>
              <td className="num">{formatPoints(fx.swap)}</td>
              <td className="num">{formatRate(fx.allIn)}</td>
              <td className="num">{formatRate(fx.strike)}</td>
              <td>{fx.mcRef}</td>
              <td>{fx.txnStatus}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function InvoiceTable({ rows }: { rows: InvoiceRow[] }) {
  return (
    <div className="deal-table-scroll">
      <table className="deal-table">
        <thead>
          <tr>
            <th>Invoice Ref</th>
            <th>Trade Type</th>
            <th>Deal Type</th>
            <th>Trade Sell</th>
            <th>Trade Buy</th>
            <th>Trade Currency</th>
            <th>MC Ref Primary</th>
            <th>MC Ref Secondary</th>
            <th>Inv Amt (USD)</th>
            <th>Inv Amt Loc Curr</th>
            <th>Exchange Rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.ref}>
              <td>{r.ref}</td>
              <td>{r.tradeType}</td>
              <td className="invoice-type-cell">{r.dealType}</td>
              <td>{r.sell}</td>
              <td>{r.buy}</td>
              <td>{r.curr}</td>
              <td>{r.mcPrimary}</td>
              <td>{r.mcSecondary}</td>
              <td className="num">{formatAmount(r.usdAmount)}</td>
              <td className="num">{formatAmount(r.localAmount)}</td>
              <td className="num">{formatRate(r.exchangeRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** "View Deal ID" (mirrors ZSGTSF_RVIEW_DEAL), opened from the Deal ID hotspot in the main list. */
export function ViewDealModal({
  row,
  onClose,
  onOpenBl,
  onViewInvoiceInfo,
  onOpenPlannedPnl,
  onOpenInvoicing,
  onOpenSettlement,
  onOpenTxn,
  onRefresh,
}: {
  row: DealRow
  onClose: () => void
  onOpenBl: () => void
  onViewInvoiceInfo: () => void
  onOpenPlannedPnl: () => void
  onOpenInvoicing: () => void
  onOpenSettlement: () => void
  onOpenTxn: (fx: FxRow) => void
  onRefresh: () => void
}) {
  const detail = buildViewDealData(row)
  const status = Number(row.status)
  const [legs, setLegs] = useState<{ rows: FxRow[]; error: string; loading: boolean }>({ rows: [], error: '', loading: true })
  useEffect(() => {
    const ctrl = new AbortController()
    setLegs({ rows: [], error: '', loading: true })
    loadDealFxRows(row.dealId, ctrl.signal).then(
      (rows) => setLegs({ rows, error: '', loading: false }),
      (e: unknown) => {
        if (!ctrl.signal.aborted) setLegs({ rows: [], error: e instanceof Error ? e.message : String(e), loading: false })
      },
    )
    return () => ctrl.abort()
  }, [row.dealId])
  const fxMeta = legs.loading
    ? 'Loading…'
    : legs.error
      ? `WAITING FOR API — ZSGTSFTR_APP_STR / FxTransaction could not be read: ${legs.error}`
      : legs.rows.length
        ? `${legs.rows.length} transaction(s) — ${WAITING_FX_LEGS_OPTION}`
        : `No FX transaction in ZSGTSFTR_APP_STR carries this Deal ID — ${WAITING_FX_LEGS_OPTION}`

  return (
    <div className="modal-overlay show" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-deal">
        <div className="modal-head">
          <div className="modal-title-row">
            <div className="modal-title">View Deal ID</div>
            <span className="modal-tag">{row.dealId}</span>
          </div>
          <button className="modal-close" type="button" aria-label="Close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div className="deal-workspace">
            <div className="deal-actionbar">
              {status > 4 ? (
                <button className="deal-action-btn" type="button" onClick={onOpenBl}>
                  View List of BLs
                </button>
              ) : null}
              {status === 5 ? (
                <button className="deal-action-btn" type="button" onClick={onViewInvoiceInfo}>
                  View List of Invoice
                </button>
              ) : null}
              <button className="deal-action-btn" type="button" onClick={onOpenPlannedPnl}>
                View Planned P&amp;L
              </button>
              <button className="deal-action-btn" type="button" onClick={onOpenInvoicing}>
                View Invoicing
              </button>
              <button className="deal-action-btn" type="button" onClick={onOpenSettlement}>
                View Settlement
              </button>
              <button className="deal-action-btn primary-action" type="button" onClick={onRefresh}>
                Refresh
              </button>
            </div>

            <section className="deal-section">
              <div className="deal-section-head">
                <span>Basic Selection</span>
                <span className="deal-section-meta">Single Deal ID</span>
              </div>
              <div className="deal-basic-grid">
                <DealField label="Deal ID" value={row.dealId} sub={detail.dealRef} wide />
                <DealField label="Deal Start Date" value={row.dealStart} />
                <DealField label="Deal End Date" value={row.dealEnd} />
                <DealField label="MC Ref No" value={row.mcRef} sub={detail.mcDesc} wide />
                <DealField label="MC Date" value={detail.mcDate} />
                <DealField label="Ship Start Date" value={row.shipStart} />
                <DealField label="Ship End Date" value={row.shipEnd} />
                <DealField label="FX Model ID" value={row.model} sub={row.modelDesc} wide />
                <DealField label="Entity String" value={detail.entityString} />
                <DealField label="Currency String" value={detail.currencyString} />
                <DealField label="Trader" value={detail.traderCode} sub={detail.traderDesc} wide />
                <DealField label="Deal ID Status" value={detail.statusText} wide status />
              </div>
            </section>

            <section className="deal-section">
              <div className="deal-section-head">
                <span>FX Deals</span>
                <span className="deal-section-meta">{fxMeta}</span>
              </div>
              <FxDealsTable rows={legs.rows} onOpenTxn={onOpenTxn} />
            </section>

            <section className="deal-section">
              <div className="deal-section-head">
                <span>Invoice Planned / Invoice Amount</span>
                <span className="deal-section-meta">{detail.invoiceRows.length ? `${detail.invoiceRows.length} line(s)` : WAITING_VIEW_DEAL}</span>
              </div>
              <InvoiceTable rows={detail.invoiceRows} />
            </section>
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

import { useState, type ReactNode } from 'react'
import { formatAmount, formatRate, parseDate } from './format.ts'
import { buildAdjustedInvoiceRows, buildBlRows, buildFxRows, buildInvoiceRows, buildPlannedPnlRows, buildSettlementInvoiceRows, buildViewDealData } from './logic.ts'
import type { AdjustedInvoiceRow, DealRow, FxRow, InvoiceRow, PlannedPlRow, SettlementRow, WorkflowExtra, WorkflowKind } from './types.ts'

function WorkflowField({ label, value }: { label: string; value: string }) {
  return (
    <div className="workflow-field">
      <span className="workflow-label">{label}</span>
      <div className="workflow-value" title={value}>
        {value}
      </div>
    </div>
  )
}

function BasicSection({ row, kindLabel }: { row: DealRow; kindLabel: string }) {
  const detail = buildViewDealData(row)
  return (
    <section className="workflow-section">
      <div className="workflow-section-head">
        <span>Basic Selection</span>
        <span className="workflow-section-meta">{kindLabel}</span>
      </div>
      <div className="workflow-basic-grid">
        <WorkflowField label="Deal ID" value={row.dealId} />
        <WorkflowField label="Deal Description" value={row.dealDesc} />
        <WorkflowField label="Deal Start Date" value={row.dealStart} />
        <WorkflowField label="Deal End Date" value={row.dealEnd} />
        <WorkflowField label="MC Ref No" value={row.mcRef} />
        <WorkflowField label="MC Date" value={detail.mcDate} />
        <WorkflowField label="Ship Start Date" value={row.shipStart} />
        <WorkflowField label="Ship End Date" value={row.shipEnd} />
        <WorkflowField label="FX Model ID" value={row.model} />
        <WorkflowField label="Entity String" value={detail.entityString} />
        <WorkflowField label="Currency String" value={detail.currencyString} />
        <WorkflowField label="Trader" value={`${detail.traderCode} — ${detail.traderDesc}`} />
        {kindLabel === 'Invoice Finalisation' ? <WorkflowField label="FX Inv Model" value={row.model} /> : null}
        {kindLabel === 'Settlement' ? (
          <>
            <WorkflowField label="Link Model" value={row.model} />
            <WorkflowField label="FX Inv Model" value={row.model} />
          </>
        ) : null}
        <WorkflowField label="Deal ID Status" value={detail.statusText} />
      </div>
    </section>
  )
}

function FxTable({ rows, settlementMode, onOpenTxn }: { rows: FxRow[]; settlementMode: boolean; onOpenTxn: (fx: FxRow) => void }) {
  return (
    <div className="deal-table-scroll">
      <table className="deal-table">
        <thead>
          <tr>
            {settlementMode ? <th>Seq</th> : null}
            <th>Company Code</th>
            <th>Deal Type</th>
            <th>Transaction No</th>
            {settlementMode ? <th>Business Partner</th> : null}
            <th>Start Date</th>
            <th>End Date</th>
            {!settlementMode ? <th>Text</th> : null}
            <th>Entity</th>
            <th>B/S 1</th>
            <th>Curr 1</th>
            <th>Amount 1</th>
            <th>B/S 2</th>
            <th>Curr 2</th>
            <th>Amount 2</th>
            {!settlementMode ? <th>Spot</th> : null}
            {!settlementMode ? <th>Swap</th> : null}
            <th>All in Rate</th>
            {!settlementMode ? <th>Strike</th> : null}
            {!settlementMode ? <th>MC Ref No</th> : null}
            <th>Txn Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((fx, i) => (
            <tr key={fx.rfha}>
              {settlementMode ? <td>{i + 1}</td> : null}
              <td>{fx.bukrs}</td>
              <td className="deal-type-cell">{fx.dealType}</td>
              <td>
                <button className="hotspot-link" type="button" onClick={() => onOpenTxn(fx)}>
                  {fx.rfha}
                </button>
              </td>
              {settlementMode ? <td>Treasury</td> : null}
              <td>{fx.start}</td>
              <td>{fx.end}</td>
              {!settlementMode ? <td>{fx.text}</td> : null}
              <td>{fx.entity}</td>
              <td>{fx.side1}</td>
              <td>{fx.curr1}</td>
              <td className="num">{formatAmount(fx.amt1)}</td>
              <td>{fx.side2}</td>
              <td>{fx.curr2}</td>
              <td className="num">{formatAmount(fx.amt2)}</td>
              {!settlementMode ? <td className="num">{formatRate(fx.spot)}</td> : null}
              {!settlementMode ? <td className="num">{formatRate(fx.swap)}</td> : null}
              <td className="num">{formatRate(fx.allIn || fx.strike)}</td>
              {!settlementMode ? <td className="num">{formatRate(fx.strike)}</td> : null}
              {!settlementMode ? <td>{fx.mcRef}</td> : null}
              <td>{fx.txnStatus}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** "Adjusted Price/Qty": qty/price/rate are editable, matching the legacy ALV — the Invoice
 * Amount and Final Amount columns follow qty × price, as the original recalcInvoiceTable did. */
function AdjustedInvoiceTable({ rows, onChange }: { rows: AdjustedInvoiceRow[]; onChange: (idx: number, patch: Partial<AdjustedInvoiceRow>) => void }) {
  return (
    <div className="deal-table-scroll">
      <table className="deal-table" id="invoiceAdjustTable">
        <thead>
          <tr>
            <th>Trade Type</th>
            <th>Deal Type</th>
            <th>Inv Type</th>
            <th>Seller</th>
            <th>Buyer</th>
            <th>Commodity</th>
            <th>Currency</th>
            <th>Qty</th>
            <th>Price(USD)</th>
            <th>Rate</th>
            <th>Invoice Date</th>
            <th>Due Date</th>
            <th>Final Inv Amt</th>
            <th>Inv Amt(USD)</th>
            <th>Planned Inv Amt</th>
            <th>Partner Bank</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => {
            const recalc = (qty: number, price: number) => {
              const amount = qty * price
              onChange(idx, { qty, usdPrice: price, invUsd: amount, finalInv: amount })
            }
            return (
              <tr key={r.ref}>
                <td>{r.ttype}</td>
                <td className="deal-type-cell">{r.dealType}</td>
                <td>{r.invType}</td>
                <td>{r.sell}</td>
                <td>{r.buy}</td>
                <td>{r.commodity}</td>
                <td>{r.curr}</td>
                <td>
                  <input className="workflow-input" value={r.qty.toFixed(2)} onChange={(e) => recalc(parseFloat(e.target.value) || 0, r.usdPrice)} />
                </td>
                <td>
                  <input className="workflow-input" value={r.usdPrice.toFixed(6)} onChange={(e) => recalc(r.qty, parseFloat(e.target.value) || 0)} />
                </td>
                <td>
                  <input className="workflow-input" value={r.rate.toFixed(6)} onChange={(e) => onChange(idx, { rate: parseFloat(e.target.value) || 0 })} />
                </td>
                <td>
                  <input className="workflow-input" value={r.invDate} onChange={(e) => onChange(idx, { invDate: e.target.value })} />
                </td>
                <td>{r.dueDate}</td>
                <td className="num">{formatAmount(r.finalInv)}</td>
                <td className="num">{formatAmount(r.invUsd)}</td>
                <td className="num">{formatAmount(r.planned)}</td>
                <td>{r.partnerBank}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function PlannedInvoiceTable({ rows }: { rows: InvoiceRow[] }) {
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
            <th>Planned Amount</th>
            <th>Invoice Amount</th>
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

function PlannedPnlTable({ localCurr, rows }: { localCurr: string; rows: PlannedPlRow[] }) {
  return (
    <div className="deal-table-scroll">
      <table className="deal-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>USD</th>
            <th>{localCurr}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.type} className={r.total ? 'workflow-total-row' : ''}>
              <td>{r.type}</td>
              <td className={`num ${r.usd < 0 ? 'workflow-negative' : 'workflow-positive'}`}>{formatAmount(r.usd)}</td>
              <td className={`num ${r.local < 0 ? 'workflow-negative' : 'workflow-positive'}`}>{formatAmount(r.local)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function InvoiceDifferenceTable({ row, rows }: { row: DealRow; rows: AdjustedInvoiceRow[] }) {
  const shares = [0.4, 0.35, 0.25]
  return (
    <div className="deal-table-scroll">
      <table className="deal-table">
        <thead>
          <tr>
            <th>Trade Type</th>
            <th>Final Amt</th>
            <th>Inv Curr</th>
            <th>Planned Amt</th>
            <th>Difference</th>
            <th>Deal Type</th>
            <th>FX Deal Amt</th>
            <th>Diff2 Amt</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const diff = r.finalInv - r.planned
            return (
              <tr key={r.ref}>
                <td>{r.ttype}</td>
                <td className="num">{formatAmount(r.finalInv)}</td>
                <td>USD</td>
                <td className="num">{formatAmount(r.planned)}</td>
                <td className="num">{formatAmount(diff)}</td>
                <td>{r.dealType}</td>
                <td className="num">{formatAmount(row.amount * (shares[i] ?? 0))}</td>
                <td className="num">{formatAmount(diff)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SettlementInvoiceTable({ rows, onToggle }: { rows: SettlementRow[]; onToggle: (idx: number, field: 'settlement' | 'posting', value: boolean) => void }) {
  return (
    <div className="deal-table-scroll">
      <table className="deal-table" id="settlementInvoiceTable">
        <thead>
          <tr>
            <th>Seq</th>
            <th>Transfer Type</th>
            <th>Linked FX Deal</th>
            <th>Receipt/Payment</th>
            <th>Invoice Amt</th>
            <th>Inv Curr</th>
            <th>Payment Amt</th>
            <th>Settlement Curr</th>
            <th>FI Doc</th>
            <th>Doc Msg</th>
            <th>Settlement</th>
            <th>FI Posting</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.seq}>
              <td>{r.seq}</td>
              <td>{r.transfer}</td>
              <td>{r.linked}</td>
              <td>{r.receipt}</td>
              <td className="num">{formatAmount(r.invAmt)}</td>
              <td>{r.invCurr}</td>
              <td className="num">{formatAmount(r.payAmt)}</td>
              <td>{r.payCurr}</td>
              <td>{r.fiDoc}</td>
              <td>{r.docMsg}</td>
              <td>
                <input className="workflow-check" type="checkbox" checked={r.settlement} onChange={(e) => onToggle(i, 'settlement', e.target.checked)} />
              </td>
              <td>
                <input className="workflow-check" type="checkbox" checked={r.posting} onChange={(e) => onToggle(i, 'posting', e.target.checked)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ExtraPanel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="workflow-extra-panel">
      <div className="workflow-extra-head">
        <span>{title}</span>
        <button className="deal-action-btn" type="button" onClick={onClose}>
          Close panel
        </button>
      </div>
      <div className="workflow-extra-body">{children}</div>
    </div>
  )
}

function ExtraContent({ extra, onToast }: { extra: NonNullable<WorkflowExtra>; onToast: (message: string, kind?: 'success' | 'info' | 'warn' | 'error') => void }) {
  switch (extra.kind) {
    case 'change': {
      return (
        <div className="workflow-form-row">
          <label>
            <span className="workflow-label">Deal ID</span>
            <input className="workflow-input" defaultValue={extra.row.dealId} disabled />
          </label>
          <label>
            <span className="workflow-label">Invoice Plan</span>
            <input className="workflow-input" defaultValue={extra.row.model} disabled />
          </label>
          <label>
            <span className="workflow-label">MC Ref No</span>
            <input className="workflow-input" defaultValue={extra.row.mcRef} />
          </label>
          <div className="workflow-form-actions">
            <button className="secondary-btn" type="button" onClick={() => onToast('Invoice plan is open for change in the demo.', 'info')}>
              Change
            </button>
            <button className="primary-btn" type="button" onClick={() => onToast('Deal confirmed successfully in the demo.', 'success')}>
              Confirm
            </button>
          </div>
        </div>
      )
    }
    case 'premium': {
      const row = extra.row
      const rate = row.region === 'MEA' ? 3.6725 : row.region === 'EUR' ? 0.9345 : 83.12
      const localCurr = row.region === 'MEA' ? 'AED' : row.region === 'EUR' ? 'EUR' : 'INR'
      const premium = row.amount * (row.model === 'MIXED' ? 0.0014 : 0.0006)
      const fields: Array<[string, string]> = [
        ['Deal Value', `${formatAmount(row.amount)} USD`],
        ['Net Premium', `${formatAmount(premium * rate)} ${localCurr}`],
        ['RBI Rate', formatRate(rate)],
        ['Net Premium', `${formatAmount(premium)} USD`],
        ['Net Premium per USD', formatRate(premium / row.amount)],
        ['Strike Rate', formatRate(rate + 0.11)],
        ['Invoice Rate', formatRate(rate + 0.03)],
      ]
      return (
        <div className="workflow-mini-grid">
          {fields.map(([label, value]) => (
            <div className="workflow-mini-card" key={label}>
              <div className="workflow-mini-label">{label}</div>
              <div className="workflow-mini-value">{value}</div>
            </div>
          ))}
        </div>
      )
    }
    case 'txn': {
      const fx = extra.fx
      const fields: Array<[string, string]> = [
        ['Company Code', fx.bukrs],
        ['Transaction No', fx.rfha],
        ['Deal Type', fx.dealType],
        ['Start Date', fx.start],
        ['End Date', fx.end],
        ['Entity', fx.entity],
        ['Currency 1', fx.curr1],
        ['Amount 1', formatAmount(fx.amt1)],
        ['Currency 2', fx.curr2],
        ['Amount 2', formatAmount(fx.amt2)],
        ['All in Rate', formatRate(fx.allIn || fx.strike)],
        ['Transaction Status', fx.txnStatus],
      ]
      return (
        <div className="workflow-mini-grid">
          {fields.map(([label, value]) => (
            <div className="workflow-mini-card" key={label}>
              <div className="workflow-mini-label">{label}</div>
              <div className="workflow-mini-value">{value}</div>
            </div>
          ))}
        </div>
      )
    }
    default:
      return null
  }
}

/** One workflow's fullscreen-ish view (Planned P&L / Invoice Finalisation / Settlement),
 * opened from the "View Deal ID" popup's action bar. */
export function WorkflowModal({
  kind,
  row,
  onClose,
  onOpenTxn,
  toast,
}: {
  kind: WorkflowKind
  row: DealRow
  onClose: () => void
  onOpenTxn: (fx: FxRow) => void
  toast: (message: string, kind?: 'success' | 'info' | 'warn' | 'error') => void
}) {
  const [extra, setExtra] = useState<WorkflowExtra>(null)
  const [adjusted, setAdjusted] = useState<AdjustedInvoiceRow[]>(() => buildAdjustedInvoiceRows(row))
  const [settlementRows, setSettlementRows] = useState<SettlementRow[]>(() => buildSettlementInvoiceRows(row))
  const [settlementStatus, setSettlementStatus] = useState('Ready')
  const [amendEndDate, setAmendEndDate] = useState(row.dealEnd)

  const detail = buildViewDealData(row)
  const title = kind === 'plannedPnl' ? `Deal ID Analysis — Planned P&L — ${row.dealId}` : kind === 'invoicing' ? `Invoice Finalisation Blotter — ${row.dealId}` : `MO: Execute Settlement for Deal ID — ${row.dealId}`
  const kindLabel = kind === 'plannedPnl' ? 'Planned P&L' : kind === 'invoicing' ? 'Invoice Finalisation' : 'Settlement'

  const onFxTxn = (fx: FxRow) => setExtra({ kind: 'txn', row, fx })
  const settlementComplete = settlementRows.length > 0 && settlementRows.every((r) => r.settlement && r.posting)

  return (
    <div className="sub-modal-overlay show" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sub-modal workflow-modal">
        <div className="sub-modal-head">
          <div className="sub-modal-title">{title}</div>
          <button className="sub-modal-close" type="button" aria-label="Close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="sub-modal-body">
          <div className="workflow-shell">
            <div className="workflow-actionbar">
              {kind === 'plannedPnl' ? (
                <>
                  <button className="deal-action-btn" type="button" onClick={() => setExtra({ kind: 'change', row })}>
                    Change/Confirm
                  </button>
                  <button className="deal-action-btn" type="button" onClick={() => setExtra({ kind: 'premium', row })}>
                    Premium Adjustment
                  </button>
                </>
              ) : null}
              {kind === 'invoicing' ? (
                <>
                  <button className="deal-action-btn" type="button" onClick={() => setExtra({ kind: 'bl', row })}>
                    View List of BLs
                  </button>
                  <button className="deal-action-btn" type="button" onClick={() => setExtra({ kind: 'diff', row })}>
                    Invoice Difference
                  </button>
                  <button
                    className="deal-action-btn"
                    type="button"
                    onClick={() => {
                      setAdjusted((rows) => rows.map((r) => ({ ...r, invUsd: r.qty * r.usdPrice, finalInv: r.qty * r.usdPrice })))
                      toast('Adjusted invoice values recalculated and updated in the demo.', 'success')
                    }}
                  >
                    Re-calculate and Update
                  </button>
                  <button className="deal-action-btn" type="button" onClick={() => toast('Invoice finalisation changes saved in the demo.', 'success')}>
                    Save
                  </button>
                </>
              ) : null}
              {kind === 'settlement' ? (
                <>
                  <button
                    className="deal-action-btn primary-action"
                    type="button"
                    onClick={() => {
                      setSettlementStatus('Settlement Initiated')
                      toast('Settlement initiated in the demo.', 'success')
                    }}
                  >
                    Initiate Settlement
                  </button>
                  <button className="deal-action-btn" type="button" onClick={() => setExtra({ kind: 'plannedInvoice', row })}>
                    View Trade Invoice
                  </button>
                  <button className="deal-action-btn" type="button" onClick={() => setExtra({ kind: 'diff', row })}>
                    FX-Invoice Difference
                  </button>
                  <button className="deal-action-btn" type="button" onClick={() => setExtra({ kind: 'settlementPl', row })}>
                    View P&amp;L
                  </button>
                  <button className="deal-action-btn" type="button" onClick={() => setExtra({ kind: 'amendEnd', row })}>
                    Amend End Date
                  </button>
                  <button
                    className="deal-action-btn"
                    type="button"
                    disabled={!settlementComplete}
                    onClick={() => {
                      setSettlementStatus('Execution Complete')
                      toast('Settlement execution completed in the demo.', 'success')
                    }}
                  >
                    Execution Complete
                  </button>
                  <span className="workflow-spacer" />
                  <span className="workflow-status">{settlementStatus}</span>
                </>
              ) : null}
              <button className="deal-action-btn primary-action" type="button" onClick={onClose}>
                Refresh
              </button>
            </div>

            <BasicSection row={row} kindLabel={kindLabel} />

            {kind === 'plannedPnl' ? (
              <>
                <section className="workflow-section">
                  <div className="workflow-section-head">
                    <span>FX Deals</span>
                    <span className="workflow-section-meta">Transaction hotspot enabled</span>
                  </div>
                  <FxTable rows={buildFxRows(row, detail.companyCode)} settlementMode={false} onOpenTxn={onFxTxn} />
                </section>
                <section className="workflow-section">
                  <div className="workflow-section-head">
                    <span>Deal ID: Planned Trade Invoices</span>
                    <span className="workflow-section-meta">Invoice plan</span>
                  </div>
                  <PlannedInvoiceTable rows={buildInvoiceRows(row)} />
                </section>
                <section className="workflow-section">
                  <div className="workflow-section-head">
                    <span>Deal ID: Planned P&amp;L</span>
                    <span className="workflow-section-meta">Calculated demo values</span>
                  </div>
                  <PlannedPnlTable {...buildPlannedPnlRows(row)} />
                </section>
              </>
            ) : null}

            {kind === 'invoicing' ? (
              <>
                <section className="workflow-section">
                  <div className="workflow-section-head">
                    <span>FX Deals</span>
                    <span className="workflow-section-meta">RFHA hotspot enabled</span>
                  </div>
                  <FxTable rows={buildFxRows(row, detail.companyCode)} settlementMode={false} onOpenTxn={onFxTxn} />
                </section>
                <section className="workflow-section">
                  <div className="workflow-section-head">
                    <span>Adjusted Price/Qty</span>
                    <span className="workflow-section-meta">Editable demo fields follow the SAP ALV edit behavior</span>
                  </div>
                  <AdjustedInvoiceTable rows={adjusted} onChange={(idx, patch) => setAdjusted((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)))} />
                </section>
              </>
            ) : null}

            {kind === 'settlement' ? (
              <>
                <section className="workflow-section">
                  <div className="workflow-section-head">
                    <span>FX Deal Settlement</span>
                    <span className="workflow-section-meta">RFHA hotspot enabled</span>
                  </div>
                  <FxTable rows={buildFxRows(row, detail.companyCode)} settlementMode onOpenTxn={onFxTxn} />
                </section>
                <section className="workflow-section">
                  <div className="workflow-section-head">
                    <span>Trade Invoice Settlement</span>
                    <span className="workflow-section-meta">Settlement and FI Posting controls</span>
                  </div>
                  <SettlementInvoiceTable rows={settlementRows} onToggle={(idx, field, value) => setSettlementRows((rows) => rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)))} />
                </section>
              </>
            ) : null}

            <div className="workflow-extra">
              {extra?.kind === 'change' ? (
                <ExtraPanel title="Invoice Plan Change/Confirm" onClose={() => setExtra(null)}>
                  <ExtraContent extra={extra} onToast={toast} />
                </ExtraPanel>
              ) : null}
              {extra?.kind === 'premium' ? (
                <ExtraPanel title="Premium Adjustments" onClose={() => setExtra(null)}>
                  <ExtraContent extra={extra} onToast={toast} />
                </ExtraPanel>
              ) : null}
              {extra?.kind === 'txn' ? (
                <ExtraPanel title="Treasury Transaction Display" onClose={() => setExtra(null)}>
                  <ExtraContent extra={extra} onToast={toast} />
                </ExtraPanel>
              ) : null}
              {extra?.kind === 'bl' ? (
                <ExtraPanel title="View List of BLs" onClose={() => setExtra(null)}>
                  <BlTable row={extra.row} />
                </ExtraPanel>
              ) : null}
              {extra?.kind === 'diff' ? (
                <ExtraPanel title="Invoice Difference" onClose={() => setExtra(null)}>
                  <InvoiceDifferenceTable row={extra.row} rows={adjusted} />
                </ExtraPanel>
              ) : null}
              {extra?.kind === 'plannedInvoice' ? (
                <ExtraPanel title="View Trade Invoice" onClose={() => setExtra(null)}>
                  <PlannedInvoiceTable rows={buildInvoiceRows(extra.row)} />
                </ExtraPanel>
              ) : null}
              {extra?.kind === 'settlementPl' ? (
                <ExtraPanel title="View P&L Amount" onClose={() => setExtra(null)}>
                  <SettlementPlTable row={extra.row} />
                </ExtraPanel>
              ) : null}
              {extra?.kind === 'amendEnd' ? (
                <ExtraPanel title="Amend Deal End Date" onClose={() => setExtra(null)}>
                  <div className="workflow-form-row">
                    <label>
                      <span className="workflow-label">Deal ID</span>
                      <input className="workflow-input" defaultValue={extra.row.dealId} disabled />
                    </label>
                    <label>
                      <span className="workflow-label">Deal End Date</span>
                      <input className="workflow-input" value={amendEndDate} onChange={(e) => setAmendEndDate(e.target.value)} />
                    </label>
                    <div className="workflow-form-actions">
                      <button
                        className="primary-btn"
                        type="button"
                        onClick={() => {
                          if (!parseDate(amendEndDate)) {
                            toast('Enter the date in dd-mm-yyyy format.', 'error')
                            return
                          }
                          toast(`Deal end date updated to ${amendEndDate} in the demo.`, 'success')
                        }}
                      >
                        Update Deal End Date
                      </button>
                    </div>
                  </div>
                </ExtraPanel>
              ) : null}
            </div>
          </div>
        </div>
        <div className="sub-modal-foot">
          <button className="secondary-btn" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function BlTable({ row }: { row: DealRow }) {
  const rows = buildBlRows(row)
  return (
    <div className="deal-table-scroll">
      <table className="deal-table">
        <thead>
          <tr>
            <th>TF No</th>
            <th>TF Split</th>
            <th>BL No</th>
            <th>BL Split</th>
            <th>BL Date</th>
            <th>Invoice Commodity</th>
            <th>TRM Commodity ID</th>
            <th>Incoterm</th>
            <th>Invoice Date</th>
            <th>Quantity</th>
            <th>Unit</th>
            <th>Price</th>
            <th>Trade Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.blNo}>
              <td>{r.tfNo}</td>
              <td>{r.tfSplit}</td>
              <td>{r.blNo}</td>
              <td>{r.blSplit}</td>
              <td>{r.blDate}</td>
              <td>{r.commodity}</td>
              <td>{r.commodityId}</td>
              <td>{r.incoterm}</td>
              <td>{r.invoiceDate}</td>
              <td className="num">{formatAmount(r.qty)}</td>
              <td>{r.unit}</td>
              <td className="num">{formatAmount(r.price)}</td>
              <td className="num">{formatAmount(r.tradeValue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SettlementPlTable({ row }: { row: DealRow }) {
  const detail = buildPlannedPnlRows(row)
  const total = detail.rows[detail.rows.length - 1]!
  return (
    <div className="deal-table-scroll">
      <table className="deal-table">
        <thead>
          <tr>
            <th>Currency</th>
            <th>Amount</th>
            <th>Value Date</th>
            <th>Roll Type</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>USD</td>
            <td className="num">{formatAmount(total.usd)}</td>
            <td>{row.dealEnd}</td>
            <td>{row.model}</td>
          </tr>
          <tr>
            <td>{detail.localCurr}</td>
            <td className="num">{formatAmount(total.local)}</td>
            <td>{row.dealEnd}</td>
            <td>{row.model}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

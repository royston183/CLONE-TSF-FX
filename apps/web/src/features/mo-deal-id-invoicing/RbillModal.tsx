import { FX_MODELS, STATUS_META, TRADERS, currStr, entStr } from './data.ts'
import { fmtAmt } from './format.ts'
import { canAmendDeal, canLetters, canReverse, fxUtilAmt, uninvoicedExists } from './logic.ts'
import type { Deal } from './types.ts'

const ICON = {
  refresh: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M20 11a8 8 0 1 0-2.34 5.66" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M20 5v6h-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  save: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M5 4h11l3 3v13H5V4Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M8 4v5h7V4M8 14h8v6H8v-6Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  ),
  edit: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M4 20l1-4L16 5l3 3L8 19l-4 1Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M13 7l3 3" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  ),
  check: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  checkCircle: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 12.5l2.5 2.5L16 9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  xCircle: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9.5 9.5l5 5M14.5 9.5l-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
  list: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M5 4h14v16H5V4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8 9h8M8 13h8M8 17h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  barChart: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M4 20V10M12 20V4M20 20v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  arrowDown: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M12 4v13M6 12l6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  arrowUp: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M12 20V7M6 12l6-6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
}

/** "Invoice Finalisation Blotter" (ZSGTSF_RBILL_ADJUST screen 9000), opened via the Deal ID hyperlink. */
export function RbillModal({
  deal,
  amending,
  onClose,
  onRefresh,
  onSave,
  onToggleAmendment,
  onConfirmAmendment,
  onAmendDealStatus,
  onConfirmInvoiceGeneration,
  onReverseInvoiceGeneration,
  onRecalc,
  onOpenBlList,
  onOpenDiff,
  onLetter,
  onOpenHouseBank,
  onToggleMark,
  onEditPrice,
  onEditInvDate,
  onViewTxn,
}: {
  deal: Deal
  amending: boolean
  onClose: () => void
  onRefresh: () => void
  onSave: () => void
  onToggleAmendment: (on: boolean) => void
  onConfirmAmendment: () => void
  onAmendDealStatus: () => void
  onConfirmInvoiceGeneration: () => void
  onReverseInvoiceGeneration: () => void
  onRecalc: () => void
  onOpenBlList: () => void
  onOpenDiff: () => void
  onLetter: (kind: 'Import' | 'Export') => void
  onOpenHouseBank: (idx: number) => void
  onToggleMark: (idx: number, checked: boolean) => void
  onEditPrice: (idx: number, value: string) => void
  onEditInvDate: (idx: number, value: string) => void
  onViewTxn: (bukrs: string, rfha: string) => void
}) {
  const meta = STATUS_META[deal.dealStat]!
  const uninvoiced = uninvoicedExists(deal)

  const headerGrid: Array<[string, string, string?]> = [
    ['Deal ID', deal.dealId, 'green'],
    ['Deal Start Date', deal.dealStart],
    ['Deal End Date', deal.dealEnd],
    ['MC Ref No', deal.mcRef, 'blue'],
    ['MC Description', deal.mcDesc],
    ['MC Date', deal.mcDate],
    ['Ship Start Date', deal.shipStart],
    ['Ship End Date', deal.shipEnd],
    ['FX Model ID', deal.model],
    ['Model Description', FX_MODELS[deal.model]!.desc],
    ['Entity String', entStr(deal.model), 'blue'],
    ['Currency String', currStr(deal.model), 'blue'],
    ['Trader', `${deal.trader} - ${TRADERS[deal.trader] ?? ''}`],
    ['Deal ID Status', meta.label],
    ['FX Inv Model', deal.model],
  ]

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card" style={{ maxWidth: 1180 }}>
        <div className="modal-header">
          <div className="modal-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
              <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </div>
          <div className="modal-header-text">
            <div className="modal-title">Invoice Finalisation Blotter</div>
            <div className="modal-subtitle">
              Deal ID {deal.dealId} — opened via Deal ID hyperlink (SUBMIT zsgtsf_rbill_adjust WITH p_deal = {deal.dealId})
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div className="detail-grid">
            {headerGrid.map(([label, value, tone]) => (
              <div className="detail-item" key={label}>
                <label>{label}</label>
                <div className={`val${tone ? ` ${tone}` : ''}`}>{value}</div>
              </div>
            ))}
          </div>

          <div className="rbill-toolbar">
            <button className="tbtn" title="Reload this deal to its last saved state" onClick={onRefresh}>
              {ICON.refresh} Refresh
            </button>
            <button className="tbtn" title="Save current changes" onClick={onSave}>
              {ICON.save} Save
            </button>
            {!amending ? (
              <button className="tbtn" disabled={!uninvoiced} title="Make Unit Price and Invoice Date editable on lines not yet invoiced" onClick={() => onToggleAmendment(true)}>
                {ICON.edit} Amendment
              </button>
            ) : (
              <button className="tbtn primary" title="Save amended price/date values" onClick={onConfirmAmendment}>
                {ICON.check} Amendment Confirm
              </button>
            )}
            {canAmendDeal(deal) ? (
              <button className="tbtn amber" title="Re-open this Deal ID to a lower status" onClick={onAmendDealStatus}>
                {ICON.refresh} Amend Deal Status
              </button>
            ) : null}
            <button className="tbtn primary" disabled={!uninvoiced} title="Validate and confirm invoice generation for marked lines" onClick={onConfirmInvoiceGeneration}>
              {ICON.checkCircle} Confirm Invoice Generation
            </button>
            <button className="tbtn danger" disabled={!canReverse(deal)} title="Reverse invoice generation for this Deal ID" onClick={onReverseInvoiceGeneration}>
              {ICON.xCircle} Reverse Confirm Invoice Generation
            </button>
            <button className="tbtn purple" title="Re-calculate due dates, FX rate and local currency amount from the FX Deal" onClick={onRecalc}>
              {ICON.refresh} Re-calculate and Update
            </button>
            <button className="tbtn" title="View Bills of Lading attached to this Deal ID" onClick={onOpenBlList}>
              {ICON.list} View List of BL&apos;s
            </button>
            <button className="tbtn" title="Planned vs invoiced amount per leg" onClick={onOpenDiff}>
              {ICON.barChart} Invoice Difference
            </button>
            <button className="tbtn" disabled={!canLetters(deal)} title="Generate Import cover letter" onClick={() => onLetter('Import')}>
              {ICON.arrowDown} Import
            </button>
            <button className="tbtn" disabled={!canLetters(deal)} title="Generate Export cover letter" onClick={() => onLetter('Export')}>
              {ICON.arrowUp} Export
            </button>
          </div>

          <div className="subgrid-panel">
            <div className="gridtitle">
              FX Deals <span className="badge badge-blue">D1 / D2 legs — offset each other&apos;s currency exposure</span>
            </div>
            <div className="table-wrap">
              <table className="list-table">
                <thead>
                  <tr>
                    <th className="left">Leg</th>
                    <th className="left">Co. Code</th>
                    <th className="left">TRM Deal No</th>
                    <th className="left">Curr 1</th>
                    <th>Amount 1</th>
                    <th className="left">Curr 2</th>
                    <th>Amount 2</th>
                    <th className="left">Counterparty</th>
                    <th>Rate</th>
                    <th className="left">&nbsp;</th>
                  </tr>
                </thead>
                <tbody>
                  {deal.fx.map((f) => (
                    <tr key={f.type}>
                      <td className="left">
                        <b>{f.type}</b>
                      </td>
                      <td className="left">{f.bukrs}</td>
                      <td className="left">
                        <button className="tbl-link" onClick={() => onViewTxn(f.bukrs, f.rfha)}>
                          {f.rfha}
                        </button>
                      </td>
                      <td className="left">{f.curr1}</td>
                      <td className="num">{fmtAmt(f.amt1)}</td>
                      <td className="left">{f.curr2}</td>
                      <td className="num">{fmtAmt(f.amt2)}</td>
                      <td className="left">
                        {f.bp} - {f.bpName}
                      </td>
                      <td className="num">{f.rate.toFixed(4)}</td>
                      <td className="left">
                        <button className="tbtn" style={{ height: 26, padding: '0 8px', fontSize: 11 }} onClick={() => onViewTxn(f.bukrs, f.rfha)}>
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="subgrid-panel">
            <div className="gridtitle">
              Adjusted Price/Qty <span className="badge badge-orange">Trade Invoicing — one row per leg of the Entity String</span>
            </div>
            <div className="table-wrap">
              <table className="list-table">
                <thead>
                  <tr>
                    <th className="left">&nbsp;</th>
                    <th className="left">Leg</th>
                    <th className="left">Seller</th>
                    <th className="left">Buyer</th>
                    <th>Qty (MT)</th>
                    <th>Unit Price (USD)</th>
                    <th>Amount (USD)</th>
                    <th>Due Date</th>
                    <th>Invoice Date</th>
                    <th className="left">Invoice No</th>
                    <th className="left">Bank</th>
                  </tr>
                </thead>
                <tbody>
                  {deal.inv.map((r, idx) => {
                    const amt = r.qty * r.usdPrice
                    const editable = amending && !r.invoiced
                    return (
                      <tr key={r.ttype} className={editable ? 'editing-row' : ''}>
                        <td className="left">
                          <input type="checkbox" className="chk" disabled={r.invoiced} checked={r.marked} onChange={(e) => onToggleMark(idx, e.target.checked)} />
                        </td>
                        <td className="left">
                          <b>{r.ttype}</b>
                          {r.invoiced ? (
                            <span className="badge badge-green" style={{ marginLeft: 4 }}>
                              Invoiced
                            </span>
                          ) : null}
                        </td>
                        <td className="left">{r.seller}</td>
                        <td className="left">{r.buyer}</td>
                        <td className="num">{r.qty.toLocaleString()}</td>
                        <td className="num">
                          {editable ? (
                            <input className="mini-input" style={{ textAlign: 'right' }} type="text" defaultValue={r.usdPrice.toFixed(2)} onBlur={(e) => onEditPrice(idx, e.target.value)} />
                          ) : (
                            r.usdPrice.toFixed(2)
                          )}
                        </td>
                        <td className="num">{fmtAmt(amt)}</td>
                        <td className="num">{r.dueDate}</td>
                        <td className="num">
                          {editable ? (
                            <input className="mini-input" style={{ textAlign: 'right' }} type="text" placeholder="dd-mm-yyyy" defaultValue={r.invDate} onBlur={(e) => onEditInvDate(idx, e.target.value)} />
                          ) : r.invDate ? (
                            r.invDate
                          ) : (
                            <span className="muted-dash">&ndash;</span>
                          )}
                        </td>
                        <td className="left">{r.invNo ? r.invNo : <span className="muted-dash">&ndash;</span>}</td>
                        <td className="left">
                          <button className="tbtn" style={{ height: 26, padding: '0 8px', fontSize: 11 }} onClick={() => onOpenHouseBank(idx)}>
                            {r.hb ? `${r.hb}/${r.acct}` : 'Set bank'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="note-box">
            <b>Trade Invoicing rule:</b> once a Bill of Lading is attached to this Deal ID, one invoice is generated per leg of the Entity String ({entStr(deal.model)}). A Master Contract with several
            shipments produces one set of T1/T2/T3 invoices per Deal ID, not a single deal-to-invoice mapping.
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose}>
            Back
          </button>
        </div>
      </div>
    </div>
  )
}

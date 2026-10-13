import { fxTxnStatusLabel } from '../../shared/fx/txn-status.ts'
import { statusMeta } from './logic.ts'
import type { Deal } from './types.ts'

export function StatusBadge({ code }: { code: string }) {
  const meta = statusMeta(code)
  return (
    <span className={`status-badge ${meta.cls}`}>
      <span className="status-dot"></span>
      {code} - {meta.desc}
    </span>
  )
}

/**
 * A transaction's own status (ZSGTSFTR_APP_STR.TXN_STATUS), worded from ZSGTSFTR_TXNSTAT type 01 — not from the Deal ID
 * status table, which uses the same codes for something else (07 is "Partial Invoice Created in TRM" for a Deal ID, but
 * "MO: Match & Release for Settlement" for a transaction). The colour is the code's badge colour.
 */
export function LegStatusBadge({ code }: { code: string }) {
  const meta = statusMeta(code)
  return (
    <span className={`status-badge ${meta.cls}`}>
      <span className="status-dot"></span>
      {code ? `${code} - ${fxTxnStatusLabel(code)}` : '–'}
    </span>
  )
}

/** The Deal Selection card's detail grid. */
export function DealDetails({ deal }: { deal: Deal }) {
  const items: [string, string][] = [
    ['Deal ID', deal.dealId],
    ['Trader', `${deal.trader} — ${deal.traderName}`],
  ]
  const rest: [string, string][] = [
    ['Deal Start Date', deal.startDate],
    ['Deal End Date', deal.endDate],
    ['MC Ref No', deal.mcRef],
    ['MC Date', deal.mcDate],
    ['MC Description', deal.mcDesc],
    ['Company Code', deal.bukrs],
    ['Shipment Start Date', deal.shipStart],
    ['Shipment End Date', deal.shipEnd],
    ['FX Model ID', deal.fxModel],
    ['Model Description', deal.modelDesc],
    ['Entity String', deal.entityString],
    ['Currency String', deal.currString],
  ]
  const item = ([k, v]: [string, string]) => (
    <div className="detail-item" key={k}>
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  )
  return (
    <div className="deal-details">
      <div className="detail-grid">
        {items.map(item)}
        <div className="detail-item">
          <span className="k">Deal ID Status</span>
          <StatusBadge code={deal.status} />
        </div>
        {rest.map(item)}
      </div>
    </div>
  )
}

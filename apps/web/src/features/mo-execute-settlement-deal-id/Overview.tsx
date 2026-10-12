import type { ReactNode } from 'react'
import { statusMeta, type ToolbarVisibility } from './logic.ts'
import type { Deal, StatusMeta } from './types.ts'

export function StatusPill({ code, statuses }: { code: string; statuses: readonly StatusMeta[] }) {
  const sm = statusMeta(code, statuses)
  return (
    <span className={`pill ${sm.cls}`}>
      <span className="dot"></span>
      {sm.code}{sm.text ? <> &middot; {sm.text}</> : null}
    </span>
  )
}

/** Deal ID Status list box: ZSGTSFTR_DEAL_ST of the deal's type + sub type (api.ts statusList). */
export function HeaderGrid({
  deal,
  statuses,
  onStatus,
}: {
  deal: Deal
  statuses: readonly StatusMeta[]
  onStatus: (code: string) => void
}) {
  const cells: [string, ReactNode][] = [
    ['Deal ID', <span className="accent">{deal.dealId}</span>],
    ['Deal Start Date', deal.dealStartDate],
    ['Deal End Date', deal.dealEndDate],
    ['Revised End Date', deal.revisedEndDate ? deal.revisedEndDate : <span className="mut">-</span>],
    ['MC Ref No', <span className="accent">{deal.mcRefNo}</span>],
    ['MC Description', deal.mcDesc],
    ['MC Date', deal.mcDate],
    ['Ship End Date', deal.shipEndDate],
    ['FX Model ID', deal.fxModelId],
    ['FX Model Desc', deal.fxModelDesc],
    ['Entity String', deal.entityString],
    ['FX Inv Model', deal.fxInvModel],
    ['Trader', `${deal.trader} - ${deal.traderDesc}`],
    ['Currency String', deal.currencyString],
    [
      'Deal ID Status',
      <select id="hdrStatusSel" value={deal.dealStatus} onChange={(e) => onStatus(e.target.value)} style={{ width: '100%' }}>
        {(statuses.some((s) => s.code === deal.dealStatus) ? statuses : [statusMeta(deal.dealStatus, statuses), ...statuses]).map((s) => (
          <option key={s.code} value={s.code}>
            {s.code} - {s.text}
          </option>
        ))}
      </select>,
    ],
  ]
  return (
    <div className="hdr-grid">
      {cells.map(([label, value]) => (
        <div className="hdr-cell" key={label}>
          <div className="hdr-lbl">{label}</div>
          <div className="hdr-val">{value}</div>
        </div>
      ))}
      <div className="hdr-cell"></div>
    </div>
  )
}

function ToolBtn({
  fcode,
  disabled,
  variant,
  onClick,
  children,
}: {
  fcode: string
  disabled: boolean
  variant?: 'primary' | 'success'
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={variant ? `action-btn ${variant}` : 'action-btn'}
      title={fcode}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export type ToolbarActions = {
  amend: () => void
  headsup: () => void
  viewInvoice: () => void
  diff: () => void
  pl: () => void
  editDms: () => void
  initiate: () => void
  executionComplete: () => void
}

export function ActionToolbar({
  noInvoiceFlag,
  visibility,
  actions,
}: {
  noInvoiceFlag: boolean
  visibility: ToolbarVisibility
  actions: ToolbarActions
}) {
  return (
    <div className="action-toolbar">
      <ToolBtn fcode="REV_EDATE" disabled={false} onClick={actions.amend}>
        &#128197; Amend End Date
      </ToolBtn>
      <ToolBtn fcode="HEADSUP" disabled={false} onClick={actions.headsup}>
        &#128276; Headsup
      </ToolBtn>
      <ToolBtn fcode="INV" disabled={noInvoiceFlag} onClick={actions.viewInvoice}>
        &#128203; View Trade Invoice
      </ToolBtn>
      <ToolBtn fcode="INV_DIFF" disabled={false} onClick={actions.diff}>
        &Delta; FX-Invoice Difference
      </ToolBtn>
      <ToolBtn fcode={'P&L'} disabled={false} onClick={actions.pl}>
        &#128202; View P&amp;L
      </ToolBtn>
      <ToolBtn fcode="EDIT" disabled={false} onClick={actions.editDms}>
        &#9999; Edit DMS
      </ToolBtn>
      <span className="action-spacer"></span>
      {/* No Post FX Deal / Post Trade Invoice here: accounting posting is BO's (ZSGTSFR081). */}
      {visibility.showInit ? (
        <ToolBtn fcode="INIT" disabled={false} variant="primary" onClick={actions.initiate}>
          Initiate Settlement
        </ToolBtn>
      ) : null}
      {visibility.showExeC ? (
        <ToolBtn fcode="EXE_C" disabled={false} variant="success" onClick={actions.executionComplete}>
          Execution Complete
        </ToolBtn>
      ) : null}
    </div>
  )
}

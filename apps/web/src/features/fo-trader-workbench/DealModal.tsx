import type { ReactNode } from 'react'
import { dropCls, type Dnd } from './dnd.ts'
import { actionDiffSpot, actionItemCreate, actionNdfFixing, actionOptionExercise, findDeal, findTxn, type Wb } from './flows.ts'
import { formatAmount, formatRate, isoToDMY } from './format.ts'
import { actionItemEntry, dealStatusInfo, fetchActionItems, fetchTransactions, modelDesc, txnLinkClass, txnStatusInfo, txnTypeDescription, txnTypeText, type EntryAction } from './logic.ts'
import { ModalFrame, type FrameProps, type PopupSpec } from './modal.tsx'
import type { ActionItem, TxnRow } from './types.ts'

type TxnCol = {
  label: string
  shortLabel?: string
  get?: (t: TxnRow) => string
  num?: boolean
  mono?: boolean
  link?: boolean
  type?: boolean
  sd?: boolean
  status?: boolean
  txnType?: boolean
}

const TXN_COLS: readonly TxnCol[] = [
  { label: 'Co. Code', get: (t) => t.bukrs },
  { label: 'Deal Type', get: (t) => t.dealType, type: true },
  { label: 'Transaction', shortLabel: 'Txn No.', link: true, get: (t) => t.rfha },
  { label: 'Txn Type', txnType: true, get: (t) => [t.sfhaart, txnTypeDescription(t.sfhaart)].filter(Boolean).join(' · ') },
  { label: 'Partner Name', shortLabel: 'Cpty', get: (t) => (t.cptyName && t.cptyName !== t.cpty ? `${t.cpty} - ${t.cptyName}` : t.cpty) },
  { label: 'Trade Date', get: (t) => isoToDMY(t.tradeDate), mono: true },
  { label: 'Value Date', get: (t) => isoToDMY(t.valueDate), mono: true },
  { label: 'Exec. Date', get: (t) => isoToDMY(t.eDate), mono: true },
  { label: 'Entity', get: (t) => t.entity },
  { label: 'Put/Call 1', shortLabel: 'P/C 1', get: (t) => t.pc1 },
  { label: 'B/S 1', get: (t) => t.bs1 },
  { label: 'Curr 1', get: (t) => t.curr1 },
  { label: 'Amount 1', shortLabel: 'Amt 1', num: true, get: (t) => formatAmount(t.amt1) },
  { label: 'Put/Call 2', shortLabel: 'P/C 2', get: (t) => t.pc2 },
  { label: 'B/S 2', get: (t) => t.bs2 },
  { label: 'Curr 2', get: (t) => t.curr2 },
  { label: 'Amount 2', shortLabel: 'Amt 2', num: true, get: (t) => formatAmount(t.amt2) },
  { label: 'Spot', num: true, get: (t) => formatRate(t.ospot) },
  { label: 'Swap Rate', shortLabel: 'Swap', num: true, get: (t) => formatRate(t.oswap) },
  { label: 'Strike', num: true, get: (t) => formatRate(t.strike) },
  { label: 'All in Rate', shortLabel: 'All-in', num: true, get: (t) => formatRate(t.rate) },
  { label: 'Premium', num: true, get: (t) => (t.preAmt ? `${formatAmount(t.preAmt)} ${t.preCurr}` : '') },
  { label: 'MC Reference', shortLabel: 'MC Ref', mono: true, get: (t) => t.mcRef },
  { label: 'Txn Status', status: true, get: (t) => txnStatusInfo(t.status).desc },
  { label: 'Status Code', shortLabel: 'St.', get: (t) => t.status },
  { label: 'Profit Center', shortLabel: 'PC', get: (t) => t.prctr },
  { label: 'Bus. Area', shortLabel: 'BA', get: (t) => t.rbusa },
  { label: 'Sett Complete', shortLabel: 'Sett', get: (t) => (t.settled ? 'Yes' : '') },
  { label: 'Sett Spot Amt', shortLabel: 'Spot Amt', num: true, sd: true, get: (t) => (t.sdAmt !== '' ? formatAmount(t.sdAmt) : '') },
  { label: 'Sett Spot Curr', shortLabel: 'Spot Ccy', sd: true, get: (t) => t.sdCurr },
  { label: 'Deal ID', mono: true, get: (t) => t.dealId },
  { label: 'Portfolio', get: (t) => t.portfolio },
  { label: 'Group', get: (t) => t.grp },
  { label: 'NDF Fix Date', shortLabel: 'Fix Date', get: (t) => isoToDMY(t.ndfDate), mono: true },
  { label: 'Fix. Ref. ID', shortLabel: 'Fix Ref', get: (t) => t.ndfRefName || t.ndfRef },
  { label: 'Currency Pair', shortLabel: 'Pair', get: (t) => t.cpair },
  { label: 'NDF Rate', num: true, get: (t) => formatRate(t.ndfRate) },
  { label: 'Cash Amt', num: true, get: (t) => (t.cashAmt && t.cashCurr === 'USD' ? `${formatAmount(t.cashAmt)} USD` : '') },
  { label: 'Cash Curr', get: (t) => t.cashCurr },
  {
    label: 'Sett Amt (Local)',
    shortLabel: 'Local Amt',
    num: true,
    get: (t) => (t.cashAmt && t.cashCurr && t.cashCurr !== 'USD' ? `${formatAmount(t.cashAmt * 100)} ${t.cashCurr}` : ''),
  },
  { label: 'Pay Curr', get: (t) => t.cashCurr },
  { label: 'Deal Type Sequence', shortLabel: 'Seq', num: true, get: (t) => String(t.seq) },
]

type ActCol = { label: string; shortLabel?: string; get?: (i: ActionItem) => string; num?: boolean; mono?: boolean; cls?: string; action?: boolean; btn?: boolean; status?: boolean }

const ACT_COLS: readonly ActCol[] = [
  { label: 'Transaction', shortLabel: 'Txn No.', get: (i) => i.rfha, mono: true },
  { label: 'Deal Type', get: (i) => i.dealType, cls: 'cell-type' },
  { label: 'Action Item', action: true, get: (i) => i.text },
  { label: 'Create', btn: true },
  { label: 'Co. Code', get: (i) => i.bukrs },
  { label: 'Counterparty', shortLabel: 'Cpty', get: (i) => i.cpty },
  { label: 'Txn Type', get: (i) => [i.sfhaart, txnTypeText(i.sfhaart)].filter(Boolean).join(' · ') },
  { label: 'Txn Status', status: true, get: (i) => txnStatusInfo(i.status).desc },
  { label: 'Trade Date', mono: true, get: (i) => isoToDMY(i.tradeDate) },
  { label: 'Value Date', mono: true, get: (i) => isoToDMY(i.valueDate) },
  { label: 'Exec. Date', mono: true, get: (i) => isoToDMY(i.eDate) },
  { label: 'NDF Fix Date', shortLabel: 'Fix Date', mono: true, get: (i) => isoToDMY(i.ndfDate) },
  { label: 'Put/Call 1', shortLabel: 'P/C 1', get: (i) => i.pc1 },
  { label: 'B/S 1', get: (i) => i.bs1 },
  { label: 'Curr 1', get: (i) => i.curr1 },
  { label: 'Amount 1', shortLabel: 'Amt 1', num: true, get: (i) => formatAmount(i.amt1) },
  { label: 'Put/Call 2', shortLabel: 'P/C 2', get: (i) => i.pc2 },
  { label: 'B/S 2', get: (i) => i.bs2 },
  { label: 'Curr 2', get: (i) => i.curr2 },
  { label: 'Buy/Sell', shortLabel: 'B/S', get: (i) => i.bs },
  { label: 'Invoice Amt', shortLabel: 'Inv Amt', num: true, get: (i) => (i.invAmt !== '' ? formatAmount(i.invAmt) : '') },
  { label: 'Inv Curr', get: (i) => i.invCurr },
  { label: 'Invoice Diff.', shortLabel: 'Inv Diff', num: true, get: (i) => (i.diffAmt !== '' ? formatAmount(i.diffAmt) : '') },
  { label: 'Cover Txn', mono: true, get: (i) => i.coverTxn },
]

const dsItem = (label: string, value: ReactNode) => (
  <div className="ds-item" key={label}>
    <span className="ds-label">{label}</span>
    <span className="ds-value">{value}</span>
  </div>
)

/**
 * The deal popup (click a Deal ID): FETCH_TXN_DATA and PROCESS_ACTION_ITEMS in two grids,
 * with Option Exercise/Expire, NDF Rate Fixing and Diff Spot acting on the selected transaction.
 */
export function DealModal({
  frame,
  spec,
  wb,
  dnd,
  txnNote,
  txnLoading = false,
  txnError = '',
  onSelectTxn,
}: {
  frame: FrameProps
  spec: Extract<PopupSpec, { kind: 'deal' }>
  wb: Wb
  dnd: Dnd
  /** Why the transaction grids are empty when no service serves them (WAITING FOR API). */
  txnNote: string
  txnLoading?: boolean
  txnError?: string
  onSelectTxn: (rfha: string | null) => void
}) {
  const data = wb.get()
  const deal = findDeal(data, spec.dealId)
  if (!deal) return null
  const txns = fetchTransactions(data, deal.id)
  const items = fetchActionItems(data, deal, txns)
  const st = dealStatusInfo(deal.status)
  const sel = spec.selectedRfha
  const has = !!sel

  const withTxn = (fn: (wb: Wb, t: NonNullable<ReturnType<typeof findTxn>>) => void) => () => {
    const t = sel ? findTxn(wb.get(), sel, { dealId: deal.id }) : undefined
    if (!t) {
      wb.toast('Select a transaction first.', 'error')
      return
    }
    fn(wb, t)
  }
  const wrongKind = (kind: string) => wb.toast(kind === 'txn' ? 'This action requires a transaction row.' : 'Select a deal first.', 'error')
  const selectedTxn = sel ? findTxn(data, sel, { dealId: deal.id }) : undefined
  const itemReason = (it: ActionItem) => {
    const txn = findTxn(data, it.rfha, { dealId: deal.id, bukrs: it.bukrs })
    return txn ? wb.entryReason(actionItemEntry(it, deal, txn), txn) : 'Transaction unavailable. Reload the workbench.'
  }
  const toolBtn = (id: string, label: string, action: EntryAction, run: () => void) => {
    const reason = wb.entryReason(action, selectedTxn)
    const activate = () => reason ? wb.toast(reason, 'error') : run()
    return <div className="action-entry">
    <button
      type="button"
      className={`btn btn-secondary${dropCls(dnd, id, 'txn', !!reason)}`}
      id={id}
      aria-disabled={!!reason}
      title={reason || label}
      onClick={activate}
      {...dnd.drop(id, 'txn', !!reason, activate, wrongKind)}
    >
      {label}
    </button>
    {reason ? <span className="hint">{reason}</span> : null}
    </div>
  }

  return (
    <ModalFrame frame={frame} title={`Deal ${deal.id}`} cls="wb-modal" actions={<button type="button" className="btn btn-secondary" onClick={frame.onClose}>Close</button>}>
      <div className="deal-summary">
        {dsItem('Description', deal.desc)}
        {dsItem('Model', `${deal.model} · ${modelDesc(deal.model)}`)}
        {dsItem('Status', <span className={`status-text ${st.cls}`}>{st.desc}</span>)}
        {dsItem('MC Reference', deal.mcRef)}
        {dsItem('Settlement Window', `${isoToDMY(deal.start)} to ${isoToDMY(deal.end)}`)}
        {deal.ss === 'X' ? dsItem('Type', 'Short Straddle') : null}
      </div>
      <div className="modal-toolbar">
        {toolBtn('btnEx', 'Option Exercise/Expire', 'rate', withTxn(actionOptionExercise))}
        {toolBtn('btnNdf', 'NDF Rate Fixing', 'ndf', withTxn(actionNdfFixing))}
        {toolBtn('btnDiff', 'Diff Spot', 'settlementSpot', withTxn(actionDiffSpot))}
        <span className="hint">{has ? `Transaction ${sel} selected` : 'Select a transaction to enable the actions'}</span>
      </div>
      {txnLoading || txnError ? <div className="inline-msg error show" role="status">{txnLoading ? 'Loading transactions…' : txnError}{txnError && !txnLoading ? <button type="button" className="btn btn-secondary" onClick={wb.reload}>Retry loading transactions</button> : null}</div> : null}

      <div className="sub-section">
        <div className="sub-title">
          <span className="dot"></span>Transactions <span className="count">{txns.length + (txns.length === 1 ? ' transaction' : ' transactions')}</span>
        </div>
        <div className="grid-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th className="action-col"></th>
                {TXN_COLS.map((c) => (
                  <th key={c.label} className={c.num ? 'num' : ''} title={c.label}>
                    {c.shortLabel ?? c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {txnLoading || txnError || txns.length === 0 ? (
                <tr className="no-hover">
                  <td colSpan={TXN_COLS.length + 1} className="empty-row">
                    {txnLoading ? 'Loading transactions…' : txnError || txnNote || 'No transactions for this deal.'}
                  </td>
                </tr>
              ) : (
                txns.map((t) => {
                  const isSel = sel === t.rfha
                  return (
                    <tr
                      key={t.rfha}
                      className={`${isSel ? 'selected' : ''}${dnd.dragging?.id === t.rfha ? ' dragging' : ''}`.trim() || undefined}
                      draggable={isSel}
                      onClick={() => onSelectTxn(isSel ? null : t.rfha)}
                      onDragStart={(e) => {
                        if (!isSel) {
                          e.preventDefault()
                          return
                        }
                        dnd.start(e, 'txn', t.rfha, `${t.rfha} — ${txnTypeText(t.sfhaart) || t.sfhaart}`)
                      }}
                      onDragEnd={dnd.end}
                    >
                      <td className="action-col">
                        <input
                          type="checkbox"
                          className="row-select-checkbox"
                          aria-label={`Select transaction ${t.rfha}`}
                          checked={isSel}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => onSelectTxn(e.target.checked ? t.rfha : null)}
                        />
                      </td>
                      {TXN_COLS.map((c) => {
                        let cls = (c.num ? 'num ' : '') + (c.mono ? 'mono ' : '')
                        if (c.link) cls += `${txnLinkClass(t)} cell-id `
                        if (c.type) cls += 'cell-type '
                        if (c.sd && t.sdPending) cls += 'cell-pending '
                        const text = c.get ? c.get(t) : ''
                        let inner: ReactNode = text
                        if (c.txnType) {
                          const description = txnTypeDescription(t.sfhaart)
                          inner = <>{t.sfhaart}{description ? <small className="txn-type-description">{description}</small> : null}</>
                        }
                        if (c.link)
                          inner = (
                            <button type="button"
                              className="link-cell"
                              aria-haspopup="dialog"
                              title="Display transaction"
                              onClick={(e) => {
                                e.stopPropagation()
                                wb.open({ kind: 'txn', rfha: t.rfha, dealId: t.dealId })
                              }}
                            >
                              {text}
                            </button>
                          )
                        if (c.status) inner = <span className={`status-text ${txnStatusInfo(t.status).cls}`}>{text}</span>
                        return (
                          <td key={c.label} className={cls.trim() || undefined} title={text}>
                            {inner}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="sub-section">
        <div className="sub-title">
          <span className="dot"></span>Action Items <span className="count">{items.length + (items.length === 1 ? ' item' : ' items')}</span>
        </div>
        <div className="grid-wrap">
          <table className="grid">
            <thead>
              <tr>
                {ACT_COLS.map((c) => (
                  <th key={c.label} className={c.num ? 'num' : ''} title={c.label}>
                    {c.shortLabel ?? c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {txnLoading || txnError || items.length === 0 ? (
                <tr className="no-hover">
                  <td colSpan={ACT_COLS.length} className="empty-row">
                    {txnLoading ? 'Loading action items…' : txnError || txnNote || 'No action items for this deal.'}
                  </td>
                </tr>
              ) : (
                items.map((it) => (
                  <tr key={it.rfha} className="no-hover">
                    {ACT_COLS.map((c) => {
                      if (c.btn)
                        return (
                          <td key={c.label}>
                            {it.button ? (
                              <button type="button" className="btn btn-primary btn-create" aria-disabled={!!itemReason(it)} title={itemReason(it) || it.text} onClick={() => actionItemCreate(wb, it)}>
                                Create
                              </button>
                            ) : null}
                              {it.button && itemReason(it) ? <div className="hint">{itemReason(it)}</div> : null}
                            </td>
                        )
                      let cls = (c.num ? 'num ' : '') + (c.mono ? 'mono ' : '') + (c.cls ? `${c.cls} ` : '')
                      if (c.action) cls += it.state === 'done' ? 'cell-done ' : 'cell-pending '
                      const text = c.get ? c.get(it) : ''
                      return (
                        <td key={c.label} className={cls.trim() || undefined} title={text}>
                          {c.status ? <span className={`status-text ${txnStatusInfo(it.status).cls}`}>{text}</span> : c.action ? <span className="action-copy">{text}</span> : text}
                        </td>
                      )
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ModalFrame>
  )
}

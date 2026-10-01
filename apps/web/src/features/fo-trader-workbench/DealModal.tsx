import type { ReactNode } from 'react'
import { dropCls, type Dnd } from './dnd.ts'
import { actionDiffSpot, actionItemCreate, actionNdfFixing, actionOptionExercise, findDeal, findTxn, type Wb } from './flows.ts'
import { formatAmount, formatRate, isoToDMY } from './format.ts'
import { dealStatusInfo, fetchActionItems, fetchTransactions, modelDesc, txnLinkClass, txnStatusInfo, txnTypeText } from './logic.ts'
import { ModalFrame, type FrameProps, type PopupSpec } from './modal.tsx'
import type { ActionItem, TxnRow } from './types.ts'

type TxnCol = {
  label: string
  get?: (t: TxnRow) => string
  num?: boolean
  mono?: boolean
  link?: boolean
  type?: boolean
  sd?: boolean
  status?: boolean
}

const TXN_COLS: readonly TxnCol[] = [
  { label: 'Co. Code', get: (t) => t.bukrs },
  { label: 'Deal Type', get: (t) => t.dealType, type: true },
  { label: 'Transaction', link: true, get: (t) => t.rfha },
  { label: 'Txn Type', get: (t) => `${t.sfhaart} · ${txnTypeText(t.sfhaart)}` },
  { label: 'Counterparty', get: (t) => t.cptyName },
  { label: 'Trade Date', get: (t) => isoToDMY(t.tradeDate), mono: true },
  { label: 'Value Date', get: (t) => isoToDMY(t.valueDate), mono: true },
  { label: 'Exec. Date', get: (t) => isoToDMY(t.eDate), mono: true },
  { label: 'Entity', get: (t) => t.entity },
  { label: 'P/C', get: (t) => t.pc1 },
  { label: 'B/S 1', get: (t) => t.bs1 },
  { label: 'Curr 1', get: (t) => t.curr1 },
  { label: 'Amount 1', num: true, get: (t) => formatAmount(t.amt1) },
  { label: 'B/S 2', get: (t) => t.bs2 },
  { label: 'Curr 2', get: (t) => t.curr2 },
  { label: 'Amount 2', num: true, get: (t) => formatAmount(t.amt2) },
  { label: 'Strike', num: true, get: (t) => formatRate(t.strike) },
  { label: 'All in Rate', num: true, get: (t) => formatRate(t.rate) },
  { label: 'Premium', num: true, get: (t) => (t.preAmt ? `${formatAmount(t.preAmt)} ${t.preCurr}` : '') },
  { label: 'Txn Status', status: true, get: (t) => txnStatusInfo(t.status).desc },
  { label: 'Sett Spot Amt', num: true, sd: true, get: (t) => (t.sdAmt !== '' ? formatAmount(t.sdAmt) : '') },
  { label: 'Sett Spot Curr', sd: true, get: (t) => t.sdCurr },
  { label: 'NDF Fix Date', get: (t) => isoToDMY(t.ndfDate), mono: true },
  { label: 'NDF Rate', num: true, get: (t) => formatRate(t.ndfRate) },
  { label: 'Cash Amt', num: true, get: (t) => (t.cashAmt && t.cashCurr === 'USD' ? `${formatAmount(t.cashAmt)} USD` : '') },
  {
    label: 'Sett Amt (Local)',
    num: true,
    get: (t) => (t.cashAmt && t.cashCurr && t.cashCurr !== 'USD' ? `${formatAmount(t.cashAmt * 100)} ${t.cashCurr}` : ''),
  },
]

type ActCol = { label: string; get?: (i: ActionItem) => string; num?: boolean; mono?: boolean; cls?: string; action?: boolean; btn?: boolean; status?: boolean }

const ACT_COLS: readonly ActCol[] = [
  { label: 'Transaction', get: (i) => i.rfha, mono: true },
  { label: 'Deal Type', get: (i) => i.dealType, cls: 'cell-type' },
  { label: 'Action Item', action: true, get: (i) => i.text },
  { label: 'Create', btn: true },
  { label: 'Co. Code', get: (i) => i.bukrs },
  { label: 'Counterparty', get: (i) => i.cpty },
  { label: 'Txn Type', get: (i) => `${i.sfhaart} · ${txnTypeText(i.sfhaart)}` },
  { label: 'Txn Status', status: true, get: (i) => txnStatusInfo(i.status).desc },
  { label: 'Value Date', mono: true, get: (i) => isoToDMY(i.valueDate) },
  { label: 'Exec. Date', mono: true, get: (i) => isoToDMY(i.eDate) },
  { label: 'P/C', get: (i) => i.pc1 },
  { label: 'Curr 1', get: (i) => i.curr1 },
  { label: 'Amount 1', num: true, get: (i) => formatAmount(i.amt1) },
  { label: 'Curr 2', get: (i) => i.curr2 },
  { label: 'Buy/Sell', get: (i) => i.bs },
  { label: 'Invoice Amt', num: true, get: (i) => (i.invAmt !== '' ? formatAmount(i.invAmt) : '') },
  { label: 'Inv Curr', get: (i) => i.invCurr },
  { label: 'Invoice Diff.', num: true, get: (i) => (i.diffAmt !== '' ? formatAmount(i.diffAmt) : '') },
]

const dsItem = (label: string, value: ReactNode) => (
  <div className="ds-item" key={label}>
    <span className="ds-label">{label}</span>
    <span className="ds-value">{value}</span>
  </div>
)

/**
 * The deal popup (double-click a deal): FETCH_TXN_DATA and PROCESS_ACTION_ITEMS in two grids,
 * with Option Exercise/Expire, NDF Rate Fixing and Diff Spot acting on the selected transaction.
 */
export function DealModal({
  frame,
  spec,
  wb,
  dnd,
  onSelectTxn,
}: {
  frame: FrameProps
  spec: Extract<PopupSpec, { kind: 'deal' }>
  wb: Wb
  dnd: Dnd
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
    const t = sel ? findTxn(wb.get(), sel) : undefined
    if (!t) {
      wb.toast('Select a transaction first.', 'error')
      return
    }
    fn(wb, t)
  }
  const wrongKind = (kind: string) => wb.toast(kind === 'txn' ? 'This action requires a transaction row.' : 'Select a deal first.', 'error')
  const toolBtn = (id: string, label: string, run: () => void) => (
    <button
      type="button"
      className={`btn btn-secondary${dropCls(dnd, id, 'txn', !has)}`}
      id={id}
      disabled={!has}
      onClick={run}
      {...dnd.drop(id, 'txn', !has, run, wrongKind)}
    >
      {label}
    </button>
  )

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
        {toolBtn('btnEx', 'Option Exercise/Expire', withTxn(actionOptionExercise))}
        {toolBtn('btnNdf', 'NDF Rate Fixing', withTxn(actionNdfFixing))}
        {toolBtn('btnDiff', 'Diff Spot', withTxn(actionDiffSpot))}
        <span className="hint">{has ? `Transaction ${sel} selected` : 'Select a transaction to enable the actions'}</span>
      </div>

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
                  <th key={c.label} className={c.num ? 'num' : ''}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {txns.length === 0 ? (
                <tr className="no-hover">
                  <td colSpan={TXN_COLS.length + 1} className="empty-row">
                    No transactions for this deal.
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
                        if (c.link) cls += `${txnLinkClass(t)} `
                        if (c.type) cls += 'cell-type '
                        if (c.sd && t.sdPending) cls += 'cell-pending '
                        const text = c.get ? c.get(t) : ''
                        let inner: ReactNode = text
                        if (c.link)
                          inner = (
                            <span
                              className="link-cell"
                              title="Display transaction"
                              onClick={(e) => {
                                e.stopPropagation()
                                wb.open({ kind: 'txn', rfha: t.rfha })
                              }}
                            >
                              {text}
                            </span>
                          )
                        if (c.status) inner = <span className={`status-text ${txnStatusInfo(t.status).cls}`}>{text}</span>
                        return (
                          <td key={c.label} className={cls.trim() || undefined}>
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
                  <th key={c.label} className={c.num ? 'num' : ''}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr className="no-hover">
                  <td colSpan={ACT_COLS.length} className="empty-row">
                    No action items for this deal.
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
                              <button type="button" className="btn btn-primary btn-create" onClick={() => actionItemCreate(wb, it)}>
                                Create
                              </button>
                            ) : null}
                          </td>
                        )
                      let cls = (c.num ? 'num ' : '') + (c.mono ? 'mono ' : '') + (c.cls ? `${c.cls} ` : '')
                      if (c.action) cls += it.state === 'done' ? 'cell-done ' : 'cell-pending '
                      const text = c.get ? c.get(it) : ''
                      return (
                        <td key={c.label} className={cls.trim() || undefined}>
                          {c.status ? <span className={`status-text ${txnStatusInfo(it.status).cls}`}>{text}</span> : text}
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

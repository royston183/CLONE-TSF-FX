import type { ReactNode } from 'react'
import { formatAmount, formatCompactUSD, formatRate } from './format.ts'
import { breakdownBy, totalAmount } from './logic.ts'
import { Overlay, type Modal } from './modal.tsx'
import type { MasterContract } from './types.ts'

/** Which KPI card was double-clicked. */
export type KpiKind = { type: 'total' } | { type: 'status'; status: string } | { type: 'amount' } | { type: 'models' } | { type: 'entities' }

const TOTAL_BREAKDOWN = ['In Use', 'Confirmed', 'Draft', 'Pending Approval', 'Rejected', 'Settled', 'Matured']

function KvRow({ label, value, total = false }: { label: string; value: string | number; total?: boolean }) {
  return (
    <div className={`kv-row${total ? ' kv-total' : ''}`}>
      <span className="kv-label">{label}</span>
      <span className="kv-value">{value}</span>
    </div>
  )
}

function BreakdownTable({ rows, first }: { rows: ReturnType<typeof breakdownBy>; first: string }) {
  const total = rows.reduce((s, r) => s + r.amountUsd, 0)
  return (
    <div className="popup-table-wrap">
      <table className="popup-table" style={{ minWidth: 0 }}>
        <thead>
          <tr>
            <th>{first}</th>
            <th className="num">Contracts</th>
            <th className="num">MC Amount (USD)</th>
            <th className="num">Share</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={4} className="popup-empty">No contracts found.</td></tr>
          ) : (
            rows.map((r) => (
              <tr key={r.key}>
                <td><b>{r.label}</b></td>
                <td className="num">{r.count}</td>
                <td className="num mono">{formatAmount(r.amountUsd)}</td>
                <td className="num">{total ? ((r.amountUsd / total) * 100).toFixed(1) : '0.0'}%</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

function ContractsTable({ list }: { list: MasterContract[] }) {
  return (
    <div className="popup-table-wrap">
      <table className="popup-table">
        <thead>
          <tr>
            <th>MC Number</th>
            <th>Origin Entity</th>
            <th>FX Model</th>
            <th>Commodity</th>
            <th>MC Date</th>
            <th className="num">MC Amount (USD)</th>
            <th className="num">Exchange Rate</th>
          </tr>
        </thead>
        <tbody>
          {list.length === 0 ? (
            <tr>
              <td colSpan={7} className="popup-empty">
                No contracts found.
              </td>
            </tr>
          ) : (
            list.map((c) => (
              <tr key={c.mcNumber}>
                <td className="mono">{c.mcNumber}</td>
                <td>{c.originEntity}</td>
                <td>{c.fxModelCode}</td>
                <td>{c.commodityName}</td>
                <td className="mono">{c.mcDate}</td>
                <td className="num mono">{formatAmount(c.mcAmountUsd)}</td>
                <td className="num mono">{formatRate(c.exchangeRate)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

function body(kind: KpiKind, all: MasterContract[]): { title: string; content: ReactNode } {
  if (kind.type === 'total') {
    const counts: Record<string, number> = {}
    for (const c of all) counts[c.status] = (counts[c.status] ?? 0) + 1
    return {
      title: 'Total Master Contracts',
      content: (
        <div className="kv-list">
          <KvRow label="Total Contracts" value={all.length} total />
          {TOTAL_BREAKDOWN.map((s) => (
            <KvRow key={s} label={s} value={counts[s] ?? 0} />
          ))}
          <KvRow label="Total MC Amount" value={formatCompactUSD(totalAmount(all))} total />
        </div>
      ),
    }
  }
  if (kind.type === 'status') {
    const list = all.filter((c) => c.status === kind.status)
    return { title: `${kind.status} Master Contracts (${list.length})`, content: <ContractsTable list={list} /> }
  }
  if (kind.type === 'models' || kind.type === 'entities') {
    const by = kind.type === 'models' ? 'model' : 'entity'
    const rows = breakdownBy(all, by)
    return {
      title: kind.type === 'models' ? `FX Models in Use (${rows.length})` : `Origin Entities (${rows.length})`,
      content: <BreakdownTable rows={rows} first={kind.type === 'models' ? 'FX Model' : 'Origin Entity'} />,
    }
  }
  const amounts = all.map((c) => c.mcAmountUsd || 0)
  const total = totalAmount(all)
  return {
    title: 'Total MC Amount (USD)',
    content: (
      <div className="kv-list">
        <KvRow label="Total Contracts" value={all.length} />
        <KvRow label="Total MC Amount" value={formatCompactUSD(total)} total />
        <KvRow label="Average Contract" value={formatCompactUSD(all.length ? total / all.length : 0)} />
        <KvRow label="Largest Contract" value={formatCompactUSD(amounts.length ? Math.max(...amounts) : 0)} />
        <KvRow label="Smallest Contract" value={formatCompactUSD(amounts.length ? Math.min(...amounts) : 0)} />
      </div>
    ),
  }
}

export function KpiDetailModal({ modal, kind, contracts }: { modal: Modal; kind: KpiKind | null; contracts: MasterContract[] }) {
  const detail = kind ? body(kind, contracts) : null
  return (
    <Overlay modal={modal} onBackdrop={modal.close}>
      <div className={`modal modal-left modal-scrollable kpi-detail-modal${kind?.type === 'models' || kind?.type === 'entities' ? ' wide' : ''}`}>
        <div className="modal-head-row">
          <h2>{detail?.title ?? 'KPI Detail'}</h2>
          <button type="button" className="modal-close-btn" aria-label="Close" onClick={modal.close}>
            ×
          </button>
        </div>
        <div className="modal-body-scroll">{detail?.content}</div>
        <div className="modal-actions">
          <button className="btn btn-secondary" type="button" style={{ width: '100%' }} onClick={modal.close}>
            Close
          </button>
        </div>
      </div>
    </Overlay>
  )
}

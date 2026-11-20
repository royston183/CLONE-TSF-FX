import { useEffect, useMemo, useState } from 'react'
import { useAsync } from '@slc/api-client/react'
import { useModal } from '../fo-create-master-contract/modal.tsx'
import { Amount, Notice, ReportHeader, Skeleton, opener } from '../../shared/report/ui.tsx'
import { portfolioTotals } from './calc.ts'
import { DATA_SOURCE, getDeals } from './api.ts'
import { DealPnlModal } from './DealPnlModal.tsx'
import { exportPortfolio } from './export.ts'
import { statusClass } from './status.ts'
import type { DealStatus, DealSummary } from './types.ts'
import './fx-deal-pnl.css'

/**
 * FX Deal P&L Analysis: planned, settlement, actual and net P&L of every FX Deal ID, in USD, laid out like the Master Contract
 * screen. A deal opens its entity-wise breakdown; double-click a planned or settlement figure there for the calculation.
 * api.ts says where the figures come from.
 */

type SortKey = 'id' | 'model' | 'description' | 'entity' | 'tradeDate' | 'maturityDate' | 'pair' | 'plannedUsd' | 'settlementUsd' | 'actualUsd' | 'netUsd' | 'status'
type Sort = { key: SortKey; dir: 1 | -1 }

const dmy = (iso: string) => iso.split('-').reverse().join('-')
const COLUMNS: { key: SortKey; label: string; num?: boolean }[] = [
  { key: 'status', label: 'Status' },
  { key: 'id', label: 'Deal ID' },
  { key: 'model', label: 'FX Model' },
  { key: 'description', label: 'Deal Description' },
  { key: 'entity', label: 'Entity' },
  { key: 'tradeDate', label: 'Trade Date' },
  { key: 'maturityDate', label: 'Maturity Date' },
  { key: 'pair', label: 'Pair' },
  { key: 'plannedUsd', label: 'Planned P&L', num: true },
  { key: 'settlementUsd', label: 'Settlement P&L', num: true },
  { key: 'actualUsd', label: 'Actual P&L', num: true },
  { key: 'netUsd', label: 'Net P&L', num: true },
]

const value = (d: DealSummary, key: SortKey): string | number => {
  if (key === 'entity') return d.entities.join(', ')
  const v = d[key]
  return v === null ? Number.NEGATIVE_INFINITY : v
}

export default function FxDealPnl() {
  const read = useAsync((signal) => getDeals(signal), [])
  const modal = useModal()
  const [q, setQ] = useState('')
  const [entity, setEntity] = useState('')
  const [type, setType] = useState('')
  const [ccy, setCcy] = useState('')
  const [status, setStatus] = useState<'' | DealStatus>('')
  const [basis, setBasis] = useState<'tradeDate' | 'maturityDate'>('tradeDate')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sort, setSort] = useState<Sort>({ key: 'id', dir: -1 })
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(8)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tip, setTip] = useState<{ x: number; y: number; deal: DealSummary } | null>(null)
  const [busy, setBusy] = useState(false)

  const deals = read.data ?? []
  const options = useMemo(() => ({
    entities: [...new Set(deals.flatMap((d) => d.entities))].sort(),
    models: [...new Map(deals.map((d) => [d.model, d.type] as const)).entries()].sort(([a], [b]) => a.localeCompare(b)),
    ccys: [...new Set(deals.map((d) => d.localCcy))].sort(),
  }), [deals])

  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase()
    return deals.filter((d) =>
      (!text || d.id.toLowerCase().includes(text) || d.description.toLowerCase().includes(text)) &&
      (!entity || d.entities.includes(entity)) && (!type || d.model === type) && (!ccy || d.localCcy === ccy) && (!status || d.status === status) &&
      (!from || d[basis] >= from) && (!to || d[basis] <= to))
  }, [deals, q, entity, type, ccy, status, basis, from, to])

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const x = value(a, sort.key), y = value(b, sort.key)
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * sort.dir
  }), [filtered, sort])

  const pageCount = Math.max(1, Math.ceil(sorted.length / size))
  const current = Math.min(page, pageCount)
  const rows = sorted.slice((current - 1) * size, current * size)
  const totals = useMemo(() => portfolioTotals(filtered), [filtered])
  const selected = deals.find((d) => d.id === selectedId) ?? null
  const filtering = !!(q || entity || type || ccy || status || from || to)

  useEffect(() => { if (modal.state === 'closed') setSelectedId(null) }, [modal.state])

  const open = (id: string) => { setTip(null); setSelectedId(id); modal.open() }
  const reset = (set: () => void) => { set(); setPage(1) }
  const clear = () => { setQ(''); setEntity(''); setType(''); setCcy(''); setStatus(''); setFrom(''); setTo(''); setPage(1) }
  const sortBy = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }))

  async function download() {
    setBusy(true)
    try {
      await exportPortfolio(sorted)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fomc">
      <div className="app">
        <ReportHeader title="FX Deal P&L Analysis" subtitle="Planned, settlement, actual and net P&L of every FX Deal ID, in USD">
          <button className="btn btn-secondary" type="button" onClick={() => void download()} disabled={busy || !sorted.length}>{busy ? 'Exporting…' : 'Export to Excel'}</button>
          <button className="btn btn-primary" type="button" onClick={read.reload} disabled={read.loading}>{read.loading ? 'Refreshing…' : 'Refresh'}</button>
        </ReportHeader>

        <div className="table-col">
          <div className="card">
            <div className="section-title">
              <span className="dot" />
              Deal P&amp;L
              <span className="rpt-source" title="These are sample deals until the P&L service is connected.">{DATA_SOURCE === 'sample' ? 'Sample data' : 'Live'}</span>
            </div>

            <div className="table-toolbar">
              <div className="search-box">
                <span className="icon">🔍</span>
                <input placeholder="Search Deal ID or description..." value={q} onChange={(e) => reset(() => setQ(e.target.value))} aria-label="Search Deal ID" />
              </div>
              <select className="control filter-select" value={entity} onChange={(e) => reset(() => setEntity(e.target.value))} aria-label="Entity"><option value="">All entities</option>{options.entities.map((v) => <option key={v}>{v}</option>)}</select>
              <select className="control filter-select" value={type} onChange={(e) => reset(() => setType(e.target.value))} aria-label="FX model"><option value="">All FX models</option>{options.models.map(([code, desc]) => <option key={code} value={code}>{code} — {desc}</option>)}</select>
              <select className="control filter-select" value={ccy} onChange={(e) => reset(() => setCcy(e.target.value))} aria-label="Currency"><option value="">All currencies</option>{options.ccys.map((v) => <option key={v} value={v}>USD/{v}</option>)}</select>
              <select className="control filter-select" value={status} onChange={(e) => reset(() => setStatus(e.target.value as '' | DealStatus))} aria-label="Status"><option value="">All statuses</option>{(['Open', 'Matured', 'Settled'] as const).map((v) => <option key={v}>{v}</option>)}</select>
              <select className="control filter-select" value={basis} onChange={(e) => reset(() => setBasis(e.target.value as 'tradeDate' | 'maturityDate'))} aria-label="Date to filter on"><option value="tradeDate">Trade date</option><option value="maturityDate">Maturity date</option></select>
              <input className="control filter-select" type="date" value={from} onChange={(e) => reset(() => setFrom(e.target.value))} aria-label="From date" />
              <input className="control filter-select" type="date" value={to} onChange={(e) => reset(() => setTo(e.target.value))} aria-label="To date" />
              {filtering ? <button className="btn btn-secondary btn-sm" type="button" onClick={clear}>Clear filters</button> : null}
              <div className="toolbar-spacer" />
              <span className="result-count">{filtered.length} {filtered.length === 1 ? 'deal' : 'deals'}</span>
            </div>

            {read.loading && !read.data ? <Skeleton rows={7} /> : null}
            {read.error ? <Notice tone="error" title="Could not load the deals." action={<button className="btn btn-secondary btn-sm" type="button" onClick={read.reload}>Retry</button>}>{read.error.message}</Notice> : null}

            {read.data && sorted.length ? (
              <div className="table-scroll">
                <table className="mc-table">
                  <thead>
                    <tr>
                      {COLUMNS.map((c) => (
                        <th key={c.key} className={`${c.num ? 'num ' : ''}${sort.key === c.key ? 'sorted' : ''}`} aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                          <button type="button" onClick={() => sortBy(c.key)}>{c.label}<span className="sort-ind">{sort.key === c.key ? (sort.dir === 1 ? '▲' : '▼') : '↕'}</span></button>
                        </th>
                      ))}
                      <th className="no-sort">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((d) => (
                      <tr key={d.id} tabIndex={0} aria-label={`Deal ${d.id}, open P&L breakdown`}
                        onMouseMove={(e) => setTip({ x: Math.min(e.clientX + 16, window.innerWidth - 290), y: Math.min(e.clientY + 18, window.innerHeight - 150), deal: d })}
                        onMouseLeave={() => setTip(null)} onBlur={() => setTip(null)}
                        {...opener(() => open(d.id))}>
                        <td><span className={statusClass(d.status)}>{d.status}</span></td>
                        <td><span className="mc-link">{d.id}</span></td>
                        <td>{d.model}</td>
                        <td>{d.description}<span className="rpt-sub">{d.type}</span></td>
                        <td>{d.entities[0]}{d.entities.length > 1 ? <span className="rpt-more" title={d.entities.join(', ')}>+{d.entities.length - 1}</span> : null}</td>
                        <td>{dmy(d.tradeDate)}</td>
                        <td>{dmy(d.maturityDate)}</td>
                        <td>{d.pair}</td>
                        <td className="num"><Amount value={d.plannedUsd} /></td>
                        <td className="num"><Amount value={d.settlementUsd} /></td>
                        <td className="num"><Amount value={d.actualUsd} /></td>
                        <td className="num"><b><Amount value={d.netUsd} /></b></td>
                        <td><button className="btn btn-ghost" type="button" onClick={(e) => { e.stopPropagation(); open(d.id) }}>View</button></td>
                      </tr>
                    ))}
                    <tr className="rpt-sum">
                      <td colSpan={8}>Total of {sorted.length} deal{sorted.length === 1 ? '' : 's'} (USD)</td>
                      <td className="num"><Amount value={totals.plannedUsd} plain /></td>
                      <td className="num"><Amount value={sorted.reduce((s, d) => s + (d.settlementUsd ?? 0), 0)} plain /></td>
                      <td className="num"><Amount value={totals.actualUsd} plain /></td>
                      <td className="num"><Amount value={totals.netUsd} plain /></td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : null}
            {read.data && !sorted.length ? (
              <div className="empty-state">
                <div className="big">📄</div>
                {deals.length ? 'No deals match your search or filters.' : 'There are no deals to show yet. They appear here once the P&L service is connected.'}
              </div>
            ) : null}

            <div className="table-footer">
              <div className="page-size-select">
                Rows per page
                <select value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(1) }}>
                  <option value={8}>8</option>
                  <option value={12}>12</option>
                  <option value={20}>20</option>
                </select>
              </div>
              <div className="pagination">
                <button type="button" disabled={current <= 1} onClick={() => setPage(current - 1)}>‹</button>
                {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
                  <button key={p} type="button" className={p === current ? 'active' : undefined} onClick={() => setPage(p)}>{p}</button>
                ))}
                <button type="button" disabled={current >= pageCount} onClick={() => setPage(current + 1)}>›</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {tip ? (
        <div className="rpt-tip" role="tooltip" style={{ left: tip.x, top: tip.y }}>
          <b>{tip.deal.id}</b>
          <span>{tip.deal.entities.join(' · ')}</span>
          <span>{tip.deal.model} · {tip.deal.pair} · {tip.deal.status}</span>
          <span>Net P&amp;L <Amount value={tip.deal.netUsd} ccy="USD" /></span>
        </div>
      ) : null}

      <DealPnlModal modal={modal} deal={selected} />
    </div>
  )
}


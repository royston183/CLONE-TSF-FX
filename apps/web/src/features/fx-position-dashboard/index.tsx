import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { useAsync } from '@slc/api-client/react'
import { Overlay, useModal, type Modal } from '../fo-create-master-contract/modal.tsx'
import { Counter, Notice, ReportHeader, Skeleton } from '../../shared/report/ui.tsx'
import { compact, isoOf } from '../../menu/live/fxOverview.ts'
import { buildPosition, loadPositionRaw, positionDetail, type Grid, type PositionDetail, type PositionView } from '../../menu/live/fxPosition.ts'
import { Clusters, Columns, Donut, Rows, money } from './charts.tsx'
import './fx-position-dashboard.css'

/**
 * FX Position Dashboard, laid out like the Master Contract screen: a header, KPI cards, then four cards (BP wise summary,
 * maturity ladder, Deal ID status, planned P&L). Each shows a chart or its table, and every bar, slice, row or cell opens the
 * Deal IDs behind it. The numbers come from menu/live/fxPosition.ts.
 */

const BANKS = 'BP wise summary'
const LADDER = 'Maturity ladder'
const STATUS = 'Deal ID status'
const PNL = 'Planned P&L for upcoming settlement'
const dmy = (iso: string) => iso.split('-').reverse().join('.')
const bankName = (label: string) => {
  const name = label.includes(' - ') ? label.slice(label.indexOf(' - ') + 3) : label
  return name.length > 14 ? name.slice(0, 13) + '…' : name
}

type Mode = 'chart' | 'table'

/** One card: title, a Chart / Table switch, a View details link; its marks open Deal IDs through `onDrill`. */
function Panel({ title, sub, chart, table, empty, initial = 'chart', onDrill }: {
  title: string
  sub: string
  chart: ReactNode
  table: ReactNode
  empty: boolean
  initial?: Mode
  onDrill: (title: string, mark: string) => void
}) {
  const [mode, setMode] = useState<Mode>(initial)
  const mark = (target: EventTarget | null) => (target instanceof Element ? target.closest('[data-drill]')?.getAttribute('data-drill') ?? null : null)
  const click = (e: MouseEvent) => {
    const m = mark(e.target)
    if (m !== null) onDrill(title, m)
  }
  const key = (e: KeyboardEvent) => {
    if (e.key !== 'Enter') return
    const m = mark(e.target)
    if (m !== null) onDrill(title, m)
  }
  return (
    <div className="card pos-card">
      <div className="section-title">
        <span className="dot" />
        <span>{title}<span className="pos-sub">{sub}</span></span>
        <span className="pos-tools">
          <span className="pagination" role="group" aria-label={`${title} view`}>
            <button type="button" className={mode === 'chart' ? 'active' : undefined} aria-pressed={mode === 'chart'} onClick={() => setMode('chart')}>Chart</button>
            <button type="button" className={mode === 'table' ? 'active' : undefined} aria-pressed={mode === 'table'} onClick={() => setMode('table')}>Table</button>
          </span>
          <button type="button" className="btn btn-ghost" onClick={() => onDrill(title, '')}>View details</button>
        </span>
      </div>
      <div className="pos-body" onClick={click} onKeyDown={key}>
        {empty ? <div className="empty-state"><div className="big">📄</div>No Deal IDs on this key date.</div> : <div key={mode} className="pos-swap">{mode === 'chart' ? chart : table}</div>}
      </div>
    </div>
  )
}

function GridTable({ grid, first, mark }: { grid: Grid; first: string; mark: (year: number, column: string) => string }) {
  const columns = grid.columns.filter((c) => grid.colTotal[c])
  return (
    <div className="table-scroll">
      <table className="mc-table">
        <thead><tr><th className="no-sort">{first}</th>{columns.map((c) => <th key={c} className="no-sort num">{c}</th>)}<th className="no-sort num">Total</th></tr></thead>
        <tbody>
          {grid.years.map((y) => (
            <tr key={y}>
              <td><span className="mc-link" data-drill={String(y)}>{y}</span></td>
              {columns.map((c) => {
                const v = grid.cells[y]![c] ?? 0
                return v ? <td key={c} className="num" data-drill={mark(y, c)} data-tip={`${mark(y, c).replace('|', ' · ')}\nUSD ${money(v)}`}>{money(v)}</td> : <td key={c} className="num" />
              })}
              <td className="num" data-drill={String(y)}><b>{money(grid.rowTotal[y] ?? 0)}</b></td>
            </tr>
          ))}
          <tr className="rpt-sum"><td>Total</td>{columns.map((c) => <td key={c} className="num">{money(grid.colTotal[c] ?? 0)}</td>)}<td className="num">{money(grid.total)}</td></tr>
        </tbody>
      </table>
    </div>
  )
}

function Panels({ view, onDrill }: { view: PositionView; onDrill: (title: string, mark: string) => void }) {
  const none = view.deals.length === 0
  const months = view.ladder.columns.filter((c) => view.ladder.colTotal[c])
  const models = view.pl.columns
  return (
    <div className="pos-grid">
      <Panel
        title={BANKS} sub="USD volume and number of Deal IDs by counterparty bank" empty={none} initial="table" onDrill={onDrill}
        chart={<Columns columns={view.banks.map((b) => b.label)} series={['USD volume']} label={bankName} slim value={(b) => view.banks.find((x) => x.label === b)?.volume ?? 0} mark={(b) => b} title="USD volume by bank" />}
        table={
          <div className="table-scroll">
            <table className="mc-table">
              <thead><tr><th className="no-sort">Bank name</th><th className="no-sort num">USD volume</th><th className="no-sort num">Percentage %</th><th className="no-sort num">No. of Deal ID</th></tr></thead>
              <tbody>
                {view.banks.map((b) => (
                  <tr key={b.label} tabIndex={0} data-drill={b.label} data-tip={`${b.label}\nUSD ${money(b.volume)} · ${b.count} Deal IDs`}>
                    <td><span className="mc-link">{b.label}</span></td><td className="num">{money(b.volume)}</td><td className="num">{b.share.toFixed(3)}%</td><td className="num">{b.count}</td>
                  </tr>
                ))}
                <tr className="rpt-sum"><td>Total</td><td className="num">{money(view.volume)}</td><td className="num">100.000%</td><td className="num">{view.deals.length}</td></tr>
              </tbody>
            </table>
          </div>
        }
      />
      <Panel
        title={LADDER} sub="USD volume maturing, by year and month" empty={none} onDrill={onDrill}
        chart={<Rows rows={months} series={view.ladder.years.map(String)} value={(m, y) => view.ladder.cells[Number(y)]?.[m] ?? 0} mark={(m, y) => `${y}|${m}`} title="USD volume maturing by month, stacked by year" />}
        table={<GridTable grid={{ ...view.ladder, columns: months }} first="Year" mark={(y, m) => `${y}|${m}`} />}
      />
      <Panel
        title={STATUS} sub="Deal IDs by status: USD volume and count" empty={none} onDrill={onDrill}
        chart={<div className="pos-ringwrap"><Donut data={view.statuses.map((s) => ({ label: s.label, value: s.count, volume: s.volume }))} caption="DEAL IDS" title="Deal IDs by status" /></div>}
        table={
          <div className="table-scroll">
            <table className="mc-table">
              <thead><tr><th className="no-sort">Status</th><th className="no-sort num">USD volume</th><th className="no-sort num">No. of Deal</th></tr></thead>
              <tbody>
                {view.statuses.map((s) => (
                  <tr key={s.label} tabIndex={0} data-drill={s.label} data-tip={`${s.label}\nUSD ${money(s.volume)} · ${s.count} Deal IDs`}>
                    <td><span className="mc-link">{s.label}</span></td><td className="num">{money(s.volume)}</td><td className="num">{s.count}</td>
                  </tr>
                ))}
                <tr className="rpt-sum"><td>Total</td><td className="num">{money(view.volume)}</td><td className="num">{view.deals.length}</td></tr>
              </tbody>
            </table>
          </div>
        }
      />
      <Panel
        title={PNL} sub="Planned P&L in USD, by year and FX model" empty={none} onDrill={onDrill}
        chart={<Clusters groups={view.pl.years.map(String)} series={models} value={(y, m) => view.pl.cells[Number(y)]?.[m] ?? 0} mark={(y, m) => `${y}|${m}`} title="Planned P&L by year, a bar per FX model" />}
        table={<GridTable grid={view.pl} first="Year" mark={(y, m) => `${y}|${m}`} />}
      />
    </div>
  )
}

/** The Deal IDs behind a card or one mark of it, in the Master Contract pop-up. */
function DrillModal({ modal, detail }: { modal: Modal; detail: PositionDetail | null }) {
  return (
    <Overlay modal={modal} onBackdrop={modal.close}>
      <div className="modal modal-left modal-scrollable pos-modal">
        <div className="modal-head-row">
          <h2>{detail?.title ?? 'Deal IDs'}</h2>
          <button type="button" className="modal-close-btn" aria-label="Close" onClick={modal.close}>×</button>
        </div>
        <div className="modal-body-scroll">
          {detail && detail.rows.length ? (
            <div className="popup-table-wrap">
              <table className="popup-table">
                <thead><tr>{detail.columns.map((c) => <th key={c} className={/USD|P&L/.test(c) ? 'num' : ''}>{c}</th>)}</tr></thead>
                <tbody>
                  {detail.rows.map((r, i) => (
                    <tr key={i}>{detail.columns.map((c) => <td key={c} className={/USD|P&L/.test(c) ? 'num' : ''}>{r[c]}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="empty-state"><div className="big">📄</div>No Deal IDs behind this.</div>}
        </div>
        <div className="modal-actions">
          <span className="pos-count">{detail?.rows.length ?? 0} Deal ID{detail?.rows.length === 1 ? '' : 's'}</span>
          <button className="btn btn-secondary" type="button" onClick={modal.close}>Close</button>
        </div>
      </div>
    </Overlay>
  )
}

export default function FxPositionDashboard() {
  const read = useAsync((signal) => loadPositionRaw(signal), [])
  const [keyDate, setKeyDate] = useState(() => isoOf(new Date()))
  const modal = useModal()
  const [detail, setDetail] = useState<PositionDetail | null>(null)
  const [tip, setTip] = useState<{ x: number; y: number; lines: string[] } | null>(null)
  const raw = read.data
  const view = useMemo(() => (raw && keyDate ? buildPosition(raw, keyDate) : null), [raw, keyDate])

  const drill = (title: string, mark: string) => {
    if (!view) return
    setTip(null)
    setDetail(positionDetail(view.deals, title, mark))
    modal.open()
  }
  useEffect(() => { if (modal.state === 'closed') setDetail(null) }, [modal.state])

  const hover = (e: MouseEvent) => {
    const el = e.target instanceof Element ? e.target.closest('[data-tip]') : null
    const text = el?.getAttribute('data-tip')
    setTip(text ? { x: Math.min(e.clientX + 14, window.innerWidth - 300), y: Math.min(e.clientY + 16, window.innerHeight - 110), lines: text.split('\n') } : null)
  }
  const planned = view ? view.deals.reduce((s, d) => s + d.pl, 0) : 0

  return (
    <div className="fomc" onMouseMove={hover} onMouseLeave={() => setTip(null)}>
      <div className="app">
        <ReportHeader title="FX Position Dashboard" subtitle="Deal ID volume, maturity and planned P&L as of a key date. Click any bar, slice, row or cell for its Deal IDs.">
          <label className="pos-key-date">
            Key date
            <input className="control" type="date" value={keyDate} onChange={(e) => setKeyDate(e.target.value)} aria-label="Key date" />
          </label>
          <button className="btn btn-primary" type="button" onClick={read.reload} disabled={read.loading}>{read.loading ? 'Refreshing…' : 'Refresh'}</button>
        </ReportHeader>

        {read.loading && !raw ? <div className="card"><Skeleton rows={8} /></div> : null}
        {!raw && !read.loading ? (
          <div className="card"><Notice tone="error" title="The Deal IDs could not be read." action={<button className="btn btn-secondary btn-sm" type="button" onClick={read.reload}>Retry</button>}>{read.error?.message}</Notice></div>
        ) : null}

        {raw && view ? (
          <>
            <div className="kpi-row">
              <div className="kpi-card rpt-kpi" title={`Deal IDs not cancelled and ending on or after ${dmy(keyDate)}.`}>
                <div className="kpi-value"><Counter value={view.deals.length} /></div>
                <div className="kpi-label">Deal IDs</div>
                <div className="kpi-description">Live from {dmy(keyDate)}</div>
              </div>
              <div className="kpi-card rpt-kpi">
                <div className="kpi-value"><Counter value={view.volume} format={(v) => 'USD ' + compact(v)} /></div>
                <div className="kpi-label">Total USD Volume</div>
                <div className="kpi-description">USD amount of all Deal IDs</div>
              </div>
              <div className="kpi-card rpt-kpi">
                <div className="kpi-value"><Counter value={view.banks.filter((b) => b.label !== 'Unassigned').length} /></div>
                <div className="kpi-label">Counterparty Banks</div>
                <div className="kpi-description">Banks with Deal IDs</div>
              </div>
              <div className="kpi-card rpt-kpi">
                <div className={`kpi-value ${planned > 0 ? 'pos' : planned < 0 ? 'neg' : ''}`}><Counter value={planned} format={(v) => 'USD ' + compact(v)} /></div>
                <div className="kpi-label">Planned P&amp;L</div>
                <div className="kpi-description">Sum of planned P&amp;L, USD</div>
              </div>
            </div>
            {raw.problems.length ? <div className="success-banner show" style={{ background: 'var(--warning-tint)', borderColor: 'var(--warning)', color: 'var(--text)' }}><b>Data source notices.</b>{raw.problems.map((p) => <span key={p}>· {p}</span>)}</div> : null}
            <Panels view={view} onDrill={drill} />
          </>
        ) : null}
      </div>

      {tip ? (
        <div className="rpt-tip" role="tooltip" style={{ left: tip.x, top: tip.y }}>
          <b>{tip.lines[0]}</b>
          {tip.lines.slice(1).map((l) => <span key={l}>{l}</span>)}
        </div>
      ) : null}
      <DrillModal modal={modal} detail={detail} />
    </div>
  )
}

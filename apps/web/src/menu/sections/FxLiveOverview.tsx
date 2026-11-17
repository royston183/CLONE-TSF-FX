import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAsync } from '@slc/api-client/react'
import {
  SERIES_LABEL,
  buildFxOverview,
  compact,
  isoOf,
  lastDays,
  loadFxOverviewRaw,
  usd,
  type FxOverviewRaw,
  type SeriesKey,
  type TableRow,
} from '../live/fxOverview.ts'
import { rankRecords, RANKING_COLUMNS, type RankingKind } from '../live/rankings.ts'
import { detailFor } from '../live/fxDrilldown.ts'
import { DetailCard, DrillContext } from '../charts/DetailCard.tsx'
import { donutArc, niceTicks, scaleLinear } from '../charts/geometry.ts'
import type { Kpi, Slice } from '../mock/overview.ts'
import './fx-dash.css'

/* The FX dashboard, laid out like the ZFS_CASHPOS3 report: icon KPI cards, then white cards with a title, a subtitle and a
 * collapse button holding a share table, an area chart, rings with a ruled legend and track bars. */

/** Kept for the other screens that show a KPI's change. */
export function KpiDelta({ kpi }: { kpi: Kpi }) {
  if (kpi.delta === null) return <div className="mp-kpi-delta">{kpi.deltaNote}</div>
  const up = kpi.delta >= 0
  return (
    <div className={up ? 'mp-kpi-delta up' : 'mp-kpi-delta down'} aria-label={`${up ? 'Up' : 'Down'} ${Math.abs(kpi.delta).toFixed(1)}% ${kpi.deltaNote}`}>
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>
      {Math.abs(kpi.delta).toFixed(1)}% {kpi.deltaNote}
    </div>
  )
}

const SERIES = ['var(--fxd-s1)', 'var(--fxd-s2)', 'var(--fxd-s3)', 'var(--fxd-s4)', 'var(--fxd-s5)', 'var(--fxd-s6)', 'var(--fxd-s7)', 'var(--fxd-s8)']
const colourAt = (i: number) => SERIES[i % SERIES.length]
const PERIODS = [7, 30, 90] as const
const TONES = ['blue', 'green', 'amber', 'violet', 'blue'] as const
const ICONS = [
  <path key="a" d="M3 3v18h18M18 17V9M13 17V5M8 17v-3" />,
  <g key="b"><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></g>,
  <g key="c"><path d="m12 2 10 5-10 5L2 7z" /><path d="m2 12 10 5 10-5" /></g>,
  <g key="d"><path d="M21.21 15.89A10 10 0 1 1 8 2.83" /><path d="M22 12A10 10 0 0 0 12 2v10z" /></g>,
  <g key="e"><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2" /></g>,
]
const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0)

function Card({ title, sub, right, children, className = '' }: { title: string; sub?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(true)
  return (
    <DetailCard title={title}>
      <section className={`fxd-card ${className}${open ? '' : ' collapsed'}`}>
        <header className="fxd-card-h">
          <div>
            <div className="fxd-card-t">{title}</div>
            {sub ? <div className="fxd-card-s">{sub}</div> : null}
          </div>
          <div className="fxd-card-r">
            {right}
            <button type="button" className="fxd-ico" aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${title}`} onClick={() => setOpen(!open)}>
              {open ? '▲' : '▼'}
            </button>
          </div>
        </header>
        {open ? <div className="fxd-card-b">{children}</div> : null}
      </section>
    </DetailCard>
  )
}

const Empty = ({ text = 'Nothing to show yet.' }: { text?: string }) => <p className="fxd-empty">{text}</p>

function KpiCard({ kpi, index }: { kpi: Kpi; index: number }) {
  const up = (kpi.delta ?? 0) >= 0
  return (
    <DetailCard title={kpi.label} kpi>
      <div className={`fxd-kpi${index === 0 ? ' wide' : ''}`} title={`${kpi.label}: ${kpi.value}. ${kpi.deltaNote}`}>
        <div className="fxd-kpi-l">{kpi.label}</div>
        <div className="fxd-kpi-v">{kpi.value}</div>
        <div className="fxd-kpi-s">
          {kpi.delta === null ? null : <b className={up ? 'up' : 'down'}>{up ? '▲' : '▼'} {Math.abs(kpi.delta).toFixed(1)}% </b>}
          {kpi.deltaNote}
        </div>
        <span className={`fxd-kpi-ic t-${TONES[index % TONES.length]}`} aria-hidden="true">
          <svg viewBox="0 0 24 24">{ICONS[index % ICONS.length]}</svg>
        </span>
      </div>
    </DetailCard>
  )
}

/** A ring with the total in the middle and a ruled legend beside it. */
function Ring({ data, caption, title }: { data: Slice[]; caption: string; title: string }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  let cursor = 0
  const parts = data.map((d, i) => {
    const start = cursor
    cursor += total ? d.value / total : 0
    return { ...d, colour: colourAt(i), path: donutArc(start, Math.min(cursor, start + 0.9999), 62, 24), share: pct(d.value, total) }
  })
  return (
    <div className="fxd-ring">
      <svg viewBox="-70 -70 140 140" role="img" aria-label={title}>
        <title>{title}</title>
        {parts.map((p) => (
          <path key={p.label} className="seg" data-drill={p.label} d={p.path} fill={p.colour}>
            <title>{`${p.label}: ${p.value.toLocaleString()} (${p.share.toFixed(1)}%)`}</title>
          </path>
        ))}
        <text className="fxd-ring-cap" x="0" y="-8" textAnchor="middle">{caption}</text>
        <text className="fxd-ring-tot" x="0" y="10" textAnchor="middle">{total.toLocaleString()}</text>
      </svg>
      <ul className="fxd-legend">
        {parts.map((p) => (
          <li key={p.label} data-drill={p.label} title={`${p.label}: ${p.value.toLocaleString()}`}>
            <i style={{ background: p.colour }} />
            <b>{p.label}</b>
            <span>{p.share.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Label, a soft track with a fill, and the value at the right edge. */
function Bars({ data, format = (v: number) => v.toLocaleString(), title }: { data: Slice[]; format?: (v: number) => string; title: string }) {
  const max = Math.max(...data.map((d) => d.value), 1)
  return (
    <div className="fxd-bars" role="img" aria-label={title}>
      {data.map((d, i) => (
        <div key={d.label} className="fxd-bar" data-drill={d.label} title={`${d.label}: ${format(d.value)}`}>
          <span className="fxd-bar-l">{d.label}</span>
          <span className="fxd-bar-t"><span style={{ width: `${Math.max(2, pct(d.value, max))}%`, background: colourAt(i) }} /></span>
          <span className="fxd-bar-v">{format(d.value)}</span>
        </div>
      ))}
    </div>
  )
}

/** A filled line over a grid, the value axis on the left. */
function Area({ data, unit, title }: { data: { month: string; value: number }[]; unit: string; title: string }) {
  const W = 640, H = 210, L = 38, B = 24
  const max = Math.max(...data.map((d) => d.value), 0)
  const ticks = niceTicks(max, 4)
  const top = ticks[ticks.length - 1] || 1
  const x = (i: number) => L + (i / Math.max(data.length - 1, 1)) * (W - L - 6)
  const y = (v: number) => scaleLinear({ min: 0, max: top }, { min: H - B, max: 6 }, v)
  const line = data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ')
  const every = Math.max(1, Math.ceil(data.length / 6))
  return (
    <svg className="fxd-area" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
      <title>{title}</title>
      <defs>
        <linearGradient id="fxd-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--fxd-s1)" stopOpacity=".28" />
          <stop offset="1" stopColor="var(--fxd-s1)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - 6} y1={y(t)} y2={y(t)} className="grid" />
          <text x={L - 6} y={y(t) + 3} textAnchor="end" className="ax">{compact(t)}</text>
        </g>
      ))}
      {data.length > 1 ? <polygon points={`${x(0)},${H - B} ${line} ${x(data.length - 1)},${H - B}`} fill="url(#fxd-fill)" /> : null}
      <polyline points={line} className="ln" />
      {data.map((d, i) => (
        <g key={d.month}>
          <circle cx={x(i)} cy={y(d.value)} r="9" fill="transparent"><title>{`${d.month}: ${d.value.toLocaleString()}${unit}`}</title></circle>
          {i % every === 0 ? <text x={x(i)} y={H - 6} textAnchor="middle" className="ax">{d.month}</text> : null}
        </g>
      ))}
    </svg>
  )
}

/** Stage by stage, each bar as long as the share of the first stage that reached it. */
function Stages({ stages }: { stages: Slice[] }) {
  const first = stages[0]?.value || 1
  return (
    <div className="fxd-bars">
      {stages.map((s, i) => (
        <div key={s.label} className="fxd-bar" data-drill={s.label} title={`${s.label}: ${s.value.toLocaleString()}`}>
          <span className="fxd-bar-l">{s.label}</span>
          <span className="fxd-bar-t"><span style={{ width: `${Math.max(2, pct(s.value, first))}%`, background: colourAt(i) }} /></span>
          <span className="fxd-bar-v">{s.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

function Progress({ gauges }: { gauges: { label: string; value: number; total: number; hint: string }[] }) {
  return (
    <div className="fxd-prog">
      {gauges.map((g, i) => (
        <div key={g.label} data-drill={g.label} title={g.hint}>
          <div className="fxd-prog-h"><b>{g.label}</b><span>{g.value.toLocaleString()} / {g.total.toLocaleString()} · {pct(g.value, g.total).toFixed(0)}%</span></div>
          <span className="fxd-bar-t"><span style={{ width: `${pct(g.value, g.total)}%`, background: colourAt(i) }} /></span>
          <small>{g.hint}</small>
        </div>
      ))}
    </div>
  )
}

function DataTable({ columns, rows, empty }: { columns: string[]; rows: TableRow[]; empty: string }) {
  if (!rows.length) return <Empty text={empty} />
  return (
    <div className="fxd-tw">
      <table className="fxd-tbl">
        <thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>{row.cells.map((cell, c) => <td key={c} className={c === 0 ? 'key' : undefined}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const KINDS: { id: RankingKind; label: string; title: string }[] = [
  { id: 'trade', label: 'Trade flows', title: 'Top trade flows by value (USD)' },
  { id: 'fx', label: 'FX deals', title: 'Top FX deals by USD notional' },
  { id: 'contracts', label: 'Contracts', title: 'Top master contracts by amount' },
]
const PRODUCT_NAMES: Record<string, string> = { '12A': 'Spot', '12B': 'Forward', '12D': 'NDF' }

/** The ranking as a share table (like "Balance by Bank"): rank, name, value and a share bar. */
function RankingCard({ raw, company }: { raw: FxOverviewRaw; company: string }) {
  const [kind, setKind] = useState<RankingKind>('trade')
  const [limit, setLimit] = useState(5)
  const [category, setCategory] = useState('')
  const [openOnly, setOpenOnly] = useState(false)
  const rows = kind === 'contracts' ? raw.mcs : kind === 'fx' ? raw.fxDeals : raw.bls
  const categoryKey = kind === 'contracts' ? 'ZCURR' : kind === 'fx' ? 'SGSART' : 'ZBU'
  const categories = [...new Set((rows ?? []).map((r) => r[categoryKey]).filter((s): s is string => !!s))].sort()
  if (kind === 'contracts' && !categories.includes('USD')) categories.unshift('USD')
  const cat = kind === 'contracts' ? category || 'USD' : category
  const selected = useMemo(() => rankRecords(raw, kind, { limit, category: cat, openOnly, company }, new Date()), [raw, kind, limit, cat, openOnly, company])
  const meta = KINDS.find((k) => k.id === kind)!
  const currency = kind === 'contracts' ? cat : 'USD'
  const total = selected.reduce((s, r) => s + r.value, 0)
  const pick = (id: RankingKind) => { setKind(id); setCategory(''); setOpenOnly(id === 'fx') }
  const controls = (
    <>
      <select aria-label="Kind" value={kind} onChange={(e) => pick(e.target.value as RankingKind)}>
        {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
      </select>
      <select aria-label={kind === 'contracts' ? 'Currency' : kind === 'fx' ? 'Product' : 'Business unit'} value={cat} onChange={(e) => setCategory(e.target.value)}>
        {kind !== 'contracts' ? <option value="">All</option> : null}
        {categories.map((c) => <option key={c} value={c}>{kind === 'fx' ? PRODUCT_NAMES[c] ?? c : c}</option>)}
      </select>
      <select aria-label="Top" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
        {[5, 10, 20, 50].map((n) => <option key={n} value={n}>Top {n}</option>)}
      </select>
      {kind !== 'trade' ? (
        <select aria-label="Scope" value={openOnly ? 'open' : 'all'} onChange={(e) => setOpenOnly(e.target.value === 'open')}>
          <option value="all">All</option>
          <option value="open">{kind === 'contracts' ? 'In use' : 'Not matured'}</option>
        </select>
      ) : null}
    </>
  )
  return (
    <DrillContext.Provider value={(heading, mark) => ({ title: heading + (mark ? ' - ' + mark : ''), rows: selected.filter((i) => !mark || i.label === mark).map((i) => i.row), unavailable: rows === null, columns: RANKING_COLUMNS[kind] })}>
      <Card title={meta.title} sub={kind === 'contracts' ? 'One currency at a time; amounts are not converted' : kind === 'fx' ? 'Only deals with a USD leg are ranked' : 'Ranked by bill of lading trade value'} right={controls} className="wide">
        {rows === null ? (
          <Empty text="Source unavailable. Refresh to retry." />
        ) : !selected.length ? (
          <Empty text="No amounts match these filters." />
        ) : (
          <div className="fxd-tw">
            <table className="fxd-tbl">
              <thead><tr><th>#</th><th>Reference</th><th className="num">Value</th><th>Share</th></tr></thead>
              <tbody>
                {selected.map((item, i) => (
                  <tr key={item.label + i} data-drill={item.label}>
                    <td className="rk">{i + 1}</td>
                    <td className="key">{item.label}</td>
                    <td className="num"><b>{currency} {compact(item.value)}</b></td>
                    <td className="share">
                      <span className="fxd-bar-t"><span style={{ width: `${pct(item.value, total)}%`, background: colourAt(0) }} /></span>
                      <em>{pct(item.value, total).toFixed(1)}%</em>
                    </td>
                  </tr>
                ))}
                <tr className="sum"><td /><td>Shown</td><td className="num">{currency} {compact(total)}</td><td /></tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </DrillContext.Provider>
  )
}

/** Live SAP FX transactions and FS Cloud tables (see live/fxOverview.ts). */
export function FxLiveOverview() {
  const overview = useAsync((signal) => loadFxOverviewRaw(signal), [])
  useEffect(() => {
    if (overview.loading) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') overview.reload()
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [overview.loading, overview.reload])
  const raw = overview.data
  const [company, setCompany] = useState('All')
  const [series, setSeries] = useState<SeriesKey>('deals')
  const [days, setDays] = useState<number>(30)
  const data = useMemo(() => (raw ? buildFxOverview(raw, company, new Date()) : null), [raw, company])

  if (overview.loading && !raw) return <p className="fxd-note">Reading FX data from SAP…</p>
  if (!raw || !data) {
    return (
      <p className="fxd-note">
        The FX overview could not be read{overview.error ? `: ${overview.error.message}` : '.'}{' '}
        <button type="button" className="fxd-btn" onClick={overview.reload}>Retry</button>
      </p>
    )
  }

  const activity = lastDays(new Date(), days).map((iso) => ({ month: `${iso.slice(8)}-${iso.slice(5, 7)}`, value: data.daily[series][iso] ?? 0 }))
  const activityTotal = activity.reduce((s, p) => s + p.value, 0)
  const stamp = `${isoOf(raw.loadedAt).split('-').reverse().join('-')} ${raw.loadedAt.toTimeString().slice(0, 5)}`

  return (
    <DrillContext.Provider value={(title, mark) => detailFor(raw, company, new Date(), title, mark, series, days)}>
      <div className="fxd">
        <div className="fxd-bar-top">
          <label className="fxd-ctl">
            Company
            <select value={company} onChange={(e) => setCompany(e.target.value)} aria-label="Company">
              <option value="All">All companies</option>
              {data.companies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <span className="fxd-chip">Updated {stamp}</span>
          <button type="button" className="fxd-icon-btn" onClick={overview.reload} disabled={overview.loading} aria-label="Refresh" title="Refresh">
            <svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" /></svg>
          </button>
        </div>

        {raw.problems.length ? (
          <div className="fxd-warn">
            <b>Data source notices.</b> Unavailable figures show —; fallback sources are listed below.
            {raw.problems.map((p) => <span key={p}>· {p}</span>)}
            <button type="button" className="fxd-btn" onClick={overview.reload}>Retry</button>
          </div>
        ) : null}

        <div className="fxd-kpis">
          {data.kpis.map((k, i) => <KpiCard key={k.label} kpi={k} index={i} />)}
        </div>

        <div className="fxd-row r-wide">
          <RankingCard raw={raw} company={company} />
          <Card
            title={`${SERIES_LABEL[series]} created`}
            sub={`${activityTotal.toLocaleString()} in the last ${days} days`}
            right={
              <>
                <select aria-label="Series" value={series} onChange={(e) => setSeries(e.target.value as SeriesKey)}>
                  {(Object.keys(SERIES_LABEL) as SeriesKey[]).map((k) => <option key={k} value={k}>{SERIES_LABEL[k]}</option>)}
                </select>
                <span className="fxd-pills">
                  {PERIODS.map((p) => <button key={p} type="button" className={p === days ? 'on' : ''} aria-pressed={p === days} onClick={() => setDays(p)}>{p}D</button>)}
                </span>
              </>
            }
          >
            <Area data={activity} unit=" created" title={`${SERIES_LABEL[series]} created per day, last ${days} days`} />
          </Card>
        </div>

        <div className="fxd-row r-even">
          <Card title="Deals by product" sub="FX deals split by product">
            {data.products.length ? <Ring data={data.products} caption="FX DEALS" title="FX deals by product" /> : <Empty />}
          </Card>
          <Card title="Master contracts by FX model" sub="Contracts using each model">
            {data.mcByModel.length ? <Bars data={data.mcByModel} title="Master contracts by FX model" /> : <Empty />}
          </Card>
        </div>

        <div className="fxd-row r-three">
          <Card title="Contracts by status">
            {data.mcStatus.length ? <Ring data={data.mcStatus} caption="CONTRACTS" title="Master contracts by status" /> : <Empty />}
          </Card>
          <Card title="Deal ID status">
            {data.dealIdStatus.length ? <Ring data={data.dealIdStatus} caption="DEAL IDS" title="Deal IDs by status" /> : <Empty />}
          </Card>
          <Card title="Bills of lading by status">
            {data.blStatus.length ? <Ring data={data.blStatus} caption="BILLS" title="Bills of lading by status" /> : <Empty />}
          </Card>
        </div>

        <div className="fxd-row r-three">
          <Card title="Deal IDs by FX model" sub="Deal IDs on each model">
            {data.dealIdByModel.length ? <Bars data={data.dealIdByModel} title="Deal IDs by FX model" /> : <Empty />}
          </Card>
          <Card title="Deal ID lifecycle" sub="Reached each stage or later">
            {data.dealFunnel.length ? <Stages stages={data.dealFunnel} /> : <Empty />}
          </Card>
          <Card title="Progress at a glance" sub="Contracts in use, deals settled, bills invoiced">
            {data.gauges.some((g) => g.total > 0) ? <Progress gauges={data.gauges} /> : <Empty />}
          </Card>
        </div>

        <div className="fxd-row r-one">
          <Card title="Trade value by business unit (USD)" sub="Bill of lading value">
            {data.blByUnit.length ? <Bars data={data.blByUnit} format={usd} title="Bill of lading value by business unit" /> : <Empty />}
          </Card>
        </div>

        <div className="fxd-row r-even">
          <Card title="Upcoming maturities" sub="Open FX deals with a value date">
            <DataTable columns={['Value date', 'Company', 'Product', 'Pair', 'Amount', 'Rate']} rows={data.upcoming} empty="No open FX deals with a value date." />
          </Card>
          <Card title="Latest master contracts" sub="Most recently created">
            <DataTable columns={['MC no.', 'Commodity', 'Amount', 'Shipment end', 'Status']} rows={data.recentContracts} empty="No master contracts." />
          </Card>
        </div>
      </div>
    </DrillContext.Provider>
  )
}

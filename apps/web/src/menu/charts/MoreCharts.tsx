import { niceTicks, scaleLinear } from './geometry.ts'
import { SERIES_COLOURS } from './Charts.tsx'
import type { Slice } from '../mock/overview.ts'

/**
 * The richer Overview charts, all inline SVG / CSS like Charts.tsx. Presentational only: every figure comes in as a
 * prop, already summed, and `format` turns a value into the text shown.
 */

const colour = (i: number) => SERIES_COLOURS[i % SERIES_COLOURS.length] ?? '#1565c0'
type Format = (value: number) => string

// ------------------------------------------------------------------ treemap

export type TreeGroup = { label: string; value: number; children: Slice[] }

/**
 * Two-level treemap, slice-and-dice: one column per group (width by its total), its children stacked in the column
 * (height by share). Boxes are percentages of the frame, so it scales with the tile.
 */
export function Treemap({ groups, format, title }: { groups: TreeGroup[]; format: Format; title: string }) {
  const total = groups.reduce((s, g) => s + g.value, 0)
  if (total <= 0) return null
  return (
    <div className="mp-tree" role="group" aria-label={title}>
      {groups.map((group, gi) => (
        <div className="mp-tree-col" key={group.label} style={{ flexBasis: `${(group.value / total) * 100}%`, minWidth: groups.length > 1 ? "22%" : undefined }}>
          <div className="mp-tree-head" title={`${group.label}: ${format(group.value)}`}>
            {group.label} · {format(group.value)}
          </div>
          <div className="mp-tree-cells">
            {group.children.map((child, ci) => (
              <div
                className="mp-tree-cell"
                data-drill={group.label + "|" + child.label}
                key={child.label}
                style={{ flexBasis: `${(child.value / Math.max(group.value, 1)) * 100}%`, background: colour(gi * 2 + ci) }}
                title={`${group.label} · ${child.label}: ${format(child.value)} (${Math.round((child.value / total) * 100)}% of total)`}
              >
                <span>{child.label}</span>
                <b>{format(child.value)}</b>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ------------------------------------------------------------------ stacked columns

export type StackColumn = { label: string; parts: Slice[] }

export function StackedColumns({ columns, format, title }: { columns: StackColumn[]; format: Format; title: string }) {
  const width = 360
  const height = 170
  const totals = columns.map((c) => c.parts.reduce((s, p) => s + p.value, 0))
  const ticks = niceTicks(Math.max(...totals, 0), 4)
  const top = ticks[ticks.length - 1] ?? 1
  const legend = columns[0]?.parts.map((p) => p.label) ?? []
  const slot = width / Math.max(columns.length, 1)
  const barW = Math.min(46, slot * 0.55)
  const y = (v: number) => scaleLinear({ min: 0, max: top }, { min: height, max: 0 }, v)
  return (
    <div className="mp-stack">
      <svg viewBox={`-6 -14 ${width + 12} ${height + 44}`} role="img" aria-label={title}>
        <title>{title}</title>
        {ticks.map((t) => (
          <line key={t} x1="0" x2={width} y1={y(t)} y2={y(t)} stroke="var(--blue-pale2)" strokeWidth="1" />
        ))}
        {columns.map((col, i) => {
          const x = slot * i + (slot - barW) / 2
          let acc = 0
          return (
            <g key={col.label}>
              {col.parts.map((part, pi) => {
                const y0 = y(acc + part.value)
                const h = y(acc) - y0
                acc += part.value
                return h > 0 ? (
                  <rect key={part.label} data-drill={col.label + "|" + part.label} x={x} y={y0} width={barW} height={h} fill={colour(pi)} rx="2">
                    <title>{`${col.label} · ${part.label}: ${format(part.value)}`}</title>
                  </rect>
                ) : null
              })}
              <text className="mp-axis" x={x + barW / 2} y={y(totals[i] ?? 0) - 5} textAnchor="middle">
                {(totals[i] ?? 0) > 0 ? format(totals[i] ?? 0) : ''}
              </text>
              <text className="mp-axis" x={x + barW / 2} y={height + 16} textAnchor="middle">
                {col.label}
              </text>
            </g>
          )
        })}
      </svg>
      <ul className="mp-legend mp-legend-row">
        {legend.map((l, i) => (
          <li key={l}>
            <span className="mp-legend-dot" style={{ background: colour(i) }} />
            <span className="mp-legend-label">{l}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ------------------------------------------------------------------ Gantt

export type ShipWindow = { label: string; sub: string; start: string; end: string }

const dmy = (iso: string) => iso.split('-').reverse().join('-')
const dayNo = (iso: string) => new Date(`${iso}T00:00:00`).getTime() / 86_400_000

/** Each bar spans a contract's shipment start to end on one shared date axis; the line marks today. */
export function Gantt({ rows, todayIso, title }: { rows: ShipWindow[]; todayIso: string; title: string }) {
  if (!rows.length) return null
  const min = Math.min(...rows.map((r) => dayNo(r.start)), dayNo(todayIso))
  const max = Math.max(...rows.map((r) => dayNo(r.end)), dayNo(todayIso))
  const span = Math.max(max - min, 1)
  const pct = (d: number) => ((d - min) / span) * 100
  return (
    <div className="mp-gantt" role="group" aria-label={title}>
      {rows.map((r, i) => (
        <div className="mp-gantt-row" key={r.label} data-drill={r.label} title={`${r.label} (${r.sub}): ${dmy(r.start)} → ${dmy(r.end)}`}>
          <div className="mp-gantt-label">{r.label}</div>
          <div className="mp-gantt-track">
            <div
              className="mp-gantt-bar"
              style={{
                left: `${pct(dayNo(r.start))}%`,
                width: `${Math.max(pct(dayNo(r.end)) - pct(dayNo(r.start)), 1.5)}%`,
                background: colour(i),
              }}
            />
            <div className="mp-gantt-today" style={{ left: `${pct(dayNo(todayIso))}%` }} />
          </div>
        </div>
      ))}
      <div className="mp-gantt-axis">
        <span>{dmy(new Date(min * 86_400_000).toISOString().slice(0, 10))}</span>
        <span>today {dmy(todayIso)}</span>
        <span>{dmy(new Date(max * 86_400_000).toISOString().slice(0, 10))}</span>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ funnel

/** Bars narrow stage by stage; the figure is the Deal IDs that reached the stage or a later one. */
export function Funnel({ stages, title }: { stages: Slice[]; title: string }) {
  const first = stages[0]?.value ?? 0
  if (first <= 0) return null
  return (
    <div className="mp-funnel" role="group" aria-label={title}>
      {stages.map((stage, i) => {
        const share = (stage.value / first) * 100
        return (
          <div className="mp-funnel-row" key={stage.label} data-drill={stage.label} title={`${stage.label}: ${stage.value.toLocaleString()} (${Math.round(share)}% of the first stage)`}>
            <div className="mp-funnel-bar" style={{ width: `${Math.max(share, 18)}%`, background: colour(i) }}>
              <span>{stage.label}</span>
              <b>{stage.value.toLocaleString()}</b>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ------------------------------------------------------------------ radial progress

export type Gauge = { label: string; value: number; total: number; hint: string }

export function RadialGauges({ gauges, title }: { gauges: Gauge[]; title: string }) {
  const r = 38
  const circ = 2 * Math.PI * r
  return (
    <div className="mp-radials" role="group" aria-label={title}>
      {gauges.map((g, i) => {
        const share = g.total > 0 ? g.value / g.total : 0
        return (
          <div className="mp-radial" key={g.label} data-drill={g.label} title={`${g.label}: ${g.value} of ${g.total} (${g.hint})`}>
            <svg viewBox="-50 -50 100 100" aria-hidden="true">
              <circle r={r} fill="none" stroke="var(--bg2)" strokeWidth="9" />
              <circle
                r={r}
                fill="none"
                stroke={colour(i)}
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={`${circ * share} ${circ}`}
                transform="rotate(-90)"
              />
              <text className="mp-radial-pct" textAnchor="middle" y="6">
                {Math.round(share * 100)}%
              </text>
            </svg>
            <div className="mp-radial-label">{g.label}</div>
            <div className="mp-radial-sub">
              {g.value.toLocaleString()} of {g.total.toLocaleString()}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ------------------------------------------------------------------ area

export function AreaChart({
  data,
  title,
  format,
  plotHeight = 120,
}: {
  data: { month: string; value: number }[]
  title: string
  format: Format
  plotHeight?: number
}) {
  const width = 620
  const height = plotHeight
  const max = Math.max(...data.map((d) => d.value), 0)
  const ticks = niceTicks(max, 4)
  const top = ticks[ticks.length - 1] ?? max
  const labelEvery = Math.max(1, Math.ceil(data.length / 10))
  const pts = data.map((d, i) => ({
    x: (i / Math.max(data.length - 1, 1)) * width,
    y: scaleLinear({ min: 0, max: top || 1 }, { min: height, max: 0 }, d.value),
  }))
  const line = pts.map((p) => `${p.x},${p.y}`).join(' ')
  return (
    <div className="mp-line-wrap">
      <svg className="mp-line" viewBox={`-12 -10 ${width + 86} ${height + 40}`} role="img" aria-label={title}>
        <title>{title}</title>
        <defs>
          <linearGradient id="mp-area-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--blue)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--blue)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {ticks.map((t) => {
          const y = scaleLinear({ min: 0, max: top || 1 }, { min: height, max: 0 }, t)
          return (
            <g key={t}>
              <line x1="0" x2={width} y1={y} y2={y} stroke="var(--blue-pale2)" strokeWidth="1" />
              <text className="mp-axis" x={width + 8} y={y + 4}>
                {format(t)}
              </text>
            </g>
          )
        })}
        <polygon points={`0,${height} ${line} ${width},${height}`} fill="url(#mp-area-fill)" />
        <polyline points={line} fill="none" stroke="var(--blue-dark)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {data.map((d, i) => (
          <g key={`${d.month}-${i}`} data-drill={d.month}>
            <circle cx={pts[i]?.x} cy={pts[i]?.y} r="6" fill="transparent">
              <title>{`${d.month}: ${format(d.value)}`}</title>
            </circle>
            {i % labelEvery === 0 || i === data.length - 1 ? (
              <text className="mp-axis" x={pts[i]?.x} y={height + 20} textAnchor="middle">
                {d.month}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
    </div>
  )
}


/** Hairline columns retain exact CSS pixel width as the tile grows. */
export function ExposureBars({ groups, format }: { groups: TreeGroup[]; format: Format }) {
  const items = groups.flatMap(group => group.children.map(child => ({ ...child, company: group.label })))
  const max = Math.max(...items.map(item => item.value), 1)
  return <div className="mp-exposure-bars" role="group" aria-label="USD exposure by company and currency pair">
    <div className="mp-exposure-scale"><span>{format(max)}</span><span>{format(max / 2)}</span><span>0</span></div>
    <div className="mp-exposure-columns">{items.map((item, i) => <div className="mp-exposure-column" key={item.company + item.label} data-drill={item.company + '|' + item.label} title={item.company + ' / ' + item.label + ': ' + format(item.value)}>
      <div className="mp-exposure-plot"><span className="mp-exposure-amount">{format(item.value)}</span><div className="mp-exposure-stem" style={{ height: Math.max(item.value / max * 100, 0.72) + '%', background: colour(i) }} /></div>
      <strong>{item.company}</strong><span>{item.label}</span>
    </div>)}</div>
  </div>
}

/** Products and maturity buckets remain independently selectable. */
export function MaturityHeatmap({ columns, format }: { columns: StackColumn[]; format: Format }) {
  const products = columns[0]?.parts.map(part => part.label) ?? []
  const max = Math.max(...columns.flatMap(col => col.parts.map(part => part.value)), 1)
  return <div className="mp-maturity-map" role="group" aria-label="USD maturity heatmap by product">
    <div className="mp-maturity-grid"><span />{columns.map(col => <strong key={col.label}>{col.label}</strong>)}
      {products.map(product => <div className="mp-maturity-row" key={product}><strong>{product}</strong>{columns.map(col => {
        const value = col.parts.find(part => part.label === product)?.value ?? 0
        return <div className="mp-maturity-cell" key={col.label} data-drill={col.label + '|' + product} title={col.label + ' / ' + product + ': ' + format(value)} style={{ background: value ? 'rgba(21, 101, 192, ' + (0.12 + value / max * 0.88) + ')' : 'var(--bg2)', color: value / max > 0.45 ? '#fff' : 'var(--text)' }}>{format(value)}</div>
      })}</div>)}
    </div><div className="mp-heat-legend"><span>Lower exposure</span><i /><span>Higher exposure</span></div>
  </div>
}

/** Deadline lollipops compare remaining days instead of overlapping shipment ranges. */
export function ShipmentDeadlines({ rows, todayIso }: { rows: ShipWindow[]; todayIso: string }) {
  const items = rows.map(row => ({ ...row, days: Math.round(dayNo(row.end) - dayNo(todayIso)) }))
  const max = Math.max(...items.map(item => Math.abs(item.days)), 1)
  return <div className="mp-shipment-deadlines" role="group" aria-label="Days until shipment window ends">
    {items.map((item, i) => <div className="mp-deadline-row" key={item.label} data-drill={item.label} title={item.label + ': ' + dmy(item.start) + ' to ' + dmy(item.end) + ' / ' + item.days + ' days from today'}>
      <div className="mp-deadline-label"><strong>{item.label}</strong><span>{dmy(item.end)}</span></div>
      <div className="mp-deadline-track"><div style={{ width: Math.max(Math.abs(item.days) / max * 100, 1) + '%', background: colour(i) }}><i style={{ background: colour(i) }} /></div></div>
      <b>{item.days < 0 ? Math.abs(item.days) + 'd overdue' : item.days + ' days'}</b>
    </div>)}<div className="mp-deadline-axis"><span>Today</span><span>Days to shipment end</span><span>{max} days</span></div>
  </div>
}

import { compact } from '../../menu/live/fxOverview.ts'
import { niceTicks, scaleLinear } from '../../menu/charts/geometry.ts'

/**
 * The four charts of the FX Position Dashboard, drawn in SVG with the Master Contract palette. A mark that opens its Deal IDs
 * carries `data-drill`; one with hover text carries `data-tip` (a line per "\n"), shown by the screen's tooltip.
 */

export const PALETTE = ['#0854a0', '#6FA8FF', '#17BEBB', '#FF8A00', '#8E44AD', '#27AE60', '#E74C3C', '#8CA0B3']
export const colourAt = (i: number) => PALETTE[i % PALETTE.length]!
export const money = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type Series = {
  series: string[]
  title: string
}

function Key({ series }: { series: string[] }) {
  return (
    <ul className="pos-key">
      {series.map((s, si) => <li key={s}><i style={{ background: colourAt(si) }} />{s}</li>)}
    </ul>
  )
}

/** Vertical stacked columns, the total above each. A segment's mark is `mark(column, series)`. */
export function Columns({ columns, series, value, mark, title, label = (c) => c, slim = false }: Series & {
  columns: string[]
  value: (column: string, series: string) => number
  mark: (column: string, series: string) => string
  label?: (column: string) => string
  slim?: boolean
}) {
  const W = 640, H = 250, L = 50, B = 28, T = 20
  const totals = columns.map((c) => series.reduce((s, k) => s + Math.max(0, value(c, k)), 0))
  const ticks = niceTicks(Math.max(...totals, 0), 4)
  const top = ticks[ticks.length - 1] || 1
  const y = (v: number) => scaleLinear({ min: 0, max: top }, { min: H - B, max: T }, v)
  const band = (W - L - 6) / Math.max(columns.length, 1)
  return (
    <>
      <svg className={`pos-svg${slim ? ' slim' : ''}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - 6} y1={y(t)} y2={y(t)} className="grid" />
            <text x={L - 6} y={y(t) + 3} textAnchor="end" className="ax">{compact(t)}</text>
          </g>
        ))}
        {columns.map((c, ci) => {
          let base = 0
          const width = band * (slim ? 0.26 : 0.6)
          const x = L + ci * band + (band - width) / 2
          return (
            <g key={c}>
              {series.map((s, si) => {
                const v = Math.max(0, value(c, s))
                if (!v) return null
                const y0 = y(base), y1 = y(base + v)
                base += v
                return <rect key={s} className="seg" data-drill={mark(c, s)} data-tip={`${s} · ${c}\nUSD ${money(value(c, s))}`} x={x} y={y1} width={width} height={Math.max(1, y0 - y1)} rx="3" fill={colourAt(si)} />
              })}
              {totals[ci] ? <text x={x + width / 2} y={y(totals[ci]!) - 6} textAnchor="middle" className="dl">{compact(totals[ci]!)}</text> : null}
              <text x={x + width / 2} y={H - 9} textAnchor="middle" className="ax">{label(c)}</text>
            </g>
          )
        })}
      </svg>
      {series.length > 1 ? <Key series={series} /> : null}
    </>
  )
}

/** Horizontal stacked bars, one row per label, the total at the end of each bar. */
export function Rows({ rows, series, value, mark, title }: Series & {
  rows: string[]
  value: (row: string, series: string) => number
  mark: (row: string, series: string) => string
}) {
  const W = 640, L = 46, R = 70, T = 6, B = 24, rowH = 44
  const H = T + B + rows.length * rowH
  const totals = rows.map((r) => series.reduce((s, k) => s + Math.max(0, value(r, k)), 0))
  const ticks = niceTicks(Math.max(...totals, 0), 4)
  const top = ticks[ticks.length - 1] || 1
  const x = (v: number) => scaleLinear({ min: 0, max: top }, { min: L, max: W - R }, v)
  return (
    <>
      <svg className="pos-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={T} y2={H - B} className="grid" />
            <text x={x(t)} y={H - 8} textAnchor="middle" className="ax">{compact(t)}</text>
          </g>
        ))}
        {rows.map((r, ri) => {
          let base = 0
          const y = T + ri * rowH + rowH * 0.1
          return (
            <g key={r}>
              <text x={L - 8} y={y + rowH * 0.46} textAnchor="end" className="ax">{r}</text>
              {series.map((s, si) => {
                const v = Math.max(0, value(r, s))
                if (!v) return null
                const x0 = x(base), x1 = x(base + v)
                base += v
                return <rect key={s} className="seg" data-drill={mark(r, s)} data-tip={`${s} · ${r}\nUSD ${money(value(r, s))}`} x={x0} y={y} width={Math.max(1, x1 - x0)} height={rowH * 0.78} rx="3" fill={colourAt(si)} />
              })}
              {totals[ri] ? <text x={x(totals[ri]!) + 6} y={y + rowH * 0.5} className="dl">{compact(totals[ri]!)}</text> : null}
            </g>
          )
        })}
      </svg>
      <Key series={series} />
    </>
  )
}

/** Clustered columns: a cluster per group, a bar per series, negatives below the zero line, the group total under its name. */
export function Clusters({ groups, series, value, mark, title }: Series & {
  groups: string[]
  value: (group: string, series: string) => number
  mark: (group: string, series: string) => string
}) {
  const W = 640, H = 270, L = 54, B = 44, T = 20
  const all = groups.flatMap((g) => series.map((s) => value(g, s)))
  const hi = Math.max(...all, 0), lo = Math.min(...all, 0)
  const up = niceTicks(hi, 4)
  const down = lo < 0 ? niceTicks(-lo, 3).filter((t) => t > 0).map((t) => -t) : []
  const domain = [...down, ...up]
  const y = (v: number) => scaleLinear({ min: Math.min(...domain), max: Math.max(...domain, 1) }, { min: H - B, max: T }, v)
  const ticks = domain.filter((t) => t >= 0 || y(t) - y(0) >= 14)
  const band = (W - L - 8) / Math.max(groups.length, 1)
  const bar = Math.min(76, (band * 0.86) / Math.max(series.length, 1))
  return (
    <>
      <svg className="pos-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - 8} y1={y(t)} y2={y(t)} className={t === 0 ? 'grid zero' : 'grid'} />
            <text x={L - 6} y={y(t) + 3} textAnchor="end" className="ax">{compact(t)}</text>
          </g>
        ))}
        {groups.map((g, gi) => {
          const left = L + gi * band + (band - bar * series.length) / 2
          const total = series.reduce((s, k) => s + value(g, k), 0)
          return (
            <g key={g}>
              {series.map((s, si) => {
                const v = value(g, s)
                const x = left + si * bar
                const y0 = y(0), y1 = y(v)
                return (
                  <g key={s}>
                    <rect className="seg" data-drill={mark(g, s)} data-tip={`${s} · ${g}\nUSD ${money(v)}`} x={x + 3} y={Math.min(y0, y1)} width={bar - 6} height={Math.max(1, Math.abs(y0 - y1))} rx="3" fill={colourAt(si)} />
                    {v ? <text x={x + bar / 2} y={v >= 0 ? y1 - 5 : y1 + 12} textAnchor="middle" className="dl">{compact(v)}</text> : null}
                  </g>
                )
              })}
              <text x={L + gi * band + band / 2} y={H - 24} textAnchor="middle" className="ax">{g}</text>
              <text x={L + gi * band + band / 2} y={H - 9} textAnchor="middle" className="ax sub">Total {compact(total)}</text>
            </g>
          )
        })}
      </svg>
      <Key series={series} />
    </>
  )
}

/** A donut with the total in the middle, and a ruled legend beside it; both open the slice's Deal IDs. */
export function Donut({ data, caption, title }: { data: { label: string; value: number; volume: number }[]; caption: string; title: string }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  const R = 80, r = 52
  let angle = -Math.PI / 2
  const arcs = data.map((d, i) => {
    const sweep = total ? (d.value / total) * Math.PI * 2 : 0
    const a0 = angle, a1 = angle + Math.min(sweep, Math.PI * 2 - 0.0001)
    angle += sweep
    const p = (rad: number, a: number) => `${(rad * Math.cos(a)).toFixed(2)},${(rad * Math.sin(a)).toFixed(2)}`
    const large = a1 - a0 > Math.PI ? 1 : 0
    return { d, i, path: `M${p(R, a0)} A${R},${R} 0 ${large} 1 ${p(R, a1)} L${p(r, a1)} A${r},${r} 0 ${large} 0 ${p(r, a0)} Z` }
  })
  return (
    <div className="pos-donut">
      <svg viewBox="-90 -90 180 180" role="img" aria-label={title}>
        {arcs.map(({ d, i, path }) => (
          <path key={d.label} className="seg" data-drill={d.label} data-tip={`${d.label}\n${d.value} Deal IDs · ${total ? ((d.value / total) * 100).toFixed(1) : 0}%\nUSD ${money(d.volume)}`} d={path} fill={colourAt(i)} />
        ))}
        <text className="cap" x="0" y="-6" textAnchor="middle">{caption}</text>
        <text className="tot" x="0" y="16" textAnchor="middle">{total.toLocaleString()}</text>
      </svg>
      <ul className="pos-legend">
        {data.map((d, i) => (
          <li key={d.label} data-drill={d.label} data-tip={`${d.label}\n${d.value} Deal IDs\nUSD ${money(d.volume)}`}>
            <i style={{ background: colourAt(i) }} />
            <span>{d.label}</span>
            <b>{total ? ((d.value / total) * 100).toFixed(1) : '0.0'}%</b>
          </li>
        ))}
      </ul>
    </div>
  )
}

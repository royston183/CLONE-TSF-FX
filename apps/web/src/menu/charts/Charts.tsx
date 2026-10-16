import { donutArc, niceTicks, polylinePoints, scaleLinear } from './geometry.ts'
import type { Slice } from '../mock/overview.ts'

/**
 * Inline-SVG charts for the Overview section. Presentational only — every number comes in
 * as a prop and all arithmetic lives in geometry.ts. Each chart uses a viewBox with no
 * fixed size so it scales with its container.
 */

/** Ordered so adjacent series stay distinguishable; all six sit on the page's blue-teal axis. */
export const SERIES_COLOURS = ['#1565c0', '#1e88e5', '#42a5f5', '#00acc1', '#7cb3e8', '#9ccce0']

function colourAt(index: number): string {
  return SERIES_COLOURS[index % SERIES_COLOURS.length] ?? '#1565c0'
}

export function Sparkline({ values, rising }: { values: number[]; rising: boolean }) {
  const points = polylinePoints(values, 100, 28)
  if (!points) return null
  return (
    <svg className="mp-spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke={rising ? 'var(--blue)' : 'var(--text-muted)'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

export function BarChart({
  data,
  unit,
  title,
  format,
  large = false,
}: {
  data: Slice[]
  unit: string
  title: string
  /** Overrides "value unit" for the figure at the end of each bar (e.g. compact currency). */
  format?: (value: number) => string
  /** Thicker bars with more air between rows, for charts with only a few of them. */
  large?: boolean
}) {
  const max = Math.max(...data.map((d) => d.value), 0)
  // Not role="img": unlike the donut and line charts, this content is real text (six product
  // labels and values) that a screen reader should be able to read individually, not collapse
  // into a single image label. role="group" keeps it labelled without hiding it.
  return (
    <div className={large ? 'mp-bars mp-bars-lg' : 'mp-bars'} role="group" aria-label={title}>
      {data.map((slice, index) => (
        <div className="mp-bar-row" key={slice.label} title={`${slice.label}: ${format ? format(slice.value) : `${slice.value.toLocaleString()} ${unit}`}`}>
          <div className="mp-bar-label">{slice.label}</div>
          <div className="mp-bar-track">
            <div
              className="mp-bar-fill"
              style={{
                width: `${scaleLinear({ min: 0, max }, { min: 0, max: 100 }, slice.value)}%`,
                background: colourAt(index),
              }}
            />
          </div>
          <div className="mp-bar-value">
            {format ? format(slice.value) : `${slice.value.toLocaleString()} ${unit}`}
          </div>
        </div>
      ))}
    </div>
  )
}

export function DonutChart({ data, title, caption = 'DEALS' }: { data: Slice[]; title: string; caption?: string }) {
  const total = data.reduce((sum, slice) => sum + slice.value, 0)
  let cursor = 0
  const segments = data.map((slice, index) => {
    const start = cursor
    const fraction = total === 0 ? 0 : slice.value / total
    cursor += fraction
    return { ...slice, fraction, path: donutArc(start, start + fraction, 60, 22), colour: colourAt(index) }
  })

  return (
    <div className="mp-donut-wrap">
      <svg className="mp-donut" viewBox="-70 -70 140 140" role="img" aria-label={title}>
        <title>{title}</title>
        {segments.map((segment) => (
          <path key={segment.label} className="mp-donut-slice" d={segment.path} fill={segment.colour}>
            <title>{`${segment.label}: ${segment.value.toLocaleString()} (${Math.round(segment.fraction * 100)}%)`}</title>
          </path>
        ))}
        <text className="mp-donut-total" x="0" y="-2" textAnchor="middle">
          {total.toLocaleString()}
        </text>
        <text className="mp-donut-cap" x="0" y="14" textAnchor="middle">
          {caption}
        </text>
      </svg>
      <ul className="mp-legend">
        {segments.map((segment) => (
          <li key={segment.label} title={`${segment.label}: ${segment.value.toLocaleString()}`}>
            <span className="mp-legend-dot" style={{ background: segment.colour }} />
            <span className="mp-legend-label">{segment.label}</span>
            <span className="mp-legend-value">{segment.value.toLocaleString()} · {Math.round(segment.fraction * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function LineChart({
  data,
  title,
  unit = '',
  plotHeight = 180,
}: {
  data: { month: string; value: number }[]
  title: string
  unit?: string
  /** Height of the plotting area in viewBox units; the whole chart scales with the width. */
  plotHeight?: number
}) {
  // A long series (daily buckets) drops the dots and thins the labels so neither collides.
  const dots = data.length <= 31
  const labelEvery = Math.max(1, Math.ceil(data.length / 12))
  const width = 620
  const height = plotHeight
  const values = data.map((d) => d.value)
  const max = Math.max(...values, 0)
  const ticks = niceTicks(max, 5)
  const top = ticks[ticks.length - 1] ?? max
  // Scaled against 0..top rather than the series min, so the gridlines and the line agree.
  const scaled = values.map((value) => scaleLinear({ min: 0, max: top }, { min: height, max: 0 }, value))
  const points = scaled
    .map((y, index) => `${(index / Math.max(data.length - 1, 1)) * width},${y}`)
    .join(' ')

  return (
    <div className="mp-line-wrap">
      <svg className="mp-line" viewBox={`-12 -10 ${width + 66} ${height + 40}`} role="img" aria-label={title}>
        <title>{title}</title>
        {ticks.map((tick) => {
          const y = scaleLinear({ min: 0, max: top }, { min: height, max: 0 }, tick)
          return (
            <g key={tick}>
              <line x1="0" y1={y} x2={width} y2={y} stroke="var(--blue-pale2)" strokeWidth="1" />
              <text className="mp-axis" x={width + 8} y={y + 4}>
                {tick.toLocaleString()}
              </text>
            </g>
          )
        })}
        <polyline
          points={points}
          fill="none"
          stroke="var(--blue-dark)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {data.map((point, index) => {
          const x = (index / Math.max(data.length - 1, 1)) * width
          return (
            <g key={`${point.month}-${index}`} className="mp-line-point">
              <circle cx={x} cy={scaled[index] ?? height} r={dots ? 3.5 : 6} fill={dots ? 'var(--white)' : 'transparent'} stroke={dots ? 'var(--blue-dark)' : 'none'} strokeWidth="2">
                <title>{`${point.month}: ${point.value.toLocaleString()}${unit}`}</title>
              </circle>
              {index % labelEvery === 0 || index === data.length - 1 ? (
                <text className="mp-axis" x={x} y={height + 20} textAnchor="middle">
                  {point.month}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

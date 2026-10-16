import { useMemo, useState, type ReactNode } from 'react'
import { useAsync } from '@slc/api-client/react'
import { BarChart, DonutChart, LineChart, Sparkline } from '../charts/Charts.tsx'
import {
  SERIES_LABEL,
  buildFxOverview,
  isoOf,
  lastDays,
  loadFxOverviewRaw,
  usd,
  type SeriesKey,
  type TableRow,
} from '../live/fxOverview.ts'
import type { Kpi } from '../mock/overview.ts'

export function KpiDelta({ kpi }: { kpi: Kpi }) {
  if (kpi.delta === null) return <div className="mp-kpi-delta">{kpi.deltaNote}</div>
  const up = kpi.delta >= 0
  return (
    <div
      className={up ? 'mp-kpi-delta up' : 'mp-kpi-delta down'}
      aria-label={`${up ? 'Up' : 'Down'} ${Math.abs(kpi.delta).toFixed(1)}% ${kpi.deltaNote}`}
    >
      {/* An arrow as well as the colour, so the direction survives a greyscale print or a red-green colour
          deficiency; the aria-label says it in words, since Math.abs() strips the sign. */}
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>
      {Math.abs(kpi.delta).toFixed(1)}% {kpi.deltaNote}
    </div>
  )
}

const NO_DATA = 'Nothing to show yet.'
const PERIODS = [
  { id: 14, label: '14 days' },
  { id: 30, label: '30 days' },
  { id: 60, label: '60 days' },
] as const

function Chips<T extends string | number>({
  options,
  value,
  onPick,
  label,
  vertical = false,
}: {
  options: readonly { id: T; label: string }[]
  value: T
  onPick: (id: T) => void
  label: string
  vertical?: boolean
}) {
  return (
    <div className={vertical ? 'mp-scope-row mp-scope-col' : 'mp-scope-row'} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          type="button"
          key={String(o.id)}
          className={o.id === value ? 'mp-scope active' : 'mp-scope'}
          aria-pressed={o.id === value}
          onClick={() => onPick(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Panel({ title, children, head }: { title: string; children: ReactNode; head?: ReactNode }) {
  return (
    <div className="mp-panel">
      <div className="mp-panel-head">
        <div className="mp-panel-title">{title}</div>
        {head}
      </div>
      {children}
    </div>
  )
}

function Table({ columns, rows, empty }: { columns: string[]; rows: TableRow[]; empty: string }) {
  if (!rows.length) return <p className="mp-scope-note">{empty}</p>
  return (
    <table className="mp-activity">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, r) => (
          <tr key={r}>
            {row.cells.map((cell, c) => (
              <td key={c} className={c === 0 ? 'mp-activity-when' : undefined}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function KpiRow({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="mp-kpi-grid">
      {kpis.map((kpi) => (
        <div className="mp-kpi" key={kpi.label}>
          <div className="mp-kpi-label">{kpi.label}</div>
          <div className="mp-kpi-value">{kpi.value}</div>
          <KpiDelta kpi={kpi} />
          <Sparkline values={kpi.series} rising={(kpi.delta ?? 0) >= 0} />
        </div>
      ))}
    </div>
  )
}

/** The FX scope: every figure is read from the SLC middleware (see live/fxOverview.ts). */
export function FxLiveOverview() {
  const overview = useAsync((signal) => loadFxOverviewRaw(signal), [])
  const raw = overview.data
  const [company, setCompany] = useState('All')
  const [series, setSeries] = useState<SeriesKey>('deals')
  const [days, setDays] = useState<number>(30)
  const data = useMemo(() => (raw ? buildFxOverview(raw, company, new Date()) : null), [raw, company])

  if (overview.loading && !raw) return <p className="mp-scope-note">Reading FX data from SAP…</p>
  if (!raw || !data) {
    return (
      <p className="mp-scope-note">
        The FX overview could not be read{overview.error ? `: ${overview.error.message}` : '.'}{' '}
        <button type="button" className="mp-scope" onClick={overview.reload}>
          Retry
        </button>
      </p>
    )
  }

  const activity = lastDays(new Date(), days).map((iso) => ({
    month: `${iso.slice(8)}/${iso.slice(5, 7)}`,
    value: data.daily[series][iso] ?? 0,
  }))
  const activityTotal = activity.reduce((s, p) => s + p.value, 0)
  const companyOptions = [{ id: 'All', label: 'All companies' }, ...data.companies.map((c) => ({ id: c, label: c }))]
  const none = <p className="mp-scope-note">{NO_DATA}</p>
  const stamp = `${isoOf(raw.loadedAt).split('-').reverse().join('-')} ${raw.loadedAt.toTimeString().slice(0, 5)}`

  return (
    <>
      <div className="mp-live-bar">
        <Chips options={companyOptions} value={company} onPick={setCompany} label="Company" />
        <button type="button" className="mp-scope" onClick={overview.reload} disabled={overview.loading}>
          {overview.loading ? 'Refreshing…' : '↻ Refresh'}
        </button>
        <span className="mp-live-stamp">Updated {stamp} · the company filter applies to the FX deal figures</span>
      </div>
      {raw.problems.length ? (
        <p className="mp-scope-note">
          Could not read {raw.problems.length} source{raw.problems.length > 1 ? 's' : ''}; the figures that depend on them show — or are left out.
          {raw.problems.map((p) => (
            <span key={p} style={{ display: 'block' }}>
              · {p}
            </span>
          ))}
          <button type="button" className="mp-scope" onClick={overview.reload}>
            Retry
          </button>
        </p>
      ) : null}

      <div className="group-label">Key figures</div>
      <KpiRow kpis={data.kpis} />

      <div className="group-label">Exposure</div>
      <div className="mp-live-grid">
        <Panel title="Open exposure by company (USD)">
          {data.exposureByCompany.length ? (
            <BarChart large data={data.exposureByCompany} unit="USD" format={usd} title="Open USD notional by company" />
          ) : (
            none
          )}
        </Panel>
        <Panel title="Deals by product">
          {data.products.length ? <DonutChart data={data.products} caption="FX DEALS" title="FX deals by product" /> : none}
        </Panel>
        <Panel title="Maturity ladder (USD)">
          {data.maturity.some((m) => m.value > 0) ? (
            <BarChart large data={data.maturity} unit="USD" format={usd} title="Open USD notional by time to value date" />
          ) : (
            none
          )}
        </Panel>
      </div>

      <div className="group-label">Master contracts</div>
      <div className="mp-live-grid">
        <Panel title="Contracts by status">
          {data.mcStatus.length ? <DonutChart data={data.mcStatus} caption="CONTRACTS" title="Master contracts by status" /> : none}
        </Panel>
        <Panel title="Contracts by commodity">
          {data.mcByCommodity.length ? (
            <BarChart data={data.mcByCommodity} unit="contracts" title="Master contracts by commodity" />
          ) : (
            none
          )}
        </Panel>
        <Panel title="Contracts by FX model">
          {data.mcByModel.length ? <BarChart data={data.mcByModel} unit="contracts" title="Master contracts by FX model" /> : none}
        </Panel>
      </div>

      <div className="group-label">Deal IDs</div>
      <div className="mp-live-grid">
        <Panel title="Deal ID status">
          {data.dealIdStatus.length ? <DonutChart data={data.dealIdStatus} caption="DEAL IDS" title="Deal IDs by status" /> : none}
        </Panel>
        <Panel title="Deal IDs by FX model">
          {data.dealIdByModel.length ? <BarChart data={data.dealIdByModel} unit="deal IDs" title="Deal IDs by FX model" /> : none}
        </Panel>
        <Panel title="Planned spot hedges by type">
          {data.spotByType.length ? <BarChart data={data.spotByType} unit="rows" title="Planned spot hedge rows by deal type" /> : none}
        </Panel>
      </div>

      <div className="group-label">Trade flows</div>
      <div className="mp-live-grid">
        <Panel title="Trade value by business unit (USD)">
          {data.blByUnit.length ? (
            <BarChart data={data.blByUnit} unit="USD" format={usd} title="Bill of lading value by business unit" />
          ) : (
            none
          )}
        </Panel>
        <Panel title="Bills of lading by status">
          {data.blStatus.length ? <DonutChart data={data.blStatus} caption="BILLS" title="Bills of lading by status" /> : none}
        </Panel>
        <Panel title="Invoices by commodity">
          {data.invoicesByCommodity.length ? (
            <BarChart data={data.invoicesByCommodity} unit="invoices" title="Trade invoices by commodity" />
          ) : (
            none
          )}
        </Panel>
      </div>

      <div className="group-label">Activity</div>
      <div className="mp-panel">
        <div className="mp-panel-title">
          {SERIES_LABEL[series]} created · {activityTotal.toLocaleString()} in the last {days} days
        </div>
        <div className="mp-activity-layout">
          <LineChart data={activity} plotHeight={92} unit=" created" title={`${SERIES_LABEL[series]} created per day, last ${days} days`} />
          <div className="mp-activity-filters">
            <div className="mp-filter-label">Show</div>
            <Chips
              vertical
              options={(Object.keys(SERIES_LABEL) as SeriesKey[]).map((k) => ({ id: k, label: SERIES_LABEL[k] }))}
              value={series}
              onPick={setSeries}
              label="Series"
            />
            <div className="mp-filter-label">Period</div>
            <Chips vertical options={PERIODS} value={days} onPick={setDays} label="Period" />
          </div>
        </div>
      </div>

      <div className="group-label">Upcoming maturities</div>
      <div className="mp-panel">
        <Table
          columns={['Value date', 'Company', 'Product', 'Pair', 'Amount', 'Rate']}
          rows={data.upcoming}
          empty="No open FX deals with a value date."
        />
      </div>

      <div className="group-label">Latest master contracts</div>
      <div className="mp-panel">
        <Table
          columns={['MC no.', 'Commodity', 'Amount', 'Shipment end', 'Status']}
          rows={data.recentContracts}
          empty="No master contracts."
        />
      </div>
    </>
  )
}

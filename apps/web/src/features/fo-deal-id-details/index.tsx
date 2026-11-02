import { useMemo, useState } from 'react'
import { useAsync } from '@slc/api-client/react'
import { Dialog } from '@slc/ui'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { FX_LOGO } from '../../shared/fx/logo.ts'
import { loadReport, type ReportRow } from './api.ts'
import { COLUMNS } from './columns.ts'
import { cellValue, filterRows, todayIso, type Filters } from './logic.ts'
import './fo-deal-id-details.legacy.css'
import './fo-deal-id-details.dark.css'
import './report.css'

const blankFilters = (): Filters => ({ search: '', keyDate: todayIso(), region: '', origin: '', model: '', status: '', co: '' })
export default function FoDealIdDetails() {
  const report = useAsync(signal => loadReport(signal), [])
  const [filters, setFilters] = useState<Filters>(blankFilters)
  const [sort, setSort] = useState({ key: 'zdealId', descending: true })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)
  const [selected, setSelected] = useState('')
  const [detail, setDetail] = useState<{ row: ReportRow; mc: boolean } | null>(null)
  const rows = report.data?.rows ?? []
  const filtered = useMemo(() => filterRows(rows, filters, sort.key, sort.descending), [report.data, filters, sort])
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const current = Math.min(page, pages)
  const start = (current - 1) * pageSize
  const visible = filtered.slice(start, start + pageSize)
  const update = (key: keyof Filters, value: string) => { setFilters(f => ({ ...f, [key]: value })); setPage(1); setSelected('') }
  const reset = () => { setFilters(blankFilters()); setSort({ key: 'zdealId', descending: true }); setPage(1); setSelected(''); setDetail(null) }
  const options = (key: string) => [...new Set(rows.map(r => r[key]).filter((v): v is string => !!v))].sort()
  const open = (row: ReportRow, mc: boolean) => { setSelected(row.id); setDetail({ row, mc }) }
  const mcKeys = new Set(['mcRef', 'mcDesc', 'mcDate', 'mcAmt', 'origin', 'region', 'model', 'modelDesc', 'shipStart', 'shipEnd', 'mcCurrId', 'mcCurrDesc', 'util'])
  return <div className="fo-deal-id-details"><div className="app"><div className="shell">
    <header className="topbar"><div className="title-wrap"><BackButton className="back-btn" /><img className="brand-logo" src={FX_LOGO} alt="FS" /><div><h1 className="page-title">Deal ID Details</h1><div className="page-sub">FX Front-Office Report</div></div></div><div className="header-actions"><button className="btn" disabled={report.loading} onClick={() => { reset(); report.reload() }}>{report.loading ? 'Refreshing...' : 'Refresh'}</button><SignOutButton /></div></header>
    <section className="card workbench" aria-label="Deal ID report">
      <div className="section-head"><div><div className="section-title">Deal ID Details</div><div className="section-meta">Key Date: {filters.keyDate ? filters.keyDate.split('-').reverse().join('-') : 'Not selected'}</div></div><div className="section-meta">{filtered.length} deals</div></div>
      <div className="toolbar"><div className="toolbar-row">
        <label className="field search-field"><span className="label">Search</span><input className="control" placeholder="Search every visible column..." value={filters.search} onChange={e => update('search', e.target.value)} /></label>
        <label className="field date"><span className="label">Key Date</span><input className="control" type="date" required value={filters.keyDate} onChange={e => update('keyDate', e.target.value)} /></label>
        {([{ key: 'region', label: 'Region' }, { key: 'origin', label: 'Origin Entity' }, { key: 'model', label: 'Model' }, { key: 'status', label: 'Deal Status' }, { key: 'co', label: 'CO Area' }] as const).map(field => <label className={'field ' + field.key} key={field.key}><span className="label">{field.label}</span><select className="control" value={filters[field.key]} onChange={e => update(field.key, e.target.value)}><option value="">All</option>{options(field.key).map(value => <option key={value} value={value}>{field.key === 'status' ? value + ' - ' + rows.find(r => r.status === value)?.statusDesc : field.key === 'model' ? value + ' - ' + rows.find(r => r.model === value)?.modelDesc : value}</option>)}</select></label>)}
        <button className="btn" onClick={reset}>Reset</button>
      </div>{!filters.keyDate && <p className="date-error" role="alert">Select a Key Date to calculate days to expiry and run the report.</p>}</div>
      <div className="info-strip">Click a row to select it. Open the Deal ID or Master Contract reference to view details.</div>
      {report.data?.notices.map(note => <div className="info-strip" key={note}>{note}</div>)}
      {report.error && <div className="report-error" role="alert">The report could not be read: {report.error.message} <button className="btn" onClick={report.reload}>Retry</button></div>}
      {report.loading && <div className="info-strip" role="status">Reading Deal IDs and report tables...</div>}
      <div className="table-wrap" aria-busy={report.loading}><table><thead><tr><th className="sticky-select"><input className="row-check" type="checkbox" aria-label="Select first visible row" checked={!!visible[0] && selected === visible[0].id} onChange={e => setSelected(e.target.checked ? visible[0]?.id ?? '' : '')} /></th>{COLUMNS.map((col, i) => <th key={col.key} className={i === 0 ? 'sticky-id' : i === 1 ? 'sticky-mc' : ''} aria-sort={sort.key === col.key ? sort.descending ? 'descending' : 'ascending' : 'none'}><button type="button" className="sort-button" onClick={() => { setSort(s => ({ key: col.key, descending: s.key === col.key ? !s.descending : false })); setPage(1) }}>{col.label}{sort.key === col.key ? sort.descending ? ' \u2193' : ' \u2191' : ''}</button></th>)}</tr></thead>
        <tbody>{filters.keyDate && visible.map(row => <tr key={row.id} className={selected === row.id ? 'selected' : ''} onClick={() => setSelected(row.id)}><td className="sticky-select"><input className="row-check" type="checkbox" aria-label={'Select Deal ID ' + row.zdealId} checked={selected === row.id} onClick={e => e.stopPropagation()} onChange={e => setSelected(e.target.checked ? row.id : '')} /></td>{COLUMNS.map((col, i) => <td key={col.key} className={(i === 0 ? 'sticky-id' : i === 1 ? 'sticky-mc' : '') + (col.numeric ? ' num' : '')} title={cellValue(row, col.key, filters.keyDate)}>{i < 2 ? <button className={'link ' + (i === 0 ? 'deal' : 'mc')} onClick={e => { e.stopPropagation(); open(row, i === 1) }}>{cellValue(row, col.key, filters.keyDate)}</button> : cellValue(row, col.key, filters.keyDate)}</td>)}</tr>)}</tbody>
      </table>{!report.loading && !report.error && (!filtered.length || !filters.keyDate) && <div className="empty"><strong>No Data Found</strong>Try changing the filters or Key Date.</div>}</div>
      <footer className="footer"><span className="showing">Showing {filtered.length && filters.keyDate ? start + 1 : 0}-{filters.keyDate ? Math.min(start + pageSize, filtered.length) : 0} of {filters.keyDate ? filtered.length : 0}</span><div className="pager"><label>Rows <select className="rows-select" value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}>{[8, 15, 20, 25, 50].map(size => <option key={size}>{size}</option>)}</select></label><button className="page-btn" aria-label="Previous page" disabled={current <= 1} onClick={() => setPage(current - 1)}>Previous</button><span>Page {current} of {pages}</span><button className="page-btn" aria-label="Next page" disabled={current >= pages} onClick={() => setPage(current + 1)}>Next</button></div></footer>
    </section>
    <Dialog open={!!detail} onClose={() => setDetail(null)} title={detail ? (detail.mc ? 'Master Contract ' + detail.row.mcRef : 'Deal ID ' + detail.row.zdealId) : 'Details'}>
      <div className="detail-list">{detail && <>
        {!detail.mc && <><div className="kv"><span className="k">Deal Type / Subtype</span><span className="v">{detail.row.dealType} / {detail.row.subType}</span></div></>}
        {COLUMNS.filter(col => !detail?.mc || mcKeys.has(col.key)).map(col => <div className="kv" key={col.key}><span className="k">{col.label}</span><span className="v">{cellValue(detail.row, col.key, filters.keyDate)}</span></div>)}
        {detail.mc && <div className="kv"><span className="k">MC Original Amount / Currency</span><span className="v">{detail.row.mcOriginalAmount} {detail.row.mcCurrency}</span></div>}
      </>}</div>
    </Dialog>
  </div></div></div>
}

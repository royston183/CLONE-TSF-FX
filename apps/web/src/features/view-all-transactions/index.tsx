import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Dialog } from '@slc/ui'
import { ChevronLeft, ChevronRight, Columns3, Download, Eye, RefreshCw, Search } from 'lucide-react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { FX_LOGO } from '../../shared/fx/logo.ts'
import { messageOf } from '../../shared/fx/master-contract.ts'
import { isAbort } from '../../shared/fx/mw.ts'
import { COVERAGE_NOTICE, loadLookups, loadReport } from './api.ts'
import { BASIS_LABEL, COLUMNS, DEFAULT_COLUMNS, EMPTY_FILTERS, cellValue, csvOutput, displayDate, filterSortRows, initialSelection, selectionError } from './logic.ts'
import type { Basis, Filters, Lookups, Row, Selection, Sort } from './types.ts'
import '../view-tsf-deals/view-tsf-deals.css'
import './view-all-transactions.css'

const INITIAL_SORT: Sort = { field: 'blotter', direction: 'desc' }
const initialLookups: Lookups = { companies: [], traders: [], notice: '' }

export default function ViewAllTransactions() {
  const [draft, setDraft] = useState<Selection>(initialSelection)
  const [applied, setApplied] = useState<Selection | null>(null)
  const [lookups, setLookups] = useState<Lookups>(initialLookups)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [filters, setFilters] = useState<Filters>({ ...EMPTY_FILTERS })
  const [advanced, setAdvanced] = useState(false)
  const [sort, setSort] = useState<Sort>(INITIAL_SORT)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<Row | null>(null)
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [visibleFields, setVisibleFields] = useState<readonly (keyof Row)[]>(DEFAULT_COLUMNS)
  const [exporting, setExporting] = useState(false)
  const request = useRef<AbortController | null>(null)

  const run = useCallback(async (selection: Selection) => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoading(true); setError(''); setNotice(''); setRows([]); setApplied(null); setSelected(null); setDetail(null); setPage(1)
    try {
      const masters = await loadLookups(controller.signal)
      if (controller.signal.aborted) return
      setLookups(masters)
      const result = await loadReport(selection, masters, controller.signal)
      if (controller.signal.aborted) return
      setRows(result.rows); setNotice(result.notice); setApplied({ ...selection })
    } catch (error) {
      if (!controller.signal.aborted && !isAbort(error)) setError(messageOf(error))
    } finally {
      if (request.current === controller && !controller.signal.aborted) setLoading(false)
    }
  }, [])
  useEffect(() => { void run(initialSelection()); return () => request.current?.abort() }, [run])

  const columns = useMemo(() => COLUMNS.filter((c) => visibleFields.includes(c.field)), [visibleFields])
  const filtered = useMemo(() => filterSortRows(rows, filters, sort), [rows, filters, sort])
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const selectedRow = visible.find((r) => r.id === selected)
  const dirty = !!applied && Object.keys(draft).some((key) => draft[key as keyof Selection] !== applied[key as keyof Selection])
  const pages = Array.from({ length: Math.min(5, pageCount) }, (_, i) => Math.max(1, Math.min(currentPage - 2, pageCount - 4)) + i)
  const choices = (key: keyof Row) => [...new Set(rows.map((r) => String(r[key] ?? '')).filter(Boolean))].sort()
  const traderChoices = [...new Map([...lookups.traders, ...rows.filter((r) => r.traderCode).map((r) => ({ code: r.traderCode, name: r.trader }))].map((t) => [t.code, t])).values()]
  const filter = (key: keyof Filters, value: string) => { setFilters((f) => ({ ...f, [key]: value })); setPage(1); setSelected(null) }
  const change = <K extends keyof Selection>(key: K, value: Selection[K]) => { setDraft((s) => ({ ...s, [key]: value })); setError('') }

  function submit(event: FormEvent) {
    event.preventDefault()
    const message = selectionError(draft, lookups.companies.map((c) => c.code))
    if (message) { setError(message); return }
    setSort({ field: draft.basis, direction: 'desc' })
    void run({ ...draft })
  }
  function reset() {
    const selection = initialSelection()
    setDraft(selection); setFilters({ ...EMPTY_FILTERS }); setSort(INITIAL_SORT); setPageSize(15); setVisibleFields(DEFAULT_COLUMNS)
    void run(selection)
  }
  const exportDisabled = loading || dirty || exporting || !applied || !filtered.length
  function downloadCsv() {
    if (exportDisabled || !applied) return
    const url = URL.createObjectURL(new Blob([csvOutput(filtered, columns)], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a')
    link.href = url; link.download = `Deal-Dump-${applied.basis}-${applied.from}-${applied.to}.csv`
    document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  async function downloadExcel() {
    if (exportDisabled || !applied) return
    setExporting(true)
    try {
      const { utils, writeFile } = await import('xlsx')
      const workbook = utils.book_new()
      const sheet = utils.aoa_to_sheet([
        columns.map((c) => c.label),
        ...filtered.map((r) => columns.map((c) => r[c.field] ?? '')),
      ])
      sheet['!cols'] = columns.map((c) => ({ wch: Math.max(18, c.label.length + 2) }))
      utils.book_append_sheet(workbook, sheet, 'Deal Dump')
      writeFile(workbook, `Deal-Dump-${applied.basis}-${applied.from}-${applied.to}.xlsx`)
    } catch (error) { setError(`Export failed: ${messageOf(error)}`) }
    finally { setExporting(false) }
  }

  return <div className="tsf-deals deal-dump">
    <nav className="tsf-breadcrumb" aria-label="Report location"><Link to="/reporting">Reporting</Link><span>/</span><Link to="/reporting/fx-structure">FX Structure</Link><span>/</span><span>FX Front-Office</span></nav>
    <header className="page-header">
      <BackButton className="fx-back-btn" /><img className="logo-img" src={FX_LOGO} alt="Fourth Signal" />
      <div className="header-text"><h1>View List of All Transactions</h1><p>Deal Dump · FX Treasury Blotter</p></div>
      <div className="tsf-header-actions"><button className="btn btn-secondary" type="button" disabled={loading} onClick={() => void run(applied ?? draft)}><RefreshCw size={15} />Refresh</button><SignOutButton className="btn btn-secondary" /></div>
    </header>

    <section className="card tsf-report-card" aria-labelledby="dump-title">
      <div className="tsf-section-head"><div><h2 id="dump-title">Deal Dump</h2><p>{applied ? `${BASIS_LABEL[applied.basis]} Date Range: ${displayDate(applied.from)} – ${displayDate(applied.to)}` : loading ? 'Loading transactions…' : 'Select a company and date range to run the report.'}</p></div><span className="tsf-readonly" role="status">{filtered.length} transactions</span></div>
      <form onSubmit={submit}>
        <div className="tsf-filters dump-selection">
          <label>Company Code *<select id="dump-company" value={draft.company} onChange={(e) => change('company', e.target.value)} disabled={loading} required><option value="ALL">All available companies</option>{lookups.companies.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.name}</option>)}</select></label>
          <label>From Date *<input id="dump-from" type="date" value={draft.from} onChange={(e) => change('from', e.target.value)} disabled={loading} required /></label>
          <label>To Date *<input id="dump-to" type="date" value={draft.to} min={draft.from || undefined} onChange={(e) => change('to', e.target.value)} disabled={loading} required /></label>
          <fieldset className="dump-basis"><legend>Date Basis</legend><div>{(Object.keys(BASIS_LABEL) as Basis[]).map((basis) => <button key={basis} type="button" aria-pressed={draft.basis === basis} disabled={loading} onClick={() => change('basis', basis)}>{BASIS_LABEL[basis]}</button>)}</div></fieldset>
          <div className="tsf-filter-actions"><button className="btn btn-primary" type="submit" disabled={loading || !lookups.companies.length}>{loading ? 'Loading…' : 'Run Report'}</button><button className="btn btn-secondary" type="button" onClick={reset} disabled={loading}>Reset</button></div>
        </div>
      </form>
      {error && <div className="tsf-message tsf-error" role="alert">{error}<button className="btn btn-secondary" type="button" onClick={() => void run(draft)} disabled={loading}>Retry</button></div>}
      {notice && <p className="tsf-message" role="status">{notice}</p>}
      {dirty && <p className="tsf-message" role="status">Selection changed. Run the report to update these results.</p>}

      <div className="tsf-table-toolbar">
        <label className="tsf-search"><Search size={16} aria-hidden="true" /><input type="search" aria-label="Search all columns" placeholder="Search all columns…" value={filters.search} onChange={(e) => filter('search', e.target.value)} /></label>
        <div className="tsf-table-actions">
          <button className="btn btn-primary" type="button" disabled={!selectedRow || loading || dirty} onClick={() => selectedRow && setDetail(selectedRow)}><Eye size={15} />View Transaction</button>
          <button className="btn btn-secondary" type="button" onClick={downloadCsv} disabled={exportDisabled}><Download size={15} />Download CSV</button>
          <button className="btn btn-secondary" type="button" onClick={() => void downloadExcel()} disabled={exportDisabled}>{exporting ? 'Exporting…' : 'Export Excel'}</button>
          <button className="btn btn-secondary" type="button" onClick={() => setColumnsOpen(true)}><Columns3 size={15} />Columns</button>
        </div>
      </div>
      <div className="tsf-filters dump-quick-filters">
        <label>Type<select aria-label="Type" value={filters.type} onChange={(e) => filter('type', e.target.value)}><option value="">All</option><option>Internal</option><option>External</option><option value="TSF-linked">TSF-linked</option></select></label>
        <label>Transaction Status<select aria-label="Transaction Status" value={filters.status} onChange={(e) => filter('status', e.target.value)}><option value="">All statuses</option>{choices('statusCode').map((code) => <option key={code} value={code}>{code} · {rows.find((r) => r.statusCode === code)?.status || code}</option>)}</select></label>
        <div className="tsf-filter-actions"><button className="btn btn-secondary" type="button" aria-expanded={advanced} aria-controls="dump-advanced" onClick={() => setAdvanced((v) => !v)}>{advanced ? 'Fewer filters' : 'More filters'}</button><button className="btn btn-secondary" type="button" onClick={() => { setFilters({ ...EMPTY_FILTERS }); setPage(1); setSelected(null) }}>Clear filters</button></div>
      </div>
      {advanced && <div className="tsf-filters dump-advanced" id="dump-advanced">
        <label>Trader<select aria-label="Trader" value={filters.trader} onChange={(e) => filter('trader', e.target.value)}><option value="">All traders</option>{traderChoices.map((t) => <option key={t.code} value={t.code}>{t.code} · {t.name}</option>)}</select></label>
        <label title="Trader group is not exposed by the current transaction services.">Trader Group<select aria-label="Trader Group" disabled><option>Unavailable</option></select></label>
        <label>Business Area<input aria-label="Business Area" placeholder="Code / name" value={filters.businessArea} onChange={(e) => filter('businessArea', e.target.value)} /></label>
        <label title="Profit center is not exposed by the current transaction services.">Profit Center<input aria-label="Profit Center" placeholder="Unavailable" disabled /></label>
        <label>Business Partner<input aria-label="Business Partner" placeholder="Code / name" value={filters.partner} onChange={(e) => filter('partner', e.target.value)} /></label>
        <label>Transaction No.<input aria-label="Transaction No." placeholder="Transaction number" value={filters.deal} onChange={(e) => filter('deal', e.target.value)} /></label>
        <label>Transaction Type<select aria-label="Transaction Type" value={filters.txnType} onChange={(e) => filter('txnType', e.target.value)}><option value="">All types</option>{choices('txnType').map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Currency Pair<select aria-label="Currency Pair" value={filters.pair} onChange={(e) => filter('pair', e.target.value)}><option value="">All pairs</option>{choices('pair').map((value) => <option key={value}>{value}</option>)}</select></label>
      </div>}
      <div className="tsf-table-hint"><span>Click a transaction number or double-click a row for details. Rates retain their original quotation.</span><span className="tsf-readonly">Read only</span></div>
      <div className="tsf-table-scroll" role="region" aria-label="Deal Dump transactions" aria-busy={loading} tabIndex={0}>
        <table className="tsf-deal-table"><thead><tr><th className="tsf-check-col" scope="col"><span className="tsf-sr-only">Select transaction</span></th>{columns.map((c) => <th key={c.field} scope="col" className={`${c.field === 'deal' ? 'tsf-transaction-col' : ''} ${c.kind === 'rate' || c.kind === 'amount' ? 'tsf-num' : ''}`} aria-sort={sort.field === c.field ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><button type="button" onClick={() => { setSort({ field: c.field, direction: sort.field === c.field && sort.direction === 'asc' ? 'desc' : 'asc' }); setPage(1); setSelected(null) }}>{c.label}<span aria-hidden="true">{sort.field === c.field ? sort.direction === 'asc' ? '▴' : '▾' : '↕'}</span></button></th>)}</tr></thead>
          <tbody>{visible.map((r) => <tr key={r.id} className={`${r.id === selected ? 'selected' : ''} ${r.reversed ? 'is-reversed' : r.intExt === 'Internal' ? 'is-internal' : ''}`} onClick={() => setSelected((id) => id === r.id ? null : r.id)} onDoubleClick={() => setDetail(r)}>
            <td className="tsf-check-col"><input type="checkbox" aria-label={`Select ${r.company} transaction ${r.deal}`} checked={selected === r.id} onClick={(e) => e.stopPropagation()} onChange={(e) => setSelected(e.target.checked ? r.id : null)} /></td>
            {columns.map((c) => <td key={c.field} className={`${c.field === 'deal' ? 'tsf-transaction-col' : ''} ${c.kind === 'rate' || c.kind === 'amount' ? 'tsf-num' : ''} ${c.field === 'status' ? 'tsf-status' : ''}`} title={c.kind === 'rate' ? `Rate quotation: ${r.quotation || 'unavailable'}` : cellValue(r, c)}>{c.field === 'deal' ? <button type="button" className="tsf-txn-link" onClick={(e) => { e.stopPropagation(); setDetail(r) }}>{r.deal}</button> : cellValue(r, c)}</td>)}
          </tr>)}{!visible.length && <tr><td className="tsf-empty" colSpan={columns.length + 1}><strong>{loading ? 'Loading transactions…' : error ? 'The report could not be loaded.' : rows.length ? 'No transactions match these filters.' : 'No transactions match this selection.'}</strong><span>{loading ? 'Reading Treasury transactions and report details.' : 'Adjust your company, date range or filters.'}</span></td></tr>}</tbody>
        </table>
      </div>
      <footer className="tsf-pagination"><span role="status">Showing {filtered.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} transactions</span><div><label>Rows<select aria-label="Rows per page" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); setSelected(null) }}>{[8, 15, 20, 25, 50, 100].map((n) => <option key={n}>{n}</option>)}</select></label><button type="button" aria-label="Previous page" disabled={currentPage === 1} onClick={() => { setPage(currentPage - 1); setSelected(null) }}><ChevronLeft size={16} /></button>{pages.map((n) => <button key={n} type="button" aria-label={`Page ${n}`} aria-current={n === currentPage ? 'page' : undefined} onClick={() => { setPage(n); setSelected(null) }}>{n}</button>)}<button type="button" aria-label="Next page" disabled={currentPage === pageCount} onClick={() => { setPage(currentPage + 1); setSelected(null) }}><ChevronRight size={16} /></button></div></footer>
    </section>
    <details className="dump-coverage"><summary>Report coverage</summary><p>{COVERAGE_NOTICE}</p></details>

    <Dialog open={columnsOpen} onClose={() => setColumnsOpen(false)} title="Choose report columns" width={650} footer={<><button type="button" className="btn btn-secondary" onClick={() => setVisibleFields(DEFAULT_COLUMNS)}>Restore defaults</button><button type="button" className="btn btn-primary" onClick={() => setColumnsOpen(false)}>Done</button></>}>
      <p className="dump-dialog-note">Downloads include all filtered rows and the selected columns.</p>
      <div className="dump-columns">{COLUMNS.map((c) => <label key={c.field}><input type="checkbox" checked={visibleFields.includes(c.field)} disabled={c.field === 'deal'} onChange={(e) => setVisibleFields((fields) => e.target.checked ? [...fields, c.field] : fields.filter((field) => field !== c.field))} />{c.label}</label>)}</div>
    </Dialog>
    <Dialog open={!!detail} onClose={() => setDetail(null)} title="Transaction Details" width={1000} footer={<button type="button" className="btn btn-secondary" onClick={() => setDetail(null)}>Close</button>}>
      {detail && <><div className="tsf-detail-summary"><strong>{detail.company} · {detail.deal}</strong><span>{detail.status || 'Status unavailable'}</span><span className="tsf-readonly">Read only</span></div><dl className="tsf-detail-grid">{COLUMNS.map((c) => <div key={c.field}><dt>{c.label}</dt><dd>{cellValue(detail, c)}</dd></div>)}<div><dt>Rate Quotation</dt><dd>{detail.quotation || '—'}</dd></div></dl></>}
    </Dialog>
  </div>
}

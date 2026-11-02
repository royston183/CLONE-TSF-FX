import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Dialog } from '@slc/ui'
import { Download, Eye, RefreshCw, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { FX_LOGO } from '../../shared/fx/logo.ts'
import { messageOf } from '../../shared/fx/master-contract.ts'
import { isAbort } from '../../shared/fx/mw.ts'
import { loadLookups, loadReport } from './api.ts'
import { COLUMNS, cellValue, displayDate, exportRecords, filterSortRows, initialSelection, selectionError } from './logic.ts'
import type { Column, DealReportRow, Lookups, Selection, Sort } from './types.ts'
import './view-tsf-deals.css'

const INITIAL_SORT: Sort = { field: 'blotter', direction: 'desc' }
const detailGroups: { title: string; fields: readonly (keyof DealReportRow)[] }[] = [
  { title: 'Transaction', fields: ['rfha', 'bukrs', 'companyName', 'dealId', 'dealDesc', 'dealType', 'product', 'transactionType', 'activity', 'status', 'execution', 'trader'] },
  { title: 'Counterparty & master contract', fields: ['partner', 'bpName', 'externalRef', 'internalRef', 'mcRef', 'mcDesc', 'commodity', 'model', 'modelDesc', 'subType', 'portfolio', 'businessArea'] },
  { title: 'Dates', fields: ['blotter', 'tradeDate', 'valueDate', 'ndfDate', 'created', 'changed'] },
  { title: 'Amounts & rates', fields: ['bs1', 'curr1', 'amt1', 'bs2', 'curr2', 'amt2', 'spot', 'swap', 'allRate', 'rateBasis', 'pnl', 'localPnl', 'ndfRef', 'ndfRate', 'cashAmount', 'cashCurrency'] },
  { title: 'Remarks & administration', fields: ['foRemark', 'moRemark', 'ndfFoRemark', 'ndfMoRemark', 'enteredBy', 'changedBy'] },
]
const detailLabels: Partial<Record<keyof DealReportRow, string>> = {
  companyName: 'Company Name', dealDesc: 'Deal Description', partner: 'Business Partner', activity: 'Activity Category',
  transactionType: 'Transaction Type', execution: 'Internal / External', mcDesc: 'Master Contract Description', commodity: 'Commodity',
  modelDesc: 'Model Description', portfolio: 'Portfolio', businessArea: 'Business Area', created: 'Entered On', changed: 'Changed On',
  rateBasis: 'Rate Quotation', enteredBy: 'Entered By', changedBy: 'Changed By',
}

function Details({ row, transaction, close }: { row: DealReportRow | null; transaction: boolean; close: () => void }) {
  return <Dialog open={!!row} onClose={close} title={transaction ? `Transaction Display — ${row?.rfha ?? ''}` : 'TSF Deal Details'} width={1000}
    footer={<button type="button" className="btn btn-secondary" onClick={close}>Close</button>}>
    {row && <>
      <div className="tsf-detail-summary"><strong>{row.bukrs} · {row.rfha}</strong><span>{row.dealId} · {row.dealDesc || 'TSF deal'}</span><span className="tsf-readonly">Read only</span></div>
      {detailGroups.map((group) => <section className="tsf-detail-section" key={group.title}>
        <h3>{group.title}</h3><dl className="tsf-detail-grid">{group.fields.map((field) => {
          const column: Column = COLUMNS.find((c) => c.field === field) ?? { field, label: detailLabels[field] ?? field, ...(['created', 'changed'].includes(field) ? { kind: 'date' as const } : {}) }
          return <div key={field}><dt>{column.label}</dt><dd>{cellValue(row, column)}</dd></div>
        })}</dl>
      </section>)}
      {(row.pnl !== null || row.localPnl !== null) && <p className="tsf-detail-note">P&amp;L is shown per Deal ID and repeats on its linked transactions.</p>}
    </>}
  </Dialog>
}

export default function ViewTsfDeals() {
  const [draft, setDraft] = useState<Selection>(initialSelection)
  const [applied, setApplied] = useState<Selection | null>(null)
  const [lookups, setLookups] = useState<Lookups>({ companies: [], traders: [] })
  const [rows, setRows] = useState<DealReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<Sort>(INITIAL_SORT)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<{ row: DealReportRow; transaction: boolean } | null>(null)
  const [exporting, setExporting] = useState(false)
  const request = useRef<AbortController | null>(null)

  const run = useCallback(async (selection: Selection, masters?: Lookups) => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoading(true); setError(''); setNotice(''); setRows([]); setApplied(null); setSelected(null); setDetail(null); setPage(1)
    try {
      const nextLookups = masters ?? await loadLookups(controller.signal)
      if (controller.signal.aborted) return
      setLookups(nextLookups)
      const result = await loadReport(selection, nextLookups, controller.signal)
      if (controller.signal.aborted) return
      setRows(result.rows); setNotice(result.notice); setApplied(selection)
    } catch (error) {
      if (!controller.signal.aborted && !isAbort(error)) setError(messageOf(error))
    } finally {
      if (request.current === controller && !controller.signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void run(initialSelection())
    return () => request.current?.abort()
  }, [run])

  const filtered = useMemo(() => filterSortRows(rows, search, sort), [rows, search, sort])
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const selectedRow = filtered.find((row) => row.id === selected) ?? null
  const dirty = !!applied && Object.keys(draft).some((key) => draft[key as keyof Selection] !== applied[key as keyof Selection])
  const pageStart = Math.max(1, Math.min(currentPage - 2, pageCount - 4))
  const pages = Array.from({ length: Math.min(5, pageCount) }, (_, index) => pageStart + index)
  const change = (key: keyof Selection, value: string) => { setDraft((s) => ({ ...s, [key]: value })); setError('') }

  function submit(event: FormEvent) {
    event.preventDefault()
    const message = selectionError(draft, lookups.companies.map((c) => c.code))
    if (message) { setError(message); return }
    void run({ ...draft }, lookups)
  }
  function reset() {
    const selection = initialSelection()
    setDraft(selection); setSearch(''); setSort(INITIAL_SORT); setPageSize(15)
    void run(selection)
  }
  async function exportExcel() {
    if (!applied || !filtered.length || dirty) return
    setExporting(true)
    try {
      const { utils, writeFile } = await import('xlsx')
      const workbook = utils.book_new()
      const worksheet = utils.json_to_sheet(exportRecords(filtered))
      worksheet['!cols'] = COLUMNS.map((column) => ({ wch: Math.max(column.label.length + 2, 18) }))
      utils.book_append_sheet(workbook, worksheet, 'TSF Deals')
      writeFile(workbook, `TSF-Deals-${applied.from}-${applied.to}.xlsx`)
    } catch (error) { setError(`The report could not be exported: ${messageOf(error)}`) }
    finally { setExporting(false) }
  }

  return <div className="tsf-deals">
    <nav className="tsf-breadcrumb" aria-label="Report location"><Link to="/reporting">Reporting</Link><span>/</span><Link to="/reporting/fx-structure">FX Structure</Link><span>/</span><span>FX Front Office</span></nav>
    <header className="page-header">
      <BackButton className="fx-back-btn" />
      <img className="logo-img" src={FX_LOGO} alt="Fourth Signal" />
      <div className="header-text"><h1>View List of TSF Deals</h1><p>Forex transactions, master contracts and settlement references</p></div>
      <div className="tsf-header-actions"><button type="button" className="btn btn-secondary" onClick={() => void run(applied ?? draft)} disabled={loading}><RefreshCw size={15} /> Refresh</button><SignOutButton className="btn btn-secondary" /></div>
    </header>

    <section className="tsf-kpis" aria-label="Report totals">
      {[
        [filtered.length, 'Transactions', 'Matching the report and search'],
        [new Set(filtered.map((r) => r.dealId)).size, 'Deal IDs', 'Distinct TSF deal references'],
        [new Set(filtered.map((r) => r.mcRef).filter(Boolean)).size, 'Master Contracts', 'Distinct contract references'],
        [filtered.filter((r) => r.reversed).length, 'Deleted / Reversed', 'Included for a complete deal history'],
      ].map(([count, label, caption]) => <div className="card tsf-kpi" key={label}><strong>{loading ? '—' : count}</strong><span>{label}</span><small>{caption}</small></div>)}
    </section>

    <section className="card tsf-report-card" aria-labelledby="tsf-report-title">
      <div className="tsf-section-head"><div><h2 id="tsf-report-title">Forex Deal Report</h2><p>{applied ? `Blotter date: ${displayDate(applied.from)} — ${displayDate(applied.to)}` : loading ? 'Loading current transactions…' : 'Choose a company and blotter date range to run the report.'}</p></div><span className="tsf-readonly">Read only</span></div>
      <form className="tsf-filters" onSubmit={submit}>
        <label>Company Code <span aria-hidden="true">*</span><select id="tsf-company" value={draft.company} onChange={(e) => change('company', e.target.value)} disabled={loading} required><option value="ALL">All available companies</option>{lookups.companies.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.name}</option>)}</select></label>
        <label>Blotter Date From <span aria-hidden="true">*</span><input type="date" id="tsf-from" required value={draft.from} onChange={(e) => change('from', e.target.value)} disabled={loading} /></label>
        <label>Blotter Date To <span aria-hidden="true">*</span><input type="date" id="tsf-to" required value={draft.to} min={draft.from || undefined} onChange={(e) => change('to', e.target.value)} disabled={loading} /></label>
        <label>Trader<select id="tsf-trader" value={draft.trader} onChange={(e) => change('trader', e.target.value)} disabled={loading}><option value="">All traders</option>{lookups.traders.map((t) => <option key={t.code} value={t.code}>{t.code} · {t.name}</option>)}</select></label>
        <div className="tsf-filter-actions"><button type="submit" className="btn btn-primary" disabled={loading || !lookups.companies.length}>{loading ? 'Loading…' : 'Run Report'}</button><button type="button" className="btn btn-secondary" onClick={reset} disabled={loading}>Reset</button></div>
      </form>
      {error && <div className="tsf-message tsf-error" role="alert">{error}<button className="btn btn-secondary" type="button" onClick={() => void run(draft)} disabled={loading}>Retry</button></div>}
      {notice && <p className="tsf-message" role="status">{notice}</p>}
      {dirty && <p className="tsf-message" role="status">Selection changed. Run the report to update these results.</p>}
      <div className="tsf-table-toolbar">
        <label className="tsf-search"><Search size={16} aria-hidden="true" /><input type="search" aria-label="Search report" placeholder="Search transactions, Deal IDs, contracts, counterparties…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} /></label>
        <div className="tsf-table-actions"><button type="button" className="btn btn-secondary" disabled={!selectedRow || loading} onClick={() => selectedRow && setDetail({ row: selectedRow, transaction: false })}><Eye size={15} /> View Details</button><button type="button" className="btn btn-secondary" disabled={!filtered.length || loading || exporting || dirty} onClick={() => void exportExcel()}><Download size={15} /> {exporting ? 'Exporting…' : 'Export Excel'}</button></div>
      </div>
      <div className="tsf-table-hint"><span>Double-click a row for full details, or click its transaction number.</span><div className="tsf-legend"><span><i className="internal" />Internal</span><span><i className="external" />External</span><span><i className="reversed" />Deleted / reversed</span></div></div>
      <div className="tsf-table-scroll" aria-busy={loading} tabIndex={0} role="region" aria-label="TSF deal report table">
        <table className="tsf-deal-table">
          <thead><tr><th className="tsf-check-col" scope="col"><span className="tsf-sr-only">Select transaction</span></th>{COLUMNS.map((column) => <th key={column.field} scope="col" className={`${column.field === 'rfha' ? 'tsf-transaction-col' : ''} ${column.kind && column.kind !== 'date' ? 'tsf-num' : ''}`} aria-sort={sort.field === column.field ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><button type="button" onClick={() => { setSort({ field: column.field, direction: sort.field === column.field && sort.direction === 'asc' ? 'desc' : 'asc' }); setPage(1) }}>{column.label}<span aria-hidden="true">{sort.field === column.field ? sort.direction === 'asc' ? '▴' : '▾' : '↕'}</span></button></th>)}</tr></thead>
          <tbody>{visible.map((row) => <tr key={row.id} className={`${row.id === selected ? 'selected' : ''} ${row.reversed ? 'is-reversed' : row.execution === 'Internal' ? 'is-internal' : ''}`} onClick={() => setSelected((id) => id === row.id ? null : row.id)} onDoubleClick={() => setDetail({ row, transaction: false })}>
            <td className="tsf-check-col"><input type="checkbox" aria-label={`Select ${row.bukrs} transaction ${row.rfha}`} checked={selected === row.id} onClick={(e) => e.stopPropagation()} onChange={(e) => setSelected(e.target.checked ? row.id : null)} /></td>
            {COLUMNS.map((column) => <td key={column.field} className={`${column.field === 'rfha' ? 'tsf-transaction-col' : ''} ${column.kind && column.kind !== 'date' ? 'tsf-num' : ''} ${column.field === 'status' ? 'tsf-status' : ''}`} title={column.kind === 'rate' ? `Rate quotation: ${row.rateBasis}` : column.kind === 'pnl' || column.kind === 'localPnl' ? 'Saved P&L for this Deal ID; repeats on its linked transactions.' : cellValue(row, column)}>
              {column.field === 'rfha' ? <button type="button" className="tsf-txn-link" onClick={(e) => { e.stopPropagation(); setDetail({ row, transaction: true }) }}>{row.rfha}</button> : cellValue(row, column)}
            </td>)}
          </tr>)}{!visible.length && <tr><td colSpan={COLUMNS.length + 1} className="tsf-empty"><strong>{loading ? 'Loading TSF transactions…' : error ? 'The report could not be loaded.' : rows.length ? 'No transactions match your search.' : 'No TSF deals match this selection.'}</strong><span>{loading ? 'Reading Treasury transactions and contract details.' : 'Adjust the company, blotter dates, trader or search and run the report again.'}</span></td></tr>}</tbody>
        </table>
      </div>
      <footer className="tsf-pagination"><span role="status">Showing {filtered.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} transactions</span><div><label>Rows<select aria-label="Rows per page" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}>{[15, 25, 50, 100].map((size) => <option key={size}>{size}</option>)}</select></label><button type="button" aria-label="Previous page" disabled={currentPage === 1} onClick={() => { setPage(currentPage - 1); setSelected(null) }}><ChevronLeft size={16} /></button>{pages.map((number) => <button key={number} type="button" aria-label={`Page ${number}`} aria-current={currentPage === number ? 'page' : undefined} onClick={() => { setPage(number); setSelected(null) }}>{number}</button>)}<button type="button" aria-label="Next page" disabled={currentPage === pageCount} onClick={() => { setPage(currentPage + 1); setSelected(null) }}><ChevronRight size={16} /></button></div></footer>
    </section>
    <Details row={detail?.row ?? null} transaction={detail?.transaction ?? false} close={() => setDetail(null)} />
  </div>
}

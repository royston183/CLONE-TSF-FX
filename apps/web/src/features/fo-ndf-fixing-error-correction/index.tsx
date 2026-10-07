import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { CorrectionModal } from './CorrectionModal.tsx'
import { isAbort } from '../../shared/fx/mw.ts'
import { loadCompanies, loadFixingReferences, loadWorklist, type Avail, type Option } from './api.ts'
import { DateField } from './DateField.tsx'
import { DetailModal } from './DetailModal.tsx'
import { formatDate, money, oldRateText, rate } from './format.ts'
import { buildCsv, filterRows, nextSort, sortRows } from './logic.ts'
import './fo-ndf-fixing-error-correction.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './fo-ndf-fixing-error-correction.dark.css'
import type { NdfRow, Sort, SortKey, Toast } from './types.ts'

const PAGE_SIZE = 8

type Column = { key: SortKey; label: string }
const COLUMNS: Column[] = [
  { key: 'rfha', label: 'Transaction' },
  { key: 'bukrs', label: 'CoCode' },
  { key: 'company', label: 'Company Name' },
  { key: 'product', label: 'Product Type' },
  { key: 'pair', label: 'Currency Pair' },
  { key: 'side', label: 'Buy/Sell' },
  { key: 'amt1', label: 'Amount 1' },
  { key: 'curr1', label: 'Crcy 1' },
  { key: 'amt2', label: 'Amount 2' },
  { key: 'curr2', label: 'Crcy 2' },
  { key: 'fixDate', label: 'Fixing Date' },
  { key: 'fixRef', label: 'Fixing Ref' },
  { key: 'oldRate', label: 'Old Fixing Rate' },
  { key: 'trader', label: 'Trader' },
  { key: 'partner', label: 'Business Partner' },
  { key: 'statusText', label: 'Status' },
]
const NUM_COLS = new Set<SortKey>(['amt1', 'amt2', 'oldRate'])

/**
 * FO: NDF Fixing Error Correction (ZSGTSFR025), converted from
 * legacy/ZSGTSF_RFX_NDF_FIX_FO_FINAL (1).html.
 *
 * Reads SAP only (api.ts): the status-11 queue (TrmFxApp + FxTransaction + the view's NDF_DATE for
 * the NDF Fixing Date), the company codes from T001 and the fixing-reference texts from
 * FTRT_FIX_DEF_T. Old Fixing Rate (NDF_RATE) has no source: WAITING FOR API. The correction
 * (TXN_STATUS 11 -> 12 + TX02 settle rate) has no API: Update reports it and changes nothing.
 */
const CORRECTION_WAITING =
  'WAITING FOR CORRECTION ACTION API \u2014 the NDF rate correction (TXN_STATUS 11 \u2192 12, TX02 TTMS_FX_SETTLEMENT_DATA-SETTLE_RATE, status-12 e-mail) has no API yet. Nothing was posted to SAP.'
export default function FoNdfFixingErrorCorrection() {
  const [rows, setRows] = useState<NdfRow[]>([])
  const [search, setSearch] = useState('')
  const [company, setCompany] = useState('')
  const [fixDate, setFixDate] = useState(() => formatDate(new Date()))
  const [companyHelp, setCompanyHelp] = useState<Avail<Option[]> | null>(null)
  const [refTexts, setRefTexts] = useState<Record<string, string>>({})
  const [worklistNote, setWorklistNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState<Sort>({ key: 'rfha', dir: -1 })
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [correctionOpen, setCorrectionOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [dragReady, setDragReady] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)
  const pushToast = (message: string, success: boolean) => {
    const id = ++toastId.current
    setToasts((t) => [...t, { id, message, success }])
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600)
  }

  /* Screen 1000's company F4 (T001) and 9001's reference texts, once. */
  useEffect(() => {
    const ctrl = new AbortController()
    loadCompanies(ctrl.signal).then(setCompanyHelp, (e: unknown) => {
      if (!isAbort(e)) console.warn(e)
    })
    loadFixingReferences(ctrl.signal).then(setRefTexts, (e: unknown) => {
      if (!isAbort(e)) console.warn(e)
    })
    return () => ctrl.abort()
  }, [])
  const companies = companyHelp?.state === 'ok' ? companyHelp.value : []

  /* GET_DATA for the NDF Fixing Date (P_DATE); Refresh — and a real correction — run it again. */
  const worklistAbort = useRef<AbortController | null>(null)
  const loadRows = useCallback(
    async (date: string) => {
      worklistAbort.current?.abort()
      const ctrl = new AbortController()
      worklistAbort.current = ctrl
      setLoading(true)
      try {
        const res = await loadWorklist(date, refTexts, ctrl.signal)
        setRows(res.state === 'ok' ? res.value : [])
        setWorklistNote(res.state === 'ok' ? '' : res.reason)
      } catch (error) {
        if (!isAbort(error)) console.warn(error)
      } finally {
        if (worklistAbort.current === ctrl) setLoading(false)
      }
    },
    [refTexts],
  )
  useEffect(() => {
    void loadRows(fixDate)
    return () => worklistAbort.current?.abort()
  }, [fixDate, loadRows])

  const findById = (id: string | null): NdfRow | null => (id ? (rows.find((r) => r.rfha === id && r.status === '11') ?? null) : null)
  const selectedRow = findById(selectedId)
  const detailRow = detailId ? (rows.find((r) => r.rfha === detailId) ?? null) : null

  const filtered = useMemo(() => filterRows(rows, search, company, fixDate), [rows, search, company, fixDate])
  const sorted = useMemo(() => sortRows(filtered, sort), [filtered, sort])
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const start = (currentPage - 1) * PAGE_SIZE
  const pageRows = sorted.slice(start, start + PAGE_SIZE)

  const selectRow = (id: string) => setSelectedId(id)

  const resetWorkbench = () => {
    setSearch('')
    setCompany('')
    setFixDate(formatDate(new Date()))
    setSelectedId(null)
    setPage(1)
    setSort({ key: 'rfha', dir: -1 })
  }

  const refreshWorkbench = () => {
    resetWorkbench()
    void loadRows(formatDate(new Date()))
    setCorrectionOpen(false)
    setDetailId(null)
    pushToast('Workbench refreshed.', true)
  }

  const openCorrection = () => {
    if (!selectedRow) {
      pushToast('Select a transaction first.', false)
      return
    }
    setCorrectionOpen(true)
  }

  /**
   * FORM save_data sets TXN_STATUS 12 and posts the new settle rate through TX02. No API does that
   * yet, so nothing changes: the popup stays open and the row keeps status 11. Once the action
   * exists, success closes the popup and reloads the queue (the row then drops out at 12).
   */
  const updateFixing = (_newRate: number) => {
    if (!selectedId) return
    pushToast(CORRECTION_WAITING, false)
  }

  const downloadCsv = () => {
    const blob = new Blob([buildCsv(sorted)], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ndf_fixing_transactions.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fondfec">
      <div className="app-header">
        <div className="header-left">
          <BackButton className="back-btn" />
          <div className="logo-mark" aria-label="FS">
            <span className="l1" />
            <span className="l2" />
            <span className="l3" />
            <span className="l4" />
          </div>
          <div className="page-title">NDF Fixing Error Correction</div>
          <div className="page-tag">FO</div>
        </div>
        <div className="header-right">
          <div className="header-status" title="Application ready" />
          <button className="header-btn" type="button" onClick={refreshWorkbench}>
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="none" stroke="currentColor" strokeWidth="2" d="M20 11a8 8 0 1 0 2 5M20 4v7h-7" />
            </svg>
            <span className="txt" style={{ marginLeft: 7 }}>
              Refresh
            </span>
          </button>
          <SignOutButton className="header-btn" />
        </div>
      </div>

      <main className="main">
        <section className="card">
          <div className="card-head">
            <div className="card-title-wrap">
              <div className="card-title">NDF Fixing Transactions</div>
              <div className="record-count">{sorted.length + (sorted.length === 1 ? ' record' : ' records')}</div>
            </div>
          </div>

          <div className="work-toolbar">
            <div className="toolbar-item search-wrap">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
                <path d="M16.5 16.5L21 21" fill="none" stroke="currentColor" strokeWidth="2" />
              </svg>
              <input
                className="control search-input"
                type="text"
                placeholder="Search transactions..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setSelectedId(null)
                  setPage(1)
                }}
              />
            </div>

            <div className="toolbar-item">
              <select
                className="control filter-select"
                title="Company Code"
                value={company}
                onChange={(e) => {
                  setCompany(e.target.value)
                  setSelectedId(null)
                  setPage(1)
                }}
              >
                <option value="">Company Code</option>
                {companies.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="toolbar-item">
              <DateField
                id="dateFilter"
                value={fixDate}
                onChange={(v) => {
                  setFixDate(v)
                  setSelectedId(null)
                  setPage(1)
                }}
              />
            </div>

            <button className="toolbar-item secondary-btn reset-btn" type="button" onClick={resetWorkbench}>
              Reset
            </button>
            <div className="action-spacer" />

            <button
              className={`toolbar-item primary-btn drop-target${dragReady ? ' drag-ready' : ''}${dragOver ? ' drag-over' : ''}`}
              type="button"
              disabled={!selectedRow}
              onClick={openCorrection}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                setDragReady(false)
                const id = e.dataTransfer.getData('text/plain')
                if (id) setSelectedId(id)
                openCorrection()
              }}
            >
              NDF Rate Correction
            </button>

            <button className="toolbar-item icon-btn" type="button" title="Download CSV" onClick={downloadCsv}>
              <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="none" stroke="currentColor" strokeWidth="2" d="M12 3v12m-5-5 5 5 5-5M5 20h14" />
              </svg>
            </button>
          </div>

          <div className="table-shell">
            <table style={{ display: pageRows.length ? 'table' : 'none' }}>
              <thead>
                <tr>
                  <th className="cell-check">
                    <input type="checkbox" disabled title="Single selection" />
                  </th>
                  {COLUMNS.map((col) => (
                    <th key={col.key} className="sortable" onClick={() => setSort((s) => nextSort(s, col.key))}>
                      {col.label} <span className="sort-ind">{sort.key === col.key ? (sort.dir === 1 ? '▲' : '▼') : '◆'}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const selected = selectedId === r.rfha
                  return (
                    <tr
                      key={r.rfha}
                      draggable
                      className={selected ? 'selected' : ''}
                      onClick={() => selectRow(r.rfha)}
                      onDoubleClick={() => setDetailId(r.rfha)}
                      onDragStart={(e) => {
                        selectRow(r.rfha)
                        setDragReady(true)
                        e.dataTransfer.effectAllowed = 'move'
                        e.dataTransfer.setData('text/plain', r.rfha)
                      }}
                      onDragEnd={() => {
                        setDragReady(false)
                        setDragOver(false)
                      }}
                    >
                      <td className="cell-check">
                        <input className="row-check" type="checkbox" checked={selected} readOnly onClick={(e) => e.stopPropagation()} />
                      </td>
                      <td>
                        <button
                          className="link-btn"
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            selectRow(r.rfha)
                            setDetailId(r.rfha)
                          }}
                        >
                          {r.rfha}
                        </button>
                      </td>
                      <td>{r.bukrs}</td>
                      <td>{r.company}</td>
                      <td>{r.product}</td>
                      <td>{r.pair}</td>
                      <td>{r.side}</td>
                      <td className="num">{money(r.amt1)}</td>
                      <td>{r.curr1}</td>
                      <td className="num">{money(r.amt2)}</td>
                      <td>{r.curr2}</td>
                      <td>{r.fixDate}</td>
                      <td title={r.fixRefName}>{r.fixRef}</td>
                      <td className="num">{oldRateText(r.oldRate)}</td>
                      <td>{r.trader}</td>
                      <td>{r.partner}</td>
                      <td>
                        <span className="status-code">{r.status}</span>
                        <span className="status-text">{r.statusText}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="empty-state" style={{ display: pageRows.length ? 'none' : 'block' }}>
              {loading ? 'Loading NDF transactions from SAP…' : worklistNote || 'No transactions match the current filters.'}
            </div>
          </div>

          <div className="table-footer">
            <div>{sorted.length ? `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, sorted.length)} of ${sorted.length}` : 'Showing 0 of 0'}</div>
            <div className="pager">
              <button type="button" title="Previous page" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
                &lsaquo;
              </button>
              <span className="page-current">{currentPage}</span>
              <button type="button" title="Next page" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>
                &rsaquo;
              </button>
            </div>
          </div>
        </section>
      </main>

      <div className="toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className="toast" style={t.success ? undefined : { borderColor: '#ead6a6', borderLeftColor: '#e09218', color: '#6a501a' }}>
            {t.message}
          </div>
        ))}
      </div>

      {correctionOpen && selectedRow ? <CorrectionModal row={selectedRow} onClose={() => setCorrectionOpen(false)} onUpdate={updateFixing} /> : null}
      {detailRow ? <DetailModal row={detailRow} onClose={() => setDetailId(null)} /> : null}
    </div>
  )
}

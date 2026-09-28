import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { flushSync } from 'react-dom'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { FS_SHORT_LOGO } from '../../shared/fx/logo.ts'
import { COMPANIES, DEFAULT_PAGE_SIZE, LAYOUTS, PAGE_SIZES, TRADERS, TXN_STATUSES } from './data.ts'
import { DateField } from './DateField.tsx'
import { DealGrid } from './DealGrid.tsx'
import { isoOf, parseDMY } from './format.ts'
import {
  DEFAULT_SORT,
  EMPTY_COL_FILTERS,
  EMPTY_SELECTION,
  ERROR_MESSAGES,
  buildCsv,
  columnsFor,
  csvFileName,
  filterSortRows,
  generateDeals,
  isValid,
  nextSort,
  pageCountOf,
  recordCountText,
  resultsTitle,
  txnTypesFor,
  updateToastText,
  validateSelection,
  type SelectionErrors,
} from './logic.ts'
import { useModal } from './modal.tsx'
import { SearchDropdown } from './SearchDropdown.tsx'
import { ViewTxnModal } from './ViewTxnModal.tsx'
import './mo-update-bank-reference.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './mo-update-bank-reference.dark.css'
import type { ColFilters, ColumnKey, Company, Deal, DealType, EditKey, Selection, SortState, Toast } from './types.ts'

const NO_ERRORS: SelectionErrors = { coFrom: false, keyDate: false }
const TOAST_MS = 3200

type DropTarget = 'update' | 'view'

const companyProps = {
  items: COMPANIES,
  keyOf: (c: Company) => c.code,
  searchText: (c: Company) => `${c.code} ${c.name}`,
  primaryText: (c: Company) => `${c.code}    ${c.name}`,
  displayText: (c: Company) => `${c.code} - ${c.name}`,
  placeholder: 'Select company',
}

/**
 * External Deals: Update Bank Reference (ZSGTSFR002), converted from
 * legacy/update bank reference.html.
 *
 * The original never called an API, so this is the same UI-only screen: Execute generates
 * seeded dummy deals from the Company Code range, Key Date, Report Type and External Reference
 * choice, and every edit lives in component state for the session.
 */
export default function MoUpdateBankReference() {
  // Basic Selection
  const [sel, setSel] = useState<Selection>(EMPTY_SELECTION)
  const [errors, setErrors] = useState<SelectionErrors>(NO_ERRORS)

  // Results
  const [results, setResults] = useState<Deal[]>([])
  const [showResults, setShowResults] = useState(false)
  /** Report Type and Key Date the current results were generated for. */
  const [executed, setExecuted] = useState<{ dealType: DealType; keyDateIso: string }>({ dealType: 'FX', keyDateIso: '' })
  const [execSeq, setExecSeq] = useState(0)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT)
  const [colFilters, setColFilters] = useState<ColFilters>(EMPTY_COL_FILTERS)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [activeRowId, setActiveRowId] = useState<string | null>(null)

  // View Transaction
  const viewModal = useModal()
  const [viewRow, setViewRow] = useState<Deal | null>(null)

  // Toast
  const [toast, setToast] = useState<Toast | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const showToast = useCallback((message: string, error = false) => {
    clearTimeout(toastTimer.current)
    setToast({ message, error, id: Date.now() })
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS)
  }, [])
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  // Drag and drop
  const dragged = useRef<Deal | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<DropTarget | null>(null)
  const [ghostText, setGhostText] = useState('')
  const ghostRef = useRef<HTMLDivElement>(null)

  const resultsRef = useRef<HTMLDivElement>(null)

  // ------------------------------------------------------------------ selection

  const patchSel = (patch: Partial<Selection>) => setSel((s) => ({ ...s, ...patch }))

  const execute = () => {
    const errs = validateSelection(sel)
    setErrors(errs)
    if (!isValid(errs)) return
    const keyDateIso = isoOf(parseDMY(sel.keyDate))
    setResults(generateDeals(sel.dealType, sel.coFrom, sel.coTo || sel.coFrom, keyDateIso, sel.withRef))
    setExecuted({ dealType: sel.dealType, keyDateIso })
    setPage(1)
    setSort(DEFAULT_SORT)
    setSearch('')
    setColFilters(EMPTY_COL_FILTERS)
    setActiveRowId(null)
    setShowResults(true)
    setExecSeq((n) => n + 1)
  }

  useEffect(() => {
    if (execSeq > 0) resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [execSeq])

  const resetSelection = () => {
    setSel(EMPTY_SELECTION)
    setErrors(NO_ERRORS)
    setShowResults(false)
  }

  const refresh = () => {
    resetSelection()
    showToast('Screen refreshed')
  }

  // ------------------------------------------------------------------ table

  const cols = columnsFor(executed.dealType)
  const filtered = useMemo(() => filterSortRows(results, cols, search, colFilters, sort), [results, cols, search, colFilters, sort])
  const total = filtered.length
  const pageCount = pageCountOf(total, pageSize)
  const currentPage = Math.min(page, pageCount)
  const start = (currentPage - 1) * pageSize
  const pageRows = filtered.slice(start, start + pageSize)
  const allPageChecked = pageRows.length > 0 && pageRows.every((r) => r._checked)
  const checkedCount = results.filter((r) => r._checked).length
  const updateDisabled = checkedCount === 0
  const viewDisabled = !activeRowId

  const patchColFilters = (patch: Partial<ColFilters>) => {
    setColFilters((f) => ({ ...f, ...patch }))
    setPage(1)
  }

  const resetFilters = () => {
    setColFilters(EMPTY_COL_FILTERS)
    setSearch('')
    setPage(1)
  }

  const onSort = (key: ColumnKey) => {
    setSort((s) => nextSort(s, key))
    setPage(1)
  }

  /** The original's header checkbox (un)checks every filtered row, not just this page. */
  const onToggleAll = (checked: boolean) => {
    const ids = new Set(filtered.map((r) => r._id))
    setResults((rs) => rs.map((r) => (ids.has(r._id) ? { ...r, _checked: checked } : r)))
  }

  const onToggleRow = (id: string, checked: boolean) =>
    setResults((rs) => rs.map((r) => (r._id === id ? { ...r, _checked: checked } : r)))

  const onEdit = (id: string, field: EditKey, value: string) =>
    setResults((rs) => rs.map((r) => (r._id === id ? { ...r, [field]: value } : r)))

  const onRowClick = (id: string) => setActiveRowId((cur) => (cur === id ? null : id))

  // ------------------------------------------------------------------ actions
  // The buttons and the drag-and-drop targets below call exactly these.

  const doUpdateBankReference = () => {
    const n = results.filter((r) => r._checked).length
    if (n === 0) return
    showToast(updateToastText(n))
    setShowResults(false)
    setResults([])
  }

  const openViewTransaction = (id: string) => {
    const r = results.find((x) => x._id === id)
    if (!r) return
    setActiveRowId(id)
    setViewRow(r)
    viewModal.open()
  }

  const closeView = viewModal.close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeView()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [closeView])

  const doDownload = () => {
    const blob = new Blob([buildCsv(cols, filtered)], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = csvFileName(executed.dealType, executed.keyDateIso)
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // ------------------------------------------------------------------ drag and drop

  const onDragStart = (e: DragEvent<HTMLTableRowElement>, row: Deal) => {
    dragged.current = row
    // The ghost lives inside the scope root so the scoped .drag-ghost style reaches it; its
    // text must be in the DOM before setDragImage snapshots it.
    flushSync(() => setGhostText(`${row.RFHA} — ${row.BUKRS}`))
    setDraggingId(row._id)
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData('text/plain', String(row.RFHA))
    if (ghostRef.current) e.dataTransfer.setDragImage(ghostRef.current, 12, 14)
  }

  const onDragEnd = () => {
    dragged.current = null
    setDraggingId(null)
    setDragOver(null)
  }

  const dropTarget = (target: DropTarget, disabled: boolean, onDrop: (row: Deal) => void) => ({
    onDragOver: (e: DragEvent<HTMLButtonElement>) => {
      if (!dragged.current || disabled) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setDragOver(target)
    },
    onDragLeave: () => setDragOver(null),
    onDrop: (e: DragEvent<HTMLButtonElement>) => {
      e.preventDefault()
      setDragOver(null)
      if (dragged.current && !disabled) onDrop(dragged.current)
    },
  })

  // ------------------------------------------------------------------ render

  const selectedFrom = COMPANIES.find((c) => c.code === sel.coFrom)
  const selectedTo = COMPANIES.find((c) => c.code === sel.coTo)

  return (
    <div className="mo-update-bank-reference">
      <div className="app">
        <div className="page-header">
          <img className="logo-img" src={FS_SHORT_LOGO} alt="FS logo" />
          <div className="header-text">
            <h1>
              External Deals: Update Bank Reference <span className="tcode-chip">ZSGTSFR002</span>
            </h1>
            <p>External Reference Type</p>
          </div>
          <div className="header-actions">
            <BackButton className="btn btn-secondary" />
            <button type="button" className="btn btn-secondary" onClick={refresh}>
              ↻ Refresh
            </button>
            <SignOutButton className="btn btn-secondary" />
          </div>
        </div>

        {/* ============ Selection Criteria ============ */}
        <div className="card">
          <div className="section-title">
            <span className="dot"></span>Basic Selection
          </div>
          <div className="section-body">
            <div className="form-grid-12">
              <div className={`field gc-3${errors.coFrom ? ' has-error' : ''}`}>
                <label>
                  Company Code (From)<span className="req">*</span>
                </label>
                <SearchDropdown
                  {...companyProps}
                  selected={selectedFrom}
                  onSelect={(c) => {
                    patchSel({ coFrom: c.code })
                    setErrors((e) => ({ ...e, coFrom: false }))
                  }}
                  onClear={() => patchSel({ coFrom: '' })}
                />
                <div className="error-msg">{ERROR_MESSAGES.coFrom}</div>
              </div>

              <div className="field gc-3">
                <label>Company Code (To)</label>
                <SearchDropdown
                  {...companyProps}
                  selected={selectedTo}
                  onSelect={(c) => patchSel({ coTo: c.code })}
                  onClear={() => patchSel({ coTo: '' })}
                />
              </div>

              <div className={`field gc-3${errors.keyDate ? ' has-error' : ''}`}>
                <label>
                  Key Date<span className="req">*</span>
                </label>
                <DateField
                  value={sel.keyDate}
                  onChange={(v) => patchSel({ keyDate: v })}
                  onPicked={() => setErrors((e) => ({ ...e, keyDate: false }))}
                />
                <div className="error-msg">{ERROR_MESSAGES.keyDate}</div>
              </div>

              <div className="field gc-3">
                <label>Layout</label>
                <select className="control" value={sel.layout} onChange={(e) => patchSel({ layout: e.target.value })}>
                  {LAYOUTS.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-grid-12">
              <div className="field gc-6">
                <label>Report Type</label>
                <div className="pillgroup">
                  {(
                    [
                      ['FX', 'Forex'],
                      ['OP', 'Option'],
                    ] as const
                  ).map(([val, label]) => (
                    <div key={val} className={`pill${sel.dealType === val ? ' active' : ''}`} onClick={() => patchSel({ dealType: val })}>
                      <span className="dot"></span>
                      {label}
                    </div>
                  ))}
                </div>
              </div>
              <div className="field gc-6">
                <label>External Reference</label>
                <div className="pillgroup">
                  {(
                    [
                      [true, 'With External Reference'],
                      [false, 'Without External Reference'],
                    ] as const
                  ).map(([val, label]) => (
                    <div key={label} className={`pill${sel.withRef === val ? ' active' : ''}`} onClick={() => patchSel({ withRef: val })}>
                      <span className="dot"></span>
                      {label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="helper-note">
            <strong>Note:</strong> Key Date = Date on which deals in the system are without bank reference (includes open deals
            and expired deals).
          </div>
          <div className="sel-actions">
            <button type="button" className="btn btn-primary" onClick={execute}>
              Execute
            </button>
            <button type="button" className="btn btn-secondary" onClick={resetSelection}>
              Reset
            </button>
          </div>
        </div>

        {/* ============ Results ============ */}
        <div ref={resultsRef} className={`card${showResults ? '' : ' hidden'}`}>
          <div className="results-title">
            <span className="dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)' }}></span>
            <span>{resultsTitle(executed.dealType)}</span>
          </div>

          <div className="table-toolbar">
            <div className="search-box">
              <span className="icon">🔍</span>
              <input
                placeholder="Search deals..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
              />
            </div>
            <select className="control filter-select" value={colFilters.type} onChange={(e) => patchColFilters({ type: e.target.value })}>
              <option value="">All types</option>
              {txnTypesFor(executed.dealType).map((t) => (
                <option key={t.code} value={t.code}>
                  {t.desc}
                </option>
              ))}
            </select>
            <select className="control filter-select" value={colFilters.status} onChange={(e) => patchColFilters({ status: e.target.value })}>
              <option value="">All statuses</option>
              {TXN_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select className="control filter-select" value={colFilters.trader} onChange={(e) => patchColFilters({ trader: e.target.value })}>
              <option value="">All traders</option>
              {TRADERS.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.code} — {t.name}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-secondary btn-sm" onClick={resetFilters}>
              Reset
            </button>
            <button
              type="button"
              className={`btn btn-primary btn-sm${dragOver === 'update' ? ' drag-over' : ''}`}
              disabled={updateDisabled}
              onClick={doUpdateBankReference}
              {...dropTarget('update', updateDisabled, () => doUpdateBankReference())}
            >
              Update Bank Reference
            </button>
            <button
              type="button"
              className={`btn btn-secondary btn-sm${dragOver === 'view' ? ' drag-over' : ''}`}
              disabled={viewDisabled}
              onClick={() => {
                if (activeRowId) openViewTransaction(activeRowId)
              }}
              {...dropTarget('view', viewDisabled, (row) => openViewTransaction(row._id))}
            >
              View Transaction
            </button>
            <div className="icon-btn" title="Download" onClick={doDownload}>
              ⇩
            </div>
            <div className="toolbar-spacer"></div>
            <span className="result-count">{recordCountText(total)}</span>
          </div>

          <div className={`table-scroll${total === 0 ? ' hidden' : ''}`}>
            <DealGrid
              cols={cols}
              rows={pageRows}
              rowKeyPrefix={String(execSeq)}
              sort={sort}
              activeRowId={activeRowId}
              draggingId={draggingId}
              allPageChecked={allPageChecked}
              onSort={onSort}
              onToggleAll={onToggleAll}
              onToggleRow={onToggleRow}
              onRowClick={onRowClick}
              onView={openViewTransaction}
              onEdit={onEdit}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          </div>

          <div className={`empty-state${total === 0 ? '' : ' hidden'}`}>
            <div className="big">📋</div>
            No record found. No external deals match the selected criteria.
          </div>

          <div className={`table-footer${total === 0 ? ' hidden' : ''}`}>
            <div className="page-size-select">
              Rows per page
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(parseInt(e.target.value, 10))
                  setPage(1)
                }}
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div className="pagination">
              <button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
                ‹
              </button>
              {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
                <button key={p} type="button" className={p === currentPage ? 'active' : undefined} onClick={() => setPage(p)}>
                  {p}
                </button>
              ))}
              <button type="button" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>
                ›
              </button>
            </div>
          </div>
        </div>
      </div>

      <ViewTxnModal modal={viewModal} row={viewRow} isFx={executed.dealType === 'FX'} onClose={viewModal.close} />

      <div className={`toast${toast ? ' show' : ''}${toast?.error ? ' error' : ''}`}>{toast?.message}</div>

      <div ref={ghostRef} className="drag-ghost">
        {ghostText}
      </div>
    </div>
  )
}

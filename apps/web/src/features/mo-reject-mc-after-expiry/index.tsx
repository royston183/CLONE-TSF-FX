import { useMasterContractFeedback } from '../../shared/master-contract/Feedback.tsx'
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { messageOf } from '../../shared/fx/master-contract.ts'
import type { MasterSource } from '../../shared/fx/masters.ts'
import { isAbort } from '../../shared/fx/mw.ts'
import { ResultQueue, type ResultItem } from '../../shared/ui/ResultQueue.tsx'
import { loadContracts, loadMasters, rejectContracts, rejectKeys } from './api.ts'
import { ContractsTable, isInteractiveTarget } from './ContractsTable.tsx'
import { CO_AREA_MASTER, ENTITY_MASTER, FX_MODEL_MASTER, MC_STATUS_MASTER, REGION_MASTER, REGION_NAMES, seedContracts } from './data.ts'
import { DateField } from './DateField.tsx'
import { DetailsModal } from './DetailsModal.tsx'
import {
  BLANK_CRITERIA,
  BLANK_CRITERIA_FORM,
  DEFAULT_SORT,
  NO_FILTERS,
  activeFilterCount,
  applyCriteria,
  buildFilterOptions,
  currentColumns,
  filterSortRows,
  getCriteriaRows,
  nextSort,
  pageWindow,
  rejectMasterContracts,
  rejectToastText,
  setPageSelection,
  toggleSelection,
  validateCriteria,
} from './logic.ts'
import { useModal } from './modal.tsx'
import { RejectConfirmModal } from './RejectConfirmModal.tsx'
import { SearchSelect } from './SearchSelect.tsx'
import './mo-reject-mc-after-expiry.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './mo-reject-mc-after-expiry.dark.css'
import './mo-reject-mc-after-expiry.overrides.css'
import type {
  Criteria,
  CriteriaError,
  CriteriaForm,
  DropdownOption,
  Filters,
  Layout,
  MasterContract,
  Sort,
} from './types.ts'

const BRAND_LOGO =
  'https://raw.githubusercontent.com/ryannayak/fs-assets/e82f35a83e28689167b22b4300d4994a249acee0/fs-short-logo.png'
const DEFAULT_CRITERIA_MESSAGE = 'Please enter a valid Master Contract Date From and To.'
const FILTER_FIELDS: Array<[keyof Filters, string, string]> = [
  ['originEntity', 'fOriginEntity', 'Origin Entity'],
  ['fxModel', 'fFxModel', 'FX Model'],
  ['mcStatus', 'fMcStatus', 'MC Status'],
  ['commodity', 'fCommodity', 'Commodity'],
  ['currencyString', 'fCurrencyString', 'Currency String'],
  ['businessPartner', 'fBusinessPartner', 'Business Partner'],
]

type DragState = { anchorId: string; lastHoverId: string; droppedOnReject: boolean }

/**
 * MO: Reject MC after Expiry (ZSGTSFR097), converted from legacy/reject-mc-after-expiry.html.
 *
 * View Contracts reads ZSGTSFTR_MAS_CON through the SLC middleware (api.ts) with the
 * selection criteria, and Reject moves the selected contracts to status 13 there. If the
 * middleware cannot be reached the screen runs on its dummy contracts as before and
 * rejections stay on the screen.
 */
export default function MoRejectMcAfterExpiry() {
  const [contracts, setContracts] = useState<MasterContract[]>([])
  /** Where the loaded contracts came from; 'dummy' means writes cannot reach MySQL. */
  const [source, setSource] = useState<MasterSource | 'loading'>('loading')
  // Dummy mode keeps one table for the session, so its rejections survive a new selection.
  const dummyTable = useRef<MasterContract[] | null>(null)
  const masters = useRef<Promise<unknown>>(Promise.resolve())
  const [, setMastersLoaded] = useState(false)
  const selection = useRef<AbortController | null>(null)
  const busy = useRef(false)

  // Selection screen
  const [form, setForm] = useState<CriteriaForm>(BLANK_CRITERIA_FORM)
  const [criteria, setCriteria] = useState<Criteria>(BLANK_CRITERIA)
  const [criteriaError, setCriteriaError] = useState<CriteriaError | null>(null)
  const [resultsVisible, setResultsVisible] = useState(false)
  const [emptyVisible, setEmptyVisible] = useState(true)

  // Results — the working set is kept by number so a rejection shows in it at once, as it
  // did in the original, where the rows were the very objects of the master table.
  const [rowIds, setRowIds] = useState<string[]>([])
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [filterOpen, setFilterOpen] = useState(false)
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT)
  const [page, setPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(20)

  // Popups
  const confirmModal = useModal()
  const detailsModal = useModal()
  const [pendingIds, setPendingIds] = useState<string[]>([])
  const [detailsMc, setDetailsMc] = useState<string | null>(null)

<<<<<<< HEAD
  const feedback = useMasterContractFeedback()
  const showToast = useCallback((message: string, error = false) => {
    feedback.show(message, error ? 'error' : 'success')
  }, [feedback.show])
=======
  // Outcomes show as the standard ResultDialog queue; each stays until OK.
  const [outcomes, setOutcomes] = useState<ResultItem[]>([])
  const nextToastId = useRef(1)
  const dismissToast = useCallback((id: number) => {
    setOutcomes((list) => list.filter((t) => t.id !== id))
  }, [])
  const showToast = useCallback((message: string, error = false) => {
    const id = nextToastId.current++
    setOutcomes((list) => [...list, { id, tone: error ? 'error' : 'success', title: error ? 'Error' : 'Success', message }])
  }, [])
>>>>>>> origin/main

  // The value helps load once; View Contracts waits for them, since the rows are mapped with them.
  useEffect(() => {
    const controller = new AbortController()
    masters.current = loadMasters(controller.signal)
      .then(() => setMastersLoaded(true))
      .catch((error: unknown) => {
        if (!isAbort(error)) showToast(`Could not load the value helps: ${messageOf(error)}`, true)
      })
    return () => {
      controller.abort()
      selection.current?.abort()
    }
  }, [showToast])

  // Drag and drop
  const rootRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<DragState | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [rejectDragOver, setRejectDragOver] = useState(false)
  const selectedRef = useRef(selected)
  selectedRef.current = selected

  // ------------------------------------------------------------------ derived data

  const byNumber = useMemo(() => new Map(contracts.map((c) => [c.mcNumber, c])), [contracts])
  const rows = useMemo(
    () => rowIds.map((id) => byNumber.get(id)).filter((c): c is MasterContract => c !== undefined),
    [rowIds, byNumber],
  )
  // Rebuilt from the criteria against the live table, as the original's populateFilterOptions was.
  const filterOptions = useMemo(() => buildFilterOptions(getCriteriaRows(contracts, criteria)), [contracts, criteria])
  const filtered = useMemo(() => filterSortRows(rows, filters, search, sort), [rows, filters, search, sort])
  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage))
  const currentPage = Math.min(page, totalPages)
  const pageRows = filtered.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage)
  const columns = currentColumns(criteria.layout)
  const filterCount = activeFilterCount(filters)
  // Per render: the master lists are swapped for MySQL's rows once they load.
  const entityOptions: DropdownOption[] = ENTITY_MASTER.map((e) => ({ value: e.code, code: e.code, sub: e.name }))
  const fxOptions: DropdownOption[] = FX_MODEL_MASTER.map((f) => ({ value: f.code, code: f.code, sub: f.desc }))

  // ------------------------------------------------------------------ selection screen

  const setField = <K extends keyof CriteriaForm>(key: K, value: CriteriaForm[K]) => setForm((f) => ({ ...f, [key]: value }))

  /** Reads the contracts for the criteria: MySQL's answer, or the session's dummy table. */
  const select = useCallback(async (applied: Criteria): Promise<MasterContract[] | null> => {
    selection.current?.abort()
    const controller = new AbortController()
    selection.current = controller
    setSource('loading')
    try {
      await masters.current
      const loaded = await loadContracts(applied, controller.signal)
      if (controller.signal.aborted) return null
      const list = loaded.source === 'mysql' ? loaded.contracts : (dummyTable.current ??= seedContracts())
      setContracts(list)
      setSource(loaded.source)
      return list
    } catch (error) {
      if (!isAbort(error)) showToast(`Could not load Master Contracts: ${messageOf(error)}`, true)
      return null
    }
  }, [showToast])

  const viewContracts = async () => {
    const result = validateCriteria(form.mcDateFrom, form.mcDateTo)
    if (!result.ok) {
      setCriteriaError(result.error)
      setResultsVisible(false)
      return
    }
    setCriteriaError(null)
    const applied = applyCriteria(form, result.from, result.to)
    setForm(applied.form)
    setCriteria(applied.criteria)
    const list = await select(applied.criteria)
    if (!list) return
    // The middleware applied what it could; the screen's own rules run over its answer too.
    setRowIds(getCriteriaRows(list, applied.criteria).map((c) => c.mcNumber))
    setSelected(new Set())
    setPage(1)
    setSearch('')
    setSort(DEFAULT_SORT)
    setFilters(NO_FILTERS)
    setFilterOpen(false)
    setEmptyVisible(false)
    setResultsVisible(true)
  }

  const resetCriteria = () => {
    setForm(BLANK_CRITERIA_FORM)
    setCriteriaError(null)
    setCriteria(BLANK_CRITERIA)
    setResultsVisible(false)
    setEmptyVisible(true)
  }

  // ------------------------------------------------------------------ table

  const setFilter = (key: keyof Filters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }))
    setPage(1)
  }

  const toggleRow = (id: string) => setSelected((s) => toggleSelection(s, byNumber.get(id)))

  const onCheck = (id: string, checked: boolean) =>
    setSelected((s) => {
      const next = new Set(s)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })

  const openDetails = (id: string) => {
    if (!byNumber.has(id)) return
    setDetailsMc(id)
    detailsModal.open()
  }

  // ------------------------------------------------------------------ reject flow

  const openRejectConfirm = () => {
    const ids = [...selectedRef.current]
    if (ids.length === 0) return
    setPendingIds(ids)
    confirmModal.open()
  }

  // The ids are left in place while the popup animates out; the next open replaces them.
  const cancelConfirm = confirmModal.close

  const confirmReject = async () => {
    if (busy.current) return
    const ids = pendingIds
    if (source === 'mysql') {
      busy.current = true
      try {
        await rejectContracts(rejectKeys(contracts, ids))
      } catch (error) {
        showToast(messageOf(error), true)
        confirmModal.close()
        // Whatever did move is re-read, so the grid never shows a status MySQL lacks.
        const list = await select(criteria)
        if (list) {
          setRowIds(getCriteriaRows(list, criteria).map((c) => c.mcNumber))
          setSelected(new Set())
        }
        return
      } finally {
        busy.current = false
      }
    } else if (source === 'dummy' && dummyTable.current) {
      dummyTable.current = rejectMasterContracts(dummyTable.current, ids)
    } else {
      return
    }
    setContracts((list) => rejectMasterContracts(list, ids))
    setSelected(new Set())
    confirmModal.close()
    showToast(rejectToastText(ids))
  }

  // ------------------------------------------------------------------ drag-range selection

  const onDragStart = (e: DragEvent<HTMLTableRowElement>, id: string) => {
    if (isInteractiveTarget(e.target) || !selectedRef.current.has(id)) {
      e.preventDefault()
      return
    }
    dragState.current = { anchorId: id, lastHoverId: id, droppedOnReject: false }
    setDraggingId(id)

    const count = selectedRef.current.size
    // The ghost has to live inside .mormc for the scoped stylesheet to reach it.
    const ghost = document.createElement('div')
    ghost.className = 'drag-ghost'
    ghost.textContent = count > 1 ? `${count} Master Contracts selected` : `MC ${id}`
    ;(rootRef.current ?? document.body).appendChild(ghost)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
    e.dataTransfer.setDragImage(ghost, 12, 14)
    setTimeout(() => ghost.remove(), 0)
  }

  /** Sweeping over other rows' checkbox or status cells toggles each one entered. */
  const onDragOver = (e: DragEvent<HTMLTableRowElement>, id: string) => {
    const drag = dragState.current
    if (!drag) return
    if (!(e.target instanceof Element) || !e.target.closest('.col-action, .col-status')) return
    if (id === drag.lastHoverId) return
    drag.lastHoverId = id
    setHoverId(id)
    if (id !== drag.anchorId) toggleRow(id)
  }

  const onDragEnd = () => {
    const drag = dragState.current
    if (!drag) return
    dragState.current = null
    setDraggingId(null)
    setHoverId(null)
    if (drag.droppedOnReject) openRejectConfirm()
  }

  // ------------------------------------------------------------------ keyboard

  const escapeRef = useRef<() => void>(() => {})
  // Calendars and dropdowns close themselves on Escape.
  escapeRef.current = () => {
    cancelConfirm()
    detailsModal.close()
    dragState.current = null
    setDraggingId(null)
    setHoverId(null)
    setRejectDragOver(false)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') escapeRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="mormc" ref={rootRef}>
      <div className="app-shell">
        {/* PAGE HEADER */}
        <div className="page-header">
          <BackButton className="fx-back-btn" />
          <img className="logo-img" src={BRAND_LOGO} alt="FS logo" />
          <div className="titles">
            <h1>Reject MC after Expiry</h1>
          </div>
          <div className="header-actions" style={{ marginLeft: 'auto' }}>
            <SignOutButton className="btn btn-secondary" />
          </div>
        </div>

        {/* SELECTION CRITERIA */}
        <div className="card">
          <div className="selection-row">
            <div className="selection-col selection-col-basic">
              <p className="card-title">Basic Selection</p>
              <div className="field-row">
                <DateField
                  id="mcDateFrom"
                  label="Master Contract Date — From"
                  value={form.mcDateFrom}
                  invalid={!!criteriaError?.from}
                  onChange={(v) => setField('mcDateFrom', v)}
                />
                <DateField
                  id="mcDateTo"
                  label="Master Contract Date — To"
                  value={form.mcDateTo}
                  invalid={!!criteriaError?.to}
                  onChange={(v) => setField('mcDateTo', v)}
                />
                <div className="field">
                  <label htmlFor="mcFrom">Master Contract — From</label>
                  <input
                    className="control"
                    id="mcFrom"
                    type="text"
                    placeholder="e.g. 2000002700"
                    autoComplete="off"
                    value={form.mcFrom}
                    onChange={(e) => setField('mcFrom', e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="mcTo">Master Contract — To</label>
                  <input
                    className="control"
                    id="mcTo"
                    type="text"
                    placeholder="e.g. 2000002799"
                    autoComplete="off"
                    value={form.mcTo}
                    onChange={(e) => setField('mcTo', e.target.value)}
                  />
                </div>
              </div>
              <span className={`field-error${criteriaError ? ' show' : ''}`} id="criteriaError">
                {criteriaError?.message ?? DEFAULT_CRITERIA_MESSAGE}
              </span>
            </div>

            <div className="selection-divider" />

            <div className="selection-col selection-col-posting">
              <p className="card-title">Optional Selection</p>
              <div className="field-row">
                <SearchSelect
                  id="originEntityInput"
                  label="Origin Entity"
                  value={form.originEntity}
                  options={entityOptions}
                  onChange={(v) => setField('originEntity', v)}
                />
                <PlainSelect
                  id="regionSelect"
                  label="Region"
                  value={form.region}
                  options={REGION_MASTER}
                  labels={REGION_NAMES}
                  onChange={(v) => setField('region', v)}
                />
                <SearchSelect
                  id="fxModelInput"
                  label="FX Model"
                  value={form.fxModel}
                  options={fxOptions}
                  onChange={(v) => setField('fxModel', v)}
                />
                <PlainSelect
                  id="coAreaSelect"
                  label="CO Area"
                  value={form.coArea}
                  options={CO_AREA_MASTER}
                  onChange={(v) => setField('coArea', v)}
                />
                <PlainSelect
                  id="mcStatusSelect"
                  label="MC Status"
                  value={form.mcStatus}
                  options={MC_STATUS_MASTER}
                  onChange={(v) => setField('mcStatus', v)}
                />
                <div className="field">
                  <label htmlFor="layoutSelect">Layout</label>
                  <select
                    className="control"
                    id="layoutSelect"
                    value={form.layout}
                    onChange={(e) => setField('layout', e.target.value as Layout)}
                  >
                    <option value="default">Default Layout</option>
                    <option value="compact">Compact View</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="selection-divider" />

            <div className="selection-col selection-col-actions">
              <button className="btn btn-primary" id="viewContractsBtn" onClick={viewContracts}>
                View Contracts
              </button>
              <button className="btn btn-secondary" id="resetCriteriaBtn" onClick={resetCriteria}>
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* RESULTS CARD */}
        <div className="card" id="resultsCard" style={{ marginTop: 14, display: resultsVisible ? 'block' : 'none' }}>
          <div className="table-toolbar">
            <div className="toolbar-left">
              <div className="search-box">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                  <path d="M21 21L16.65 16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <input
                  type="text"
                  id="searchInput"
                  placeholder="Search MC Number, Reference, Entity, Commodity, Status..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setPage(1)
                  }}
                />
              </div>
              <button
                className={`btn btn-secondary btn-filter${filterCount > 0 ? ' active' : ''}`}
                id="filterToggleBtn"
                type="button"
                onClick={() => setFilterOpen((o) => !o)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M4 5H20L14 12.5V19L10 21V12.5L4 5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                </svg>
                Filters
                <span className="filter-count" id="filterCountBadge" style={{ display: filterCount > 0 ? 'inline-flex' : 'none' }}>
                  {filterCount}
                </span>
              </button>

              <div className={`filter-panel${filterOpen ? ' open' : ''}`} id="filterPanel">
                {FILTER_FIELDS.map(([key, id, label]) => (
                  <div className="field" key={key}>
                    <label htmlFor={id}>{label}</label>
                    <select className="control" id={id} value={filters[key]} onChange={(e) => setFilter(key, e.target.value)}>
                      <option value="">All</option>
                      {filterOptions[key].map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
                <button
                  className="btn btn-ghost btn-sm"
                  id="clearFiltersBtn"
                  type="button"
                  onClick={() => {
                    setFilters(NO_FILTERS)
                    setPage(1)
                  }}
                >
                  Clear Filters
                </button>
              </div>

              <span className="result-count" id="resultCount">
                Showing <b>{pageRows.length}</b> of <b>{filtered.length}</b> contract{filtered.length === 1 ? '' : 's'}
              </span>
              <SourceNote source={source} />
            </div>
            <div className="toolbar-right">
              <span className="result-count" id="selCount" style={{ display: selected.size > 0 ? 'inline' : 'none' }}>
                {selected.size} selected
              </span>
              <button
                className={`btn btn-danger${rejectDragOver ? ' expiry-drag-over' : ''}`}
                id="rejectBtn"
                disabled={selected.size === 0}
                onClick={openRejectConfirm}
                onDragOver={(e) => {
                  if (!dragState.current) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  setRejectDragOver(true)
                }}
                onDragLeave={() => setRejectDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setRejectDragOver(false)
                  // The confirmation opens once the drag has ended (onDragEnd).
                  if (dragState.current) dragState.current.droppedOnReject = true
                }}
              >
                Reject
              </button>
              <select
                className="rpp-select"
                id="rppSelect"
                title="Rows per page"
                value={rowsPerPage}
                onChange={(e) => {
                  setRowsPerPage(parseInt(e.target.value, 10))
                  setPage(1)
                }}
              >
                <option value={10}>10 / page</option>
                <option value={20}>20 / page</option>
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
              </select>
            </div>
          </div>

          <div className="table-wrap" id="tableWrap">
            {filtered.length === 0 ? (
              <div className="empty-state">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                  <path d="M9 12H15M9 16H15M9 8H15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  <rect x="4" y="4" width="16" height="17" rx="2" stroke="currentColor" strokeWidth="1.6" />
                </svg>
                <div className="es-title">No Master Contracts found</div>
                <div className="es-sub">No contracts match the selected criteria.</div>
              </div>
            ) : (
              <ContractsTable
                columns={columns}
                rows={pageRows}
                sort={sort}
                selected={selected}
                draggingId={draggingId}
                hoverId={hoverId}
                onSort={(field) => setSort((s) => nextSort(s, field))}
                onSelectAll={(checked) => setSelected((s) => setPageSelection(s, pageRows, checked))}
                onCheck={onCheck}
                onToggle={toggleRow}
                onOpen={openDetails}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDragEnd={onDragEnd}
              />
            )}
          </div>

          <div className="pagination-bar" id="paginationBar">
            {filtered.length > 0 ? (
              <>
                <div className="pg-btns">
                  <button className="pg-btn" id="pgPrev" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
                    ‹
                  </button>
                  {pageWindow(currentPage, totalPages).map((p) => (
                    <button
                      key={p}
                      className={`pg-btn ${p === currentPage ? 'active' : ''}`}
                      data-page={p}
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    className="pg-btn"
                    id="pgNext"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    ›
                  </button>
                </div>
                <span className="result-count">
                  Page {currentPage} of {totalPages}
                </span>
              </>
            ) : null}
          </div>
        </div>

        {/* EMPTY STATE (before criteria executed) */}
        <div className="card" id="emptyCriteriaCard" style={{ marginTop: 14, display: emptyVisible ? 'block' : 'none' }}>
          <div className="empty-state">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
              <path d="M3 9.5H21" stroke="currentColor" strokeWidth="1.6" />
              <path d="M8 3V6.5M16 3V6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <div className="es-title">Enter selection criteria to begin</div>
            <div className="es-sub">Enter a Master Contract Date range or other filters to load Master Contracts.</div>
          </div>
        </div>
      </div>

      <RejectConfirmModal modal={confirmModal} ids={pendingIds} onCancel={cancelConfirm} onReject={confirmReject} />

      <DetailsModal modal={detailsModal} contract={detailsMc === null ? undefined : byNumber.get(detailsMc)} onClose={detailsModal.close} />

<<<<<<< HEAD
      {/* TOASTS */}
      <div id="toastWrap">{feedback.element}</div>
=======
      <ResultQueue items={outcomes} onDismiss={dismissToast} />
>>>>>>> origin/main
    </div>
  )
}

/** Says where the rows came from, so dummy data is never mistaken for MySQL's. */
function SourceNote({ source }: { source: MasterSource | 'loading' }) {
  const text =
    source === 'loading'
      ? 'Loading from MySQL…'
      : source === 'mysql'
        ? 'ZSGTSFTR_MAS_CON · MySQL'
        : 'Dummy data — the middleware could not be reached, so changes stay on this screen'
  return <span style={{ marginLeft: 10, fontSize: 11, fontWeight: 500, opacity: 0.7 }}>{text}</span>
}

function PlainSelect({
  id,
  label,
  value,
  options,
  labels = {},
  onChange,
}: {
  id: string
  label: string
  value: string
  options: readonly string[]
  /** Text shown beside a value, "<value> - <text>". */
  labels?: Readonly<Record<string, string>>
  onChange: (value: string) => void
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select className="control" id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select ...</option>
        {options.map((v) => (
          <option key={v} value={v}>
            {labels[v] ? `${v} - ${labels[v]}` : v}
          </option>
        ))}
      </select>
    </div>
  )
}

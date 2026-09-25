import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { messageOf } from '../../shared/fx/master-contract.ts'
import type { MasterSource } from '../../shared/fx/masters.ts'
import { isAbort } from '../../shared/fx/mw.ts'
import { expireOnMysql, loadContracts } from './api.ts'
import { ConfirmExpiryModal } from './ConfirmExpiryModal.tsx'
import { ContractDetailModal } from './ContractDetailModal.tsx'
import { ContractsTable } from './ContractsTable.tsx'
import { parseDMY } from './format.ts'
import { KeyDateField } from './KeyDateField.tsx'
import {
  KEY_DATE_REQUIRED,
  batchConfirm,
  dragLabel,
  eligibleIds,
  expireContracts,
  expiredToast,
  filterSortRows,
  loadScreen,
  manualConfirm,
  maskKeyDate,
  pageWindow,
  postingBannerText,
  setPageSelection,
  toggleSelection,
  validateKeyDate,
} from './logic.ts'
import { useModal } from './modal.tsx'
import './mo-update-mc-expiry.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './mo-update-mc-expiry.dark.css'
import type { ExpiryConfirm, MasterContract, PostingMode, Sort, SortField, Toast } from './types.ts'

const BRAND_LOGO =
  'https://raw.githubusercontent.com/ryannayak/fs-assets/e82f35a83e28689167b22b4300d4994a249acee0/fs-short-logo.png'
const DEFAULT_SORT: Sort = { field: 'mcNumber', dir: 'asc' }
const NO_SELECTION: ReadonlySet<string> = new Set()

/** Anything inside a row that has a click of its own, so the row itself is not toggled. */
const isInteractiveTarget = (target: Element) => !!target.closest('.row-chk, .mc-link, button, input, select, a, .chk')
const rowIdOf = (target: EventTarget) => (target as Element).closest?.('tr[data-id]')?.getAttribute('data-id') ?? null

/** A drag in progress: the row picked up, the row last swept over, and whether it hit Expiry Update. */
type DragState = { anchorId: string; lastHoverId: string; droppedOnExpiry: boolean }

/**
 * MO: Update MC Expiry (ZSGTSFR049), converted from legacy/master-contract-expiry.html.
 *
 * Master Contracts are read from ZSGTSFTR_MAS_CON through the SLC middleware (api.ts), and an
 * expiry — manual or posted — moves ZMC_STAT 04 -> 09 there before the screen changes. If the
 * middleware cannot be reached the screen runs on its dummy contracts as before, and an
 * expiry sticks only until the page is left.
 */
export default function MoUpdateMcExpiry() {
  const [contracts, setContracts] = useState<MasterContract[]>([])
  /** Where the contract list came from; 'dummy' means expiries cannot reach MySQL. */
  const [source, setSource] = useState<MasterSource | 'loading'>('loading')
  const busy = useRef(false)

  // Selection screen
  const [keyDateText, setKeyDateText] = useState('')
  const [keyDateInvalid, setKeyDateInvalid] = useState(false)
  const [keyDateError, setKeyDateError] = useState(KEY_DATE_REQUIRED)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [keyDate, setKeyDate] = useState<Date | null>(null)
  const [postingMode, setPostingMode] = useState<PostingMode>('view')

  // Results
  const [loaded, setLoaded] = useState(false)
  const [rowIds, setRowIds] = useState<string[]>([])
  const [banner, setBanner] = useState<{ keyDate: Date; posted: number } | null>(null)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT)
  const [page, setPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(20)

  // Selection is mirrored in a ref so drag handlers, which fire between renders, read it current.
  const selectedRef = useRef<ReadonlySet<string>>(NO_SELECTION)
  const [selected, setSelected] = useState<ReadonlySet<string>>(NO_SELECTION)
  const updateSelected = useCallback((next: ReadonlySet<string>) => {
    selectedRef.current = next
    setSelected(next)
  }, [])

  // Popups
  const confirmModal = useModal()
  const detailModal = useModal()
  const [confirm, setConfirm] = useState<ExpiryConfirm | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastSeq = useRef(0)
  const toastTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>())
  const dismissToast = useCallback((id: number) => {
    clearTimeout(toastTimers.current.get(id))
    toastTimers.current.delete(id)
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])
  const showToast = useCallback(
    (message: string) => {
      const id = ++toastSeq.current
      setToasts((list) => [...list, { id, message }])
      toastTimers.current.set(
        id,
        setTimeout(() => dismissToast(id), 5000),
      )
    },
    [dismissToast],
  )
  useEffect(() => {
    const timers = toastTimers.current
    return () => {
      for (const t of timers.values()) clearTimeout(t)
    }
  }, [])

  const reload = useCallback(async (signal?: AbortSignal) => {
    const loaded = await loadContracts(signal)
    setContracts(loaded.contracts)
    setSource(loaded.source)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    reload(controller.signal).catch((error: unknown) => {
      if (!isAbort(error)) showToast(`Could not load Master Contracts: ${messageOf(error)}`)
    })
    return () => controller.abort()
  }, [reload, showToast])

  /**
   * Moves the listed MCs 04 -> 09 in MySQL first; true when the screen may follow. On a
   * failure the list is re-read, so a partly posted batch shows what really moved. On success
   * it is re-read in the background too, for the ZCHANGED_* stamp the update wrote.
   */
  const persistExpiry = async (list: readonly MasterContract[], ids: readonly string[]): Promise<boolean> => {
    if (source !== 'mysql') return true
    try {
      await expireOnMysql(list, ids)
      void reload().catch(() => undefined)
      return true
    } catch (error) {
      showToast(messageOf(error))
      await reload().catch(() => undefined)
      return false
    }
  }

  // Drag and drop
  const rootRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [expiryDragOver, setExpiryDragOver] = useState(false)

  // ------------------------------------------------------------------ core flow

  /** loadScreenData: validate the Key Date, then list (or post) the eligible contracts. */
  const loadScreenData = async (text: string, mode: PostingMode) => {
    if (busy.current) return
    if (source === 'loading') {
      showToast('Master Contracts are still loading. Try again in a moment.')
      return
    }
    const check = validateKeyDate(text)
    if (!check.ok) {
      setKeyDateInvalid(true)
      setKeyDateError(check.error)
      setLoaded(false)
      return
    }
    setKeyDateInvalid(false)
    setKeyDate(check.date)
    if (mode === 'post') {
      // postExpiryProcess: every eligible MC is posted to 09 before the screen shows it expired.
      busy.current = true
      try {
        if (!(await persistExpiry(contracts, eligibleIds(contracts, check.date)))) return
      } finally {
        busy.current = false
      }
    }
    const result = loadScreen(contracts, check.date, mode)
    setContracts(result.contracts)
    setRowIds(result.rowIds)
    updateSelected(NO_SELECTION)
    setPage(1)
    setSearch('')
    setSort(DEFAULT_SORT)
    setBanner(mode === 'post' && result.posted > 0 ? { keyDate: check.date, posted: result.posted } : null)
    setLoaded(true)
  }

  const onKeyDateBlur = () => {
    const text = keyDateText.trim()
    if (text && parseDMY(text)) {
      setKeyDateInvalid(false)
      void loadScreenData(keyDateText, postingMode)
    }
  }

  const onPick = (dmy: string) => {
    setKeyDateText(dmy)
    void loadScreenData(dmy, postingMode)
  }

  const onPostingMode = (mode: PostingMode) => {
    // Choosing "MC View with Expiry Posting" asks first; the radio only moves once confirmed.
    if (mode === 'post' && postingMode !== 'post' && keyDate) {
      const ids = eligibleIds(contracts, keyDate)
      if (ids.length === 0) {
        showToast('No Master Contracts are eligible for expiry for the selected Key Date.')
        return
      }
      setConfirm(batchConfirm(ids))
      confirmModal.open()
      return
    }
    setPostingMode(mode)
    if (keyDate) void loadScreenData(keyDateText, mode)
  }

  // ------------------------------------------------------------------ expiry confirmation

  const openExpiryConfirm = () => {
    const ids = [...selectedRef.current]
    if (ids.length === 0) return
    setConfirm(manualConfirm(ids))
    confirmModal.open()
  }

  const cancelConfirm = confirmModal.close

  const onExpire = async () => {
    if (!confirm || confirmModal.state !== 'open' || busy.current) return
    confirmModal.close()
    if (confirm.mode === 'batch') {
      // The existing pipeline: postExpiryProcess(ids) + table refresh + banner.
      setPostingMode('post')
      await loadScreenData(keyDateText, 'post')
      return
    }
    const { ids } = confirm
    busy.current = true
    try {
      if (!(await persistExpiry(contracts, ids))) return
    } finally {
      busy.current = false
    }
    setContracts((list) => expireContracts(list, ids))
    updateSelected(NO_SELECTION)
    showToast(expiredToast(ids))
  }

  // ------------------------------------------------------------------ details

  const openDetails = (id: string) => {
    if (!contracts.some((c) => c.mcNumber === id)) return
    setDetailId(id)
    detailModal.open()
  }

  const escapeRef = useRef<() => void>(() => {})
  escapeRef.current = () => {
    cancelConfirm()
    detailModal.close()
    setCalendarOpen(false)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') escapeRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // ------------------------------------------------------------------ table

  const byId = useMemo(() => new Map(contracts.map((c) => [c.mcNumber, c])), [contracts])
  const rows = useMemo(() => rowIds.flatMap((id) => byId.get(id) ?? []), [rowIds, byId])
  const filtered = useMemo(() => filterSortRows(rows, search, sort), [rows, search, sort])
  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage))
  const currentPage = Math.min(page, totalPages)
  const pageRows = filtered.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage)
  const allPageSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(r.mcNumber))
  const selCount = selected.size

  const onSort = (field: SortField) =>
    setSort((s) => (s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' }))

  const toggleRow = (id: string) => updateSelected(toggleSelection(selectedRef.current, byId.get(id)))

  const onCheck = (id: string, checked: boolean) => {
    const next = new Set(selectedRef.current)
    if (checked) next.add(id)
    else next.delete(id)
    updateSelected(next)
  }

  // Row selection and drag-range selection ("MC View Only"). Every path — checkbox, row click,
  // drag sweep — feeds the same selection used by Expiry Update. The listeners sit on the
  // stable .table-wrap, as in the original.

  const onWrapClick = (e: MouseEvent<HTMLDivElement>) => {
    if (postingMode !== 'view') return
    const id = rowIdOf(e.target)
    if (!id || isInteractiveTarget(e.target as Element)) return
    toggleRow(id)
  }

  const onWrapDoubleClick = (e: MouseEvent<HTMLDivElement>) => {
    const id = rowIdOf(e.target)
    if (id) openDetails(id)
  }

  const onWrapDragStart = (e: DragEvent<HTMLDivElement>) => {
    const id = rowIdOf(e.target)
    if (postingMode !== 'view' || !id || isInteractiveTarget(e.target as Element) || !selectedRef.current.has(id)) {
      e.preventDefault()
      return
    }
    dragRef.current = { anchorId: id, lastHoverId: id, droppedOnExpiry: false }
    setDraggingId(id)
    // The ghost is a compact label, not the full row, and has to live inside .moume for the
    // scoped stylesheet to reach it.
    const ghost = document.createElement('div')
    ghost.className = 'drag-ghost'
    ghost.textContent = dragLabel(selectedRef.current.size, id)
    ;(rootRef.current ?? document.body).appendChild(ghost)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
    e.dataTransfer.setDragImage(ghost, 12, 14)
    setTimeout(() => ghost.remove(), 0)
  }

  // Sweeping over a row's checkbox or status cell toggles it exactly like a click would. The
  // anchor row stays selected so it is never dropped from its own carry.
  const onWrapDragOver = (e: DragEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const id = rowIdOf(e.target)
    if (!id || !(e.target as Element).closest('.col-action, .col-status')) return
    if (id === drag.lastHoverId) return
    drag.lastHoverId = id
    setHoverId(id)
    if (id !== drag.anchorId) toggleRow(id)
  }

  const onWrapDragEnd = () => {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    setDraggingId(null)
    setHoverId(null)
    if (drag.droppedOnExpiry) openExpiryConfirm()
  }

  const results = loaded ? (
    <>
      <div
        className="table-wrap"
        id="tableWrap"
        onClick={onWrapClick}
        onDoubleClick={onWrapDoubleClick}
        onDragStart={onWrapDragStart}
        onDragOver={onWrapDragOver}
        onDragEnd={onWrapDragEnd}
      >
        {filtered.length === 0 ? (
          <div className="empty-state">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
              <path d="M9 12H15M9 16H15M9 8H15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <rect x="4" y="4" width="16" height="17" rx="2" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            <div className="es-title">No Master Contracts found for the selected Key Date.</div>
            <div className="es-sub">Try a different Key Date or review the posting selection.</div>
          </div>
        ) : (
          <ContractsTable
            mode={postingMode}
            rows={pageRows}
            sort={sort}
            selected={selected}
            allPageSelected={allPageSelected}
            draggingId={draggingId}
            hoverId={hoverId}
            onSort={onSort}
            onSelectAll={(checked) => updateSelected(setPageSelection(selectedRef.current, pageRows, checked))}
            onCheck={onCheck}
            onOpen={openDetails}
          />
        )}
      </div>

      <div className="pagination-bar" id="paginationBar">
        {filtered.length > 0 ? (
          <>
            <div className="pg-btns">
              <button className="pg-btn" type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
                ‹
              </button>
              {pageWindow(currentPage, totalPages).map((p) => (
                <button key={p} className={`pg-btn${p === currentPage ? ' active' : ''}`} type="button" onClick={() => setPage(p)}>
                  {p}
                </button>
              ))}
              <button
                className="pg-btn"
                type="button"
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
    </>
  ) : null

  return (
    <div className="moume" ref={rootRef}>
      <div className="app-shell">
        <div className="page-header">
          <BackButton className="btn btn-secondary" />
          <img className="logo-img" src={BRAND_LOGO} alt="FS logo" />
          <div className="titles">
            <h1>Master Contract Expiry</h1>
          </div>
          <div className="header-actions" style={{ marginLeft: 'auto' }}>
            <SignOutButton className="btn btn-secondary" />
          </div>
        </div>

        <div className="card">
          <div className="selection-row">
            <div className="selection-col selection-col-basic">
              <p className="card-title">Basic Selection</p>
              <div className="field-row">
                <KeyDateField
                  value={keyDateText}
                  invalid={keyDateInvalid}
                  error={keyDateError}
                  open={calendarOpen}
                  onOpenChange={setCalendarOpen}
                  onType={(raw) => setKeyDateText(maskKeyDate(raw))}
                  onBlur={onKeyDateBlur}
                  onEnter={() => void loadScreenData(keyDateText, postingMode)}
                  onPick={onPick}
                />
              </div>
            </div>

            <div className="selection-divider" />

            <div className="selection-col selection-col-posting">
              <p className="card-title">Posting Selection</p>
              <div className="radio-group" id="postingSelection">
                <label className="radio-opt">
                  <input
                    type="radio"
                    name="postingMode"
                    value="view"
                    checked={postingMode === 'view'}
                    onChange={() => onPostingMode('view')}
                  />
                  <span className="radio-opt-inner">
                    <span className="opt-label">MC View Only</span>
                    <span className="opt-sub">View and manually update expiry</span>
                  </span>
                </label>
                <label className="radio-opt">
                  <input
                    type="radio"
                    name="postingMode"
                    value="post"
                    checked={postingMode === 'post'}
                    onChange={() => onPostingMode('post')}
                  />
                  <span className="radio-opt-inner">
                    <span className="opt-label">MC View with Expiry Posting</span>
                    <span className="opt-sub">Automatically expire all eligible contracts</span>
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="card" id="resultsCard" style={{ marginTop: '14px', display: loaded ? 'block' : 'none' }}>
          {banner ? (
            <div id="autoPostBanner" className="hint-banner success" style={{ display: 'flex' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: '1px' }}>
                <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>
                <b>Expiry posting completed</b> {postingBannerText(banner.keyDate, banner.posted)}
              </span>
            </div>
          ) : null}

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
              <span className="result-count" id="resultCount">
                Showing <b>{pageRows.length}</b> of <b>{filtered.length}</b> contract{filtered.length === 1 ? '' : 's'}
              </span>
              <SourceNote source={source} />
            </div>
            <div className="toolbar-right">
              <span
                className="result-count"
                id="selCount"
                style={{ display: postingMode === 'view' && selCount > 0 ? 'inline' : 'none' }}
              >
                {selCount} selected
              </span>
              <button
                className={`btn btn-primary${expiryDragOver ? ' expiry-drag-over' : ''}`}
                id="expiryUpdateBtn"
                type="button"
                style={{ display: postingMode === 'view' ? 'inline-flex' : 'none' }}
                disabled={selCount === 0}
                onClick={openExpiryConfirm}
                onDragOver={(e) => {
                  if (!dragRef.current) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  setExpiryDragOver(true)
                }}
                onDragLeave={() => setExpiryDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setExpiryDragOver(false)
                  if (dragRef.current) dragRef.current.droppedOnExpiry = true
                }}
              >
                Expiry Update
              </button>
              <select
                className="rpp-select"
                id="rppSelect"
                title="Rows per page"
                value={rowsPerPage}
                onChange={(e) => {
                  setRowsPerPage(Number(e.target.value))
                  setPage(1)
                }}
              >
                <option value={10}>10 / page</option>
                <option value={15}>15 / page</option>
                <option value={20}>20 / page</option>
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
              </select>
            </div>
          </div>

          {results}
        </div>

        <div className="card" id="emptyKeyDateCard" style={{ marginTop: '14px', display: loaded ? 'none' : 'block' }}>
          <div className="empty-state">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
              <path d="M3 9.5H21" stroke="currentColor" strokeWidth="1.6" />
              <path d="M8 3V6.5M16 3V6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <div className="es-title">Enter a Key Date to begin</div>
            <div className="es-sub">Select a posting mode above and enter the Key Date to load eligible Master Contracts.</div>
          </div>
        </div>
      </div>

      <ConfirmExpiryModal modal={confirmModal} confirm={confirm} onCancel={cancelConfirm} onExpire={() => void onExpire()} />

      <ContractDetailModal
        modal={detailModal}
        contract={detailId === null ? undefined : byId.get(detailId)}
        keyDate={keyDate}
      />

      <div className="toast-wrap" id="toastWrap">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <svg className="toast-icon" width="17" height="17" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" />
              <path d="M8 12.5L10.7 15L16 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{t.message}</span>
            <button className="toast-close" type="button" aria-label="Dismiss" onClick={() => dismissToast(t.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
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

/**
 * FX NDF Settlement — SAP program ZSGTSFR028 (bank settlement of TSF NDF deals: view the deals,
 * preview / print the bank settlement letter, and run the TBB1 posting run in test or update mode).
 *
 * Real SAP data (see ./api.ts): company codes from T001 (A_CompanyCode), the deals from ZSGTSFV_FX
 * (middleware "tsfvFx", column-gated -> WAITING FOR API while the view lacks TXN_STATUS and the NDF
 * fields), the letter form name from ZSGTSFTR_BS_PDF. Posting (RFTBBB00 / TBB1), the status update
 * to 50, the bank letter class and the Adobe form have no API: those actions validate as before and
 * then show WAITING FOR ACTION API without changing anything. No sample data at runtime.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { FS_SHORT_LOGO } from '../../shared/fx/logo.ts'
import { CompanySelect, DateField, SearchDropdown } from './controls.tsx'
import { loadCompanies, loadDeals, loadLetterFormName } from './api.ts'
import { CONFIRM_DELAY_MS, DEFAULTS, PAGE_SIZES, TOAST_MS } from './data.ts'
import { DealTable } from './DealTable.tsx'
import { isoToDmy } from './format.ts'
import './fx-ndf-settlement.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './fx-ndf-settlement.dark.css'
// Hand-written deviation from the generated sheet (the header's button group) — see inside.
import './fx-ndf-settlement.overrides.css'
import {
  NO_SORT,
  commitTypedDate,
  defaultCriteria,
  emptyText,
  findLayout,
  getData,
  getVisibleRows,
  keyDateOf,
  layoutItems,
  nextSort,
  pageSlice,
  pdfView,
  postAllView,
  rfhaItems,
  rowId,
  singlePostView,
  singleTestView,
  validateCriteria,
} from './logic.ts'
import { useModal } from './modal.tsx'
import { ConfirmModal, FiDocumentModal, LetterModal, RunModal, TransactionModal } from './Modals.tsx'
import type {
  ActionName,
  ColumnKey,
  CompanyOption,
  ConfirmRequest,
  CriteriaKey,
  Deal,
  Loaded,
  PostingType,
  RunView,
  Sort,
  Toast,
} from './types.ts'

const ACTIONS: { name: ActionName; id: string; label: string; title: string; primary: boolean }[] = [
  { name: 'preview', id: 'btnPreview', label: 'Preview Document', title: 'Preview the bank settlement letter for the selected deal', primary: false },
  { name: 'pdf', id: 'btnPdf', label: 'PDF', title: 'Generate the bank settlement letter as PDF', primary: false },
  { name: 'test', id: 'btnTest', label: 'TBB1 Test Run', title: 'Posting run in test mode for the selected deal', primary: false },
  { name: 'post', id: 'btnPost', label: 'TBB1 Post', title: 'Posting run (update) for the selected deal', primary: true },
]

const DATE_FORMAT = /^\d{2}-\d{2}-\d{4}$/

export default function FxNdfSettlement() {
  // T001 for S_BUKRS, and GET_DATA's database read (gt_data) for the current company codes / value dates.
  const [companies, setCompanies] = useState<Loaded<CompanyOption[]>>({ state: 'loading' })
  const [deals, setDeals] = useState<Loaded<Deal[]>>({ state: 'loading' })
  /** Bumped by Refresh (REF) to re-read the deals. */
  const [reloadKey, setReloadKey] = useState(0)

  const [criteria, setCriteria] = useState(defaultCriteria)
  /** Text typed in a date field that could not be parsed. */
  const [dateErr, setDateErr] = useState({ from: false, to: false })
  const [dateText, setDateText] = useState({ from: isoToDmy(DEFAULTS.dateFrom), to: isoToDmy(DEFAULTS.dateTo) })
  const [rfhaText, setRfhaText] = useState<string>(DEFAULTS.rfha)
  const [postingType, setPostingType] = useState<PostingType>('view')
  const [layout, setLayout] = useState<string>(DEFAULTS.layout)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<Sort>(NO_SORT)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(DEFAULTS.pageSize)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Popups and what each one shows
  const dealModal = useModal()
  const fiModal = useModal()
  const letterModal = useModal()
  const runModal = useModal()
  const confirmModal = useModal()
  const [txnRow, setTxnRow] = useState<Deal | null>(null)
  const [fiRow, setFiRow] = useState<Deal | null>(null)
  const [letterRow, setLetterRow] = useState<Deal | null>(null)
  const [runView, setRunView] = useState<RunView | null>(null)
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null)

  // Drag and drop
  const draggedId = useRef<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<ActionName | null>(null)

  // Toast
  const [toast, setToast] = useState<Toast>({ message: '', error: false, show: false })
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const showToast = useCallback((message: string, error = false) => {
    clearTimeout(toastTimer.current)
    setToast({ message, error, show: true })
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, show: false })), TOAST_MS)
  }, [])
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(
    () => () => {
      clearTimeout(toastTimer.current)
      clearTimeout(confirmTimer.current)
    },
    [],
  )

  useEffect(() => {
    const ac = new AbortController()
    loadCompanies(ac.signal).then(setCompanies, () => undefined)
    return () => ac.abort()
  }, [])

  // ------------------------------------------------------------------ derived
  const errors = useMemo(() => validateCriteria(criteria, dateErr), [criteria, dateErr])
  const readable = !errors.length
  const bukrsKey = criteria.bukrs.join(',')
  useEffect(() => {
    if (!readable) return
    const ac = new AbortController()
    setDeals({ state: 'loading' })
    loadDeals({ bukrs: bukrsKey ? bukrsKey.split(',') : [], dateFrom: criteria.dateFrom, dateTo: criteria.dateTo }, ac.signal).then(
      setDeals,
      () => undefined,
    )
    return () => ac.abort()
  }, [readable, bukrsKey, criteria.dateFrom, criteria.dateTo, reloadKey])
  const baseRows = useMemo(() => (deals.state === 'ok' ? deals.value : []), [deals])
  const unavailable = deals.state === 'waiting' || deals.state === 'error' ? deals.reason : null
  const companyList = companies.state === 'ok' ? companies.value : []
  const companyNotice =
    companies.state === 'loading'
      ? 'Loading company codes…'
      : companies.state === 'ok'
        ? companies.value.length
          ? null
          : 'No company codes in T001.'
        : companies.reason
  /** Result of GET_DATA for the current criteria. */
  const rows = useMemo(() => (errors.length ? [] : getData(baseRows, criteria)), [errors, criteria, baseRows])
  const selectedRow = useMemo(() => rows.find((r) => rowId(r) === selectedId) ?? null, [rows, selectedId])
  // A selection that is no longer listed is dropped.
  useEffect(() => {
    if (selectedId && !selectedRow) setSelectedId(null)
  }, [selectedId, selectedRow])
  const cols = findLayout(layout).cols
  const visible = useMemo(() => getVisibleRows(rows, layout, search, sort), [rows, layout, search, sort])
  const pg = pageSlice(visible, page, pageSize)
  const hasError = (k: CriteriaKey) => errors.some((e) => e.key === k)

  // ------------------------------------------------------------------ popups
  const modals = [dealModal, fiModal, letterModal, runModal, confirmModal]
  const closeAllModals = () => modals.forEach((m) => m.closeNow())
  // Escape closes the topmost popup (the last one in the page that is open).
  const modalsRef = useRef(modals)
  modalsRef.current = modals
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const open = modalsRef.current.filter((m) => m.isShown)
      open[open.length - 1]?.close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // ------------------------------------------------------------------ selection criteria
  const changeCompanies = (bukrs: string[]) => {
    setCriteria((c) => ({ ...c, bukrs }))
    setPage(1)
  }

  const dateKey = (which: 'from' | 'to') => (which === 'from' ? 'dateFrom' : 'dateTo') as 'dateFrom' | 'dateTo'
  const setDate = (which: 'from' | 'to', iso: string) => {
    setCriteria((c) => ({ ...c, [dateKey(which)]: iso }))
    setPage(1)
  }
  const pickDate = (which: 'from' | 'to', iso: string) => {
    setDateErr((e) => ({ ...e, [which]: false }))
    setDateText((t) => ({ ...t, [which]: isoToDmy(iso) }))
    setDate(which, iso)
  }
  /** Typing commits a complete valid date at once; blur / Enter also flags text that is not a date. */
  const commitDate = (which: 'from' | 'to', raw: string, final: boolean) => {
    const r = commitTypedDate(raw, final)
    if (r.kind === 'none') return
    if (r.kind === 'error') {
      setDateErr((e) => ({ ...e, [which]: true }))
      setDate(which, '')
      return
    }
    setDateErr((e) => ({ ...e, [which]: false }))
    if (r.kind === 'clear') setDate(which, '')
    else {
      if (r.text !== null) setDateText((t) => ({ ...t, [which]: r.text ?? t[which] }))
      setDate(which, r.iso)
    }
  }
  const typeDate = (which: 'from' | 'to', text: string) => {
    setDateText((t) => ({ ...t, [which]: text }))
    if (DATE_FORMAT.test(text)) commitDate(which, text, false)
  }

  const typeRfha = (text: string) => {
    setRfhaText(text)
    setCriteria((c) => ({ ...c, rfha: text.trim() }))
    setPage(1)
  }
  const pickRfha = (value: string) => {
    setRfhaText(value)
    setCriteria((c) => ({ ...c, rfha: value }))
    setPage(1)
  }

  const onReset = () => {
    closeAllModals()
    setCriteria(defaultCriteria())
    setDateErr({ from: false, to: false })
    setDateText({ from: isoToDmy(DEFAULTS.dateFrom), to: isoToDmy(DEFAULTS.dateTo) })
    setRfhaText(DEFAULTS.rfha)
    setPostingType('view')
    setLayout(DEFAULTS.layout)
    setSearch('')
    setSort(NO_SORT)
    setPage(1)
    setSelectedId(null)
    setPageSize(DEFAULTS.pageSize)
  }

  /** Refresh (REF): re-read the database. */
  const onRefresh = () => {
    closeAllModals()
    setSearch('')
    setSort(NO_SORT)
    setPage(1)
    setSelectedId(null)
    setReloadKey((k) => k + 1)
    showToast(readable ? 'Deals reloaded from SAP.' : 'Complete the required selection criteria first.', !readable)
  }

  // ------------------------------------------------------------------ actions
  /** PDF1: reads the form name (ZSGTSFTR_BS_PDF L003); the Adobe form itself has no API. */
  const generatePdf = (row: Deal) => {
    loadLetterFormName().then(
      (form) => {
        setRunView(pdfView(row, form))
        runModal.open()
      },
      () => undefined,
    )
  }
  /** TEST: RFTBBB00 test run has no API. */
  const runSingleTest = (row: Deal) => {
    setRunView(singleTestView(row))
    runModal.open()
  }
  const askSinglePost = (row: Deal) => {
    setConfirmReq({ kind: 'post', row })
    confirmModal.open()
  }
  /** Execute with posting: ALL_POSTING for every deal in the selection. */
  const askPostAll = () => {
    if (errors.length || !rows.length) return
    setConfirmReq({ kind: 'postAll', keyDate: keyDateOf(criteria), count: rows.length })
    confirmModal.open()
  }
  /** TBB1 / Execute: nothing is posted and the list is left as it is (WAITING FOR ACTION API). */
  const runConfirmed = (req: ConfirmRequest) => {
    setRunView(req.kind === 'post' ? singlePostView(req.row) : postAllView(rows, criteria, req.keyDate))
    runModal.open()
  }
  const onConfirm = () => {
    const req = confirmReq
    confirmModal.close()
    if (!req) return
    clearTimeout(confirmTimer.current)
    confirmTimer.current = setTimeout(() => runConfirmed(req), CONFIRM_DELAY_MS)
  }

  /** The toolbar buttons and a drop onto them share this handler. */
  const invokeAction = (name: ActionName) => {
    const row = selectedRow
    if (!row) {
      showToast('Select a transaction first.', true)
      return
    }
    if (name === 'preview') {
      setLetterRow(row)
      letterModal.open()
    } else if (name === 'pdf') generatePdf(row)
    else if (name === 'test') runSingleTest(row)
    else askSinglePost(row)
  }

  // ------------------------------------------------------------------ drag a row onto an action
  const endDrag = () => {
    draggedId.current = null
    setDraggingId(null)
    setDragOver(null)
  }
  const onDragStart = (e: DragEvent<HTMLTableRowElement>, row: Deal) => {
    const id = rowId(row)
    setSelectedId(id)
    draggedId.current = id
    setDraggingId(id)
    // A small label follows the pointer; it is only needed for the drag image, so it is added
    // inside the app root (where the stylesheet is scoped) and removed again at once.
    const root = e.currentTarget.closest('.fx-ndf-settlement')
    if (root) {
      const ghost = document.createElement('div')
      ghost.className = 'drag-ghost'
      ghost.textContent = `${row.rfha} — ${row.bp_name}`
      root.appendChild(ghost)
      e.dataTransfer.setDragImage(ghost, 12, 14)
      setTimeout(() => ghost.remove(), 0)
    }
    e.dataTransfer.effectAllowed = 'copy'
    try {
      e.dataTransfer.setData('text/plain', id)
    } catch {
      // Some browsers refuse data in a drag started this way; the drop still works.
    }
  }
  const dropProps = (name: ActionName) => ({
    onDragOver: (e: DragEvent<HTMLButtonElement>) => {
      if (!draggedId.current) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setDragOver(name)
    },
    onDragLeave: () => setDragOver((cur) => (cur === name ? null : cur)),
    onDrop: (e: DragEvent<HTMLButtonElement>) => {
      e.preventDefault()
      const had = draggedId.current
      endDrag()
      if (!had) {
        showToast('This action requires a transaction row.', true)
        return
      }
      invokeAction(name)
    },
  })

  const sortBy = (key: ColumnKey) => setSort((s) => nextSort(s, key))
  const pageButtons = Array.from({ length: pg.pageCount }, (_, i) => i + 1)

  return (
    <div className="fx-ndf-settlement">
      <div className="app">
        <div className="page-header">
          <img className="logo-img" src={FS_SHORT_LOGO} alt="FS logo" />
          <div className="header-text">
            <h1>FX NDF Settlement</h1>
            <p>Bank settlement of TSF NDF deals</p>
          </div>
          <div className="header-actions">
            <BackButton className="btn btn-secondary" />
            <button type="button" className="btn btn-secondary" id="btnRefresh" title="Reload deals from SAP" onClick={onRefresh}>
              ↻ Refresh
            </button>
            <SignOutButton className="btn btn-secondary" />
          </div>
        </div>

        <div className="table-col">
          <div className="card">
            <div className="section-title">
              <span className="dot"></span>NDF Deals for Bank Settlement
            </div>

            <div className="table-toolbar" id="toolbar">
              <div className="tb-field tb-search">
                <div className="search-box">
                  <span className="icon">🔍</span>
                  <input
                    id="tableSearch"
                    placeholder="Search deals..."
                    autoComplete="off"
                    aria-label="Search deals"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value)
                      setPage(1)
                    }}
                  />
                </div>
              </div>

              <div className={`tb-field tb-w-co${hasError('bukrs') ? ' has-error' : ''}`} id="field-bukrs">
                <label>
                  Company Code<span className="req">*</span>
                </label>
                <CompanySelect companies={companyList} notice={companyNotice} selected={criteria.bukrs} onChange={changeCompanies} />
              </div>

              <div className={`tb-field tb-w-date${hasError('dateFrom') ? ' has-error' : ''}`} id="field-dateFrom">
                <label>
                  Value Date From<span className="req">*</span>
                </label>
                <DateField
                  fieldKey="dateFrom"
                  label="From"
                  text={dateText.from}
                  selectedIso={criteria.dateFrom}
                  onText={(t) => typeDate('from', t)}
                  onCommit={() => commitDate('from', dateText.from, true)}
                  onPick={(iso) => pickDate('from', iso)}
                />
              </div>

              <div className={`tb-field tb-w-date${hasError('dateTo') ? ' has-error' : ''}`} id="field-dateTo">
                <label>
                  Value Date To<span className="opt">optional</span>
                </label>
                <DateField
                  fieldKey="dateTo"
                  label="To"
                  text={dateText.to}
                  selectedIso={criteria.dateTo}
                  onText={(t) => typeDate('to', t)}
                  onCommit={() => commitDate('to', dateText.to, true)}
                  onPick={(iso) => pickDate('to', iso)}
                />
              </div>

              <div className="tb-field tb-w-rfha" id="field-rfha">
                <label>
                  Transaction No<span className="opt">optional</span>
                </label>
                <SearchDropdown
                  fieldKey="rfha"
                  typing
                  value={rfhaText}
                  items={(filter) => rfhaItems(baseRows, criteria, hasError('bukrs'), filter)}
                  onType={typeRfha}
                  onSelect={pickRfha}
                />
              </div>

              <div className="tb-field" id="field-posting">
                <label>Posting Type</label>
                <div className="seg" id="segPosting" role="radiogroup" aria-label="Posting Type">
                  <button
                    type="button"
                    data-mode="view"
                    role="radio"
                    aria-checked={postingType === 'view'}
                    className={postingType === 'view' ? 'active' : undefined}
                    onClick={() => setPostingType('view')}
                  >
                    View Only
                  </button>
                  <button
                    type="button"
                    data-mode="post"
                    role="radio"
                    aria-checked={postingType === 'post'}
                    className={postingType === 'post' ? 'active' : undefined}
                    onClick={() => setPostingType('post')}
                  >
                    View With Posting
                  </button>
                </div>
              </div>

              {postingType === 'post' ? (
                <div className="tb-field" id="field-execute">
                  <label>&nbsp;</label>
                  <button
                    type="button"
                    className="btn btn-primary"
                    id="btnExecute"
                    title="Post all deals in the current selection, then reload the list"
                    disabled={errors.length > 0 || rows.length === 0}
                    onClick={askPostAll}
                  >
                    Execute
                  </button>
                </div>
              ) : null}

              <div className="tb-field tb-w-layout" id="field-layout">
                <label>Layout</label>
                <SearchDropdown
                  fieldKey="layout"
                  typing={false}
                  value={layout}
                  items={() => layoutItems(layout)}
                  onSelect={(v) => {
                    setLayout(v)
                    setSort(NO_SORT)
                  }}
                />
              </div>

              <div className="tb-field">
                <label>&nbsp;</label>
                <button type="button" className="btn btn-secondary" id="btnReset" title="Restore the default selection, search, sort and page" onClick={onReset}>
                  Reset
                </button>
              </div>

              <div className="tb-actions" id="actionBar">
                {ACTIONS.map((a) => (
                  <button
                    key={a.name}
                    type="button"
                    className={`btn ${a.primary ? 'btn-primary' : 'btn-secondary'}${draggingId !== null ? ' drop-ready' : ''}${dragOver === a.name ? ' drag-over' : ''}`}
                    id={a.id}
                    data-action={a.name}
                    disabled={!selectedRow}
                    title={a.title}
                    onClick={() => invokeAction(a.name)}
                    {...dropProps(a.name)}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={`criteria-error${errors.length ? ' show' : ''}`} id="criteriaError" role="alert">
              {errors.length ? (
                <ul>
                  {errors.map((e, i) => (
                    <li key={i}>{e.msg}</li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="table-scroll">
              {pg.total > 0 ? (
                <DealTable
                  cols={cols}
                  rows={pg.rows}
                  selectedId={selectedId}
                  draggingId={draggingId}
                  sort={sort}
                  onSort={sortBy}
                  onSelect={setSelectedId}
                  onDeselect={() => setSelectedId(null)}
                  onOpenTxn={(r) => {
                    setTxnRow(r)
                    dealModal.open()
                  }}
                  onOpenFi={(r) => {
                    setFiRow(r)
                    fiModal.open()
                  }}
                  onDragStart={onDragStart}
                  onDragEnd={endDrag}
                />
              ) : null}
            </div>
            {pg.total === 0 ? (
              <div className="empty-state" id="emptyState" style={{ display: 'block' }}>
                <div className="big">📄</div>
                <span id="emptyText">{emptyText(errors.length > 0, search, unavailable, deals.state === 'loading')}</span>
              </div>
            ) : null}

            <div className="table-footer">
              <div className="left">
                <div className="page-size-select">
                  Rows per page
                  <select
                    id="pageSizeSelect"
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
                <span className="showing" id="showingText">
                  {pg.text}
                </span>
              </div>
              <div className="pagination" id="pagination">
                <button type="button" disabled={pg.page <= 1} onClick={() => setPage(pg.page - 1)}>
                  ‹
                </button>
                {pageButtons.map((p) => (
                  <button key={p} type="button" className={p === pg.page ? 'active' : undefined} onClick={() => setPage(p)}>
                    {p}
                  </button>
                ))}
                <button type="button" disabled={pg.page >= pg.pageCount} onClick={() => setPage(pg.page + 1)}>
                  ›
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <TransactionModal modal={dealModal} row={txnRow} />
      <FiDocumentModal modal={fiModal} row={fiRow} />
      <LetterModal modal={letterModal} row={letterRow} />
      <RunModal modal={runModal} view={runView} />
      <ConfirmModal modal={confirmModal} request={confirmReq} onConfirm={onConfirm} />

      <div className={`toast${toast.show ? ' show' : ''}${toast.error ? ' error' : ''}`} id="toast">
        {toast.message}
      </div>
    </div>
  )
}

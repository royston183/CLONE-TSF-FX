import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { isAbort } from '../../shared/fx/mw.ts'
import { useStatusPopup } from '../../shared/popup/Popup.tsx'
import { CreateSpotModal, type ContextState, type PendingSpot } from './CreateSpotModal.tsx'
import { DateField } from './DateField.tsx'
import { DetailModal } from './DetailModal.tsx'
import { formatDate, parseAmountInput, parseDate } from './format.ts'
import {
  applyCreate,
  blankCreateForm,
  buildCsv,
  canCreate,
  filterSortRows,
  nextSort,
  partnerAfterLoad,
  validateCreateForm,
} from './logic.ts'
import { SpotError, createAdditionalSpot, persistSpotMetadata, prepareSpot, type CreatedSpot } from './spotCreate.ts'
import { loadSpotRows } from './spotList.ts'
import { spotPorts } from './spotPorts.ts'
import { loadPartners } from './valueHelps.ts'
import { SpotTable } from './SpotTable.tsx'
import './fo-additional-spot-booking.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './fo-additional-spot-booking.dark.css'
import type { CodeLabel, CreateFormErrors, CreateFormValues, DetailKind, Filters, Sort, SpotRow, Toast, ValueHelp } from './types.ts'

const PAGE_SIZE = 20

const DEFAULT_FILTERS: Filters = { q: '', dealFilter: '', showNew: true, showCreated: false }
const DEFAULT_SORT: Sort = { key: 'dealId', dir: -1 }

/**
 * FO: Additional Spot Booking (ZSGTSFR094), converted from
 * legacy/ZSGTSFR_SPOT_CREATE_Modern_Workbench_v3 (1).html.
 *
 * Create Spot Txn books a real FTR deal through ZFS_SB_TRMFX (api.ts) and shows every BAPI
 * message when SAP refuses it. The rules and the create order (booking, then APP_STR with status
 * 03, then the ZSGTSFTR_IN_SPOT write-back) live in spotCreate.ts; this component only holds state.
 * The list is ZSGTSFTR_IN_SPOT from MySQL, joined to ZSGTSFV_FX for dates and partner. There is no
 * seed fallback: a seed row could book a real deal.
 *
 * Route parameters (other programs opening this one for a Deal): ?dealId=&dealType= narrows the
 * list; &directCreate=1 also opens Create Spot when exactly one row of that Deal is creatable.
 */
export default function FoAdditionalSpotBooking() {
  const [rows, setRows] = useState<SpotRow[]>([])
  /** 'error': ZSGTSFTR_IN_SPOT could not be read, so there are no rows to book against. */
  const [loadState, setLoadState] = useState<'loading' | 'ok' | 'error'>('loading')
  /** Bumped by Refresh, which re-reads MySQL. */
  const [generation, setGeneration] = useState(0)
  useEffect(() => {
    const ctrl = new AbortController()
    setLoadState('loading')
    loadSpotRows(ctrl.signal).then(
      (loaded) => {
        setRows(loaded.rows)
        setLoadState('ok')
      },
      (error: unknown) => {
        if (isAbort(error)) return
        console.error('[fx] Additional Spot Booking: ZSGTSFTR_IN_SPOT unavailable', error)
        setRows([])
        setLoadState('error')
      },
    )
    return () => ctrl.abort()
  }, [generation])

  const [params] = useSearchParams()
  const routeDealId = params.get('dealId') ?? ''
  const routeDealType = params.get('dealType') ?? ''
  const directCreate = params.get('directCreate') === '1' || params.get('directCreate') === 'true'

  const [filters, setFilters] = useState<Filters>({ ...DEFAULT_FILTERS, dealFilter: routeDealId })
  const [keyDate, setKeyDate] = useState('')
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT)
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const [createRow, setCreateRow] = useState<SpotRow | null>(null)
  const [createCtx, setCreateCtx] = useState<ContextState>({ state: 'loading' })
  const [createValues, setCreateValues] = useState<CreateFormValues | null>(null)
  const [createErrors, setCreateErrors] = useState<CreateFormErrors>({})
  const [sapErrors, setSapErrors] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  /** A Spot SAP booked whose APP_STR / IN_SPOT write failed: held so Retry repairs it instead of booking again. */
  const [pending, setPending] = useState<{ created: CreatedSpot; row: SpotRow; view: PendingSpot } | null>(null)
  const [detail, setDetail] = useState<{ row: SpotRow; kind: DetailKind } | null>(null)

  // Business partners belong to the Spot's company code, which is derived when the popup opens.
  const [partners, setPartners] = useState<ValueHelp<CodeLabel>>({ state: 'loading' })
  const spotCompany = createCtx.state === 'ok' ? createCtx.ctx.companyCode : ''

  useEffect(() => {
    if (!createRow || !spotCompany) return
    const ctrl = new AbortController()
    setPartners({ state: 'loading' })
    loadPartners(spotCompany, ctrl.signal).then((help) => {
      setPartners(help)
      const list = help.state === 'ok' ? help.options : []
      setCreateValues((v) => (v ? { ...v, partner: partnerAfterLoad(v.partner, createRow.partner, list) } : v))
    }, () => undefined)
    return () => ctrl.abort()
  }, [spotCompany, createRow])

  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)
  const status = useStatusPopup()

  const pushToast = (message: string, kind: Toast['kind'] = '') => {
    const id = ++toastId.current
    setToasts((t) => [...t, { id, message, kind }])
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600)
  }

  const filteredRows = useMemo(() => filterSortRows(rows, filters, sort), [rows, filters, sort])
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const start = (currentPage - 1) * PAGE_SIZE
  const pageRows = filteredRows.slice(start, start + PAGE_SIZE)

  const selectedRow = useMemo(() => rows.find((r) => r.id === selectedId) ?? null, [rows, selectedId])

  const applyFilters = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }))
    setPage(1)
    setSelectedId(null)
  }

  const setSortKey = (key: Parameters<typeof nextSort>[1]) => {
    setSort((s) => nextSort(s, key))
    setPage(1)
  }

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS)
    setKeyDate('')
    setSort(DEFAULT_SORT)
    setPage(1)
    setSelectedId(null)
  }

  const refresh = () => {
    setGeneration((g) => g + 1)
    resetFilters()
    pushToast('Workbench reloaded from MySQL.', 'info')
  }

  const downloadCsv = () => {
    const csv = buildCsv(filteredRows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'additional_spot_booking.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.setTimeout(() => window.URL.revokeObjectURL(url), 1000)
  }

  // ------------------------------------------------------------------ create spot

  const openCreate = (target: SpotRow | null = selectedRow) => {
    const r = target
    if (!r) {
      pushToast('Select a transaction first.', 'info')
      return
    }
    if (r.spotTxn) {
      pushToast('Spot already created for the selected data.', 'info')
      return
    }
    if (!canCreate(r)) {
      pushToast('Spot cannot be created for the selected data.', 'error')
      return
    }
    setCreateRow(r)
    setCreateCtx({ state: 'loading' })
    setCreateValues({ partner: '', tradeDate: '', rate: '' })
    setCreateErrors({})
    setSapErrors([])
    setPending(null)
    setPartners({ state: 'loading' })
    prepareSpot(spotPorts, r).then(
      (ctx) => {
        setCreateCtx({ state: 'ok', ctx })
        setCreateValues(blankCreateForm(ctx))
      },
      (error: unknown) => setCreateCtx({ state: 'error', messages: error instanceof SpotError ? error.messages : [String(error instanceof Error ? error.message : error)] }),
    )
  }

  // Another program opening this one for a Deal: open Create Spot once when exactly one row of it is creatable.
  const directOpened = useRef(false)
  useEffect(() => {
    if (!directCreate || directOpened.current || loadState !== 'ok') return
    const matches = rows.filter((r) => r.dealId === routeDealId && (!routeDealType || r.dealType === routeDealType) && canCreate(r))
    directOpened.current = true
    if (matches.length === 1) {
      setSelectedId(matches[0]!.id)
      openCreate(matches[0]!)
    } else pushToast(matches.length ? 'More than one Spot can be created for this deal; select one.' : 'No Spot can be created for this deal.', 'info')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directCreate, loadState, rows])

  const closeCreate = () => {
    setCreateRow(null)
    setCreateValues(null)
    setSapErrors([])
    setPending(null)
  }

  /** The row once a Spot exists in SAP: it stops being offered, even if a follow-up write is still to be repaired. */
  const markBooked = (row: SpotRow, created: CreatedSpot) => {
    const updated = applyCreate(row, created.transaction, created.companyCode, 'DEMOUSER', formatDate(new Date()))
    setRows((all) => all.map((r) => (r.id === updated.id ? updated : r)))
    setSelectedId(updated.id)
  }

  const finishBooked = (row: SpotRow, created: CreatedSpot, persist: { appStr: string; inSpot: string }) => {
    markBooked(row, created)
    if (persist.appStr === 'done' && persist.inSpot === 'done') {
      setPending(null)
      closeCreate()
      status.show({
        tone: 'success',
        title: 'Spot Created',
        message: `Spot ${created.transaction} created in company code ${created.companyCode}.`,
        refLabel: 'Spot Transaction',
        refValue: created.transaction,
      })
      return
    }
    setPending({ created, row, view: { transaction: created.transaction, companyCode: created.companyCode, persist } })
    pushToast(`Spot ${created.transaction} was booked in SAP, but it is not fully recorded. Retry from the popup; do not create it again.`, 'error')
  }

  const confirmCreate = async () => {
    if (!createRow || !createValues || createCtx.state !== 'ok' || creating || pending) return
    const { valid, errors } = validateCreateForm(createValues)
    if (!valid) {
      setCreateErrors(errors)
      return
    }
    setCreating(true)
    setSapErrors([])
    const result = await createAdditionalSpot(spotPorts, createRow, {
      partner: createValues.partner,
      tradeDate: parseDate(createValues.tradeDate)!,
      rate: parseAmountInput(createValues.rate),
    })
    setCreating(false)
    if (result.stage === 'refused') {
      setSapErrors(result.messages)
      pushToast('Spot was not created — see the messages in the popup.', 'error')
      return
    }
    finishBooked(createRow, result.created, result.persist)
  }

  /** Repairs APP_STR and/or IN_SPOT for the Spot already booked. Never books a second deal. */
  const retryPersist = async () => {
    if (!pending || creating) return
    setCreating(true)
    const persist = await persistSpotMetadata(spotPorts, pending.row, pending.created)
    setCreating(false)
    finishBooked(pending.row, pending.created, persist)
  }

  // ------------------------------------------------------------------ drag onto Create Spot Txn

  const onDragStart = (row: SpotRow) => {
    setDragging(canCreate(row))
  }
  const onDragEnd = () => {
    setDragging(false)
    setDragOver(false)
  }
  const onDrop = () => {
    setDragOver(false)
    if (canCreate(selectedRow)) openCreate()
    else pushToast('This action requires a new spot transaction row with a non-zero difference amount.', 'info')
  }

  const pagerButtons = Array.from({ length: totalPages }, (_, i) => i + 1)

  return (
    <div className="foasb">
      <div className="app">
        <div className="header">
          <div className="header-left">
            <BackButton className="back-btn" />
            <div className="brand">
              <div className="brand-mark" aria-hidden="true">
                <span className="r" />
                <span className="o" />
                <span className="g" />
                <span className="k" />
              </div>
              <div className="brand-title">Additional Spot Booking</div>
              <div className="brand-sub">SPOT</div>
            </div>
          </div>
          <div className="header-right">
            <span className="live-dot" title="Demo ready" />
            <button className="btn" type="button" title="Refresh workbench data" onClick={refresh}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 11a8 8 0 1 0 2 5" />
                <path d="M20 4v7h-7" />
              </svg>
              Refresh
            </button>
            <SignOutButton className="btn" />
          </div>
        </div>

        <div className="content">
          <div className="card">
            <div className="card-head">
              <div className="card-title">List of Additional Spot Booking</div>
              <div className="record-count">
                {filteredRows.length} records
                <span style={{ marginLeft: 10, fontSize: 11, fontWeight: 500, opacity: 0.7 }}>
                  {loadState === 'loading'
                    ? 'Loading from MySQL…'
                    : loadState === 'ok'
                      ? 'ZSGTSFTR_IN_SPOT · MySQL'
                      : 'ZSGTSFTR_IN_SPOT could not be read — nothing to book against'}
                </span>
              </div>
              <div className="key-date-note">Key Date: <span>{keyDate || 'All dates'}</span></div>
              <div className="head-actions">
                <button className="btn" type="button" title="Download current rows as CSV" onClick={downloadCsv}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 3v12" />
                    <path d="M7 10l5 5 5-5" />
                    <path d="M5 21h14" />
                  </svg>
                  Download CSV
                </button>
              </div>
            </div>

            <div className="toolbar">
              <div className="toolbar-item search-wrap">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-3.4-3.4" />
                </svg>
                <input className="control search" type="text" placeholder="Search all columns..." value={filters.q} onChange={(e) => applyFilters({ q: e.target.value })} />
              </div>

              <div className="toolbar-item" style={{ width: 160 }}>
                <DateField
                  value={keyDate}
                  placeholder="Upto Trade Date"
                  onChange={(v) => setKeyDate(v)}
                  className="control filter-input date-field"
                />
              </div>

              <div className="toolbar-item">
                <input className="control deal-filter" type="text" placeholder="Deal ID / range" value={filters.dealFilter} onChange={(e) => applyFilters({ dealFilter: e.target.value })} />
              </div>

              <div className="toolbar-item status-filter" title="SAP status selection">
                <label>
                  <input type="checkbox" checked={filters.showNew} onChange={(e) => applyFilters({ showNew: e.target.checked })} />
                  New Spot
                </label>
                <label>
                  <input type="checkbox" checked={filters.showCreated} onChange={(e) => applyFilters({ showCreated: e.target.checked })} />
                  Spot Created
                </label>
              </div>

              <div className="toolbar-item">
                <button className="btn" type="button" onClick={resetFilters}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4v6h6" />
                    <path d="M20 20v-6h-6" />
                    <path d="M5.5 15a7 7 0 0 0 11.7 2.4L20 14" />
                    <path d="M18.5 9A7 7 0 0 0 6.8 6.6L4 10" />
                  </svg>
                  Reset
                </button>
              </div>

              <div
                className={`toolbar-item action-wrap${dragging ? ' drag-ready' : ''}${dragOver ? ' drag-over' : ''}`}
                onDragOver={(e) => {
                  if (canCreate(selectedRow)) {
                    e.preventDefault()
                    setDragOver(true)
                  }
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  onDrop()
                }}
              >
                <button className="btn btn-primary" type="button" disabled={!canCreate(selectedRow)} onClick={() => openCreate()}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                  </svg>
                  Create Spot Txn
                </button>
              </div>
            </div>

            <SpotTable
              rows={pageRows}
              selectedId={selectedId}
              sort={sort}
              onSort={setSortKey}
              onSelect={setSelectedId}
              onOpenDetail={(row, kind) => setDetail({ row, kind })}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />

            <div className="footer">
              <span>
                {filteredRows.length ? `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, filteredRows.length)} of ${filteredRows.length}` : 'Showing 0 of 0'}
              </span>
              <div className="pagination">
                <button className="page-btn" type="button" disabled={currentPage === 1} onClick={() => setPage(Math.max(1, currentPage - 1))}>
                  ‹
                </button>
                {pagerButtons.map((p) => (
                  <button key={p} className={`page-btn${p === currentPage ? ' active' : ''}`} type="button" onClick={() => setPage(p)}>
                    {p}
                  </button>
                ))}
                <button className="page-btn" type="button" disabled={currentPage === totalPages} onClick={() => setPage(Math.min(totalPages, currentPage + 1))}>
                  ›
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.kind ? ` ${t.kind}` : ''}`}>
            {t.message}
          </div>
        ))}
      </div>

      {createRow && createValues ? (
        <CreateSpotModal
          row={createRow}
          context={createCtx}
          values={createValues}
          partners={partners}
          errors={createErrors}
          onChange={(patch) => setCreateValues((v) => (v ? { ...v, ...patch } : v))}
          sapErrors={sapErrors}
          pending={pending?.view ?? null}
          busy={creating}
          onClearErrors={() => setCreateErrors({})}
          onCancel={closeCreate}
          onConfirm={() => void confirmCreate()}
          onRetry={() => void retryPersist()}
        />
      ) : null}

      {detail ? <DetailModal row={detail.row} kind={detail.kind} onClose={() => setDetail(null)} /> : null}
      {status.element}
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { isAbort } from '../../shared/fx/mw.ts'
import { createSpotTransaction, toCreatePayload } from './api.ts'
import { CreateSpotModal } from './CreateSpotModal.tsx'
import { findCompanyName } from './data.ts'
import { DateField } from './DateField.tsx'
import { DetailModal } from './DetailModal.tsx'
import { formatDate } from './format.ts'
import {
  applyCreate,
  blankCreateForm,
  buildCsv,
  canCreate,
  filterSortRows,
  nextSort,
  offered,
  partnerAfterLoad,
  productTypeOf,
  validateCreateForm,
} from './logic.ts'
import { loadSpotRows, recordSpot } from './spotList.ts'
import { loadCompanies, loadPartners, loadTxnTypes } from './valueHelps.ts'
import { SpotTable } from './SpotTable.tsx'
import './fo-additional-spot-booking.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './fo-additional-spot-booking.dark.css'
import type { CodeLabel, CreateFormErrors, CreateFormValues, DetailKind, Filters, Sort, SpotRow, Toast, TxnTypeOption, ValueHelp } from './types.ts'

const PAGE_SIZE = 20

const DEFAULT_FILTERS: Filters = { q: '', dealFilter: '', showNew: true, showCreated: false }
const DEFAULT_SORT: Sort = { key: 'dealId', dir: -1 }

/**
 * FO: Additional Spot Booking (ZSGTSFR094), converted from
 * legacy/ZSGTSFR_SPOT_CREATE_Modern_Workbench_v3 (1).html.
 *
 * Create Spot Txn books a real FTR deal through ZFS_SB_TRMFX (api.ts) and shows every BAPI
 * message when SAP refuses it; the new spot number then goes back on the ZSGTSFTR_IN_SPOT row
 * (spotList.ts). The list is ZSGTSFTR_IN_SPOT from MySQL, joined to ZSGTSFV_FX for dates and
 * partner. There is no seed fallback: a seed row could book a real deal.
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

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [keyDate, setKeyDate] = useState('')
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT)
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const [createRow, setCreateRow] = useState<SpotRow | null>(null)
  const [createValues, setCreateValues] = useState<CreateFormValues | null>(null)
  const [createErrors, setCreateErrors] = useState<CreateFormErrors>({})
  const [sapErrors, setSapErrors] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const [detail, setDetail] = useState<{ row: SpotRow; kind: DetailKind } | null>(null)

  // The Create Spot drop-downs, read from SAP (valueHelps.ts).
  const [companies, setCompanies] = useState<ValueHelp<CodeLabel>>({ state: 'loading' })
  const [txnTypes, setTxnTypes] = useState<ValueHelp<TxnTypeOption>>({ state: 'loading' })
  const [partners, setPartners] = useState<ValueHelp<CodeLabel>>({ state: 'loading' })
  const companyList = companies.state === 'ok' ? companies.options : []
  const txnTypeList = txnTypes.state === 'ok' ? txnTypes.options : []

  useEffect(() => {
    const ctrl = new AbortController()
    loadCompanies(ctrl.signal).then(setCompanies, () => undefined)
    loadTxnTypes(ctrl.signal).then(setTxnTypes, () => undefined)
    return () => ctrl.abort()
  }, [])

  // A popup opened before the lists arrived gets the row's defaults once they do.
  useEffect(() => {
    if (!createRow) return
    setCreateValues((v) =>
      v
        ? {
            ...v,
            companyCode: v.companyCode || offered(companyList, createRow.companyCode),
            txnType: v.txnType || offered(txnTypeList, createRow.defaultTxnType),
          }
        : v,
    )
  }, [companies, txnTypes, createRow])

  // Business partners belong to the picked company code: reload them whenever it changes.
  const pickedCompany = createValues?.companyCode ?? ''
  useEffect(() => {
    if (!createRow) return
    const ctrl = new AbortController()
    setPartners({ state: 'loading' })
    loadPartners(pickedCompany, ctrl.signal).then((help) => {
      setPartners(help)
      const list = help.state === 'ok' ? help.options : []
      setCreateValues((v) => (v ? { ...v, partner: partnerAfterLoad(v.partner, createRow.partner, list) } : v))
    }, () => undefined)
    return () => ctrl.abort()
  }, [pickedCompany, createRow])

  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)

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

  const openCreate = () => {
    const r = selectedRow
    if (!r) {
      pushToast('Select a transaction first.', 'info')
      return
    }
    if (r.spotTxn) {
      pushToast('Spot already created for the selected data.', 'info')
      return
    }
    if (Number(r.diffAmt) === 0) {
      pushToast('Spot cannot be created for the selected data.', 'error')
      return
    }
    setCreateRow(r)
    setCreateValues(blankCreateForm(r, companyList, txnTypeList))
    setCreateErrors({})
  }

  const closeCreate = () => {
    setCreateRow(null)
    setCreateValues(null)
    setSapErrors([])
  }

  const confirmCreate = async () => {
    if (!createRow || !createValues || creating) return
    const { valid, errors } = validateCreateForm(createValues)
    if (!valid) {
      setCreateErrors(errors)
      return
    }
    setCreating(true)
    setSapErrors([])
    const productType = productTypeOf(txnTypeList, createValues.txnType)
    const out = await createSpotTransaction(toCreatePayload(createRow, createValues, productType))
    setCreating(false)
    if (!out.ok) {
      setSapErrors(out.messages)
      pushToast('Spot was not created in SAP — see the messages in the popup.', 'error')
      return
    }
    const values = { ...createValues, companyCode: out.companyCode }
    const updated = applyCreate(
      createRow,
      values,
      out.transaction,
      'DEMOUSER',
      formatDate(new Date()),
      findCompanyName(out.companyCode, companyList),
      productType,
    )
    setRows((all) => all.map((r) => (r.id === updated.id ? updated : r)))
    setSelectedId(updated.id)
    closeCreate()
    // The deal now exists in SAP. IN_SPOT has to say so, or the next load offers the row again.
    const writeBack = await recordSpot(createRow, out.transaction)
    if (writeBack) {
      pushToast(
        `Spot ${out.transaction} was booked in SAP, but IN_SPOT was not updated (${writeBack}). Note the number: the row will show as New Spot until it is.`,
        'error',
      )
      return
    }
    pushToast(`Spot ${out.transaction} created in company code ${out.companyCode}.`)
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
                <button className="btn btn-primary" type="button" disabled={!canCreate(selectedRow)} onClick={openCreate}>
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
          values={createValues}
          companies={companies}
          txnTypes={txnTypes}
          partners={partners}
          errors={createErrors}
          onChange={(patch) => setCreateValues((v) => (v ? { ...v, ...patch } : v))}
          sapErrors={sapErrors}
          busy={creating}
          onClearErrors={() => setCreateErrors({})}
          onCancel={closeCreate}
          onConfirm={() => void confirmCreate()}
        />
      ) : null}

      {detail ? <DetailModal row={detail.row} kind={detail.kind} onClose={() => setDetail(null)} /> : null}
    </div>
  )
}

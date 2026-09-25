import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { CorrectionModal } from './CorrectionModal.tsx'
import { FX_MODELS, ORIGIN_ENTITIES, REGION_CATALOG, buildFreshDataset } from './data.ts'
import { DateField } from './DateField.tsx'
import {
  applyCorrection,
  calcOrigin,
  canAct,
  correctionBlockedMessage,
  defaultFilters,
  filterSortRows,
  formFromRow,
  isAmendedDateValid,
  picksFromRow,
  reverseRow,
  validateCorrection,
} from './logic.ts'
import { McTable } from './McTable.tsx'
import { useModal } from './modal.tsx'
import { ReverseModal } from './ReverseModal.tsx'
import './fo-mc-error-correction.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './fo-mc-error-correction.dark.css'
import type {
  CorrectionForm,
  ErrorRow,
  FieldErrors,
  FieldKey,
  Filters,
  Picks,
  Sort,
  SortField,
  Toast,
  ToastKind,
} from './types.ts'

const BRAND_LOGO =
  'https://raw.githubusercontent.com/ryannayak/fs-assets/e82f35a83e28689167b22b4300d4994a249acee0/fs-short-logo.png'
const DEFAULT_SORT: Sort = { field: 'mcRef', dir: 'desc' }
/** The FX model filter lists each code once, keyed by the first model id carrying it. */
const FX_FILTER_OPTIONS = FX_MODELS.filter((m, i) => FX_MODELS.findIndex((x) => x.code === m.code) === i)
const EMPTY_FORM: CorrectionForm = {
  amendedDate: '',
  amountUsd: '',
  exRate: '',
  amountOrigin: '',
  shipStart: '',
  shipEnd: '',
  paymentTerms: '',
  portShipment: '',
  portDestination: '',
  foRemarks: '',
}
const EMPTY_PICKS: Picks = { paymentTerms: '', portShipment: '', portDestination: '' }
const records = (n: number) => `${n}${n === 1 ? ' record' : ' records'}`

/**
 * FO: MC Error Correction (ZSGTSFR093), converted from legacy/mc-error-correction.html — the
 * page titled "FO: MC Error/Amendment".
 *
 * Front Office sees the Master Contracts Mid-Office rejected, corrects one (Update &
 * Resubmit to MO) or reverses it. The original never called an API, so this is the same
 * UI-only screen: the rows live in component state for the session and Refresh restores the
 * seed data.
 */
export default function FoMcErrorCorrection() {
  const [dataset, setDataset] = useState<ErrorRow[]>(buildFreshDataset)

  // Table
  const [filters, setFilters] = useState<Filters>(() => defaultFilters())
  /** The MC Date boxes' text: typing alone does not filter, only a calendar pick does. */
  const [dateText, setDateText] = useState(() => ({ from: filters.dateFrom, to: filters.dateTo }))
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT)
  const [selectedRef, setSelectedRef] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)
  const [flashRef, setFlashRef] = useState<number | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Error Correction form
  const correctionModal = useModal()
  const [editingRef, setEditingRef] = useState<number | null>(null)
  const [form, setForm] = useState<CorrectionForm>(EMPTY_FORM)
  const [picks, setPicks] = useState<Picks>(EMPTY_PICKS)
  const [errors, setErrors] = useState<FieldErrors>({})

  // Reverse confirmation
  const reverseModal = useModal()
  const [pendingReverseRef, setPendingReverseRef] = useState<number | null>(null)

  // Toast
  const [toast, setToast] = useState<Toast | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const showToast = useCallback((message: string, kind: ToastKind = '') => {
    clearTimeout(toastTimer.current)
    setToast({ message, kind, id: Date.now() })
    toastTimer.current = setTimeout(() => setToast(null), 3400)
  }, [])

  useEffect(
    () => () => {
      clearTimeout(toastTimer.current)
      clearTimeout(flashTimer.current)
    },
    [],
  )

  const findRow = (ref: number | null) => (ref === null ? undefined : dataset.find((r) => r.mcRef === ref))

  /** The original's renderList(flashRef): the row that just changed flashes green once. */
  const flash = (ref: number) => {
    clearTimeout(flashTimer.current)
    setFlashRef(ref)
    flashTimer.current = setTimeout(() => setFlashRef(null), 1600)
  }

  // ------------------------------------------------------------------ toolbar

  const setFilter = (key: keyof Filters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }))
    setPage(1)
  }

  const clearFiltersAndSearch = () => {
    const fresh = defaultFilters()
    setFilters(fresh)
    setDateText({ from: fresh.dateFrom, to: fresh.dateTo })
    setSearch('')
    setPage(1)
  }

  const resetFilters = () => {
    clearFiltersAndSearch()
    showToast('Filters cleared.')
  }

  const refresh = () => {
    // Future: re-read the correction queue from SAP instead of restoring the seed rows.
    setDataset(buildFreshDataset())
    clearFiltersAndSearch()
    setSort(DEFAULT_SORT)
    setSelectedRef(null)
    showToast('Hard reset — all Master Contracts restored to their original state.', 'warn')
  }

  // ------------------------------------------------------------------ correction flow

  const openCorrection = (ref: number) => {
    const row = findRow(ref)
    if (!row) return
    const blocked = correctionBlockedMessage(row)
    if (blocked) {
      showToast(blocked, 'warn')
      return
    }
    setEditingRef(row.mcRef)
    setForm(formFromRow(row))
    setPicks(picksFromRow(row))
    setErrors({})
    correctionModal.open()
  }

  const editingRow = findRow(editingRef)

  const changeForm = (patch: Partial<CorrectionForm>) =>
    setForm((f) => {
      const next = { ...f, ...patch }
      // MC Amount (Origin) follows USD × rate as either is typed.
      if ('amountUsd' in patch || 'exRate' in patch) next.amountOrigin = calcOrigin(next.amountUsd, next.exRate)
      return next
    })

  const clearError = (key: FieldKey) => setErrors((e) => (e[key] ? { ...e, [key]: false } : e))

  const commitAmendedDate = (value: string) =>
    setErrors((e) => ({ ...e, amendedDate: !isAmendedDateValid(value, editingRow?.abapStatus) }))

  const update = () => {
    const { valid, errors: found } = validateCorrection(form, editingRow?.abapStatus)
    setErrors(found)
    if (!valid) {
      showToast('Please fix the highlighted fields before updating.', 'error')
      return
    }
    if (!editingRow) return
    const updated = applyCorrection(editingRow, form, picks)
    setDataset((list) => list.map((r) => (r.mcRef === updated.mcRef ? updated : r)))
    correctionModal.close()
    showToast(`Master Contract ${updated.mcRef} updated and resubmitted to Mid-Office.`)
    setSelectedRef(updated.mcRef)
    flash(updated.mcRef)
  }

  // ------------------------------------------------------------------ reverse flow

  const openReverseConfirm = (row: ErrorRow | undefined) => {
    if (!row) return
    setPendingReverseRef(row.mcRef)
    reverseModal.open()
  }

  const cancelReverse = () => {
    reverseModal.hide()
    setPendingReverseRef(null)
  }

  const confirmReverse = () => {
    const row = findRow(pendingReverseRef)
    if (row) {
      // Future: post the reversal to SAP.
      setDataset((list) => list.map((r) => (r.mcRef === row.mcRef ? reverseRow(r) : r)))
      showToast(`Master Contract ${row.mcRef} reversed successfully.`, 'warn')
      flash(row.mcRef)
    }
    reverseModal.hide()
    setPendingReverseRef(null)
    correctionModal.close()
  }

  // Escape closes the correction form first; the Reverse confirmation only when it is alone.
  const escapeRef = useRef<() => void>(() => {})
  escapeRef.current = () => {
    if (correctionModal.state !== 'closed') correctionModal.close()
    else if (reverseModal.state === 'open') reverseModal.hide()
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') escapeRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // ------------------------------------------------------------------ table

  const filtered = useMemo(() => filterSortRows(dataset, search, filters, sort), [dataset, search, filters, sort])
  const totalRows = filtered.length
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize))
  const currentPage = Math.min(page, pageCount)
  const startIdx = (currentPage - 1) * pageSize
  const pageRows = filtered.slice(startIdx, startIdx + pageSize)

  const onSort = (field: SortField) =>
    setSort((s) => (s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' }))

  const selectedRow = findRow(selectedRef)
  const actionable = canAct(selectedRow)

  return (
    <div className="fomcec">
      <div className="app">
        <div className="page-header">
          <BackButton className="btn-outline btn-back" />
          <img className="logo-img" src={BRAND_LOGO} alt="FS logo" />
          <div className="header-text">
            <h1>Error Correction</h1>
          </div>
          <div className="header-right">
            <button type="button" className="btn-outline" id="btnRefresh" title="Reload data" onClick={refresh}>
              ↻ Refresh
            </button>
            <SignOutButton className="btn-outline" />
          </div>
        </div>

        <div className="card">
          <div className="section-title">
            <span className="dot" />
            Master Contracts <span className="title-count">{records(dataset.length)}</span>
          </div>

          <div className="table-toolbar toolbar-flat">
            <div className="toolbar-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                id="btnErrorCorrection"
                disabled={!actionable}
                onClick={() => {
                  if (selectedRef !== null) openCorrection(selectedRef)
                }}
              >
                Error Correction
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                id="btnReverse"
                disabled={!actionable}
                onClick={() => openReverseConfirm(selectedRow)}
              >
                Reverse
              </button>
            </div>

            <div className="search-box compact">
              <span className="icon">Search</span>
              <input
                placeholder="Search all columns..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
              />
            </div>

            <div className="toolbar-date-group">
              <span className="toolbar-inline-label">MC Date</span>
              <DateField
                className="toolbar-date"
                placeholder="From"
                title="MC Date From"
                iconText="Calendar"
                iconLabel="Open from-date calendar"
                value={dateText.from}
                onInput={(v) => setDateText((d) => ({ ...d, from: v }))}
                onPick={(v) => setFilter('dateFrom', v)}
              />
              <span className="date-sep">to</span>
              <DateField
                className="toolbar-date"
                placeholder="To"
                title="MC Date To"
                iconText="Calendar"
                iconLabel="Open to-date calendar"
                value={dateText.to}
                onInput={(v) => setDateText((d) => ({ ...d, to: v }))}
                onPick={(v) => setFilter('dateTo', v)}
              />
            </div>

            <FilterSelect
              title="Origin Entity"
              all="All entities"
              value={filters.origin}
              options={ORIGIN_ENTITIES.map((e) => [e.code, `${e.code} - ${e.name}`])}
              onChange={(v) => setFilter('origin', v)}
            />
            <FilterSelect
              title="Region"
              all="All regions"
              value={filters.region}
              options={REGION_CATALOG.map((r) => [r.code, `${r.code} - ${r.label}`])}
              onChange={(v) => setFilter('region', v)}
            />
            <FilterSelect
              title="FX Model"
              all="All models"
              value={filters.fxModel}
              options={FX_FILTER_OPTIONS.map((m) => [m.id, `${m.code} - ${m.desc}`])}
              onChange={(v) => setFilter('fxModel', v)}
            />
            <button type="button" className="btn btn-secondary btn-sm" id="btnResetFilters" onClick={resetFilters}>
              Reset
            </button>

            <span className="result-count">{records(totalRows)}</span>
          </div>

          <div className="table-scroll">
            {totalRows > 0 ? (
              <McTable
                rows={pageRows}
                sort={sort}
                selectedRef={selectedRef}
                flashRef={flashRef}
                onSort={onSort}
                onSelect={setSelectedRef}
                onOpen={openCorrection}
              />
            ) : null}
          </div>
          {totalRows === 0 ? <div className="empty-state">No Master Contracts match your search or filters.</div> : null}

          <div className="table-footer">
            <div className="page-size-select">
              Rows per page
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setPage(1)
                }}
              >
                <option value={8}>8</option>
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>
            <div className="pagination">
              <button type="button" disabled={currentPage <= 1} onClick={() => setPage(1)}>
                «
              </button>
              <button type="button" disabled={currentPage <= 1} onClick={() => setPage(Math.max(1, currentPage - 1))}>
                ‹
              </button>
              {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
                <button key={p} type="button" className={p === currentPage ? 'active' : undefined} onClick={() => setPage(p)}>
                  {p}
                </button>
              ))}
              <button
                type="button"
                disabled={currentPage >= pageCount}
                onClick={() => setPage(Math.min(pageCount, currentPage + 1))}
              >
                ›
              </button>
              <button type="button" disabled={currentPage >= pageCount} onClick={() => setPage(pageCount)}>
                »
              </button>
            </div>
            <span className="result-count">
              {totalRows === 0 ? (
                <>
                  Showing <b>0</b> of <b>0</b>
                </>
              ) : (
                <>
                  Showing{' '}
                  <b>
                    {startIdx + 1}-{Math.min(startIdx + pageSize, totalRows)}
                  </b>{' '}
                  of <b>{totalRows}</b>
                </>
              )}
            </span>
          </div>
        </div>
      </div>

      <CorrectionModal
        modal={correctionModal}
        row={editingRow}
        form={form}
        errors={errors}
        onChange={changeForm}
        onPick={(patch) => setPicks((p) => ({ ...p, ...patch }))}
        onClearError={clearError}
        onAmendedDateCommit={commitAmendedDate}
        onClose={correctionModal.close}
        onUpdate={update}
        onReverse={() => openReverseConfirm(editingRow)}
      />

      <ReverseModal
        modal={reverseModal}
        row={findRow(pendingReverseRef)}
        onCancel={cancelReverse}
        onConfirm={confirmReverse}
      />

      <div className={`toast${toast ? ' show' : ''}${toast?.kind ? ` ${toast.kind}` : ''}`}>{toast?.message}</div>
    </div>
  )
}

function FilterSelect({
  title,
  all,
  value,
  options,
  onChange,
}: {
  title: string
  all: string
  value: string
  options: Array<[string, string]>
  onChange: (value: string) => void
}) {
  return (
    <select className="control filter-select" title={title} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{all}</option>
      {options.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  )
}

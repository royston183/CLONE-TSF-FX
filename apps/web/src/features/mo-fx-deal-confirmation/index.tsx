import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { BlotterDateField } from './BlotterDateField.tsx'
import { ComboBox } from './ComboBox.tsx'
import { CorrectionModal } from './CorrectionModal.tsx'
import { generateDeals } from './data.ts'
import { DealsTable } from './DealsTable.tsx'
import {
  COMPANY_OPTIONS,
  EMPTY_FILTERS,
  EMPTY_SELECTION,
  TRADER_OPTIONS,
  applyDragRange,
  applySelection,
  correctionMessage,
  dealCountLabel,
  dealSummary,
  dragModeFor,
  filterDeals,
  filterOptions,
  isBlotterDateValid,
  isCorrectionValid,
  markCorrectionRequired,
  matchReleaseDeals,
  matchReleaseMessage,
  nextSort,
  pageOf,
  rowClickSelection,
  selectedDeals,
} from './logic.ts'
import { MatchReleaseModal, type MatchReleaseValues } from './MatchReleaseModal.tsx'
import { useModal } from './modal.tsx'
import { Pagination } from './Pagination.tsx'
import { StatusModal } from './StatusModal.tsx'
import { Toasts } from './Toasts.tsx'
import './mo-fx-deal-confirmation.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './mo-fx-deal-confirmation.dark.css'
import type {
  AppliedSelection,
  Deal,
  DealSummary,
  DealType,
  DragMode,
  Filters,
  SelectionForm,
  Sort,
  SortKey,
  StatusModalState,
  Toast,
  ToastType,
} from './types.ts'

const TOAST_MS = 3800
const TOAST_FADE_MS = 260
const REFRESH_MS = 550
const EMPTY_SUMMARY: DealSummary = { dealId: '-', partner: '-', coverNo: '' }
const EMPTY_MR: MatchReleaseValues = { externalRef: '', internalRef: '', remarks: '' }

const FILTER_FIELDS: Array<{ key: keyof Filters; id: string; label: string }> = [
  { key: 'coCode', id: 'filterCoCode', label: 'Company Code' },
  { key: 'txnType', id: 'filterTxnType', label: 'Transaction Type' },
  { key: 'partner', id: 'filterPartner', label: 'Partner / Bank' },
  { key: 'trader', id: 'filterTrader', label: 'Trader' },
  { key: 'ccy1', id: 'filterCcy1', label: 'Currency 1' },
  { key: 'ccy2', id: 'filterCcy2', label: 'Currency 2' },
  { key: 'status', id: 'filterStatus', label: 'Transaction Status' },
]

/**
 * TSF MO Deal Confirmation - FX & Options (ZSGTSFR024), converted from
 * legacy/fx-deal-confirmation.html.
 *
 * The original never called an API, so this is the same UI-only screen: the deal queue lives
 * in component state for the session, seeded from data.ts. MO picks a Company Code range,
 * Upto Blotter Date and Display Type, then Matches & Releases deals (they leave the queue) or
 * sends them back to FO as Correction Required.
 */
export default function MoFxDealConfirmation() {
  const [deals, setDeals] = useState<Deal[]>(() => generateDeals())

  // Basic Selection
  const [form, setForm] = useState<SelectionForm>(EMPTY_SELECTION)
  const [dateInvalid, setDateInvalid] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [applied, setApplied] = useState<AppliedSelection>(() => applySelection(EMPTY_SELECTION))

  // Results
  const [filterOpen, setFilterOpen] = useState(false)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<Sort>({ key: null, dir: 'asc' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [refreshing, setRefreshing] = useState(false)

  // Checkbox-column drag
  const drag = useRef<{ anchor: number; mode: DragMode } | null>(null)
  const [dragging, setDragging] = useState(false)

  // Modals
  const mrModal = useModal()
  const crModal = useModal()
  const statusModal = useModal()
  const [mrSummary, setMrSummary] = useState<DealSummary>(EMPTY_SUMMARY)
  const [mrValues, setMrValues] = useState<MatchReleaseValues>(EMPTY_MR)
  const [crSummary, setCrSummary] = useState<DealSummary>(EMPTY_SUMMARY)
  const [crRemarks, setCrRemarks] = useState('')
  const [crError, setCrError] = useState(false)
  const [status, setStatus] = useState<StatusModalState>({ type: 'success', title: ' ', heading: 'Success', message: '' })

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastSeq = useRef(0)
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  const later = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.current.delete(t)
      fn()
    }, ms)
    timers.current.add(t)
  }, [])
  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const t of pending) clearTimeout(t)
      pending.clear()
    }
  }, [])

  const showToast = (type: ToastType, title: string, message: string) => {
    const id = ++toastSeq.current
    setToasts((ts) => [...ts, { id, type, title, message, fading: false }])
    later(() => {
      setToasts((ts) => ts.map((t) => (t.id === id ? { ...t, fading: true } : t)))
      later(() => setToasts((ts) => ts.filter((t) => t.id !== id)), TOAST_FADE_MS)
    }, TOAST_MS)
  }

  const rows = useMemo(() => filterDeals(deals, applied, filters, search, sort), [deals, applied, filters, search, sort])
  const paged = pageOf(rows, page, pageSize)
  const options = useMemo(() => filterOptions(deals), [deals])

  // A mouseup anywhere ends a checkbox drag.
  useEffect(() => {
    const onUp = () => {
      if (!drag.current) return
      drag.current = null
      setDragging(false)
    }
    document.addEventListener('mouseup', onUp)
    return () => document.removeEventListener('mouseup', onUp)
  }, [])

  // ------------------------------------------------------------------ selection screen

  const patchForm = (patch: Partial<SelectionForm>) => setForm((f) => ({ ...f, ...patch }))

  const viewDeals = () => {
    if (!isBlotterDateValid(form.blotterDate)) {
      setDateInvalid(true)
      return
    }
    setDateInvalid(false)
    setApplied(applySelection(form))
    setPage(1)
    setSelected(new Set())
    setShowResults(true)
    setCollapsed(true)
  }

  const resetSelection = () => {
    setForm(EMPTY_SELECTION)
    setDateInvalid(false)
    setShowResults(false)
  }

  // ------------------------------------------------------------------ table

  const setFilter = (key: keyof Filters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }))
    setPage(1)
  }

  const onSort = (key: SortKey) => setSort((s) => nextSort(s, key))

  const pageIds = paged.rows.map((d) => d.id)

  const onCheckboxDown = (rowIndex: number, deal: Deal) => {
    const mode = dragModeFor(selected, deal.id)
    drag.current = { anchor: rowIndex, mode }
    setDragging(true)
    setSelected((s) => applyDragRange(s, pageIds, rowIndex, rowIndex, mode))
  }

  const onCheckboxEnter = (rowIndex: number) => {
    const d = drag.current
    if (!d) return
    setSelected((s) => applyDragRange(s, pageIds, d.anchor, rowIndex, d.mode))
  }

  const refresh = () => {
    setRefreshing(true)
    // Future: re-fetch the queue from the ZSGTSFR024 service; the demo keeps its in-memory rows.
    later(() => {
      setRefreshing(false)
      setStatus({
        type: 'success',
        title: 'Deals Refreshed',
        heading: 'Deals Refreshed',
        message: 'All FX & Options deals have been refreshed successfully.',
      })
      statusModal.open()
    }, REFRESH_MS)
  }

  // ------------------------------------------------------------------ match & release / correction

  const openMatchRelease = () => {
    const list = selectedDeals(deals, selected)
    if (list.length === 0) return
    setMrSummary(dealSummary(list))
    setMrValues(EMPTY_MR)
    mrModal.open()
  }

  const confirmMatchRelease = () => {
    const list = selectedDeals(deals, selected)
    if (list.length === 0) return
    setDeals((all) => matchReleaseDeals(all, selected, mrValues.remarks))
    setSelected(new Set())
    mrModal.close()
    showToast('success', 'Matched & Released', matchReleaseMessage(list))
  }

  const openCorrection = () => {
    const list = selectedDeals(deals, selected)
    if (list.length === 0) return
    setCrSummary(dealSummary(list))
    setCrRemarks('')
    setCrError(false)
    crModal.open()
  }

  const confirmCorrection = () => {
    const list = selectedDeals(deals, selected)
    if (list.length === 0) return
    if (!isCorrectionValid(crRemarks)) {
      setCrError(true)
      return
    }
    setDeals((all) => markCorrectionRequired(all, selected, crRemarks))
    setSelected(new Set())
    crModal.close()
    showToast('error', 'Correction Requested', correctionMessage(list))
  }

  // ------------------------------------------------------------------ render

  const hasSelection = selected.size > 0
  const displayTypes: DealType[] = ['FX', 'Options']

  return (
    <div className="mo-fx-deal-confirmation">
      <div className="app">
        <header className="app-header">
          <BackButton className="btn btn-secondary" />
          <div className="fs-logo">
            <span className="bar bar1" />
            <span className="bar bar2" />
            <span className="bar bar3" />
            <span className="bar bar4" />
          </div>
          <div className="app-title">
            FX Deal Confirmation - FX&amp;Options
            <small>Review, match and release FX &amp; Options deal confirmations</small>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <SignOutButton className="btn btn-secondary" />
          </div>
        </header>

        <main>
          {/* BASIC SELECTION */}
          <section className={`card${collapsed ? ' collapsed' : ''}`} id="selectionCard">
            <div className="card-header" id="selectionCardHeader" onClick={() => setCollapsed((c) => !c)}>
              <h2>Basic Selection</h2>
              <span className="collapse-icon">&#9660;</span>
            </div>
            <div className="card-body">
              <div className="form-grid">
                <div className="field">
                  <label>
                    Company Code <span className="req">*</span>
                  </label>
                  <div className="field-row">
                    <ComboBox
                      id="companyCodeCombo"
                      inputId="companyCodeInput"
                      panelId="companyCodePanel"
                      text={form.companyCodeText}
                      options={COMPANY_OPTIONS}
                      showSub
                      onText={(t) => patchForm({ companyCodeText: t })}
                      onPick={(o) => patchForm({ companyCode: o ? o.code : '' })}
                    />
                    <span className="to-label">to</span>
                    <ComboBox
                      id="companyCodeToCombo"
                      inputId="companyCodeToInput"
                      panelId="companyCodeToPanel"
                      text={form.companyCodeToText}
                      options={COMPANY_OPTIONS}
                      showSub
                      onText={(t) => patchForm({ companyCodeToText: t })}
                      onPick={(o) => patchForm({ companyCodeTo: o ? o.code : '' })}
                    />
                  </div>
                </div>

                <div className="field">
                  <label>
                    Upto Blotter Date <span className="req">*</span>
                  </label>
                  <BlotterDateField
                    value={form.blotterDate}
                    invalid={dateInvalid}
                    onChange={(v) => {
                      patchForm({ blotterDate: v })
                      setDateInvalid(false)
                    }}
                  />
                  <span className="field-error" id="blotterDateError">
                    Upto Blotter Date is required.
                  </span>
                </div>

                <div className="field">
                  <label>Trader Name</label>
                  <ComboBox
                    id="traderCombo"
                    inputId="traderInput"
                    panelId="traderPanel"
                    text={form.traderText}
                    options={TRADER_OPTIONS}
                    showSub={false}
                    onText={(t) => patchForm({ traderText: t })}
                    onPick={(o) => patchForm({ trader: o ? o.code : '' })}
                  />
                </div>

                <div className="field">
                  <label htmlFor="layoutInput">Layout</label>
                  <input
                    className="input"
                    id="layoutInput"
                    placeholder="Select ..."
                    value={form.layout}
                    onChange={(e) => patchForm({ layout: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-grid" style={{ marginTop: 16 }}>
                <div className="field">
                  <label>Display Type</label>
                  <div className="radio-group" id="displayTypeGroup">
                    {displayTypes.map((t) => (
                      <label key={t} className="radio-opt">
                        <input
                          type="radio"
                          name="displayType"
                          value={t}
                          checked={form.displayType === t}
                          onChange={() => patchForm({ displayType: t })}
                        />
                        <span className="radio-dot" /> {t}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
                <button className="btn btn-primary" id="viewDealsBtn" type="button" onClick={viewDeals}>
                  View Deals
                </button>
                <button className="btn btn-secondary" id="resetSelectionBtn" type="button" onClick={resetSelection}>
                  Reset
                </button>
              </div>
            </div>
          </section>

          {/* EMPTY STATE (before execute) */}
          <section className={`card${showResults ? ' hidden' : ''}`} id="preExecuteState">
            <div className="state-block">
              <div className="state-icon">&#128269;</div>
              <h3>Enter selection criteria to begin</h3>
              <p>Choose Company Code, Upto Blotter Date and Display Type to load deals.</p>
            </div>
          </section>

          {/* RESULTS */}
          <section className={`card${showResults ? '' : ' hidden'}`} id="resultsCard">
            <div className="toolbar">
              <div className="search-box">
                <span className="icon">&#128269;</span>
                <input
                  className="input"
                  id="searchInput"
                  placeholder="Search Deal ID, Transaction, Bank, Trader, Status..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setPage(1)
                  }}
                />
              </div>
              <button className="btn btn-secondary" id="filterToggleBtn" type="button" onClick={() => setFilterOpen((o) => !o)}>
                &#9776; Filters
              </button>
              <div className="deal-count" id="dealCountLabel">
                {dealCountLabel(rows.length)}
              </div>
            </div>

            <div className={`filter-panel${filterOpen ? ' open' : ''}`} id="filterPanel">
              {FILTER_FIELDS.map((f) => (
                <div key={f.key} className="field">
                  <label htmlFor={f.id}>{f.label}</label>
                  <select className="input" id={f.id} value={filters[f.key]} onChange={(e) => setFilter(f.key, e.target.value)}>
                    <option value="">All</option>
                    {options[f.key].map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <div className="field-actions">
                <button
                  className="btn btn-secondary btn-sm"
                  id="clearFiltersBtn"
                  type="button"
                  onClick={() => {
                    setFilters(EMPTY_FILTERS)
                    setPage(1)
                  }}
                >
                  Clear Filters
                </button>
              </div>
            </div>

            <div className="toolbar" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="toolbar-actions">
                <button className="btn btn-outline-blue" id="matchReleaseBtn" type="button" disabled={!hasSelection} onClick={openMatchRelease}>
                  &#10003; Match &amp; Release
                </button>
                <button className="btn btn-danger" id="correctionBtn" type="button" disabled={!hasSelection} onClick={openCorrection}>
                  &#9888; Correction Required
                </button>
                <span className="spacer" />
                <button className="btn btn-secondary" id="refreshBtn" type="button" disabled={refreshing} onClick={refresh}>
                  <span id="refreshIcon" className={refreshing ? 'spin' : undefined}>
                    &#8635;
                  </span>{' '}
                  Refresh
                </button>
              </div>
            </div>

            <div className="table-wrap">
              <DealsTable
                rows={paged.rows}
                sort={sort}
                selected={selected}
                dragging={dragging}
                onSort={onSort}
                onRowClick={(deal) => setSelected((s) => rowClickSelection(s, deal.id))}
                onCheckboxDown={onCheckboxDown}
                onCheckboxEnter={onCheckboxEnter}
              />
            </div>

            <Pagination
              total={paged.total}
              page={paged.page}
              totalPages={paged.totalPages}
              startIdx={paged.startIdx}
              shown={paged.rows.length}
              pageSize={pageSize}
              onPage={setPage}
              onPageSize={(n) => {
                setPageSize(n)
                setPage(1)
              }}
            />
          </section>
        </main>
      </div>

      <MatchReleaseModal
        modal={mrModal}
        summary={mrSummary}
        values={mrValues}
        onChange={(patch) => setMrValues((v) => ({ ...v, ...patch }))}
        onConfirm={confirmMatchRelease}
      />

      <CorrectionModal
        modal={crModal}
        summary={crSummary}
        remarks={crRemarks}
        remarksError={crError}
        onRemarksChange={(v) => {
          setCrRemarks(v)
          if (v.trim()) setCrError(false)
        }}
        onConfirm={confirmCorrection}
      />

      <StatusModal modal={statusModal} status={status} />

      <Toasts toasts={toasts} />
    </div>
  )
}

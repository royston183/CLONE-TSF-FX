import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { ResultQueue, type ResultItem } from '../../shared/ui/ResultQueue.tsx'
import { BlotterDateField } from './BlotterDateField.tsx'
import { ComboBox } from './ComboBox.tsx'
import { CorrectionModal } from './CorrectionModal.tsx'
import { isAbort } from '../../shared/fx/mw.ts'
import { loadFxDeals, sapMessage } from './api.ts'
import { generateDeals } from './data.ts'
import { DealsTable } from './DealsTable.tsx'
import {
  COMPANY_OPTIONS,
  EMPTY_FILTERS,
  EMPTY_SELECTION,
  TRADER_OPTIONS,
  applyDone,
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
  mergeLiveDeals,
  nextSort,
  pageOf,
  rowClickSelection,
  selectedCompanyCodes,
  selectedDeals,
  withoutFxDeals,
} from './logic.ts'
import { MatchReleaseModal, type MatchReleaseValues } from './MatchReleaseModal.tsx'
import { useModal } from './modal.tsx'
import { Pagination } from './Pagination.tsx'
import { StatusModal } from './StatusModal.tsx'
import {
  matchAndReleaseDeals,
  requestCorrectionDeals,
  retryWorkflowSave,
  selectionBlockMessage,
  type MoBatch,
  type PendingSave,
} from './workflow.ts'
import './mo-fx-deal-confirmation.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './mo-fx-deal-confirmation.dark.css'
import './mo-fx-deal-confirmation.overrides.css'
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
  ToastType,
} from './types.ts'

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
 * TSF MO Deal Check - FX & Options (ZSGTSF_ROPTION_MO_EXT). MO picks a Company Code range, Upto Blotter Date,
 * Trader and Display Type; the FX worklist is the APP_STR records in status 03 / 04 / 06 joined to their SAP
 * transactions. Match & Release settles in SAP and then writes 07 (59 for a cancellation deal); Correction
 * Required writes 04 with the MO remark. The Options rows are still sample data: no Options service is configured.
 */
export default function MoFxDealConfirmation() {
  // Options rows are dummy data; the FX rows are read from SAP (see loadFx) and are not shown until they are.
  const [deals, setDeals] = useState<Deal[]>(() => withoutFxDeals(generateDeals()))

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
  /** Settled in SAP, workflow save failed: kept so the save can be retried without settling again. */
  const [pending, setPending] = useState<PendingSave[]>([])

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

  // Outcomes queue as the standard ResultDialog and stay until OK.
  const [results, setResults] = useState<ResultItem[]>([])
  const toastSeq = useRef(0)
  const showToast = (type: ToastType, title: string, message: string) => {
    setResults((r) => [...r, { id: ++toastSeq.current, tone: type === 'error' ? 'error' : 'success', title, message }])
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
    setRefreshing(true)
    void loadFx(applySelection(form)).then((message) => {
      setRefreshing(false)
      if (message) showToast('error', 'FX deals not loaded', message)
    })
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

  /**
   * Reads the FX worklist from the backend into the queue. A failure leaves the queue as it was and says so:
   * no stand-in FX rows are ever shown.
   */
  const loadFx = useCallback(async (sel: AppliedSelection, signal?: AbortSignal): Promise<string | null> => {
    if (!sel.upTo) return null
    try {
      const live = await loadFxDeals(sel.upTo, selectedCompanyCodes(sel), signal)
      if (signal?.aborted) return null
      setDeals((current) => mergeLiveDeals(current, live))
      return null
    } catch (error) {
      if (signal?.aborted || isAbort(error)) return null
      return sapMessage(error)
    }
  }, [])

  const refresh = async () => {
    setRefreshing(true)
    const message = await loadFx(applied)
    setRefreshing(false)
    setStatus(
      message
        ? { type: 'error', title: 'Refresh Failed', heading: 'Could not read the FX deals', message }
        : {
            type: 'success',
            title: 'Deals Refreshed',
            heading: 'Deals Refreshed',
            message: 'The FX deals were read again from SAP and the application data; the Options rows are sample data.',
          },
    )
    statusModal.open()
  }

  // ------------------------------------------------------------------ match & release / correction

  const blocked = (list: readonly Deal[]): boolean => {
    const message = selectionBlockMessage(list)
    if (!message) return false
    setStatus({ type: 'error', title: 'Not allowed', heading: 'This deal cannot be processed', message })
    statusModal.open()
    return true
  }

  const openMatchRelease = () => {
    const list = selectedDeals(deals, selected)
    if (list.length === 0 || blocked(list)) return
    setMrSummary(dealSummary(list))
    setMrValues(EMPTY_MR)
    mrModal.open()
  }

  /** True while a run is in progress: the modal closes at once, so a second click must not start another. */
  const busy = useRef(false)

  /** Shows a batch's failure, and keeps the retry data when SAP settled but the workflow save did not. */
  const reportFailure = (outcome: MoBatch, title: string) => {
    const f = outcome.failed
    if (!f) return
    const p = f.pending
    if (p) setPending((all) => [...all.filter((x) => x.id !== p.id), p])
    setStatus({
      type: 'error',
      title,
      heading: f.stage === 'settle' ? `SAP did not settle ${f.id}` : f.stage === 'workflow' ? 'Workflow data not saved' : 'Not processed',
      message: (outcome.done.length ? `${outcome.done.length} deal(s) were completed before it. ` : '') + f.reason,
    })
    statusModal.open()
  }

  /**
   * FX deals: SAP settles first, then the status is written (07, or 59 for a cancellation deal). The batch stops at
   * the first failure. The Options rows have no service and keep their on-screen behaviour.
   */
  const confirmMatchRelease = async () => {
    const list = selectedDeals(deals, selected)
    if (list.length === 0 || busy.current) return
    busy.current = true
    mrModal.close()
    try {
      const fx = list.filter((d) => d.live)
      const sample = new Set(list.filter((d) => !d.live).map((d) => d.id))
      const outcome = await matchAndReleaseDeals(fx, { externalRef: mrValues.externalRef, internalRef: mrValues.internalRef, moRemark: mrValues.remarks })
      const done = new Set([...outcome.done.map((d) => d.id), ...sample])
      setDeals((all) => matchReleaseDeals(applyDone(all, outcome.done), sample, mrValues.remarks))
      setSelected((s) => new Set([...s].filter((id) => !done.has(id))))
      if (outcome.failed) return reportFailure(outcome, 'Match & Release stopped')
      showToast(
        'success',
        'Matched & Released',
        matchReleaseMessage(list) + (outcome.notStored.length ? ` Not saved: ${outcome.notStored.join('; ')}.` : ''),
      )
    } finally {
      busy.current = false
    }
  }

  const retrySaves = async () => {
    if (busy.current || pending.length === 0) return
    busy.current = true
    try {
      const results = await Promise.all(pending.map((p) => retryWorkflowSave(p)))
      const ok = results.flatMap((r) => (r.ok ? [r.done] : []))
      setDeals((all) => applyDone(all, ok))
      setPending((all) => all.filter((_, i) => !results[i]?.ok))
      const failed = results.find((r) => !r.ok)
      if (failed && !failed.ok) {
        setStatus({ type: 'error', title: 'Retry failed', heading: 'Workflow data still not saved', message: failed.reason })
        statusModal.open()
      } else {
        showToast('success', 'Workflow data saved', `${ok.length} deal(s) saved; SAP was not asked to settle them again.`)
      }
    } finally {
      busy.current = false
    }
  }

  const openCorrection = () => {
    const list = selectedDeals(deals, selected)
    if (list.length === 0 || blocked(list)) return
    setCrSummary(dealSummary(list))
    setCrRemarks('')
    setCrError(false)
    crModal.open()
  }

  const confirmCorrection = async () => {
    const list = selectedDeals(deals, selected)
    if (list.length === 0 || busy.current) return
    if (!isCorrectionValid(crRemarks)) {
      setCrError(true)
      return
    }
    busy.current = true
    crModal.close()
    try {
      const fx = list.filter((d) => d.live)
      const sample = new Set(list.filter((d) => !d.live).map((d) => d.id))
      const outcome = await requestCorrectionDeals(fx, crRemarks)
      const done = new Set([...outcome.done.map((d) => d.id), ...sample])
      setDeals((all) => markCorrectionRequired(applyDone(all, outcome.done), sample, crRemarks))
      setSelected((s) => new Set([...s].filter((id) => !done.has(id))))
      if (outcome.failed) return reportFailure(outcome, 'Correction Required stopped')
      showToast('error', 'Correction Requested', correctionMessage(list) + (outcome.notStored.length ? ` Not saved: ${outcome.notStored.join('; ')}.` : ''))
    } finally {
      busy.current = false
    }
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
                {pending.length > 0 && (
                  <button className="btn btn-primary" id="retrySaveBtn" type="button" onClick={retrySaves}>
                    Retry workflow save ({pending.length})
                  </button>
                )}
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

      <ResultQueue items={results} onDismiss={(id) => setResults((r) => r.filter((x) => x.id !== id))} />
    </div>
  )
}

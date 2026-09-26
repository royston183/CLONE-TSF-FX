import { useEffect, useMemo, useRef, useState } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { CorrectionModal, InfoModal, MatchReleaseModal, type MatchReleaseValues } from './ActionModals.tsx'
import { COMPANY_CODES, TRADERS, createNdfDataset } from './data.ts'
import { FilterPanel } from './FilterPanel.tsx'
import { FixingDateField } from './FixingDateField.tsx'
import { formatAmount } from './format.ts'
import {
  EMPTY_FILTERS,
  computeResults,
  countActiveFilters,
  ensureDataForCriteria,
  markCorrectionRequired,
  matchReleaseDeal,
  nextSort,
  pageOf,
  pagerWindow,
  parseAmountInput,
  resultsMeta,
  validateSelection,
} from './logic.ts'
import { NdfTable } from './NdfTable.tsx'
import { SearchableDropdown } from './SearchableDropdown.tsx'
import './mo-confirm-ndf-fixing.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './mo-confirm-ndf-fixing.dark.css'
import type { DropdownItem, Filters, InfoMessage, NdfDeal, Selection, SelectionErrors, Sort, SortField } from './types.ts'

const COMPANY_CODE_ITEMS: DropdownItem[] = COMPANY_CODES.map((c) => ({ primary: c }))
const TRADER_ITEMS: DropdownItem[] = TRADERS.map((t) => ({ primary: `${t.code} - ${t.name}`, code: t.code }))
const EMPTY_SELECTION: Selection = { companyCode: '', companyCodeTo: '', fixingDate: '', ndfValue: '', trader: '' }
const NO_ERRORS: SelectionErrors = { companyCode: null, fixingDate: null }
const EMPTY_MR: MatchReleaseValues = { externalRef: '', internalRef: '', remarks: '' }
/** How long the Refresh icon spins, and how long after it the "refreshed" notice appears. */
const SPIN_MS = 620
const REFRESH_NOTICE_MS = 300

type OpenModal = 'matchRelease' | 'correction' | null

/**
 * MO: Confirm NDF Fixing (ZSGTSFR026), converted from legacy/confirm-ndf-fixing.html.
 *
 * The original never called an API, so this is the same UI-only screen: the deals are the
 * page's generated dummy data and live in component state for the session. Deals matched &
 * released or sent back for correction drop out of the list until the page is reloaded.
 */
export default function MoConfirmNdfFixing() {
  // One initialiser for both, so the generator's position always matches the deals it made.
  const [initial] = useState(createNdfDataset)
  const rng = initial.rng
  const [deals, setDeals] = useState<NdfDeal[]>(initial.deals)
  const [processedIds, setProcessedIds] = useState<ReadonlySet<string>>(() => new Set())

  // Basic Selection: the text in each box, and the page's state.selection behind it.
  const [ccText, setCcText] = useState('')
  const [ccToText, setCcToText] = useState('')
  const [ndfText, setNdfText] = useState('')
  const [traderText, setTraderText] = useState('')
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION)
  const [errors, setErrors] = useState<SelectionErrors>(NO_ERRORS)
  const [dealsLoaded, setDealsLoaded] = useState(false)
  /**
   * The selection the list was last worked out from. The page recomputed the list from the
   * live selection only when something asked it to (View Deals, search, filters, sort,
   * refresh, an action) — typing in the Basic Selection alone left the table as it was.
   */
  const [applied, setApplied] = useState<Selection>(EMPTY_SELECTION)

  // Results
  const [search, setSearch] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [sort, setSort] = useState<Sort>({ field: null, dir: 'asc' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [spinning, setSpinning] = useState(false)

  // Dialogs
  const [openModal, setOpenModal] = useState<OpenModal>(null)
  const [modalDeal, setModalDeal] = useState<NdfDeal | null>(null)
  const [mrValues, setMrValues] = useState<MatchReleaseValues>(EMPTY_MR)
  const [crRemarks, setCrRemarks] = useState('')
  const [crError, setCrError] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [info, setInfo] = useState<InfoMessage>({ variant: 'success', title: 'Success', desc: 'Done.' })

  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms))
  }

  const results = useMemo(
    () => (dealsLoaded ? computeResults(deals, applied, processedIds, filters, search, sort) : []),
    [dealsLoaded, deals, applied, processedIds, filters, search, sort],
  )
  const paged = dealsLoaded && results.length ? pageOf(results, page, pageSize) : null
  // The page pulled state.page back to the last page whenever the list shrank below it.
  useEffect(() => {
    if (paged && paged.page !== page) setPage(paged.page)
  }, [paged, page])
  // The pill only updated while deals were loaded.
  const filterCount = dealsLoaded ? countActiveFilters(filters) : 0
  const selectedDeal = selectedId ? (deals.find((d) => d.id === selectedId) ?? null) : null

  /** The page's applyFiltersAndRender: rework the list from the selection as it stands now. */
  const reapply = () => setApplied(selection)

  const patchSelection = (patch: Partial<Selection>) => setSelection((s) => ({ ...s, ...patch }))

  // ------------------------------------------------------------------ Basic Selection

  const viewDeals = () => {
    const errs = validateSelection(selection)
    setErrors(errs)
    if (errs.companyCode || errs.fixingDate) return

    // Company code casing is normalised so it matches consistently everywhere.
    const cc = selection.companyCode.trim().toUpperCase()
    const next = { ...selection, companyCode: cc }
    setSelection(next)
    setCcText(cc)
    if (!selection.companyCodeTo.trim()) {
      setDeals(ensureDataForCriteria(deals, rng, cc, selection.fixingDate.trim()))
    }
    setDealsLoaded(true)
    setPage(1)
    setSelectedId(null)
    setApplied(next)
  }

  // ------------------------------------------------------------------ toolbar

  const onSearch = (value: string) => {
    setSearch(value)
    setPage(1)
    reapply()
  }

  const onFilter = (key: keyof Filters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }))
    setPage(1)
    reapply()
  }

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS)
    setPage(1)
    reapply()
  }

  const onSort = (field: SortField) => {
    setSort((s) => nextSort(s, field))
    reapply()
  }

  const showInfo = (message: InfoMessage) => {
    setInfo(message)
    setInfoOpen(true)
  }

  const refresh = () => {
    setSpinning(true)
    later(() => setSpinning(false), SPIN_MS)
    // The original simulated a re-fetch that kept the session's edits; nothing is reset.
    if (dealsLoaded) reapply()
    later(
      () => showInfo({ variant: 'success', title: 'Deals Refreshed', desc: 'All NDF fixing deals have been refreshed successfully.' }),
      REFRESH_NOTICE_MS,
    )
  }

  // ------------------------------------------------------------------ actions

  const openMatchRelease = () => {
    if (!selectedDeal) return
    setModalDeal(selectedDeal)
    setMrValues({ externalRef: selectedDeal.externalRef || '', internalRef: selectedDeal.internalRef || '', remarks: '' })
    setOpenModal('matchRelease')
  }

  const openCorrection = () => {
    if (!selectedDeal) return
    setModalDeal(selectedDeal)
    setCrRemarks('')
    setCrError(false)
    setOpenModal('correction')
  }

  const closeModal = () => setOpenModal(null)

  const confirmMatchRelease = () => {
    const deal = selectedDeal
    if (!deal) return
    setDeals(matchReleaseDeal(deals, deal.id, mrValues.externalRef.trim(), mrValues.internalRef.trim(), mrValues.remarks.trim()))
    setProcessedIds((s) => new Set(s).add(deal.id))
    setSelectedId(null)
    closeModal()
    reapply()
    showInfo({ variant: 'success', title: 'NDF Fixing Confirmed', desc: `Deal ${deal.dealId} was matched and released successfully.` })
  }

  const confirmCorrection = () => {
    const deal = selectedDeal
    if (!deal) return
    const remarks = crRemarks.trim()
    if (!remarks) {
      setCrError(true)
      return
    }
    setDeals(markCorrectionRequired(deals, deal.id, remarks))
    setProcessedIds((s) => new Set(s).add(deal.id))
    setSelectedId(null)
    closeModal()
    reapply()
    showInfo({ variant: 'warn', title: 'Correction Requested', desc: 'The selected NDF deal has been sent back to FO for correction.' })
  }

  // ------------------------------------------------------------------ render

  return (
    <div className="mo-confirm-ndf-fixing">
      <div className="app">
        {/* ============ HEADER ============ */}
        <div className="app-header">
          <BackButton className="btn btn-secondary" />
          <div className="fs-logo">
            <svg viewBox="0 0 88 132" xmlns="http://www.w3.org/2000/svg">
              <rect x="0" y="0" width="88" height="30" rx="15" fill="#C62127" />
              <circle cx="15" cy="15" r="15" fill="#931B1D" />
              <rect x="0" y="34" width="63" height="30" rx="15" fill="#F0B31A" />
              <circle cx="15" cy="49" r="15" fill="#CF9B2B" />
              <rect x="0" y="68" width="45" height="30" rx="15" fill="#138842" />
              <circle cx="15" cy="83" r="15" fill="#12592F" />
              <circle cx="15" cy="117" r="14.5" fill="#818286" />
            </svg>
          </div>
          <div>
            <div className="app-title">Confirm NDF Fixing</div>
            <div className="app-subtitle">Treasury &middot; MO Confirmation</div>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <SignOutButton className="btn btn-secondary" />
          </div>
        </div>

        {/* ============ BASIC SELECTION ============ */}
        <div className="card">
          <div className="card-title">Basic Selection</div>
          <div className="field-row">
            <div className="field w-company">
              <label>
                Company Code<span className="req">*</span>
              </label>
              <div className="company-code-row">
                <SearchableDropdown
                  inputId="companyCodeInput"
                  panelId="companyCodePanel"
                  placeholder="Select company code"
                  wrapStyle={{ flex: 1 }}
                  value={ccText}
                  items={COMPANY_CODE_ITEMS}
                  invalid={!!errors.companyCode}
                  onType={(raw) => {
                    setCcText(raw)
                    patchSelection({ companyCode: raw.trim() })
                  }}
                  onBlur={() => {
                    const v = ccText.trim().toUpperCase()
                    setCcText(v)
                    patchSelection({ companyCode: v })
                  }}
                  onSelect={(item) => {
                    setCcText(item.primary)
                    patchSelection({ companyCode: item.primary })
                    setErrors((e) => ({ ...e, companyCode: null }))
                  }}
                />
                <span className="to-label">to</span>
                <SearchableDropdown
                  inputId="companyCodeToInput"
                  panelId="companyCodeToPanel"
                  inputClassName="input to-input"
                  placeholder="Optional"
                  value={ccToText}
                  items={COMPANY_CODE_ITEMS}
                  onType={(raw) => {
                    setCcToText(raw)
                    patchSelection({ companyCodeTo: raw.trim() })
                  }}
                  onBlur={() => {
                    const v = ccToText.trim().toUpperCase()
                    setCcToText(v)
                    patchSelection({ companyCodeTo: v })
                  }}
                  onSelect={(item) => {
                    setCcToText(item.primary)
                    patchSelection({ companyCodeTo: item.primary })
                  }}
                />
              </div>
              <div id="companyCodeError" className={`validation-msg${errors.companyCode ? '' : ' hidden'}`}>
                {errors.companyCode ?? 'Company Code is required.'}
              </div>
            </div>

            <div className="field w-date">
              <label>
                Fixing Date<span className="req">*</span>
              </label>
              <FixingDateField
                value={selection.fixingDate}
                invalid={!!errors.fixingDate}
                onType={(raw) => {
                  patchSelection({ fixingDate: raw })
                  setErrors((e) => ({ ...e, fixingDate: null }))
                }}
                onPick={(dmy) => {
                  patchSelection({ fixingDate: dmy })
                  setErrors((e) => ({ ...e, fixingDate: null }))
                }}
              />
              <div id="fixingDateError" className={`validation-msg${errors.fixingDate ? '' : ' hidden'}`}>
                {errors.fixingDate ?? 'Fixing Date is required.'}
              </div>
            </div>

            <div className="field w-amount">
              <label>NDF Value</label>
              <input
                type="text"
                id="ndfValueInput"
                className="input right"
                placeholder="0.00"
                value={ndfText}
                onChange={(e) => setNdfText(e.target.value)}
                onBlur={() => {
                  const v = parseAmountInput(ndfText)
                  const shown = v !== null ? formatAmount(v) : ndfText
                  setNdfText(shown)
                  patchSelection({ ndfValue: shown })
                }}
              />
            </div>

            <div className="field w-trader">
              <label>Trader Name</label>
              <SearchableDropdown
                inputId="traderInput"
                panelId="traderPanel"
                placeholder="Select..."
                value={traderText}
                items={TRADER_ITEMS}
                onType={(raw) => {
                  setTraderText(raw)
                  if (raw.trim() === '') patchSelection({ trader: '' })
                }}
                onSelect={(item) => {
                  setTraderText(item.primary)
                  patchSelection({ trader: item.code ?? '' })
                }}
              />
            </div>

            <div className="field w-layout">
              <label>Layout</label>
              <input type="text" id="layoutInput" className="input" placeholder="Default" />
            </div>

            <div className="field field-btn">
              <div className="btn-spacer" />
              <button className="btn btn-primary" id="viewDealsBtn" type="button" onClick={viewDeals}>
                View Deals
              </button>
            </div>
          </div>
        </div>

        {/* ============ RESULTS ============ */}
        <div className="card results-card" id="resultsCard">
          <div className="toolbar">
            <div className="search-box">
              <span className="icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <circle cx="11" cy="11" r="7" stroke="#687b8d" strokeWidth="2" />
                  <path d="M21 21L16.65 16.65" stroke="#687b8d" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </span>
              <input
                type="text"
                id="searchInput"
                placeholder="Search Deal ID, Transaction, Partner, Trader, Status..."
                value={search}
                onChange={(e) => onSearch(e.target.value)}
              />
            </div>
            <button className="btn btn-secondary filter-toggle" id="filterToggleBtn" type="button" onClick={() => setFilterOpen((o) => !o)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M4 6H20M7 12H17M10 18H14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Filter
              <span className={`count-pill${filterCount > 0 ? '' : ' hidden'}`} id="filterCountPill">
                {filterCount}
              </span>
            </button>
          </div>

          <FilterPanel open={filterOpen} filters={filters} onChange={onFilter} onClear={clearFilters} />

          <div className="action-row">
            <button className="btn btn-primary" id="matchReleaseBtn" type="button" disabled={!selectedId} onClick={openMatchRelease}>
              Match &amp; Release
            </button>
            <button className="btn btn-danger" id="correctionBtn" type="button" disabled={!selectedId} onClick={openCorrection}>
              Correction Required
            </button>
            <button className="btn btn-secondary btn-icon" id="refreshBtn" type="button" title="Refresh" onClick={refresh}>
              <svg className={`spin${spinning ? ' spinning' : ''}`} id="refreshIcon" width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path d="M20 11A8 8 0 1 0 18.5 15.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M20 5V11H14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div className="action-row-spacer" />
            <span className="results-meta" id="resultsMeta">
              {resultsMeta(results.length, paged)}
            </span>
          </div>

          <NdfTable
            loaded={dealsLoaded}
            rows={paged ? paged.rows : []}
            sort={sort}
            selectedId={selectedId}
            onSort={onSort}
            onSelect={setSelectedId}
          />

          <div className={`pagination-bar${paged ? '' : ' hidden'}`} id="paginationBar">
            <div className="rows-per-page">
              Rows per page
              <select
                id="pageSizeSelect"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(parseInt(e.target.value, 10))
                  setPage(1)
                }}
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="25">25</option>
                <option value="50">50</option>
              </select>
            </div>
            <div className="pagination" id="paginationControls">
              {paged ? (
                <>
                  <button className="pg-btn" id="pgPrev" type="button" disabled={paged.page === 1} onClick={() => setPage(paged.page - 1)}>
                    &#8249;
                  </button>
                  {pagerWindow(paged.page, paged.totalPages).map((p) => (
                    <button key={p} className={`pg-btn ${p === paged.page ? 'active' : ''}`} type="button" onClick={() => setPage(p)}>
                      {p}
                    </button>
                  ))}
                  <button
                    className="pg-btn"
                    id="pgNext"
                    type="button"
                    disabled={paged.page === paged.totalPages}
                    onClick={() => setPage(paged.page + 1)}
                  >
                    &#8250;
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <MatchReleaseModal
        open={openModal === 'matchRelease'}
        deal={modalDeal}
        values={mrValues}
        onChange={(patch) => setMrValues((v) => ({ ...v, ...patch }))}
        onClose={closeModal}
        onConfirm={confirmMatchRelease}
      />

      <CorrectionModal
        open={openModal === 'correction'}
        deal={modalDeal}
        remarks={crRemarks}
        remarksError={crError}
        onRemarksChange={setCrRemarks}
        onClose={closeModal}
        onConfirm={confirmCorrection}
      />

      <InfoModal open={infoOpen} info={info} onClose={() => setInfoOpen(false)} />
    </div>
  )
}

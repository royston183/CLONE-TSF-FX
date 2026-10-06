import { useEffect, useMemo, useRef, useState } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { InfoModal, MatchReleaseModal } from './ActionModals.tsx'
import { fetchNdfDeal, loadCompanyCodes, loadNdfDeals, loadTraders, sapMessage, settleNdfDeal } from './api.ts'
import { CORRECTION_GAP, SELECTION_GAP } from './data.ts'
import { FilterPanel } from './FilterPanel.tsx'
import { FixingDateField } from './FixingDateField.tsx'
import { formatAmount } from './format.ts'
import {
  EMPTY_FILTERS,
  canMatchRelease,
  computeResults,
  countActiveFilters,
  nextSort,
  pageOf,
  pagerWindow,
  parseAmountInput,
  resultsMeta,
  unappliedCriteria,
  validateSelection,
} from './logic.ts'
import { NdfTable } from './NdfTable.tsx'
import { SearchableDropdown } from './SearchableDropdown.tsx'
import './mo-confirm-ndf-fixing.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './mo-confirm-ndf-fixing.dark.css'
import type { DropdownItem, Filters, InfoMessage, NdfDeal, Selection, SelectionErrors, Sort, SortField, Trader } from './types.ts'

const EMPTY_SELECTION: Selection = { companyCode: '', companyCodeTo: '', fixingDate: '', ndfValue: '', trader: '' }
const NO_ERRORS: SelectionErrors = { companyCode: null, fixingDate: null }
const SAP_ERROR = 'SAP Error'

/**
 * MO: Confirm NDF Fixing (ZSGTSFR026 / ZSGTSF_RFX_NDF_FIX_MO), converted from
 * legacy/confirm-ndf-fixing.html and wired to SAP (see api.ts for the full source map).
 *
 * Wired: the NDF list (FxTransaction), the Trader and Company Code value helps, partner and
 * transaction-type names, and Match & Release (the Settle action). Not wired, because the SAP
 * service cannot do it: Correction Required (stays disabled), the references and remark of
 * Match & Release, and the Trader / NDF Value selection. Nothing is mocked.
 */
export default function MoConfirmNdfFixing() {
  const [deals, setDeals] = useState<NdfDeal[]>([])
  const [traders, setTraders] = useState<Trader[]>([])
  const [companyCodes, setCompanyCodes] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [settling, setSettling] = useState(false)

  // Basic Selection: the text in each box, and the page's state.selection behind it.
  const [ccText, setCcText] = useState('')
  const [ccToText, setCcToText] = useState('')
  const [ndfText, setNdfText] = useState('')
  const [traderText, setTraderText] = useState('')
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION)
  const [errors, setErrors] = useState<SelectionErrors>(NO_ERRORS)
  const [dealsLoaded, setDealsLoaded] = useState(false)
  /**
   * The selection the list was last loaded with. Typing in the Basic Selection alone leaves the
   * table as it was; View Deals (and Refresh, which re-reads with this) change it.
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
  const [matchOpen, setMatchOpen] = useState(false)
  const [modalDeal, setModalDeal] = useState<NdfDeal | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)
  const [info, setInfo] = useState<InfoMessage>({ variant: 'success', title: 'Success', desc: 'Done.' })

  const showInfo = (message: InfoMessage) => {
    setInfo(message)
    setInfoOpen(true)
  }
  const showError = (title: string, error: unknown) => showInfo({ variant: 'warn', title, desc: sapMessage(error) })

  // The value helps come from SAP; there is no built-in list to fall back to.
  useEffect(() => {
    const ctl = new AbortController()
    loadTraders(ctl.signal)
      .then(setTraders)
      .catch((e: unknown) => {
        if (!ctl.signal.aborted) showError('Trader list unavailable', e)
      })
    loadCompanyCodes(ctl.signal)
      .then(setCompanyCodes)
      .catch((e: unknown) => {
        if (!ctl.signal.aborted) showError('Company Code list unavailable', e)
      })
    return () => ctl.abort()
  }, [])

  const companyCodeItems = useMemo<DropdownItem[]>(() => companyCodes.map((c) => ({ primary: c })), [companyCodes])
  const traderItems = useMemo<DropdownItem[]>(() => traders.map((t) => ({ primary: `${t.code} - ${t.name}`, code: t.code })), [traders])

  const results = useMemo(
    () => (dealsLoaded ? computeResults(deals, applied, filters, search, sort) : []),
    [dealsLoaded, deals, applied, filters, search, sort],
  )
  const paged = dealsLoaded && results.length ? pageOf(results, page, pageSize) : null
  // The page pulled state.page back to the last page whenever the list shrank below it.
  useEffect(() => {
    if (paged && paged.page !== page) setPage(paged.page)
  }, [paged, page])
  // The pill only updated while deals were loaded.
  const filterCount = dealsLoaded ? countActiveFilters(filters) : 0
  const selectedDeal = selectedId ? (deals.find((d) => d.id === selectedId) ?? null) : null

  const patchSelection = (patch: Partial<Selection>) => setSelection((s) => ({ ...s, ...patch }))

  // ------------------------------------------------------------------ Basic Selection

  /** Reads the company code (range) from SAP. A failure leaves the list as it was. */
  const loadDeals = async (sel: Selection): Promise<boolean> => {
    setLoading(true)
    try {
      setDeals(await loadNdfDeals({ from: sel.companyCode, to: sel.companyCodeTo }))
      return true
    } catch (e) {
      showError(SAP_ERROR, e)
      return false
    } finally {
      setLoading(false)
    }
  }

  const viewDeals = async () => {
    const errs = validateSelection(selection)
    setErrors(errs)
    if (errs.companyCode || errs.fixingDate) return

    // Company code casing is normalised so it matches consistently everywhere.
    const cc = selection.companyCode.trim().toUpperCase()
    const next = { ...selection, companyCode: cc, companyCodeTo: selection.companyCodeTo.trim().toUpperCase() }
    setSelection(next)
    setCcText(cc)
    if (!(await loadDeals(next))) return
    setDealsLoaded(true)
    setPage(1)
    setSelectedId(null)
    setApplied(next)
    const unapplied = unappliedCriteria(next)
    if (unapplied.length) {
      showInfo({ variant: 'warn', title: 'Selection partly applied', desc: `${unapplied.join(' and ')}: ${SELECTION_GAP}` })
    }
  }

  // ------------------------------------------------------------------ toolbar

  const onSearch = (value: string) => {
    setSearch(value)
    setPage(1)
  }

  const onFilter = (key: keyof Filters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }))
    setPage(1)
  }

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS)
    setPage(1)
  }

  const onSort = (field: SortField) => setSort((s) => nextSort(s, field))

  /** Re-reads the list with the selection it was loaded with. */
  const refresh = async () => {
    if (!dealsLoaded || loading) return
    setSpinning(true)
    const ok = await loadDeals(applied)
    setSpinning(false)
    if (ok) {
      setSelectedId(null)
      showInfo({ variant: 'success', title: 'Deals Refreshed', desc: 'The NDF deals were re-read from SAP.' })
    }
  }

  // ------------------------------------------------------------------ actions

  const openMatchRelease = () => {
    if (!selectedDeal || !canMatchRelease(selectedDeal)) return
    setModalDeal(selectedDeal)
    setMatchOpen(true)
  }

  /**
   * Settles the deal in SAP, then reads it back so the row shows what SAP now holds. A refusal
   * leaves the row exactly as it was and shows SAP's own reason.
   */
  const confirmMatchRelease = async () => {
    const deal = modalDeal
    if (!deal) return
    setSettling(true)
    try {
      await settleNdfDeal(deal.coCode, deal.transaction)
    } catch (e) {
      setSettling(false)
      setMatchOpen(false)
      showError(`Deal ${deal.transaction} was not settled`, e)
      return
    }
    setSettling(false)
    setMatchOpen(false)
    try {
      const fresh = await fetchNdfDeal(deal.coCode, deal.transaction)
      setDeals((all) => (fresh ? all.map((d) => (d.id === deal.id ? fresh : d)) : all.filter((d) => d.id !== deal.id)))
      showInfo({ variant: 'success', title: 'Settled in SAP', desc: `Transaction ${deal.transaction} was settled (Match & Release).` })
    } catch (e) {
      showInfo({
        variant: 'warn',
        title: 'Settled in SAP',
        desc: `Transaction ${deal.transaction} was settled, but its row could not be re-read (${sapMessage(e)}). Use Refresh.`,
      })
    }
    setSelectedId(null)
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
                  items={companyCodeItems}
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
                  items={companyCodeItems}
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
                items={traderItems}
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
              <button className="btn btn-primary" id="viewDealsBtn" type="button" disabled={loading} onClick={viewDeals}>
                {loading ? 'Loading…' : 'View Deals'}
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

          <FilterPanel open={filterOpen} deals={deals} filters={filters} onChange={onFilter} onClear={clearFilters} />

          <div className="action-row">
            <button
              className="btn btn-primary"
              id="matchReleaseBtn"
              type="button"
              disabled={!selectedId || settling || !canMatchRelease(selectedDeal)}
              title={selectedDeal && !canMatchRelease(selectedDeal) ? 'This deal is already matched & released in SAP.' : undefined}
              onClick={openMatchRelease}
            >
              Match &amp; Release
            </button>
            <button className="btn btn-danger" id="correctionBtn" type="button" disabled title={CORRECTION_GAP}>
              Correction Required
            </button>
            <span className="remark-text" id="correctionGap" title={CORRECTION_GAP}>
              Correction Required: SAP gap
            </span>
            <button className="btn btn-secondary btn-icon" id="refreshBtn" type="button" title="Refresh" disabled={loading || !dealsLoaded} onClick={refresh}>
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
        open={matchOpen}
        deal={modalDeal}
        busy={settling}
        onClose={() => setMatchOpen(false)}
        onConfirm={confirmMatchRelease}
      />

      <InfoModal open={infoOpen} info={info} onClose={() => setInfoOpen(false)} />
    </div>
  )
}

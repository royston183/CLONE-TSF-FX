import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { CalendarField } from './CalendarField.tsx'
import { isAbort } from '../../shared/fx/mw.ts'
import { loadCompanies, loadFixingReferences, loadRbiRate, loadTcurf, loadTraders, loadWorklist, type Avail, type Option } from './api.ts'
import { fmtDate, money, rate } from './format.ts'
import { applyFilters, statusClass, toCsv, type Tcurf } from './logic.ts'
import { CorrectionModal, MatchReleaseModal, NdfFixModal, RefreshModal, ViewTxnModal } from './Modals.tsx'
import './tsf-ndf-fixing.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './tsf-ndf-fixing.dark.css'
import type { Filters, NdfDeal, Toast } from './types.ts'

const EMPTY_FILTERS: Filters = { search: '', company: '', trader: '', fixingDate: '' }
const PER_PAGE = 15
let toastSeq = 0

type OpenModal = 'ndfFix' | 'match' | 'correction' | 'viewTxn' | 'refresh' | null

/**
 * UA1: TSF NDF Fixing (ZSGTSFR050), converted from legacy/tsf-ndf-fixing.html.
 *
 * Reads SAP only (api.ts): Company Code from T001, Trader from ZSGTRMTR_TRD_GRP, the worklist
 * from ZSGTSFV_FX exactly as GET_DATA selects it (TXN_STATUS 07, SAKTIV <> 3, V_DATE = the Fixing
 * Date, NDF product types, trader). The view does not serve those fields yet, so the worklist
 * says WAITING FOR API rather than listing unrelated FX deals. Save Fixing needs
 * BAPI_FTR_FXT_NDF_FIXING + TX02 behind an API (WAITING FOR ACTION API) and posts nothing.
 */
const ACTION_WAITING =
  'WAITING FOR ACTION API \u2014 NDF Fixing (ZSGTRMFM_VTBFHA_EXPORT TXN_STATUS 10, BAPI_FTR_FXT_NDF_FIXING, BAPI_TRANSACTION_COMMIT, TX02 settle rate) has no API yet. Nothing was posted to SAP.'
export default function TsfNdfFixing() {
  const [deals, setDeals] = useState<NdfDeal[]>([])
  const [companies, setCompanies] = useState<Avail<Option[]> | null>(null)
  const [traders, setTraders] = useState<Avail<Option[]> | null>(null)
  const [worklistNote, setWorklistNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [tcurf, setTcurf] = useState<Tcurf>({})
  const [fixRefTexts, setFixRefTexts] = useState<Record<string, string>>({})
  const [filters, setFilters] = useState<Filters>({ ...EMPTY_FILTERS, fixingDate: fmtDate(new Date()) })
  const [sortAsc, setSortAsc] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  const [page, setPage] = useState(1)
  const [dragOver, setDragOver] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])

  const [openModal, setOpenModal] = useState<OpenModal>(null)
  const [modalDealId, setModalDealId] = useState<string | null>(null)
  const [fixRateText, setFixRateText] = useState('')
  const [fixRefText, setFixRefText] = useState('')
  const [foRemarksText, setFoRemarksText] = useState('')
  const [invalidFixRate, setInvalidFixRate] = useState(false)
  const [invalidFixRef, setInvalidFixRef] = useState(false)
  const [matchRefText, setMatchRefText] = useState('')
  const [matchRemarksText, setMatchRemarksText] = useState('')
  const [invalidMatchRef, setInvalidMatchRef] = useState(false)
  const [invalidMatchRemarks, setInvalidMatchRemarks] = useState(false)
  const [correctionRemarksText, setCorrectionRemarksText] = useState('')
  const [invalidCorrectionRemarks, setInvalidCorrectionRemarks] = useState(false)

  const draggingId = useRef<string | null>(null)

  /* Screen 1000's value helps and 9001's lookups, once. */
  useEffect(() => {
    const ctrl = new AbortController()
    const ok = <T,>(p: Promise<T>, set: (v: T) => void) =>
      p.then(set, (e: unknown) => {
        if (!isAbort(e)) console.warn(e)
      })
    ok(loadCompanies(ctrl.signal), setCompanies)
    ok(loadTraders(ctrl.signal), setTraders)
    ok(loadTcurf(ctrl.signal), setTcurf)
    ok(loadFixingReferences(ctrl.signal), setFixRefTexts)
    return () => ctrl.abort()
  }, [])

  /* GET_DATA for the selected Fixing Date (P_DATE); Refresh runs it again. */
  const worklistAbort = useRef<AbortController | null>(null)
  const loadDeals = useCallback(async (fixingDate: string) => {
    worklistAbort.current?.abort()
    const ctrl = new AbortController()
    worklistAbort.current = ctrl
    setLoading(true)
    try {
      const res = await loadWorklist(fixingDate, ctrl.signal)
      setDeals(res.state === 'ok' ? res.value : [])
      setWorklistNote(res.state === 'ok' ? '' : res.reason)
    } catch (error) {
      if (!isAbort(error)) console.warn(error)
    } finally {
      if (worklistAbort.current === ctrl) setLoading(false)
    }
  }, [])

  const showToast = (variant: Toast['variant'], message: string) => {
    const id = ++toastSeq
    setToasts((t) => [...t, { id, variant, message }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3400)
  }

  useEffect(() => {
    void loadDeals(filters.fixingDate)
    return () => worklistAbort.current?.abort()
  }, [filters.fixingDate, loadDeals])

  const visible = useMemo(() => applyFilters(deals, filters, sortAsc), [deals, filters, sortAsc])
  const totalPages = Math.max(1, Math.ceil(visible.length / PER_PAGE))
  const currentPage = Math.min(page, totalPages)
  const start = (currentPage - 1) * PER_PAGE
  const rows = visible.slice(start, start + PER_PAGE)

  const modalDeal = modalDealId ? (deals.find((d) => d.id === modalDealId) ?? null) : null

  const patchFilters = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }))
    setPage(1)
  }

  const toggleRow = (id: string, checked: boolean) => {
    setSelected((s) => {
      const next = new Set(s)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const selectOnly = (id: string) => setSelected(new Set([id]))

  const toggleSelectAll = (checked: boolean) => {
    setSelected((s) => {
      const next = new Set(s)
      rows.forEach((r) => (checked ? next.add(r.id) : next.delete(r.id)))
      return next
    })
  }

  /** The page's selectedOne(): the action buttons only work with exactly one row selected. */
  const selectedOne = (): NdfDeal | null => {
    if (selected.size !== 1) {
      showToast('error', selected.size ? 'Select only one NDF deal for this action.' : 'Select an NDF deal first.')
      return null
    }
    return deals.find((d) => d.id === [...selected][0]) ?? null
  }

  const openNdfFix = (deal?: NdfDeal) => {
    const r = deal ?? selectedOne()
    if (!r) return
    if (r.status === 'Released') {
      showToast('info', 'This NDF deal has already been released.')
      return
    }
    setModalDealId(r.id)
    setFixRateText('')
    setFixRefText(r.ref || '')
    setFoRemarksText(r.foRemarks || '')
    setInvalidFixRate(false)
    setInvalidFixRef(false)
    setOpenModal('ndfFix')
    // gv_ndf_rate: TCURR kurst RBI on the Fixing Date, for USD:INR only.
    void loadRbiRate(r, filters.fixingDate).then((rbi) => {
      if (rbi) setFixRateText((cur) => cur || String(rbi))
    })
  }

  const openMatch = () => {
    const r = selectedOne()
    if (!r) return
    if (r.status === 'Released') {
      showToast('info', 'This NDF deal has already been released.')
      return
    }
    setModalDealId(r.id)
    setMatchRefText(r.ref || '')
    setMatchRemarksText(r.remarks || '')
    setInvalidMatchRef(false)
    setInvalidMatchRemarks(false)
    setOpenModal('match')
  }

  const openCorrection = () => {
    const r = selectedOne()
    if (!r) return
    if (r.status === 'Released') {
      showToast('info', 'Released deals cannot be sent back for correction in this demo.')
      return
    }
    setModalDealId(r.id)
    setCorrectionRemarksText(r.moRemarks || '')
    setInvalidCorrectionRemarks(false)
    setOpenModal('correction')
  }

  const openViewTxn = (id: string) => {
    selectOnly(id)
    setModalDealId(id)
    setOpenModal('viewTxn')
  }

  const closeModal = () => setOpenModal(null)

  const confirmNdfFix = () => {
    const deal = modalDeal
    if (!deal) return
    const fix = parseFloat(fixRateText)
    const ref = fixRefText.trim()
    const rateInvalid = !isFinite(fix) || fix <= 0
    setInvalidFixRate(rateInvalid)
    setInvalidFixRef(!ref)
    if (rateInvalid || !ref) return
    // FORM save_data posts through BAPI_FTR_FXT_NDF_FIXING and TX02 (07 -> 10). Without that API
    // nothing changes here: the row is reloaded from SAP once a fixing has really been posted.
    showToast('error', ACTION_WAITING)
  }

  const confirmMatch = () => {
    const deal = modalDeal
    if (!deal) return
    const ref = matchRefText.trim()
    const remarks = matchRemarksText.trim()
    setInvalidMatchRef(!ref)
    setInvalidMatchRemarks(!remarks)
    if (!ref || !remarks) return
    setDeals((ds) => ds.map((d) => (d.id === deal.id ? { ...d, ref, remarks, status: 'Released' } : d)))
    setSelected(new Set())
    closeModal()
    showToast('success', `NDF transaction ${deal.id} matched and released.`)
  }

  const confirmCorrection = () => {
    const deal = modalDeal
    if (!deal) return
    const remarks = correctionRemarksText.trim()
    setInvalidCorrectionRemarks(!remarks)
    if (!remarks) return
    setDeals((ds) => ds.map((d) => (d.id === deal.id ? { ...d, moRemarks: remarks, status: 'Correction Required' } : d)))
    setSelected(new Set())
    closeModal()
    showToast('success', `Transaction ${deal.id} sent for correction.`)
  }

  const refreshAll = () => {
    setSelected(new Set())
    setPage(1)
    const fixingDate = fmtDate(new Date())
    setFilters({ ...EMPTY_FILTERS, fixingDate })
    void loadDeals(fixingDate)
    setOpenModal('refresh')
  }

  const exportCsv = () => {
    const csv = toCsv(visible)
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'confirm_ndf_fixing.csv'
    a.click()
    URL.revokeObjectURL(a.href)
    showToast('success', 'CSV downloaded.')
  }

  const selectionNote = selected.size
    ? `${selected.size} deal${selected.size > 1 ? 's' : ''} selected • drag the selected row to NDF Rate Fixing`
    : 'No deal selected • click a row to select, or drag a row onto NDF Rate Fixing'

  const pagerNumbers = Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1)

  return (
    <div className="tsf-ndf-fixing">
      <div className="app">
        <header className="topbar">
          <BackButton className="back" />
          <div className="logo" aria-label="FS">
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="titlewrap">
            <div className="title">Confirm NDF Fixing</div>
            <div className="subtitle">NDF</div>
          </div>
          <div className="spacer" />
          <div className="actions">
            <SignOutButton className="btn ghost" />
          </div>
        </header>

        <main className="main">
          <section className="card">
            <div className="card-title">
              NDF Fixing Deals <span className="record-count">{visible.length} records</span>
              <div className="right">
                <span className="note">{selectionNote}</span>
              </div>
            </div>
            <div className="toolbar">
              <div className="toolbar-left">
                <input
                  className="search"
                  placeholder="Search NDF deals..."
                  value={filters.search}
                  onChange={(e) => patchFilters({ search: e.target.value })}
                />
              </div>
              <div className="toolbar-filters">
                <select
                  className="filter-control"
                  title="Company Code"
                  value={filters.company}
                  onChange={(e) => {
                    setSelected(new Set())
                    patchFilters({ company: e.target.value })
                  }}
                >
                  <option value="">{companies && companies.state !== 'ok' ? companies.reason : 'All Company Codes'}</option>
                  {companies?.state === 'ok'
                    ? companies.value.map((c) => (
                        <option key={c.value} value={c.value} title={c.title}>
                          {c.label}
                        </option>
                      ))
                    : null}
                </select>
                <CalendarField
                  value={filters.fixingDate}
                  onChange={(v) => {
                    setSelected(new Set())
                    patchFilters({ fixingDate: v })
                  }}
                />
                <select
                  className="filter-control trader-filter"
                  title="Trader"
                  value={filters.trader}
                  onChange={(e) => {
                    setSelected(new Set())
                    patchFilters({ trader: e.target.value })
                  }}
                >
                  <option value="">{traders && traders.state !== 'ok' ? traders.reason : 'All Traders'}</option>
                  {traders?.state === 'ok'
                    ? traders.value.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))
                    : null}
                </select>
              </div>
              <div className="toolbar-right">
                <button
                  type="button"
                  className={`btn ghost${dragOver ? ' drop-target' : ''}`}
                  title="Click to open NDF Rate Fixing or drag a selected row onto this button"
                  onClick={() => openNdfFix()}
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    setDragOver(true)
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragOver(false)
                    const id = e.dataTransfer.getData('text/plain')
                    if (id) {
                      selectOnly(id)
                      const deal = deals.find((d) => d.id === id)
                      if (deal) openNdfFix(deal)
                    }
                  }}
                >
                  ◆ NDF Rate Fixing
                </button>
                <button type="button" className="btn ghost" onClick={refreshAll}>
                  ↻ Refresh
                </button>
                <button type="button" className="square" title="Download CSV" onClick={exportCsv}>
                  ⇩
                </button>
              </div>
            </div>
            <div className="table-wrap">
              <table style={{ display: rows.length ? 'table' : 'none' }}>
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        aria-label="Select all visible rows"
                        checked={rows.length > 0 && rows.every((r) => selected.has(r.id))}
                        onChange={(e) => toggleSelectAll(e.target.checked)}
                      />
                    </th>
                    <th onClick={() => setSortAsc((s) => !s)} style={{ cursor: 'pointer' }}>
                      Transaction No {sortAsc ? '▲' : '▼'}
                    </th>
                    <th>Company Code</th>
                    <th>Trader</th>
                    <th>Buy / Sell</th>
                    <th>Currency Pair</th>
                    <th className="num">Amount 1</th>
                    <th>Crcy 1</th>
                    <th className="num">Amount 2</th>
                    <th>Crcy 2</th>
                    <th className="num">Original Spot</th>
                    <th className="num">Swap</th>
                    <th className="num">Forward Rate</th>
                    <th>Fixing Date</th>
                    <th className="num">NDF Value</th>
                    <th>Fixing Reference</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className={selected.has(r.id) ? 'selected' : undefined}
                      draggable
                      onDragStart={(e) => {
                        if (!selected.has(r.id) || selected.size !== 1) selectOnly(r.id)
                        e.dataTransfer.effectAllowed = 'move'
                        e.dataTransfer.setData('text/plain', r.id)
                        draggingId.current = r.id
                      }}
                      onClick={() => selectOnly(r.id)}
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={(e) => toggleRow(r.id, e.target.checked)}
                        />
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <span
                          className="link"
                          onClick={() => openViewTxn(r.id)}
                        >
                          {r.id}
                        </span>
                      </td>
                      <td>{r.company}</td>
                      <td>{r.trader}</td>
                      <td>{r.side}</td>
                      <td>{r.pair}</td>
                      <td className="num">{money(r.amt1)}</td>
                      <td>{r.c1}</td>
                      <td className="num">{money(r.amt2)}</td>
                      <td>{r.c2}</td>
                      <td className="num">{rate(r.spot)}</td>
                      <td className="num">{rate(r.swap)}</td>
                      <td className="num">{rate(r.fwd)}</td>
                      <td>{r.date}</td>
                      <td className="num">{money(r.ndf)}</td>
                      <td>{r.ref || '—'}</td>
                      <td>
                        <span className={`status ${statusClass(r.status)}`}>{r.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 ? (
                <div className="empty">{loading ? 'Loading NDF deals from SAP\u2026' : worklistNote || 'No NDF deals match the current selection.'}</div>
              ) : null}
            </div>
            <div className="footer">
              <div>
                Showing {rows.length ? start + 1 : 0}–{Math.min(start + PER_PAGE, visible.length)} of {visible.length}
              </div>
              <div className="pages">
                <button className="pagebtn" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>
                  ‹
                </button>
                {pagerNumbers.map((p) => (
                  <button key={p} className={`pagebtn${p === currentPage ? ' active' : ''}`} onClick={() => setPage(p)}>
                    {p}
                  </button>
                ))}
                <button className="pagebtn" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>
                  ›
                </button>
              </div>
              <div className="showing">{selected.size} selected</div>
            </div>
          </section>
        </main>
      </div>

      <div className="toastbox">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.variant}`}>
            <strong>{t.variant === 'success' ? '✓' : t.variant === 'error' ? '!' : 'i'}</strong>
            <div>{t.message}</div>
          </div>
        ))}
      </div>

      <NdfFixModal
        open={openModal === 'ndfFix'}
        deal={modalDeal}
        fixRate={fixRateText}
        fixRef={fixRefText}
        fixRefText={fixRefTexts[fixRefText] ?? ''}
        tcurf={tcurf}
        foRemarks={foRemarksText}
        invalidRate={invalidFixRate}
        invalidRef={invalidFixRef}
        onFixRateChange={setFixRateText}
        onFoRemarksChange={setFoRemarksText}
        onClose={closeModal}
        onConfirm={confirmNdfFix}
      />

      <MatchReleaseModal
        open={openModal === 'match'}
        deal={modalDeal}
        ref={matchRefText}
        remarks={matchRemarksText}
        invalidRef={invalidMatchRef}
        invalidRemarks={invalidMatchRemarks}
        onRefChange={(v) => {
          setMatchRefText(v)
          setInvalidMatchRef(false)
        }}
        onRemarksChange={(v) => {
          setMatchRemarksText(v)
          setInvalidMatchRemarks(false)
        }}
        onClose={closeModal}
        onConfirm={confirmMatch}
      />

      <CorrectionModal
        open={openModal === 'correction'}
        deal={modalDeal}
        remarks={correctionRemarksText}
        invalidRemarks={invalidCorrectionRemarks}
        onRemarksChange={(v) => {
          setCorrectionRemarksText(v)
          setInvalidCorrectionRemarks(false)
        }}
        onClose={closeModal}
        onConfirm={confirmCorrection}
      />

      <ViewTxnModal open={openModal === 'viewTxn'} deal={modalDeal} onClose={closeModal} />

      <RefreshModal open={openModal === 'refresh'} onClose={closeModal} />
    </div>
  )
}

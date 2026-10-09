import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { CalendarField } from './CalendarField.tsx'
import { isAbort } from '../../shared/fx/mw.ts'
import { NDF_FIXING_API_MISSING, TXN, fixNdf, fixNdfAvailable, loadTxnStatusTexts } from '../../shared/fx/ndf.ts'
import { useStatusPopup } from '../../shared/popup/Popup.tsx'
import {
  loadCompanies,
  loadFixingReferences,
  loadRbiRate,
  loadTcurf,
  loadTraders,
  loadWorklist,
  traderNames,
  type Avail,
  type Option,
} from './api.ts'
import { money, points, rate } from './format.ts'
import { applyFilters, statusClass, toCsv, type Tcurf } from './logic.ts'
import { NdfFixModal, RefreshModal, ViewTxnModal } from './Modals.tsx'
import './tsf-ndf-fixing.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './tsf-ndf-fixing.dark.css'
import type { Filters, NdfDeal, Toast } from './types.ts'

const EMPTY_FILTERS: Filters = { search: '', company: '', trader: '', fixingDate: '' }
const PER_PAGE = 15
let toastSeq = 0

type OpenModal = 'ndfFix' | 'viewTxn' | 'refresh' | null

/**
 * UA1: TSF NDF Fixing (ZSGTSFR050), converted from legacy/tsf-ndf-fixing.html.
 *
 * Reads SAP only (api.ts): Company Code from T001, Trader from ZSGTRMTR_TRD_GRP, and the worklist
 * as GET_DATA selects it \u2014 NDF deals in TXN_STATUS 07 that are not reversed \u2014 from the TSF append
 * (TrmFxApp) joined to the FTR deal (FxTransaction). Company, Fixing Date and Trader then narrow it
 * on screen. Save Fixing needs BAPI_FTR_FXT_NDF_FIXING + TX02, which no service exposes, so the
 * popup shows that and posts nothing.
 */
export default function TsfNdfFixing() {
  const [deals, setDeals] = useState<NdfDeal[]>([])
  const [companies, setCompanies] = useState<Avail<Option[]> | null>(null)
  const [traders, setTraders] = useState<Avail<Option[]> | null>(null)
  const [worklistNote, setWorklistNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [tcurf, setTcurf] = useState<Tcurf>({})
  const [fixRefTexts, setFixRefTexts] = useState<Record<string, string>>({})
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
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
  /** null while SAP's metadata is being checked for NdfFixing. */
  const [fixAvailable, setFixAvailable] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)

  const draggingId = useRef<string | null>(null)
  const status = useStatusPopup()

  /* 9001's lookups and the company value help, once. */
  useEffect(() => {
    const ctrl = new AbortController()
    const ok = <T,>(p: Promise<T>, set: (v: T) => void) =>
      p.then(set, (e: unknown) => {
        if (!isAbort(e)) console.warn(e)
      })
    ok(loadCompanies(ctrl.signal), setCompanies)
    ok(loadTcurf(ctrl.signal), setTcurf)
    ok(loadFixingReferences(ctrl.signal), setFixRefTexts)
    void fixNdfAvailable().then(setFixAvailable)
    return () => ctrl.abort()
  }, [])

  /* GET_DATA; Refresh runs it again. Traders and status texts name the rows, so they load with it. */
  const worklistAbort = useRef<AbortController | null>(null)
  const loadDeals = useCallback(async () => {
    worklistAbort.current?.abort()
    const ctrl = new AbortController()
    worklistAbort.current = ctrl
    setLoading(true)
    try {
      const [traderHelp, statusTexts] = await Promise.all([loadTraders(ctrl.signal), loadTxnStatusTexts(ctrl.signal)])
      setTraders(traderHelp)
      const names = traderHelp.state === 'ok' ? traderNames(traderHelp.value) : {}
      const res = await loadWorklist(names, statusTexts, ctrl.signal)
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
    void loadDeals()
    return () => worklistAbort.current?.abort()
  }, [loadDeals])

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
    setModalDealId(r.id)
    setFixRateText('')
    setFixRefText(r.ref || '')
    setFoRemarksText(r.foRemarks || '')
    setInvalidFixRate(false)
    setOpenModal('ndfFix')
    // gv_ndf_rate: TCURR kurst RBI on the Fixing Date, for USD:INR only.
    void loadRbiRate(r, filters.fixingDate || r.date).then((rbi) => {
      if (rbi) setFixRateText((cur) => cur || rbi.toFixed(4))
    })
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
    const rateInvalid = !isFinite(fix) || fix <= 0
    setInvalidFixRate(rateInvalid)
    if (rateInvalid) return
    // FORM save_data: the rate through NdfFixing (BAPI_FTR_FXT_NDF_FIXING), then TXN_STATUS 10. Without the
    // action the button is disabled; this is its fallback.
    if (!fixAvailable) {
      showToast('error', NDF_FIXING_API_MISSING)
      return
    }
    setSaving(true)
    void fixNdf({ bukrs: deal.company, rfha: deal.id, etag: deal.etag }, fix, TXN.FIXED, foRemarksText)
      .then((res) => {
        // The SAP outcome as the standard popup (was a toast); same text, same follow-up as before.
        status.show(
          res.ok
            ? { tone: 'success', title: 'NDF Fixing Saved', message: res.message, refLabel: 'Transaction No', refValue: deal.id }
            : { tone: 'error', title: 'NDF Fixing Failed', message: res.message },
        )
        if (res.ok) {
          setSelected(new Set())
          closeModal()
          void loadDeals()
        }
      })
      .finally(() => setSaving(false))
  }

  const refreshAll = () => {
    setSelected(new Set())
    setPage(1)
    setFilters(EMPTY_FILTERS)
    void loadDeals()
    setOpenModal('refresh')
  }

  const exportCsv = () => {
    const csv = toCsv(visible)
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'tsf_ndf_fixing.csv'
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
          <BackButton className="fx-back-btn" />
          <div className="logo" aria-label="FS">
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="titlewrap">
            <div className="title">UA1: TSF NDF Fixing</div>
            <div className="subtitle">NDF deals released for fixing (status 07)</div>
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
                      <td>{r.trader || '—'}</td>
                      <td>{r.side}</td>
                      <td>{r.pair}</td>
                      <td className="num">{money(r.amt1)}</td>
                      <td>{r.c1}</td>
                      <td className="num">{money(r.amt2)}</td>
                      <td>{r.c2}</td>
                      <td className="num">{rate(r.spot)}</td>
                      <td className="num">{points(r.swap)}</td>
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
        blockedReason={fixAvailable === null ? 'Checking SAP for the NDF fixing action…' : fixAvailable ? '' : NDF_FIXING_API_MISSING}
        busy={saving}
        onFixRateChange={setFixRateText}
        onFoRemarksChange={setFoRemarksText}
        onClose={closeModal}
        onConfirm={confirmNdfFix}
      />

      <ViewTxnModal open={openModal === 'viewTxn'} deal={modalDeal} onClose={closeModal} />

      <RefreshModal open={openModal === 'refresh'} onClose={closeModal} />

      {status.element}
    </div>
  )
}

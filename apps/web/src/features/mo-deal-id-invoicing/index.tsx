import { useMemo, useRef, useState } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { BlListModal } from './BlListModal.tsx'
import { ComplianceModal, type ComplianceNote } from './ComplianceModal.tsx'
import { ConfirmModal } from './ConfirmModal.tsx'
import { buildDeals, ENTITIES, FX_MODELS, REGIONS } from './data.ts'
import { DateField } from './DateField.tsx'
import { DealTable } from './DealTable.tsx'
import { DiffModal } from './DiffModal.tsx'
import { HouseBankModal } from './HouseBankModal.tsx'
import {
  DEFAULT_FILTERS,
  amendDealStatusNext,
  applyAmendDealStatus,
  buildCsv,
  deAssignBl,
  editInvDate as applyEditInvDate,
  editPrice as applyEditPrice,
  filterDeals,
  finaliseInvoiceGeneration,
  invoiceGenerationCheck,
  nextSort,
  recalcDeal,
  reverseInvoiceGeneration as applyReverseInvoiceGeneration,
  saveHouseBank as applySaveHouseBank,
  sortDeals,
  toggleMark as applyToggleMark,
} from './logic.ts'
import { McDetailsModal } from './McDetailsModal.tsx'
import { RbillModal } from './RbillModal.tsx'
import { RemarkModal } from './RemarkModal.tsx'
import './mo-deal-id-invoicing.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './mo-deal-id-invoicing.dark.css'
import type { Filters, Sort, SortKey, SubModal, Toast } from './types.ts'

const PAGE_SIZE = 15
const FIRST_INVOICE_SEQ = 600

/**
 * MO: View List of Deal IDs for Invoicing (ZSGTSFR008), converted from
 * legacy/View_List_of_Deal_IDs_for_Invoicing_CALENDAR_FIXED.html.
 *
 * The legacy page never called an API — no fetch, no XMLHttpRequest — so it stays a UI-only
 * React shell with its seed data quarantined in data.ts, same as sblc-allocate-bank and
 * fo-additional-spot-booking; SAP wiring (ZSGTSFV_FX, the invoice/BL tables) is a follow-up.
 */
export default function MoDealIdInvoicing() {
  const [deals, setDeals] = useState(() => buildDeals())
  const seedRef = useRef(deals)
  const invoiceSeq = useRef(FIRST_INVOICE_SEQ)

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(true)
  const [sort, setSort] = useState<Sort>({ key: null, dir: 1 })
  const [page, setPage] = useState(1)

  const [openDealId, setOpenDealId] = useState<string | null>(null)
  const [amending, setAmending] = useState(false)
  const [sub, setSub] = useState<SubModal>(null)
  const [pendingBlIdx, setPendingBlIdx] = useState<number | null>(null)
  const [pendingFullMatch, setPendingFullMatch] = useState(false)

  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)

  const pushToast = (message: string, kind: Toast['kind'] = '') => {
    const id = ++toastId.current
    setToasts((t) => [...t, { id, message, kind }])
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200)
  }

  const filteredDeals = useMemo(() => filterDeals(deals, filters), [deals, filters])
  const sortedDeals = useMemo(() => sortDeals(filteredDeals, sort), [filteredDeals, sort])
  const totalPages = Math.max(1, Math.ceil(sortedDeals.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const start = (currentPage - 1) * PAGE_SIZE
  const pageDeals = sortedDeals.slice(start, start + PAGE_SIZE)

  const openDeal = useMemo(() => deals.find((d) => d.dealId === openDealId) ?? null, [deals, openDealId])

  const updateDeal = (dealId: string, next: (d: (typeof deals)[number]) => (typeof deals)[number]) => {
    setDeals((all) => all.map((d) => (d.dealId === dealId ? next(d) : d)))
  }

  const applyFilters = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }))
    setPage(1)
  }

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS)
    setSort({ key: null, dir: 1 })
    setPage(1)
  }

  const refreshList = () => {
    setDeals(seedRef.current.map((d) => ({ ...d })))
    invoiceSeq.current = FIRST_INVOICE_SEQ
    resetFilters()
    pushToast('List refreshed to initial dataset.')
  }

  const exportCsv = () => {
    const csv = buildCsv(sortedDeals)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'deal_id_invoice_list.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.setTimeout(() => window.URL.revokeObjectURL(url), 1000)
    pushToast(`Exported ${sortedDeals.length} row(s) to CSV.`, 'success')
  }

  // ------------------------------------------------------------------ rbill blotter

  const openDetail = (dealId: string) => {
    setOpenDealId(dealId)
    setAmending(false)
    setSub(null)
  }

  const closeDetail = () => {
    setOpenDealId(null)
    setSub(null)
  }

  const refreshDeal = () => {
    if (!openDealId) return
    const orig = seedRef.current.find((d) => d.dealId === openDealId)
    if (orig) setDeals((all) => all.map((d) => (d.dealId === openDealId ? { ...orig } : d)))
    setAmending(false)
    pushToast(`Deal ${openDealId} refreshed.`)
  }

  const saveDeal = () => pushToast(`Deal ${openDealId} saved.`, 'success')

  const amendDealStatus = () => {
    if (!openDeal) return
    const next = amendDealStatusNext(openDeal.dealStat)
    setSub({
      kind: 'confirm',
      title: 'Amend Deal Status',
      text: `Deal ID ${openDeal.dealId} is currently '${openDeal.dealStat}'.\nDo you want to reopen it to status ${next}?`,
      yesLabel: 'Yes, reopen',
      onYes: () => {
        updateDeal(openDeal.dealId, applyAmendDealStatus)
        pushToast(`Deal ID ${openDeal.dealId} reopened.`, 'success')
      },
    })
  }

  const confirmInvoiceGeneration = () => {
    if (!openDeal) return
    const check = invoiceGenerationCheck(openDeal)
    if (!check.marked.length) {
      pushToast('Select at least one line (checkbox) before confirming invoice generation.', 'warn')
      return
    }
    const note: ComplianceNote = check.withinTolerance
      ? { kind: 'ok', message: `Invoice amount ${check.invAmt.toFixed(2)} USD is within 2% tolerance of the FX Deal value ${check.dealAmt.toFixed(2)} USD (diff ${check.diffPct.toFixed(2)}%). Proceed to compliance checklist.` }
      : {
          kind: 'warn',
          message: `Invoice amount ${check.invAmt.toFixed(2)} USD differs from the FX Deal value ${check.dealAmt.toFixed(2)} USD by ${check.diffPct.toFixed(2)}%, which exceeds the 2% tolerance. You may still proceed, but this will be flagged as a Partial invoice.`,
        }
    setPendingFullMatch(check.withinTolerance)
    setSub({ kind: 'compliance', fullMatch: check.withinTolerance, note: note.message })
  }

  const finaliseInvoice = () => {
    if (!openDealId) return
    const target = deals.find((d) => d.dealId === openDealId)
    if (!target) return
    const { deal: updated, nextSeq } = finaliseInvoiceGeneration(target, pendingFullMatch, invoiceSeq.current)
    invoiceSeq.current = nextSeq
    setDeals((all) => all.map((d) => (d.dealId === openDealId ? updated : d)))
    setSub(null)
    pushToast(`Invoice generation confirmed for Deal ID ${openDealId}.`, 'success')
  }

  const reverseInvoiceGeneration = () => {
    if (!openDeal) return
    setSub({
      kind: 'confirm',
      title: 'Reverse Confirm Invoice Generation',
      text: `This will delete all invoice records for Deal ID ${openDeal.dealId} and reset its status to Booked. Continue?`,
      yesLabel: 'Yes, reverse',
      onYes: () => {
        updateDeal(openDeal.dealId, applyReverseInvoiceGeneration)
        pushToast(`Invoice generation reversed for Deal ID ${openDeal.dealId}.`, 'success')
      },
    })
  }

  const recalcUpdate = () => {
    if (!openDealId) return
    updateDeal(openDealId, recalcDeal)
    pushToast('Due dates and FX rate re-calculated from the FX Deal.', 'success')
  }

  const letterAction = (kind: 'Import' | 'Export') => {
    pushToast(`${kind} cover letter generated for Deal ID ${openDealId} (simulated — document generation is external to this demo).`)
  }

  const viewTxn = (bukrs: string, rfha: string) => {
    pushToast(`Opening TRM transaction ${rfha} in Company Code ${bukrs} (external transaction, outside this demo).`)
  }

  // ------------------------------------------------------------------ BL de-assign

  const confirmDeAssign = (remark: string) => {
    if (!openDealId || pendingBlIdx === null) return
    if (!remark.trim()) {
      pushToast('Enter a remark before updating.', 'warn')
      return
    }
    updateDeal(openDealId, (d) => deAssignBl(d, pendingBlIdx))
    setPendingBlIdx(null)
    setSub(null)
    pushToast(`BL de-assigned from Deal ID ${openDealId}.`, 'success')
  }

  const pagerButtons = Array.from({ length: totalPages }, (_, i) => i + 1)

  return (
    <div className="modiv">
      <div className="page-head">
        <BackButton className="btn-outline-hd" />
        <div className="head-flex">
          <div className="title-wrap">
            <div className="page-title">View List of Deal IDs for Invoicing</div>
          </div>
          <div className="page-subtitle">Track FX Utilization and Trade Invoicing progress per Deal ID</div>
        </div>
        <div className="head-actions">
          <span className="status-live" title="Connected" />
          <button className="btn-outline-hd" title="Refresh" onClick={refreshList}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M20 11a8 8 0 1 0-2.34 5.66" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M20 5v6h-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Refresh
          </button>
          <SignOutButton className="btn-outline-hd" />
        </div>
      </div>

      <main>
        <div className="panel">
          <div className="panel-title">
            <div className="panel-title-left">
              <h2>Deal IDs for Invoicing</h2>
              <span className="rec-count">{sortedDeals.length} records</span>
            </div>
            <div className="panel-title-right">
              <button className="btn-icon" title="Show/hide filters" onClick={() => setFiltersOpen((v) => !v)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M4 5h16l-6 7v6l-4 2v-8L4 5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                </svg>
              </button>
              <button className="btn-icon" title="Export visible rows to CSV" onClick={exportCsv}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M12 4v11M7 11l5 5 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M5 19h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>

          <div className={`master-toolbar${filtersOpen ? '' : ' collapsed'}`}>
            <div className="search-box toolbar-search">
              <span className="icon">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.9" />
                  <path d="m16.5 16.5 4 4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                </svg>
              </span>
              <input type="text" placeholder="Search all columns..." value={filters.q} onChange={(e) => applyFilters({ q: e.target.value })} />
            </div>
            <div className="filter-bar toolbar-filters">
              <div className="filter-field">
                <label>Deal End Date</label>
                <div className="date-range">
                  <DateField id="f-date-from" value={filters.dateFrom} ariaLabel="Deal end date from" onChange={(v) => applyFilters({ dateFrom: v })} />
                  <span>to</span>
                  <DateField id="f-date-to" value={filters.dateTo} ariaLabel="Deal end date to" onChange={(v) => applyFilters({ dateTo: v })} />
                </div>
              </div>
              <div className="filter-field">
                <label>Region</label>
                <select value={filters.region} onChange={(e) => applyFilters({ region: e.target.value })}>
                  <option value="ALL">All regions</option>
                  {Object.entries(REGIONS).map(([code, name]) => (
                    <option key={code} value={code}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="filter-field">
                <label>Origin Entity</label>
                <select value={filters.origin} onChange={(e) => applyFilters({ origin: e.target.value })}>
                  <option value="ALL">All entities</option>
                  {Object.values(ENTITIES).map((e) => (
                    <option key={e.code} value={e.code}>
                      {e.code} - {e.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="filter-field">
                <label>Model</label>
                <select value={filters.model} onChange={(e) => applyFilters({ model: e.target.value })}>
                  <option value="ALL">All models</option>
                  {Object.values(FX_MODELS).map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.code} - {m.desc}
                    </option>
                  ))}
                </select>
              </div>
              <div className="filter-field">
                <label>Status</label>
                <select value={filters.status} onChange={(e) => applyFilters({ status: e.target.value })}>
                  <option value="ALL">All statuses</option>
                  <option value="04">04 - Booked, Pending Invoice</option>
                  <option value="07">07 - Partial Invoice Created</option>
                  <option value="05">05 - Confirmed, Fully Invoiced</option>
                </select>
              </div>
              <div className="filter-reset-wrap">
                <span className="filter-spacer-label">Action</span>
                <button className="filter-reset" onClick={resetFilters}>
                  Reset
                </button>
              </div>
            </div>
          </div>

          <DealTable
            deals={pageDeals}
            sort={sort}
            onSort={(key: SortKey) => {
              setSort((s) => nextSort(s, key))
              setPage(1)
            }}
            onOpenDetail={openDetail}
            onOpenMcDetails={(dealId) => setSub({ kind: 'mc', dealId })}
          />

          <div className="pager">
            <div className="pager-info">
              {sortedDeals.length ? (
                <>
                  Showing <strong>{start + 1}</strong>–<strong>{Math.min(start + PAGE_SIZE, sortedDeals.length)}</strong> of <strong>{sortedDeals.length}</strong>
                </>
              ) : (
                'Showing 0 of 0'
              )}
            </div>
            <div className="pager-controls">
              <button className="pager-btn" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
                &#8249;
              </button>
              {pagerButtons.map((p) => (
                <button key={p} className={`pager-btn${p === currentPage ? ' active' : ''}`} onClick={() => setPage(p)}>
                  {p}
                </button>
              ))}
              <button className="pager-btn" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>
                &#8250;
              </button>
            </div>
          </div>
        </div>
      </main>

      <div className="toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className={`toast show${t.kind ? ` ${t.kind}` : ''}`}>
            {t.message}
          </div>
        ))}
      </div>

      {sub?.kind === 'mc'
        ? (() => {
            const mcDeal = deals.find((d) => d.dealId === sub.dealId)
            return mcDeal ? <McDetailsModal deal={mcDeal} onClose={() => setSub(null)} /> : null
          })()
        : null}

      {openDeal ? (
        <RbillModal
          deal={openDeal}
          amending={amending}
          onClose={closeDetail}
          onRefresh={refreshDeal}
          onSave={saveDeal}
          onToggleAmendment={(on) => {
            setAmending(on)
            if (on) pushToast('Amendment mode: Unit Price and Invoice Date are now editable on lines not yet invoiced.')
          }}
          onConfirmAmendment={() => {
            setAmending(false)
            pushToast('Amendment saved to invoice adjustment records.', 'success')
          }}
          onAmendDealStatus={amendDealStatus}
          onConfirmInvoiceGeneration={confirmInvoiceGeneration}
          onReverseInvoiceGeneration={reverseInvoiceGeneration}
          onRecalc={recalcUpdate}
          onOpenBlList={() => setSub({ kind: 'bl' })}
          onOpenDiff={() => setSub({ kind: 'diff' })}
          onLetter={letterAction}
          onOpenHouseBank={(idx) => setSub({ kind: 'houseBank', legIdx: idx })}
          onToggleMark={(idx, checked) => openDealId && updateDeal(openDealId, (d) => applyToggleMark(d, idx, checked))}
          onEditPrice={(idx, value) => openDealId && updateDeal(openDealId, (d) => applyEditPrice(d, idx, value))}
          onEditInvDate={(idx, value) => openDealId && updateDeal(openDealId, (d) => applyEditInvDate(d, idx, value))}
          onViewTxn={viewTxn}
        />
      ) : null}

      {sub?.kind === 'bl' && openDeal ? (
        <BlListModal
          deal={openDeal}
          onClose={() => setSub(null)}
          onDeAssign={(idx) => {
            setPendingBlIdx(idx)
            setSub({ kind: 'remark' })
          }}
        />
      ) : null}

      {sub?.kind === 'remark' && openDeal && pendingBlIdx !== null ? <RemarkModal blNo={openDeal.bls[pendingBlIdx]?.blNo ?? ''} onClose={() => setSub({ kind: 'bl' })} onConfirm={confirmDeAssign} /> : null}

      {sub?.kind === 'compliance' && openDeal ? (
        <ComplianceModal
          dealId={openDeal.dealId}
          lineCount={openDeal.inv.filter((r) => r.marked && !r.invoiced).length}
          note={{ kind: sub.fullMatch ? 'ok' : 'warn', message: sub.note }}
          onClose={() => setSub(null)}
          onConfirm={finaliseInvoice}
        />
      ) : null}

      {sub?.kind === 'diff' && openDeal ? <DiffModal deal={openDeal} onClose={() => setSub(null)} /> : null}

      {sub?.kind === 'houseBank' && openDeal && openDeal.inv[sub.legIdx] ? (
        <HouseBankModal
          deal={openDeal}
          leg={openDeal.inv[sub.legIdx]!}
          onClose={() => setSub(null)}
          onSave={(hb, acct, ptnr) => {
            const legIdx = sub.legIdx
            const leg = openDeal.inv[legIdx]
            if (openDealId) updateDeal(openDealId, (d) => applySaveHouseBank(d, legIdx, hb, acct, ptnr))
            setSub(null)
            if (leg) pushToast(`House Bank/Account ID updated for ${leg.ttype}.`, 'success')
          }}
        />
      ) : null}

      {sub?.kind === 'confirm' ? <ConfirmModal title={sub.title} text={sub.text} yesLabel={sub.yesLabel} onYes={sub.onYes} onClose={() => setSub(null)} /> : null}
    </div>
  )
}

import { masterContractDragImage } from '../../shared/master-contract/drag.ts'
import { useMasterContractFeedback } from '../../shared/master-contract/Feedback.tsx'
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { messageOf } from '../../shared/fx/master-contract.ts'
import type { MasterSource } from '../../shared/fx/masters.ts'
import { isAbort } from '../../shared/fx/mw.ts'
import { sapUser } from '../../shared/fx/sap.ts'
import { DateInput } from '../../shared/ui/DateInput.tsx'
import { bookDeal, loadContracts, loadMasters, markInUse, reverseContract, saveEdit as saveEditToMysql } from './api.ts'
import { CreateDealModal } from './CreateDealModal.tsx'
import { ENTITIES, FX_MODELS, INITIAL_DEAL_SEQ, REGIONS, STATUS_CODES, STATUS_MASTER } from './data.ts'
import { DealBreakdownModal } from './DealBreakdownModal.tsx'
import { EditMcModal } from './EditMcModal.tsx'
import { fmtNum, toISO } from './format.ts'
import {
  applyEdit,
  applyFilters,
  canCreateOrReverse,
  computeKpis,
  createDeal,
  defaultDealAmount,
  pagerWindow,
  reverseMc,
  selectionInfo,
  validateReverseRemark,
} from './logic.ts'
import { McDetailModal } from './McDetailModal.tsx'
import { McTable } from './McTable.tsx'
import { ReverseMcModal } from './ReverseMcModal.tsx'
import './short-straddle-deal-id.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './short-straddle-deal-id.dark.css'
import type {
  Deal,
  DropAction,
  EditForm,
  Filters,
  MasterContract,
  ModalId,
  StatusFilter,
  ToastKind,
} from './types.ts'

const BRAND_LOGO =
  'https://raw.githubusercontent.com/ryannayak/fs-assets/e82f35a83e28689167b22b4300d4994a249acee0/fs-short-logo.png'
const PAGE_SIZES = [8, 15, 25, 50]
const noFilters = (): Filters => ({ search: '', asOf: toISO(new Date()), status: 'ALL', entity: 'ALL', region: 'ALL', model: 'ALL' })

/**
 * RMC List – Deal ID Creation (Short Straddle), SAP transaction ZSGTSFR102, converted from
 * legacy/deal_id_workbench.html.
 *
 * Master Contracts, Deal IDs and the masters come from MySQL through the SLC middleware
 * (api.ts); Create Deal ID, Edit MC and Reverse MC write there first, and the Deal ID number
 * comes from the middleware's range. If the middleware cannot be reached the screen runs on
 * its dummy data as before and changes stay on the screen.
 *
 * The original's Refresh button reloaded the page to restore its dummy data; here it remounts
 * the workbench, which reloads everything and resets the filters.
 */
export default function ShortStraddleDealId() {
  const [generation, setGeneration] = useState(0)
  return <Workbench key={generation} onRefresh={() => setGeneration((g) => g + 1)} />
}

function Workbench({ onRefresh }: { onRefresh: () => void }) {
  const [contracts, setContracts] = useState<MasterContract[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  /** Where the contracts came from; 'dummy' means writes cannot reach MySQL. */
  const [source, setSource] = useState<MasterSource | 'loading'>('loading')
  const busy = useRef(false)
  /** Dummy mode only: the last number drawn from number-range object ZSGTSFNR01. */
  const [lastDealSeq, setLastDealSeq] = useState(INITIAL_DEAL_SEQ)

  // Table
  const [filters, setFilters] = useState<Filters>(noFilters)
  const [selected, setSelected] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)

  // Popups. Each keeps the record it last showed so the content stays put while it fades out.
  const [openModal, setOpenModal] = useState<ModalId | null>(null)
  const [detailRef, setDetailRef] = useState<number | null>(null)
  const [breakRef, setBreakRef] = useState<number | null>(null)
  const [editRef, setEditRef] = useState<number | null>(null)
  const [dealRef, setDealRef] = useState<number | null>(null)
  const [reverseRef, setReverseRef] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({ amount: '', payTerms: '', model: '' })
  const [dealAmount, setDealAmount] = useState('')
  const [reverseRemark, setReverseRemark] = useState('')
  const [reverseError, setReverseError] = useState(false)
  const closeModal = useCallback(() => setOpenModal(null), [])

  const status = useMasterContractFeedback()
  const showToast = useCallback((message: string, kind: ToastKind) => {
    status.show(message, kind === 'error' ? 'error' : kind === 'success' ? 'success' : 'info')
  }, [status.show])

  useEffect(() => {
    const controller = new AbortController()
    loadMasters(controller.signal)
      .then(() => loadContracts(controller.signal))
      .then((loaded) => {
        setContracts(loaded.contracts)
        setDeals(loaded.deals)
        setLastDealSeq(loaded.lastSeq)
        setSource(loaded.source)
      })
      .catch((error: unknown) => {
        if (!isAbort(error)) showToast(`Could not load Master Contracts: ${messageOf(error)}`, 'error')
      })
    return () => controller.abort()
  }, [showToast])

  // Drag and drop
  const [draggingRef, setDraggingRef] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<DropAction | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { closeModal(); setDraggingRef(null); setDragOver(null) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [closeModal])

  const findMc = (ref: number | null) => (ref === null ? undefined : contracts.find((c) => c.mcRef === ref))

  // ------------------------------------------------------------------ live filtering

  const { scope, filtered } = useMemo(() => applyFilters(contracts, filters), [contracts, filters])
  const kpis = useMemo(() => computeKpis(scope, deals), [scope, deals])

  /**
   * The original's applyFilters(): runs after every filter change and every update. It goes
   * back to page 1 and drops the selection once the selected row is filtered out.
   */
  const refilter = (nextContracts: MasterContract[], nextFilters: Filters, keepSelection = true) => {
    const visible = applyFilters(nextContracts, nextFilters).filtered
    if (!keepSelection || (selected !== null && !visible.some((c) => c.mcRef === selected))) setSelected(null)
    setPage(1)
  }

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    const next = { ...filters, [key]: value }
    setFilters(next)
    refilter(contracts, next)
  }

  const resetFilters = () => {
    const next = noFilters()
    setFilters(next)
    refilter(contracts, next)
  }

  // ------------------------------------------------------------------ pager

  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(page, totalPages)
  const startIdx = (currentPage - 1) * pageSize
  const pageRows = filtered.slice(startIdx, startIdx + pageSize)
  const goToPage = (p: number) => setPage(Math.min(Math.max(1, p), totalPages))

  // ------------------------------------------------------------------ selection / toolbar

  const current = findMc(selected)
  const actionsEnabled = canCreateOrReverse(current)

  const selectRow = (mcRef: number) => setSelected((s) => (s === mcRef ? null : mcRef))

  // ------------------------------------------------------------------ popups

  const openMcDetail = (mcRef: number) => {
    setDetailRef(mcRef)
    setOpenModal('mcdetail')
  }

  const openDealBreakdown = (mcRef: number) => {
    setBreakRef(mcRef)
    setOpenModal('dealbreak')
  }

  // The original kept Edit MC (dynpro 9001) wired up, but its toolbar has no Edit button, so
  // it is only reachable through a drop with the 'edit' action — kept as it was.
  const openEdit = (mc: MasterContract) => {
    setEditRef(mc.mcRef)
    setEditForm({ amount: fmtNum(mc.amtUSD), payTerms: mc.payTerms, model: mc.fxModel })
    setOpenModal('edit')
  }

  const saveEdit = async () => {
    if (busy.current) return
    const mc = findMc(editRef)
    if (!mc) {
      closeModal()
      return
    }
    // The MC update the ABAP screen performs on Update (dynpro 9001).
    let updated = applyEdit(mc, editForm, new Date())
    if (source === 'mysql') {
      busy.current = true
      try {
        await saveEditToMysql(updated)
        updated = { ...updated, changedBy: (await sapUser()) || updated.changedBy }
      } catch (error) {
        showToast(`Master Contract ${mc.mcRef} was not updated: ${messageOf(error)}`, 'error')
        return
      } finally {
        busy.current = false
      }
    }
    const next = contracts.map((c) => (c.mcRef === mc.mcRef ? updated : c))
    setContracts(next)
    closeModal()
    showToast('Master Contract record updated successfully.', 'success')
    refilter(next, filters)
  }

  const openDeal = (mc: MasterContract) => {
    setDealRef(mc.mcRef)
    setDealAmount(fmtNum(defaultDealAmount(mc, deals)))
    setOpenModal('deal')
  }

  const submitDeal = async () => {
    if (busy.current) return
    const mc = findMc(dealRef)
    if (!mc) return
    const now = new Date()
    if (source === 'mysql') {
      // GEN_NO_DEAL: the middleware draws the Deal ID from ZSGTSFNR01/01 — the local counter
      // is not used. UPDATE_DEAL_ID then moves the MC to 04.
      const draft = createDeal(mc, dealAmount, lastDealSeq, now).deal
      busy.current = true
      let deal: Deal
      try {
        const booked = await bookDeal(draft, mc)
        const user = await sapUser()
        // A blank ZTRD_CODE (no ZSGTRMTR_TRADER row for this user) keeps the dummy on screen.
        deal = { ...draft, dealId: booked.dealId, tradeCode: booked.tradeCode || draft.tradeCode, createdBy: user || draft.createdBy }
      } catch (error) {
        busy.current = false
        showToast(`The Deal ID was not created: ${messageOf(error)}`, 'error')
        return
      }
      let failure: string | null = null
      try {
        await markInUse(mc)
      } catch (error) {
        failure = messageOf(error)
      } finally {
        busy.current = false
      }
      const user = await sapUser()
      const next =
        failure === null
          ? contracts.map((c) => (c.mcRef === mc.mcRef ? { ...c, mcStat: '04' as const, changedBy: user || c.changedBy, changedOn: now } : c))
          : contracts
      setContracts(next)
      setDeals((list) => [...list, deal])
      closeModal()
      if (failure === null) showToast(`Deal ID ${deal.dealId} created successfully and linked to MC ${mc.mcRef}.`, 'success')
      else
        showToast(
          `Deal ID ${deal.dealId} was created and linked to MC ${mc.mcRef}, but the Master Contract could not be moved to status 04 (Deal ID Created): ${failure}`,
          'error',
        )
      refilter(next, filters)
      return
    }
    // Dummy mode: the number comes from the screen's own ZSGTSFNR01 counter, as before.
    const r = createDeal(mc, dealAmount, lastDealSeq, now)
    const next = contracts.map((c) => (c.mcRef === mc.mcRef ? r.contract : c))
    setContracts(next)
    setDeals((list) => [...list, r.deal])
    setLastDealSeq(r.lastSeq)
    closeModal()
    showToast(`Deal ID ${r.deal.dealId} created successfully and linked to MC ${mc.mcRef}.`, 'success')
    refilter(next, filters)
  }

  const openReverse = (mc: MasterContract) => {
    setReverseRef(mc.mcRef)
    setReverseRemark('')
    setReverseError(false)
    setOpenModal('reverse')
  }

  const submitReverse = async () => {
    if (busy.current) return
    const mc = findMc(reverseRef)
    if (!mc) return
    if (!validateReverseRemark(reverseRemark)) {
      setReverseError(true)
      showToast('Please enter remarks.', '')
      return
    }
    // USER_COMMAND_9000 writes status 21 and the remark back to the MC table.
    let reversed = reverseMc(mc, reverseRemark, new Date())
    if (source === 'mysql') {
      busy.current = true
      try {
        await reverseContract(mc, reverseRemark)
        reversed = { ...reversed, changedBy: (await sapUser()) || reversed.changedBy }
      } catch (error) {
        showToast(`Master Contract ${mc.mcRef} was not reversed: ${messageOf(error)}`, 'error')
        return
      } finally {
        busy.current = false
      }
    }
    const next = contracts.map((c) => (c.mcRef === mc.mcRef ? reversed : c))
    setContracts(next)
    closeModal()
    showToast(`Master Contract ${mc.mcRef} reversed successfully.`, 'success')
    refilter(next, filters, false)
  }

  const runAction = (action: DropAction) => {
    if (!current) return
    if (action === 'edit') openEdit(current)
    else if (action === 'deal') openDeal(current)
    else openReverse(current)
  }

  // ------------------------------------------------------------------ drag and drop

  const onRowDragStart = (e: DragEvent<HTMLTableRowElement>, mcRef: number) => {
    // Only the selected row may be dragged, mirroring the single row selection.
    if (mcRef !== selected) {
      e.preventDefault()
      return
    }
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(mcRef))
    masterContractDragImage(e.dataTransfer, `MC ${mcRef}`)
    setDraggingRef(mcRef)
  }

  const onRowDragEnd = () => {
    setDraggingRef(null)
    setDragOver(null)
  }

  const dropTarget = (action: DropAction) => ({
    onDragOver: (e: DragEvent<HTMLButtonElement>) => {
      if (selected === null) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    },
    onDragEnter: (e: DragEvent<HTMLButtonElement>) => {
      if (selected === null) return
      e.preventDefault()
      if (!e.currentTarget.disabled) setDragOver(action)
    },
    onDragLeave: () => setDragOver(null),
    onDrop: (e: DragEvent<HTMLButtonElement>) => {
      e.preventDefault()
      setDragOver(null)
      setDraggingRef(null)
      if (selected === null || e.currentTarget.disabled) return
      runAction(action)
    },
  })

  const statusFilter = filters.status
  // Per render: ENTITIES is swapped for ZSGTSFTR_COMP's rows once they load.
  const sortedEntities = [...ENTITIES].sort((a, b) => (a.code < b.code ? -1 : 1))

  return (
    <div className="ssdid">
      <div className="page-head">
        <BackButton className="fx-back-btn" />
        <img className="head-icon" src={BRAND_LOGO} alt="Company logo" />
        <div className="title-wrap">
          <div className="title-row">
            <span className="page-title">RMC List – Deal ID Creation</span>
          </div>
        </div>
        <div className="head-actions">
          <button className="btn-outline" type="button" title="Reload the Master Contracts" onClick={onRefresh}>
            ↻ Refresh
          </button>
          <SignOutButton className="btn-outline" />
        </div>
      </div>

      <main>
        {/* KPI cards — click one to filter by its status */}
        <div className="metrics-grid" id="kpi-grid">
          {kpis.cards.map((c) => (
            <div
              key={c.key}
              className={`metric-card${statusFilter === c.key ? ' active' : ''}`}
              onClick={() => setFilter('status', c.key)}
              role="button" tabIndex={0} aria-pressed={statusFilter === c.key}
              onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setFilter('status', c.key) } }}
            >
              <div className="metric-inner">
                <div className="metric-val">{c.val}</div>
                <div className="metric-lbl">{c.lbl}</div>
              </div>
            </div>
          ))}
          <div className="metric-card" style={{ cursor: 'default' }}>
            <div className="metric-inner">
              <div className="metric-val">${fmtNum(kpis.totalUti)}</div>
              <div className="metric-lbl">Total Utilized (Deal ID) Amt</div>
            </div>
          </div>
        </div>

        {/* ALV result list */}
        <div className="panel">
          <div className="panel-title">
            <div className="panel-title-left">
              <span className="dot-bullet" />
              <h2>Master Contracts (Short Straddle)</h2>
              <SourceNote source={source} />
            </div>
            <span className="badge-blue" id="result-count-badge">
              {total} contract{total === 1 ? '' : 's'}
            </span>
          </div>

          <div className="master-toolbar toolbar-flat">
            <div className="common-actions">
              <button
                className={`rowaction-btn primary drag-target${dragOver === 'deal' ? ' drag-over' : ''}`}
                id="btn-create-deal"
                type="button"
                disabled={!actionsEnabled}
                onClick={() => runAction('deal')}
                {...dropTarget('deal')}
              >
                Create Deal ID
              </button>
              <button
                className={`rowaction-btn danger drag-target${dragOver === 'reverse' ? ' drag-over' : ''}`}
                id="btn-reverse-mc"
                type="button"
                disabled={!actionsEnabled}
                onClick={() => runAction('reverse')}
                {...dropTarget('reverse')}
              >
                Reverse MC
              </button>
            </div>
            <div className="search-box compact">
              <span className="icon">🔍</span>
              <input
                type="text"
                placeholder="Search all columns..."
                value={filters.search}
                onChange={(e) => setFilter('search', e.target.value)}
              />
            </div>
            <div className="filter-panel-body" id="filter-panel-body">
              <div className="filter-bar">
                <div className="date-range">
                  <span>Ship End Date</span>
                  <div className="dp">
                    <DateInput
                      aria-label="Ship End Date"
                      value={filters.asOf}
                      title="Filters on Ship End Date: WHERE zship_end > p_date"
                      onChange={(v) => setFilter('asOf', v)}
                    />
                  </div>
                </div>
                <div className="filter-field status-filter">
                  <label htmlFor="ssdid-f-status">Status</label>
                  <select
                    id="ssdid-f-status"
                    value={statusFilter}
                    onChange={(e) => setFilter('status', e.target.value as StatusFilter)}
                  >
                    <option value="ALL">All statuses</option>
                    {STATUS_CODES.map((code) => (
                      <option key={code} value={code}>
                        {code} - {STATUS_MASTER[code]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="filter-field entity-filter">
                  <label htmlFor="ssdid-f-entity">Origin Entity</label>
                  <select id="ssdid-f-entity" value={filters.entity} onChange={(e) => setFilter('entity', e.target.value)}>
                    <option value="ALL">All entities</option>
                    {sortedEntities.map((en) => (
                      <option key={en.code} value={en.code}>
                        {en.code} - {en.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="filter-field">
                  <label htmlFor="ssdid-f-region">Region</label>
                  <select id="ssdid-f-region" value={filters.region} onChange={(e) => setFilter('region', e.target.value)}>
                    <option value="ALL">All regions</option>
                    {REGIONS.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name ? `${r.id} - ${r.name}` : r.id}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="filter-field">
                  <label htmlFor="ssdid-f-model">FX Model</label>
                  <select id="ssdid-f-model" value={filters.model} onChange={(e) => setFilter('model', e.target.value)}>
                    <option value="ALL">All models</option>
                    {FX_MODELS.map((m) => (
                      <option key={m.code} value={m.code}>
                        {m.code} - {m.desc}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="filter-reset-wrap">
                  <button className="filter-reset" type="button" onClick={resetFilters}>
                    Reset
                  </button>
                </div>
              </div>
              <span className="selected-count" id="alv-sel-info">
                {selectionInfo(current)}
              </span>
            </div>
          </div>

          <div className="table-wrap">
            <McTable
              rows={pageRows}
              deals={deals}
              selected={selected}
              draggingRef={draggingRef}
              onSelect={selectRow}
              onOpenDetail={openMcDetail}
              onOpenBreakdown={openDealBreakdown}
              onDragStart={onRowDragStart}
              onDragEnd={onRowDragEnd}
            />
          </div>

          <div className="pager" id="pager">
            <div className="pager-size">
              <span>Rows per page</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(parseInt(e.target.value, 10) || 15)
                  setPage(1)
                }}
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div className="pager-controls">
              {total ? (
                <>
                  <button className="pager-btn" type="button" disabled={currentPage <= 1} title="First page" onClick={() => goToPage(1)}>
                    «
                  </button>
                  <button
                    className="pager-btn"
                    type="button"
                    disabled={currentPage <= 1}
                    title="Previous page"
                    onClick={() => goToPage(currentPage - 1)}
                  >
                    ‹
                  </button>
                  {pagerWindow(currentPage, totalPages).map((p) => (
                    <button
                      key={p}
                      className={`pager-btn ${p === currentPage ? 'active' : ''}`}
                      type="button"
                      onClick={() => goToPage(p)}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    className="pager-btn"
                    type="button"
                    disabled={currentPage >= totalPages}
                    title="Next page"
                    onClick={() => goToPage(currentPage + 1)}
                  >
                    ›
                  </button>
                  <button
                    className="pager-btn"
                    type="button"
                    disabled={currentPage >= totalPages}
                    title="Last page"
                    onClick={() => goToPage(totalPages)}
                  >
                    »
                  </button>
                </>
              ) : null}
            </div>
            <div className="pager-info">
              {total ? `Showing ${startIdx + 1}-${Math.min(total, startIdx + pageSize)} of ${total}` : 'Showing 0 of 0'}
            </div>
          </div>

          <div className="note">
            <strong>Note:</strong> This list only ever shows Master Contracts booked under a <strong>Short Straddle</strong>{' '}
            FX Model (<code>ZSS = &apos;X&apos;</code> on the FX Model master) and whose shipment window has not yet closed
            relative to <strong>As of Date</strong> (<code>WHERE zship_end &gt; p_date</code>) — both match the ABAP
            selection logic exactly, they&apos;re just applied live as filters instead of a separate selection screen. Click
            a <strong>MC Ref No</strong> to view the full Master Contract detail popup (equivalent to function module{' '}
            <code>ZSGTSFFM_MC_DETAILS</code>). Click the <strong>Uti-Deal ID Amt(USD)</strong> value to drill into the Deal
            ID / FX leg breakdown for that contract (equivalent to <code>SUBMIT ZSGTSF_RDEAL_ID_DETAIL</code>). Click
            anywhere else on a row to select it for the toolbar actions above — only one row can be selected at a time,
            matching the ALV single-row selection used by the <b>EDIT_MC</b> and <b>DEAL</b> custom functions in the
            original transaction.
          </div>
        </div>
      </main>

      {status.element}

      <McDetailModal open={openModal === 'mcdetail'} contract={findMc(detailRef)} deals={deals} onClose={closeModal} />
      <DealBreakdownModal open={openModal === 'dealbreak'} contract={findMc(breakRef)} deals={deals} onClose={closeModal} />
      <EditMcModal
        open={openModal === 'edit'}
        contract={findMc(editRef)}
        form={editForm}
        onChange={(patch) => setEditForm((f) => ({ ...f, ...patch }))}
        onClose={closeModal}
        onSave={saveEdit}
      />
      <CreateDealModal
        open={openModal === 'deal'}
        contract={findMc(dealRef)}
        amount={dealAmount}
        lastDealSeq={source === 'mysql' ? null : lastDealSeq}
        onAmountChange={setDealAmount}
        onClose={closeModal}
        onCreate={submitDeal}
      />
      <ReverseMcModal
        open={openModal === 'reverse'}
        contract={findMc(reverseRef)}
        remark={reverseRemark}
        error={reverseError}
        onRemarkChange={(v) => {
          setReverseRemark(v)
          setReverseError(false)
        }}
        onClose={closeModal}
        onReverse={submitReverse}
      />
    </div>
  )
}

/** Says where the rows came from, so dummy data is never mistaken for MySQL's. */
function SourceNote({ source }: { source: MasterSource | 'loading' }) {
  const text =
    source === 'loading'
      ? 'Loading from MySQL…'
      : source === 'mysql'
        ? 'ZSGTSFTR_MAS_CON · MySQL'
        : 'Dummy data — the middleware could not be reached, so changes stay on this screen'
  return <span style={{ marginLeft: 10, fontSize: 11, fontWeight: 500, opacity: 0.7 }}>{text}</span>
}

import { masterContractDragImage } from '../../shared/master-contract/drag.ts'
import { useMasterContractFeedback } from '../../shared/master-contract/Feedback.tsx'
import { LinkedDealsModal } from '../../shared/master-contract/LinkedDealsModal.tsx'
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { messageOf } from '../../shared/fx/master-contract.ts'
import type { MasterSource } from '../../shared/fx/masters.ts'
import { isAbort } from '../../shared/fx/mw.ts'
import { ActionDialog } from './ActionDialog.tsx'
import { actionMcs as writeAction, loadContracts, loadMasters, moRemark, saveEdit as writeEdit } from './api.ts'
import { ChildContractModal } from './ChildContractModal.tsx'
import { ContractsTable } from './ContractsTable.tsx'
import { ENTITIES, FX_MODELS, REGIONS } from './data.ts'
import { DatePicker } from './DatePicker.tsx'
import { EditContractModal } from './EditContractModal.tsx'
import { fmtCompactUsd, fmtNum } from './format.ts'
import {
  DEFAULT_FILTERS,
  actionToast,
  applyEdit,
  applyMcAction,
  checkedContracts,
  computeKpis,
  filterContracts,
  isActionValid,
  isActionable,
  nextSort,
  pageOf,
  pagerWindow,
  parseDragPayload,
  setPageChecked,
  toggleChecked,
  type EditValues,
} from './logic.ts'
import { useModal } from './modal.tsx'
import './mo-confirm-master-contract.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './mo-confirm-master-contract.dark.css'
// Hand-written deviations from the generated sheet (the drag hint's body class) — see inside.
import './mo-confirm-master-contract.overrides.css'
import type {
  Filters,
  MasterContract,
  McAction,
  Sort,
  SortKey,
  StatusFilter,
  ToastKind,
} from './types.ts'

const BRAND_LOGO =
  'https://raw.githubusercontent.com/ryannayak/fs-assets/e82f35a83e28689167b22b4300d4994a249acee0/fs-short-logo.png'
const DEFAULT_SORT: Sort = { key: 'mcNumber', dir: -1 } // descending, newest first
const plural = (n: number) => (n === 1 ? '' : 's')

/**
 * MO: Confirm Master Contract (ZSGTSFR011), converted from legacy/confirm-master-contract.html.
 *
 * The MO work queue is ZSGTSFTR_MAS_CON at status 02 / 11, read and written through the SLC
 * middleware (api.ts): Confirm writes 03, Reject 13 with the MO remark, Edit the amount, terms
 * and FX Model. If the middleware cannot be reached the screen runs on its dummy contracts as
 * before and changes stay on the screen. Its Refresh button reloaded the page; here it
 * remounts the screen, which reloads the queue.
 */
export default function MoConfirmMasterContract() {
  const [generation, setGeneration] = useState(0)
  return <ConfirmScreen key={generation} onRefresh={() => setGeneration((g) => g + 1)} />
}

function ConfirmScreen({ onRefresh }: { onRefresh: () => void }) {
  const [contracts, setContracts] = useState<MasterContract[]>([])
  /** Where the queue came from; 'dummy' means writes cannot reach MySQL. */
  const [source, setSource] = useState<MasterSource | 'loading'>('loading')
  const busy = useRef(false)

  // Selection criteria and table
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [statusFilter, setStatusFilterState] = useState<StatusFilter>('ALL')
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT)
  /** Row order a header click sorted from, so ties keep it (see sortContracts). */
  const [prior, setPrior] = useState<number[] | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)
  const [checked, setChecked] = useState<Set<number>>(() => new Set())
  const [kpiHidden, setKpiHidden] = useState(false)
  const [openPicker, setOpenPicker] = useState<'from' | 'to' | null>(null)

  // Popups
  const actionModal = useModal()
  const childModal = useModal()
  const editModal = useModal()
  const linkedDealsModal = useModal()
  const [linkedDealsMc, setLinkedDealsMc] = useState<number | null>(null)
  const [pendingAction, setPendingAction] = useState<McAction>('confirm')
  const [actionMcs, setActionMcs] = useState<MasterContract[]>([])
  const [remark, setRemark] = useState('')
  const [remarkError, setRemarkError] = useState(false)
  const [childMc, setChildMc] = useState<MasterContract | null>(null)
  const [editMc, setEditMc] = useState<MasterContract | null>(null)
  const [editValues, setEditValues] = useState<EditValues>({ amount: '', paymentTerms: '', fxModel: '' })

  // Drag and drop
  const draggedNumbers = useRef<number[]>([])
  const [draggingRow, setDraggingRow] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<McAction | null>(null)

  const { kpiScope, rows } = useMemo(
    () => filterContracts(contracts, filters, statusFilter, sort, prior),
    [contracts, filters, statusFilter, sort, prior],
  )
  const selected = checkedContracts(contracts, checked)
  const kpis = computeKpis(kpiScope)
  const paged = pageOf(rows, page, pageSize)

  const feedback = useMasterContractFeedback()
  const showToast = useCallback((message: string, kind: ToastKind) => {
    feedback.show(message, kind === 'error' ? 'error' : kind === 'success' ? 'success' : 'info')
  }, [feedback.show])

  const reload = useCallback(async (signal?: AbortSignal) => {
    const loaded = await loadContracts(signal)
    setContracts(loaded.contracts)
    setSource(loaded.source)
    return loaded.contracts
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    loadMasters(controller.signal)
      .then(() => reload(controller.signal))
      .catch((error: unknown) => {
        if (!isAbort(error)) showToast(`Could not load Master Contracts: ${messageOf(error)}`, 'error')
      })
    return () => controller.abort()
  }, [reload, showToast])

  /**
   * What the page's applyFilters did besides filtering (which is derived here): back to page
   * one, and the list rebuilt from the master order before sorting.
   */
  const refilter = () => {
    setPage(1)
    setPrior(null)
  }

  const setFilter = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }))
    refilter()
  }

  const setStatusFilter = (key: StatusFilter) => {
    setStatusFilterState(key)
    refilter()
  }

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS)
    setStatusFilter('ALL')
  }

  const onSort = (key: SortKey) => {
    setPrior(rows.map((mc) => mc.mcNumber))
    setSort((s) => nextSort(s, key))
  }

  // ------------------------------------------------------------------ keyboard / outside clicks

  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {})
  keyRef.current = (e) => {
    if (e.key === 'F8') {
      // Execute (F8), as on the SAP selection screen.
      e.preventDefault()
      refilter()
      showToast(`Selection executed. ${rows.length} Master Contract(s) found.`, 'info')
    }
    if (e.key === 'Escape') {
      endDrag()
      actionModal.close()
      childModal.close()
      editModal.close()
      linkedDealsModal.close()
      setOpenPicker(null)
    }
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e)
    // A click anywhere outside a date picker closes whichever calendar is open.
    const onClick = (e: MouseEvent) => {
      if (!(e.target instanceof Element && e.target.closest('.dp'))) setOpenPicker(null)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('click', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('click', onClick)
    }
  }, [])

  // ------------------------------------------------------------------ selection

  const onToggleRow = (mc: MasterContract) => {
    if (!isActionable(mc)) return
    setChecked((s) => toggleChecked(s, mc, !s.has(mc.mcNumber)))
  }

  // ------------------------------------------------------------------ confirm / reject

  const openActionDialog = (action: McAction, mcs: MasterContract[]) => {
    setPendingAction(action)
    setActionMcs(mcs)
    setRemark('')
    setRemarkError(false)
    actionModal.open()
  }

  const askBulkAction = (action: McAction) => {
    if (selected.length === 0) return
    openActionDialog(action, selected)
  }

  const doAction = async () => {
    if (busy.current) return
    // Confirm exactly the records displayed in the review, including drag-and-drop selections.
    const mcs = actionMcs
    if (!isActionValid(pendingAction, remark)) {
      setRemarkError(true) // keep the dialog open until a remark is entered
      return
    }
    const numbers = mcs.map((mc) => mc.mcNumber)
    const action = pendingAction
    if (source === 'mysql') {
      // ZMC_STAT 03 / 13 (and ZMO_REMARKS on a rejection), one update per MC.
      busy.current = true
      let changedBy: string
      try {
        changedBy = await writeAction(numbers, action, remark)
      } catch (error) {
        showToast(messageOf(error), 'error')
        // Whatever did move is re-read, so the queue never shows a status MySQL lacks.
        await reload().catch(() => undefined)
        return
      } finally {
        busy.current = false
      }
      setContracts((all) => applyMcAction(all, numbers, action, moRemark(remark), new Date(), changedBy))
    } else {
      setContracts((all) => applyMcAction(all, numbers, action, remark, new Date()))
    }
    setChecked((s) => {
      const next = new Set(s)
      for (const n of numbers) next.delete(n)
      return next
    })
    const t = actionToast(action, mcs)
    showToast(t.message, 'success')
    actionModal.close()
    childModal.close()
    refilter()
  }

  // ------------------------------------------------------------------ drag a selection onto Confirm / Reject

  const endDrag = () => {
    draggedNumbers.current = []
    setDraggingRow(null)
    setDragOver(null)
  }

  const onDragStart = (e: DragEvent<HTMLTableRowElement>, mc: MasterContract) => {
    if (!isActionable(mc) || !checked.has(mc.mcNumber)) {
      e.preventDefault()
      return
    }
    // Dragging any selected row carries the complete current selection.
    draggedNumbers.current = selected.map((m) => m.mcNumber)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', draggedNumbers.current.join(','))
    masterContractDragImage(e.dataTransfer, selected.length > 1 ? `${selected.length} Master Contracts selected` : `MC ${mc.mcNumber}`)
    setDraggingRow(mc.mcNumber)
  }

  const dropTarget = (action: McAction) => ({
    onDragOver: (e: DragEvent<HTMLButtonElement>) => {
      if (!draggedNumbers.current.length) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    },
    onDragEnter: (e: DragEvent<HTMLButtonElement>) => {
      if (!draggedNumbers.current.length) return
      e.preventDefault()
      setDragOver(action)
    },
    onDragLeave: () => setDragOver((cur) => (cur === action ? null : cur)),
    onDrop: (e: DragEvent<HTMLButtonElement>) => {
      e.preventDefault()
      // The selection captured when the drag started: dragging one row of a multi-selection
      // confirms/rejects all of them.
      const numbers = draggedNumbers.current.length
        ? draggedNumbers.current.slice()
        : parseDragPayload(e.dataTransfer.getData('text/plain'))
      endDrag()
      const mcs = numbers
        .map((n) => contracts.find((mc) => mc.mcNumber === n))
        .filter((mc): mc is MasterContract => !!mc && isActionable(mc))
      if (mcs.length) openActionDialog(action, mcs)
    },
  })

  // ------------------------------------------------------------------ child / edit

  const openChild = (mc: MasterContract) => {
    setChildMc(mc)
    childModal.open()
  }

  const openLinkedDeals = (mc: MasterContract) => {
    if (source !== 'mysql') return
    actionModal.close()
    childModal.close()
    editModal.close()
    setLinkedDealsMc(mc.mcNumber)
    linkedDealsModal.open()
  }

  const quickAction = (action: McAction, mc: MasterContract) => {
    const current = contracts.find((m) => m.mcNumber === mc.mcNumber)
    if (current) openActionDialog(action, [current])
  }

  const openEdit = (mc: MasterContract) => {
    setEditMc(mc)
    setEditValues({ amount: fmtNum(mc.amtUSD), paymentTerms: mc.paymentTerms, fxModel: mc.fxModel })
    editModal.open()
  }

  const saveEdit = async () => {
    if (busy.current) return
    const current = editMc ? contracts.find((m) => m.mcNumber === editMc.mcNumber) : undefined
    if (!current || !isActionable(current)) {
      editModal.close()
      return
    }
    let updated = applyEdit(current, editValues, new Date())
    if (source === 'mysql') {
      busy.current = true
      try {
        updated = { ...updated, changedBy: await writeEdit(updated) }
      } catch (error) {
        showToast(`Master Contract ${current.mcNumber} was not updated: ${messageOf(error)}`, 'error')
        return
      } finally {
        busy.current = false
      }
    }
    setContracts((all) => all.map((m) => (m.mcNumber === updated.mcNumber ? updated : m)))
    editModal.close()
    showToast('Master Contract Updated Successfully', 'success')
    refilter()
  }

  // ------------------------------------------------------------------ render

  // Per render: ENTITIES and FX_MODELS are swapped for MySQL's rows once they load. RULE_BT
  // can hold a model under more than one currency string; the filter is by code, so once each.
  const entityOptions = ENTITIES.slice().sort((a, b) => (a.code < b.code ? -1 : 1))
  const modelOptions = FX_MODELS.filter((m, i) => FX_MODELS.findIndex((x) => x.code === m.code) === i)

  const kpiCards: Array<{ key: StatusFilter; cls: string; val: number; lbl: string; help: string }> = [
    { key: 'ALL', cls: 'k-total', val: kpis.total, lbl: 'Total Master Contracts', help: 'Contracts currently awaiting MO review' },
    { key: 'RELEASE', cls: 'k-pending', val: kpis.counts.RELEASE, lbl: 'Release to MO', help: 'New contracts released by Front Office' },
    { key: 'ERRCORR', cls: 'k-errcorr', val: kpis.counts.ERRCORR, lbl: 'Error Correction', help: 'Corrected contracts returned for MO review' },
  ]

  return (
    <div className={`mocmc${draggingRow !== null ? ' row-dragging' : ''}`}>
      <div className="page-head">
        <BackButton className="fx-back-btn" />
        <img className="head-icon" src={BRAND_LOGO} alt="Fourth Signal" />
        <div className="title-wrap">
          <div className="page-title">MO: Confirm Master Contract</div>
        </div>
        <div className="head-actions">
          <button className="btn-outline" type="button" title="Reload data" onClick={onRefresh}>
            ↻ Refresh
          </button>
          <SignOutButton className="btn-outline" />
        </div>
      </div>

      <main>
        <div className="kpi-head">
          <button className={`kpi-toggle${kpiHidden ? ' collapsed' : ''}`} id="kpi-toggle" type="button" onClick={() => setKpiHidden((h) => !h)}>
            <span id="kpi-caret">▾</span>
          </button>
          <div className="kpi-head-title">Overview</div>
        </div>
        <div className={`metrics-grid${kpiHidden ? ' kpi-hidden' : ''}`} id="kpi-grid">
          {kpiCards.map((c) => (
            <div
              key={c.key}
              className={`metric-card ${c.cls}${statusFilter === c.key ? ' active' : ''}`}
              onClick={() => setStatusFilter(c.key)}
              role="button" tabIndex={0} aria-pressed={statusFilter === c.key}
              onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setStatusFilter(c.key) } }}
            >
              <div className="metric-inner">
                <div className="metric-val">{c.val}</div>
                <div className="metric-lbl">{c.lbl}</div>
                <div className="metric-help">{c.help}</div>
              </div>
            </div>
          ))}
          <div className="metric-card k-total" style={{ cursor: 'default' }}>
            <div className="metric-inner">
              <div className="metric-val">{fmtCompactUsd(kpis.totalUSD)}</div>
              <div className="metric-lbl">Total MC Amount (USD)</div>
              <div className="metric-help">Combined USD value of contracts in this queue</div>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-title">
            <div className="panel-title-left">
              <span className="dot-bullet" />
              <h2>Master Contracts</h2>
              <SourceNote source={source} />
            </div>
          </div>

          <div className="master-toolbar toolbar-flat">
            <div className="common-actions">
              <button
                className={`common-btn approve drag-target${dragOver === 'confirm' ? ' drag-over' : ''}`}
                id="btn-confirm-sel"
                type="button"
                disabled={selected.length === 0}
                onClick={() => askBulkAction('confirm')}
                title="Confirm selected contracts, or drag any selected row here"
                {...dropTarget('confirm')}
              >
                Confirm
              </button>
              <button
                className={`common-btn reject drag-target${dragOver === 'reject' ? ' drag-over' : ''}`}
                id="btn-reject-sel"
                type="button"
                disabled={selected.length === 0}
                onClick={() => askBulkAction('reject')}
                title="Reject selected contracts, or drag any selected row here"
                {...dropTarget('reject')}
              >
                Reject
              </button>
              <span className="selected-count" id="selected-count">
                {selected.length ? `${selected.length} selected · drag any selected row to Confirm or Reject` : '0 selected'}
              </span>
            </div>
            <div className="search-box">
              <span className="icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
                  <path d="m16.5 16.5 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </span>
              <input
                id="f-search"
                type="text"
                placeholder="Search MC number, entity, commodity, reference..."
                value={filters.q}
                onChange={(e) => setFilter({ q: e.target.value })}
              />
            </div>
            <div className="filter-panel-body" id="filter-panel-body">
              <div className="filter-bar">
                <div className="filter-field status-filter">
                  <label htmlFor="f-status">Status</label>
                  <select id="f-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
                    <option value="ALL">All statuses</option>
                    <option value="RELEASE">Release to MO</option>
                    <option value="ERRCORR">Error Correction</option>
                  </select>
                </div>
                <div className="filter-field entity-filter">
                  <label htmlFor="f-entity">Origin Entity</label>
                  <select id="f-entity" value={filters.entity} onChange={(e) => setFilter({ entity: e.target.value })}>
                    <option value="ALL">All entities</option>
                    {entityOptions.map((ent) => (
                      <option key={ent.code} value={ent.code}>
                        {ent.code} - {ent.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="filter-field">
                  <label htmlFor="f-region">Region</label>
                  <select id="f-region" value={filters.region} onChange={(e) => setFilter({ region: e.target.value })}>
                    <option value="ALL">All regions</option>
                    {REGIONS.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name ? `${r.id} - ${r.name}` : r.id}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="filter-field">
                  <label htmlFor="f-model">FX Model</label>
                  <select id="f-model" value={filters.model} onChange={(e) => setFilter({ model: e.target.value })}>
                    <option value="ALL">All models</option>
                    {modelOptions.map((m) => (
                      <option key={m.code} value={m.code}>
                        {m.code} - {m.desc}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="filter-field">
                  <label>MC Date</label>
                  <div className="date-range">
                    <DatePicker
                      id="f-date-from"
                      label="MC date from"
                      value={filters.dateFrom}
                      open={openPicker === 'from'}
                      onOpenChange={(o) => setOpenPicker(o ? 'from' : null)}
                      onPick={(v) => setFilter({ dateFrom: v })}
                    />
                    <span>to</span>
                    <DatePicker
                      id="f-date-to"
                      label="MC date to"
                      value={filters.dateTo}
                      open={openPicker === 'to'}
                      onOpenChange={(o) => setOpenPicker(o ? 'to' : null)}
                      onPick={(v) => setFilter({ dateTo: v })}
                    />
                  </div>
                </div>
                <div className="filter-reset-wrap">
                  <span className="filter-spacer-label">Action</span>
                  <button className="filter-reset" type="button" onClick={resetFilters}>
                    Reset
                  </button>
                </div>
              </div>
            </div>
            <span className="badge badge-blue" id="result-count-badge">
              {rows.length} contract{plural(rows.length)}
            </span>
          </div>

          <div className="table-wrap">
            <ContractsTable
              rows={paged.rows}
              sort={sort}
              checked={checked}
              draggingRow={draggingRow}
              onSort={onSort}
              onToggleRow={onToggleRow}
              onCheck={(mc, on) => setChecked((s) => toggleChecked(s, mc, on))}
              onCheckAll={(on) => setChecked((s) => setPageChecked(s, paged.rows, on))}
              onOpenChild={openChild}
              onOpenLinkedDeals={openLinkedDeals}
              canViewLinkedDeals={source === 'mysql'}
              onEdit={openEdit}
              onDragStart={onDragStart}
              onDragEnd={endDrag}
            />
          </div>
          <div className="pager" id="pager">
            <div className="pager-size">
              <span>Rows per page</span>
              <select
                id="pager-size"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(parseInt(e.target.value, 10) || 15)
                  setPage(1)
                }}
              >
                <option value={8}>8</option>
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>
            <div className="pager-controls" id="pager-controls">
              <button className="pager-btn" type="button" disabled={paged.page <= 1} onClick={() => setPage(1)}>
                «
              </button>
              <button className="pager-btn" type="button" disabled={paged.page <= 1} onClick={() => setPage(paged.page - 1)}>
                ‹
              </button>
              {pagerWindow(paged.page, paged.totalPages).map((p) => (
                <button key={p} className={`pager-btn ${p === paged.page ? 'active' : ''}`} type="button" onClick={() => setPage(p)}>
                  {p}
                </button>
              ))}
              <button className="pager-btn" type="button" disabled={paged.page >= paged.totalPages} onClick={() => setPage(paged.page + 1)}>
                ›
              </button>
              <button
                className="pager-btn"
                type="button"
                disabled={paged.page >= paged.totalPages}
                onClick={() => setPage(paged.totalPages)}
              >
                »
              </button>
            </div>
            <div className="pager-info" id="pager-info">
              {rows.length ? (
                <>
                  Showing{' '}
                  <strong>
                    {paged.first}-{paged.last}
                  </strong>{' '}
                  of <strong>{rows.length}</strong>
                </>
              ) : (
                'No records'
              )}
            </div>
          </div>
          <div className="note">
            <strong>Note:</strong> This queue only ever shows Master Contracts still awaiting MO action &mdash; <em>Release to MO</em>{' '}
            or <em>Error Correction</em>. Both are treated the same way: select one or more using the checkboxes, then use
            Confirm/Reject Selected above to act on all of them at once. Once a contract is Confirmed or Rejected it leaves this
            list entirely, which is also why <strong>Deal ID</strong> is always blank here - a Deal ID can only be assigned after
            Confirmation. Click any <strong>MC Number</strong> to open its child-contract breakdown; from there you can also
            confirm or reject a single contract. Click a column heading to sort.
          </div>
        </div>
      </main>

      <LinkedDealsModal open={linkedDealsModal.isOpen} onClose={linkedDealsModal.close} mcNumber={linkedDealsMc} />

      <div id="toast">{feedback.element}</div>

      <ActionDialog
        modal={actionModal}
        action={pendingAction}
        mcs={actionMcs}
        remark={remark}
        remarkError={remarkError}
        onRemarkChange={(v) => {
          setRemark(v)
          setRemarkError(false)
        }}
        onProceed={doAction}
      />

      <ChildContractModal modal={childModal} mc={childMc} onQuickAction={quickAction} />

      <EditContractModal
        modal={editModal}
        mc={editMc}
        values={editValues}
        onChange={(patch) => setEditValues((v) => ({ ...v, ...patch }))}
        onSave={saveEdit}
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

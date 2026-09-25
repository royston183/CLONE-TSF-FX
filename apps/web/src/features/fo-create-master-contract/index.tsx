import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { messageOf } from '../../shared/fx/master-contract.ts'
import { isAbort } from '../../shared/fx/mw.ts'
import type { MasterSource } from '../../shared/fx/masters.ts'
import { createContract, loadContracts, loadMasters, releaseContracts, saveChildren, updateContract } from './api.ts'
import { ChildContractsModal } from './ChildContractsModal.tsx'
import { ContractDetailModal } from './ContractDetailModal.tsx'
import { ContractFormModal } from './ContractFormModal.tsx'
import { ContractsTable } from './ContractsTable.tsx'
import {
  COMMODITIES,
  FIRST_CHILD_REFS,
  FIRST_NEW_MC_NUMBER,
  FX_MODELS,
  INITIAL_MC_DATE,
  ORIGIN_ENTITIES,
  STATUS_META,
} from './data.ts'
import { formatAmount, formatCompactUSD } from './format.ts'
import { KpiDetailModal, type KpiKind } from './KpiDetailModal.tsx'
import {
  blankForm,
  buildContract,
  ensureChildContracts,
  filterSortContracts,
  formFromContract,
  releaseToMO,
  sendMasterContractEmail,
  totalAmount,
  validateForm,
} from './logic.ts'
import { useModal } from './modal.tsx'
import { SuccessModal } from './SuccessModal.tsx'
import './fo-create-master-contract.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './fo-create-master-contract.dark.css'
import type {
  ChildStore,
  FieldErrors,
  FieldKey,
  Filters,
  FormMode,
  FormValues,
  MasterContract,
  Sort,
  SortField,
  Toast,
} from './types.ts'

const BRAND_LOGO =
  'https://raw.githubusercontent.com/ryannayak/fs-assets/e82f35a83e28689167b22b4300d4994a249acee0/fs-short-logo.png'
const NO_FILTERS: Filters = { status: '', entity: '', fxModel: '', commodity: '' }
const plural = (n: number) => (n === 1 ? '' : 's')

/**
 * FO: Create Master Contract (ZSGTSFP001), converted from legacy/create-master-contract.html.
 *
 * Contracts live in ZSGTSFTR_MAS_CON and their children in ZSGTSFTR_MCCHILD, both through the
 * SLC middleware (api.ts), and the MC number comes from the middleware's range. If the
 * middleware cannot be reached the screen runs on its dummy contracts as before and changes
 * stay on the screen. "Send to M.O." still logs its email instead of sending one.
 */
export default function FoCreateMasterContract() {
  const [contracts, setContracts] = useState<MasterContract[]>([])
  const [childStore, setChildStore] = useState<ChildStore>({ byMc: {}, nextRef: { ...FIRST_CHILD_REFS } })
  /** Where the contract list came from; 'dummy' means writes cannot reach MySQL. */
  const [source, setSource] = useState<MasterSource | 'loading'>('loading')
  const busy = useRef(false)
  // Dummy mode only: with the middleware down there is no range to draw a number from.
  const nextMcNumber = useRef(FIRST_NEW_MC_NUMBER)

  // Table
  const [sort, setSort] = useState<Sort>({ field: 'mcNumber', dir: 'desc' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [selectedRow, setSelectedRow] = useState<number | null>(null)
  const [checked, setChecked] = useState<Set<number>>(() => new Set())
  const [lastCreatedMc, setLastCreatedMc] = useState<number | null>(null)
  const [bannerMc, setBannerMc] = useState<number | null>(null)

  // Form
  const [formMode, setFormMode] = useState<FormMode>('create')
  const [formSourceMc, setFormSourceMc] = useState<number | null>(null)
  const [formValues, setFormValues] = useState<FormValues>(() => blankForm(INITIAL_MC_DATE))
  const [formErrors, setFormErrors] = useState<FieldErrors>({})
  const formResetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Popups
  const formModal = useModal()
  const successModal = useModal()
  const kpiModal = useModal()
  const detailModal = useModal()
  const childModal = useModal()
  const [kpiKind, setKpiKind] = useState<KpiKind | null>(null)
  const [detailMc, setDetailMc] = useState<number | null>(null)
  const [childMc, setChildMc] = useState<number | null>(null)

  // Toast
  const [toast, setToast] = useState<Toast | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const showToast = useCallback((message: string, error: boolean) => {
    clearTimeout(toastTimer.current)
    setToast({ message, error, id: Date.now() })
    toastTimer.current = setTimeout(() => setToast(null), 3200)
  }, [])

  // Drag and drop
  const rootRef = useRef<HTMLDivElement>(null)
  const dragged = useRef<MasterContract | null>(null)
  const [dragOver, setDragOver] = useState<'copy' | 'send' | null>(null)

  useEffect(
    () => () => {
      clearTimeout(toastTimer.current)
      clearTimeout(formResetTimer.current)
    },
    [],
  )

  const reload = useCallback(async (signal?: AbortSignal) => {
    const loaded = await loadContracts(signal)
    setContracts(loaded.contracts)
    setChildStore(loaded.children)
    setSource(loaded.source)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    loadMasters(controller.signal)
      .then(() => reload(controller.signal))
      .catch((error: unknown) => {
        if (!isAbort(error)) showToast(`Could not load Master Contracts: ${messageOf(error)}`, true)
      })
    return () => controller.abort()
  }, [reload, showToast])

  const findContract = (mc: number | null) => (mc === null ? undefined : contracts.find((c) => c.mcNumber === mc))

  // ------------------------------------------------------------------ form flow

  const resetForm = useCallback(() => {
    clearTimeout(formResetTimer.current)
    setFormValues(blankForm())
    setFormErrors({})
    setFormMode('create')
    setFormSourceMc(null)
  }, [])

  const closeForm = useCallback(() => {
    formModal.close()
    // Leaving Edit or Copy returns the form to a blank Create once it has animated out; a
    // half-filled Create is kept for next time.
    if (formMode !== 'create') formResetTimer.current = setTimeout(resetForm, 170)
  }, [formModal, formMode, resetForm])

  const openCreate = () => {
    if (formMode !== 'create') resetForm()
    formModal.open()
  }

  const openPrefilled = (c: MasterContract, mode: 'edit' | 'copy') => {
    detailModal.hide()
    clearTimeout(formResetTimer.current)
    setFormValues(formFromContract(c))
    setFormErrors({})
    setFormMode(mode)
    setFormSourceMc(c.mcNumber)
    formModal.open()
  }

  const openCopy = (c: MasterContract) => openPrefilled(c, 'copy')

  const openEdit = (c: MasterContract) => {
    if (c.linkedDealId) {
      showToast(`Master Contract ${c.mcNumber} cannot be edited because Deal ID ${c.linkedDealId} is already linked.`, true)
      return
    }
    openPrefilled(c, 'edit')
  }

  const save = async () => {
    if (busy.current) return
    const { valid, errors } = validateForm(formValues)
    setFormErrors(errors)
    if (!valid) {
      showToast('Please fix the highlighted fields before saving.', true)
      return
    }

    if (formMode === 'edit') {
      const existing = findContract(formSourceMc)
      if (!existing) {
        showToast('The selected Master Contract could not be found.', true)
        return
      }
      if (existing.linkedDealId) {
        showToast(`Master Contract ${existing.mcNumber} cannot be edited because Deal ID ${existing.linkedDealId} is already linked.`, true)
        return
      }
      const updated = buildContract(formValues, existing.mcNumber, existing)
      if (source === 'mysql') {
        busy.current = true
        try {
          await updateContract(updated)
        } catch (error) {
          showToast(`Master Contract ${existing.mcNumber} was not updated: ${messageOf(error)}`, true)
          return
        } finally {
          busy.current = false
        }
      }
      setContracts((list) => list.map((c) => (c.mcNumber === existing.mcNumber ? { ...c, ...updated } : c)))
      formModal.hide()
      showToast(`Master Contract ${existing.mcNumber} updated successfully.`, false)
      setLastCreatedMc(null)
      resetForm()
      return
    }

    let mcNumber: number
    if (source === 'mysql') {
      // The middleware draws the number from ZSGTSFTR_MAS_CON's range; nothing is picked here.
      busy.current = true
      try {
        mcNumber = await createContract(buildContract(formValues, 0, null))
      } catch (error) {
        busy.current = false
        showToast(`The Master Contract was not created: ${messageOf(error)}`, true)
        return
      }
    } else {
      mcNumber = nextMcNumber.current++
    }
    const contract = buildContract(formValues, mcNumber, null)
    const { store, children } = ensureChildContracts(childStore, contract)
    if (source === 'mysql') {
      try {
        await saveChildren(children, contract)
      } catch (error) {
        showToast(`Master Contract ${mcNumber} was created, but its child contracts were not saved: ${messageOf(error)}`, true)
      } finally {
        busy.current = false
      }
    }
    setContracts((list) => [contract, ...list])
    setChildStore(store)
    setLastCreatedMc(mcNumber)
    formModal.hide()
    successModal.open()
  }

  const finishCreation = () => {
    successModal.hide()
    setBannerMc(lastCreatedMc)
    setPage(1)
    resetForm()
  }

  // ------------------------------------------------------------------ send to M.O.

  /** The one entry point for every Send to M.O. button: email each, then release. */
  const sendToMO = async (list: MasterContract[]) => {
    if (list.length === 0) return
    if (source === 'mysql') {
      try {
        await releaseContracts(list)
      } catch (error) {
        showToast(messageOf(error), true)
        // Whatever did move is re-read, so the table never shows a status MySQL lacks.
        await reload().catch(() => undefined)
        return
      }
    }
    for (const c of list) sendMasterContractEmail(c)
    const released = new Set(list.map((c) => c.mcNumber))
    setContracts((all) => all.map((c) => (released.has(c.mcNumber) ? releaseToMO(c) : c)))
    const [first] = list
    showToast(
      list.length === 1 && first
        ? `Master Contract ${first.mcNumber} sent to M.O. successfully.`
        : `${list.length} Master Contracts sent to M.O. successfully.`,
      false,
    )
  }

  // ------------------------------------------------------------------ popups

  const openKpi = (kind: KpiKind) => {
    setKpiKind(kind)
    kpiModal.open()
  }

  const openDetail = (c: MasterContract) => {
    setDetailMc(c.mcNumber)
    detailModal.open()
  }

  const openChildren = (c: MasterContract) => {
    setChildStore((store) => ensureChildContracts(store, c).store)
    setChildMc(c.mcNumber)
    detailModal.hide()
    childModal.open()
  }

  const escapeRef = useRef<() => void>(() => {})
  escapeRef.current = () => {
    kpiModal.close()
    detailModal.close()
    childModal.close()
    if (formModal.state === 'open') closeForm()
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') escapeRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // ------------------------------------------------------------------ table

  const filtered = useMemo(() => filterSortContracts(contracts, search, filters, sort), [contracts, search, filters, sort])
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const setFilter = (key: keyof Filters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }))
    setPage(1)
  }

  const onSort = (field: SortField) =>
    setSort((s) => (s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' }))

  const onRowClick = (c: MasterContract) => {
    const next = selectedRow === c.mcNumber ? null : c.mcNumber
    setSelectedRow(next)
    // A row click also drives the checkboxes; ticking a box directly still multi-selects.
    setChecked(next === null ? new Set() : new Set([next]))
  }

  const onCheck = (c: MasterContract, isChecked: boolean) =>
    setChecked((s) => {
      const next = new Set(s)
      if (isChecked) next.add(c.mcNumber)
      else next.delete(c.mcNumber)
      return next
    })

  /** Copy works on exactly one contract: the one ticked box, or the selected row. */
  const copyCandidate = (() => {
    if (checked.size === 1) return findContract([...checked][0] ?? null)
    if (checked.size === 0 && selectedRow !== null) return findContract(selectedRow)
    return undefined
  })()

  const onCopySelected = () => {
    if (!copyCandidate) {
      showToast('Select one Master Contract to copy.', true)
      return
    }
    openCopy(copyCandidate)
  }

  const onSendBulk = () => {
    if (checked.size === 0) return
    sendToMO(contracts.filter((c) => checked.has(c.mcNumber)))
    setChecked(new Set())
  }

  const onDragStart = (e: DragEvent<HTMLTableRowElement>, c: MasterContract) => {
    dragged.current = c
    e.currentTarget.classList.add('dragging')
    // The ghost has to live inside .fomc for the scoped stylesheet to reach it.
    const ghost = document.createElement('div')
    ghost.className = 'drag-ghost'
    ghost.textContent = `${c.mcNumber} — ${c.originEntity}`
    ;(rootRef.current ?? document.body).appendChild(ghost)
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData('text/plain', String(c.mcNumber))
    e.dataTransfer.setDragImage(ghost, 12, 14)
    setTimeout(() => ghost.remove(), 0)
  }

  const onDragEnd = (e: DragEvent<HTMLTableRowElement>) => {
    dragged.current = null
    e.currentTarget.classList.remove('dragging')
    setDragOver(null)
  }

  const dropTarget = (target: 'copy' | 'send', onDrop: (c: MasterContract) => void) => ({
    onDragOver: (e: DragEvent<HTMLButtonElement>) => {
      if (!dragged.current) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setDragOver(target)
    },
    onDragLeave: () => setDragOver(null),
    onDrop: (e: DragEvent<HTMLButtonElement>) => {
      e.preventDefault()
      setDragOver(null)
      if (dragged.current) onDrop(dragged.current)
    },
  })

  // ------------------------------------------------------------------ KPIs

  // Per render: FX_MODELS is swapped for ZSGTSFTR_RULE_BT's rows once they load.
  const fxFilterOptions = FX_MODELS.filter((m, i) => FX_MODELS.findIndex((x) => x.code === m.code) === i)
  const inUse = contracts.filter((c) => c.status === 'In Use').length
  const confirmed = contracts.filter((c) => c.status === 'Confirmed').length
  const total = totalAmount(contracts)

  const detailContract = findContract(detailMc)
  const childParent = findContract(childMc)

  return (
    <div className="fomc" ref={rootRef}>
      <div className="app">
        <div className="page-header">
          <BackButton className="btn btn-secondary" />
          <img className="logo-img" src={BRAND_LOGO} alt="Fourth Signal" />
          <div className="header-text">
            <h1>Create Master Contract</h1>
            <p>Create and manage commodity master contracts</p>
          </div>
          <button className="btn btn-primary" type="button" style={{ marginLeft: 'auto' }} onClick={openCreate}>
            + Create Master Contract
          </button>
          <SignOutButton className="btn btn-secondary" />
        </div>

        <div className="kpi-row">
          <div
            className="kpi-card"
            title={`${contracts.length} contract${plural(contracts.length)} currently available — double-click for details`}
            onDoubleClick={() => openKpi({ type: 'total' })}
          >
            <div className="kpi-value">{contracts.length}</div>
            <div className="kpi-label">Total Master Contracts</div>
            <div className="kpi-description">All available master contracts</div>
          </div>
          <div
            className="kpi-card"
            title={`${inUse} contract${plural(inUse)} currently in use — double-click for details`}
            onDoubleClick={() => openKpi({ type: 'status', status: 'In Use' })}
          >
            <div className="kpi-value">{inUse}</div>
            <div className="kpi-label">In Use</div>
            <div className="kpi-description">Contracts currently being utilized</div>
          </div>
          <div
            className="kpi-card"
            title={`${confirmed} confirmed contract${plural(confirmed)} — double-click for details`}
            onDoubleClick={() => openKpi({ type: 'status', status: 'Confirmed' })}
          >
            <div className="kpi-value">{confirmed}</div>
            <div className="kpi-label">Confirmed</div>
            <div className="kpi-description">Approved and confirmed contracts</div>
          </div>
          <div
            className="kpi-card"
            title={`Total USD value across all master contracts (${formatAmount(total)}) — double-click for details`}
            onDoubleClick={() => openKpi({ type: 'amount' })}
          >
            <div className="kpi-value">{formatCompactUSD(total)}</div>
            <div className="kpi-label">Total MC Amount (USD)</div>
            <div className="kpi-description">Combined USD value of all contracts</div>
          </div>
        </div>

        <div className={`success-banner${bannerMc !== null ? ' show' : ''}`}>
          <span>✓</span>
          <span>
            Master Contract <b>{bannerMc}</b> created successfully.
          </span>
          <span className="spacer" />
          <button className="btn btn-secondary btn-sm" type="button" onClick={() => setBannerMc(null)}>
            Dismiss
          </button>
        </div>

        <div className="table-col">
          <div className="card">
            <div className="section-title">
              <span className="dot" />
              Master Contracts
              <SourceNote source={source} />
            </div>

            <div className="table-toolbar">
              <div className="search-box">
                <span className="icon">🔍</span>
                <input
                  placeholder="Search MC number, entity, commodity, reference..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setPage(1)
                  }}
                />
              </div>
              <FilterSelect
                title="Status"
                all="All statuses"
                value={filters.status}
                options={Object.keys(STATUS_META).map((s) => [s, s])}
                onChange={(v) => setFilter('status', v)}
              />
              <FilterSelect
                title="Origin Entity"
                all="All entities"
                value={filters.entity}
                options={ORIGIN_ENTITIES.map((e) => [e.code, `${e.code} - ${e.name}`])}
                onChange={(v) => setFilter('entity', v)}
              />
              <FilterSelect
                title="FX Model"
                all="All models"
                value={filters.fxModel}
                options={fxFilterOptions.map((m) => [m.code, `${m.code} - ${m.desc}`])}
                onChange={(v) => setFilter('fxModel', v)}
              />
              <FilterSelect
                title="Commodity"
                all="All commodities"
                value={filters.commodity}
                options={COMMODITIES.map((c) => [c.code, `${c.code} - ${c.name}`])}
                onChange={(v) => setFilter('commodity', v)}
              />
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => setFilters(NO_FILTERS)}>
                Reset
              </button>
              <button
                className={`btn btn-secondary btn-sm${dragOver === 'copy' ? ' drag-over' : ''}`}
                type="button"
                disabled={!copyCandidate}
                onClick={onCopySelected}
                {...dropTarget('copy', openCopy)}
              >
                Copy
              </button>
              <button
                className={`btn btn-danger btn-sm${dragOver === 'send' ? ' drag-over' : ''}`}
                type="button"
                disabled={checked.size === 0}
                onClick={onSendBulk}
                {...dropTarget('send', (c) => sendToMO([c]))}
              >
                Send to M.O.
              </button>
              <div className="toolbar-spacer" />
              <span className="result-count">
                {filtered.length} {filtered.length === 1 ? 'contract' : 'contracts'}
              </span>
            </div>

            <div className="table-scroll">
              {filtered.length > 0 ? (
                <ContractsTable
                  rows={pageRows}
                  sort={sort}
                  selectedRow={selectedRow}
                  checked={checked}
                  flashMcNumber={lastCreatedMc}
                  onSort={onSort}
                  onRowClick={onRowClick}
                  onOpen={openDetail}
                  onCheck={onCheck}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                />
              ) : null}
            </div>
            {filtered.length === 0 ? (
              <div className="empty-state">
                <div className="big">📄</div>
                No master contracts match your search or filters.
              </div>
            ) : null}

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
                  <option value={12}>12</option>
                  <option value={20}>20</option>
                </select>
              </div>
              <div className="pagination">
                <button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
                  ‹
                </button>
                {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
                  <button key={p} type="button" className={p === currentPage ? 'active' : undefined} onClick={() => setPage(p)}>
                    {p}
                  </button>
                ))}
                <button type="button" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>
                  ›
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ContractFormModal
        modal={formModal}
        mode={formMode}
        sourceMcNumber={formSourceMc}
        values={formValues}
        errors={formErrors}
        onChange={(patch) => setFormValues((v) => ({ ...v, ...patch }))}
        onClearError={(key: FieldKey) => setFormErrors((e) => (e[key] ? { ...e, [key]: false } : e))}
        onClose={closeForm}
        onCancel={() => {
          resetForm()
          formModal.close()
        }}
        onSave={save}
      />

      <SuccessModal
        modal={successModal}
        mcNumber={lastCreatedMc}
        onDone={finishCreation}
        onSendToMO={() => {
          const created = findContract(lastCreatedMc)
          if (created) sendToMO([created])
          finishCreation()
        }}
      />

      <KpiDetailModal modal={kpiModal} kind={kpiKind} contracts={contracts} />

      <ContractDetailModal
        modal={detailModal}
        contract={detailContract}
        childCount={detailContract ? (childStore.byMc[String(detailContract.mcNumber)]?.length ?? 0) : 0}
        onChildren={openChildren}
        onCopy={openCopy}
        onEdit={openEdit}
        onSendToMO={(c) => sendToMO([c])}
      />

      <ChildContractsModal
        modal={childModal}
        parent={childParent}
        items={childParent ? (childStore.byMc[String(childParent.mcNumber)] ?? []) : []}
      />

      <div className={`toast${toast ? ' show' : ''}${toast?.error ? ' error' : ''}`}>{toast?.message}</div>
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

import { useEffect, useRef, useState, type DragEvent } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { FS_SHORT_LOGO } from '../../shared/fx/logo.ts'
import { isAbort } from '../../shared/fx/mw.ts'
import { useStatusPopup } from '../../shared/popup/Popup.tsx'
import type { DealRow } from '../../shared/fx/master-contract.ts'
import { cancelDealRow, changeMc, loadScreen, type Loaded } from './api.ts'
import { CANCELLED_STATUS, PREMIUMS } from './data.ts'
import { recordCount } from './format.ts'
import {
  CalculatorIcon,
  CalendarPlaceholderIcon,
  CancelCircleIcon,
  CheckIcon,
  DollarIcon,
  EditIcon,
  PlusBoxIcon,
  RefreshIcon,
  SearchIcon,
} from './icons.tsx'
import {
  CANCEL_CONFIRM_MSG,
  MC_CHANGE_BLOCKED_MSG,
  MC_STATUS_UNKNOWN_MSG,
  cancelDeal,
  hasUnverifiedLegs,
  isDealOpen,
  isMcChangeBlocked,
  loadDeal,
  mcChangeError,
  premiumFields,
  recalculateInvoices,
  searchDeals,
  setExRate,
  showsInvoicePl,
  statusMeta,
  summaryFields,
  traderLabel,
  txnFields,
  updateDealPair,
  updateMcRef,
  validateNewRfha,
} from './logic.ts'
import { useModal } from './modal.tsx'
import {
  CancelDealModal,
  ChangeModal,
  ConfirmModal,
  EditPairModal,
  McPickerModal,
  PremiumModal,
  TxnModal,
  type ChangeHint,
} from './Modals.tsx'
import { DealPickerModal, ViewDealsButton } from '../../shared/ui/DealPickerModal.tsx'
import { DealTable, InvoiceTable, PlTable, StatusPill } from './Tables.tsx'
import './fo-change-deal-id.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './fo-change-deal-id.dark.css'
import type { Deal, DealStore, MasterContract, PickedMc, PlTable as PlTableData, Toast } from './types.ts'

let toastSeq = 0

/**
 * ZSGTSFP013: FO: Change Deal ID, converted from legacy/FO_Change_Deal_ID.html.
 *
 * The Deal IDs, their Master Contracts, the MC picker (status 03 / 04), the linked FX
 * transactions and the invoice plan come from MySQL through the SLC middleware (api.ts).
 * Change MC Ref No writes ZSGTSFTR_DEALID-ZMC_REF and Cancel Deal ID writes status 30; both
 * stop at MySQL, because the program's stamp on the Treasury transactions is an SAP call.
 * Edit Deal Pair is not saved at all (it is that same SAP write), invoice exchange-rate edits
 * and Calculate only touch the loaded copy as in the original, and the Premium and planned
 * P&L cards have no source yet and stay empty. There is no seed data: when the Deal IDs
 * cannot be read the screen says so.
 */
export default function FoChangeDealId() {
  const [store, setStore] = useState<DealStore>({})
  const [contracts, setContracts] = useState<MasterContract[]>([])
  /** The DEALID rows behind the store: Change and Cancel write against their keys. */
  const dealRows = useRef<ReadonlyMap<string, DealRow>>(new Map())
  const [source, setSource] = useState<'loading' | 'sap' | 'unavailable'>('loading')
  const busy = useRef(false)
  const [deal, setDeal] = useState<Deal | null>(null)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  // The page ran onDealSearchInput('') on load, so the suggestions start open.
  const [typeaheadOpen, setTypeaheadOpen] = useState(true)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [invGeneration, setInvGeneration] = useState(0)
  const [toasts, setToasts] = useState<Toast[]>([])

  const [draggingIdx, setDraggingIdx] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const dragging = useRef(false)
  const ghostRef = useRef<HTMLDivElement>(null)
  const searchWrap = useRef<HTMLDivElement>(null)

  const [txnIdx, setTxnIdx] = useState(0)

  const [changeEditing, setChangeEditing] = useState(false)
  const [changeHint, setChangeHint] = useState<ChangeHint>('initial')
  const [mcInput, setMcInput] = useState('')
  // Like the page's input dataset, the last pick is kept until another is made.
  const [pickedMc, setPickedMc] = useState<PickedMc | null>(null)
  const [changeError, setChangeError] = useState<string | null>(null)

  const [editPairIdx, setEditPairIdx] = useState<number | null>(null)
  const [editPairEditing, setEditPairEditing] = useState(false)
  const [newRfha, setNewRfha] = useState('')
  const [editPairError, setEditPairError] = useState<string | null>(null)

  const [confirmTitle, setConfirmTitle] = useState('Confirm')
  const [confirmMsg, setConfirmMsg] = useState('')
  const onConfirmYes = useRef<(() => void) | null>(null)

  const txnModal = useModal()
  const changeModal = useModal()
  const mcPickerModal = useModal()
  const premiumModal = useModal()
  const editPairModal = useModal()
  const cancelDealModal = useModal()
  const confirmModal = useModal()
  /** The outcome popup of the MySQL writes (Change MC Ref No, Cancel Deal ID). */
  const status = useStatusPopup()

  const toastTimers = useRef(new Set<ReturnType<typeof setTimeout>>())
  useEffect(() => {
    const timers = toastTimers.current
    return () => timers.forEach(clearTimeout)
  }, [])

  const toast = (message: string, isErr = false) => {
    const id = ++toastSeq
    setToasts((t) => [...t, { id, message, isErr }])
    const timer = setTimeout(() => {
      toastTimers.current.delete(timer)
      setToasts((t) => t.filter((x) => x.id !== id))
    }, 3200)
    toastTimers.current.add(timer)
  }

  // Clicking anywhere outside the search box hides the suggestions.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const wrap = searchWrap.current
      if (wrap && !wrap.contains(e.target as Node)) setTypeaheadOpen(false)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  // ------------------------------------------------------------------ deal loading

  /** Reads MySQL; resolves to the loaded result so a caller can re-open its deal from it. */
  const reload = async (signal?: AbortSignal): Promise<Loaded> => {
    const loaded = await loadScreen(signal)
    dealRows.current = loaded.rows
    setStore(loaded.store)
    setContracts(loaded.contracts)
    setSource(loaded.source)
    return loaded
  }

  useEffect(() => {
    const ctrl = new AbortController()
    reload(ctrl.signal).catch((error: unknown) => {
      if (!isAbort(error)) console.error('[fx] Change Deal ID failed to load', error)
    })
    return () => ctrl.abort()
  }, [])

  const openDealFrom = (from: DealStore, dealId: string) => {
    const d = loadDeal(from, dealId)
    if (!d) {
      toast('Deal ID not found.', true)
      return
    }
    setDeal(d)
    setSelectedIdx(null)
    setInvGeneration((g) => g + 1)
  }

  const openDeal = (dealId: string) => openDealFrom(store, dealId)

  const onSearchInput = (term: string) => {
    setSearch(term)
    setTypeaheadOpen(true)
  }

  const pickDeal = (dealId: string) => {
    setSearch(dealId)
    setTypeaheadOpen(false)
    openDeal(dealId)
  }

  const goToSelection = () => {
    setDeal(null)
    setSelectedIdx(null)
    setSearch('')
  }

  const refresh = async () => {
    const dealId = deal?.dealId
    const loaded = await reload().catch(() => undefined)
    if (!loaded) {
      toast('Could not reload from MySQL.', true)
      return
    }
    if (!dealId) {
      toast('Screen refreshed.')
      return
    }
    openDealFrom(loaded.store, dealId)
    toast('Workbench data refreshed.')
  }

  const selectTopRow = (idx: number) => setSelectedIdx((s) => (s === idx ? null : idx))

  // ------------------------------------------------------------------ drag and drop

  const startTopRowDrag = (e: DragEvent<HTMLTableRowElement>, idx: number) => {
    const row = deal?.top[idx]
    if (!row) return
    dragging.current = true
    setDraggingIdx(idx)
    e.dataTransfer.effectAllowed = 'copy'
    try {
      e.dataTransfer.setData('text/plain', String(row.rfha))
    } catch {
      // Some browsers refuse custom data here; the drop does not need it.
    }
    if (ghostRef.current) e.dataTransfer.setDragImage(ghostRef.current, 12, 14)
  }

  const endTopRowDrag = () => {
    dragging.current = false
    setDraggingIdx(null)
    setDragOver(false)
  }

  // ------------------------------------------------------------------ Transaction details

  const openTxnModal = (idx: number) => {
    setTxnIdx(idx)
    txnModal.open()
  }

  // ------------------------------------------------------------------ Change (Screen 9001)

  const openChangeModal = () => {
    if (!deal) return
    setChangeEditing(false)
    setMcInput(`${deal.mcRef} – ${deal.mcDesc}`)
    setChangeError(null)
    changeModal.open()
  }

  const toggleChangeEdit = () => {
    const next = !changeEditing
    setChangeEditing(next)
    setChangeHint(next ? 'editing' : 'idle')
  }

  const openMcPicker = () => {
    if (!changeEditing) return
    mcPickerModal.open()
  }

  const pickMc = (mc: MasterContract) => {
    setMcInput(`${mc.ref} – ${mc.desc}`)
    setPickedMc({ ref: mc.ref, desc: mc.desc })
    mcPickerModal.close()
  }

  const confirmChange = async () => {
    if (!deal || busy.current) return
    // A leg whose status the source cannot give cannot be shown to be matched.
    if (hasUnverifiedLegs(deal)) {
      setChangeError(MC_STATUS_UNKNOWN_MSG)
      return
    }
    if (isMcChangeBlocked(deal)) {
      setChangeError(MC_CHANGE_BLOCKED_MSG)
      return
    }
    if (!pickedMc) {
      changeModal.close()
      return
    }
    const picked = contracts.find((c) => c.ref === pickedMc.ref)
    const mismatch = picked ? mcChangeError(deal, picked) : null
    if (mismatch) {
      setChangeError(mismatch)
      return
    }
    const row = dealRows.current.get(deal.dealId)
    if (source === 'sap' && row) {
      busy.current = true
      try {
        await changeMc(row, pickedMc.ref)
      } catch (error) {
        setChangeError(error instanceof Error ? error.message : String(error))
        return
      } finally {
        busy.current = false
      }
    }
    setStore((s) => updateMcRef(s, deal.dealId, pickedMc.ref, pickedMc.desc))
    setDeal({ ...deal, mcRef: pickedMc.ref, mcDesc: pickedMc.desc })
    changeModal.close()
    // The new MC's dates and strings come from MySQL.
    if (source === 'sap') {
      const loaded = await reload().catch(() => undefined)
      if (loaded) openDealFrom(loaded.store, deal.dealId)
    }
    status.show({
      tone: 'success',
      title: 'MC Ref No Changed',
      message: 'MC Ref No saved in ZSGTSFTR_DEALID. The Treasury transactions are not re-stamped (SAP).',
      refLabel: 'MC Ref No',
      refValue: pickedMc.ref,
    })
  }

  // ------------------------------------------------------------------ Edit Deal Pair (Screen 9004)

  /** The one entry point for both the button click and a row dropped on it. */
  const openEditPairModal = () => {
    if (selectedIdx === null) return
    setEditPairIdx(selectedIdx)
    setEditPairEditing(false)
    setNewRfha('')
    setEditPairError(null)
    editPairModal.open()
  }

  const dealUpdate = () => {
    if (!deal || editPairIdx === null) return
    const v = validateNewRfha(newRfha)
    if (!v.ok) {
      setEditPairError(v.error)
      return
    }
    const idx = editPairIdx
    setStore((s) => updateDealPair(s, deal.dealId, idx, v.value))
    setDeal({ ...deal, top: deal.top.map((r, i) => (i === idx ? { ...r, rfha: v.value } : r)) })
    editPairModal.close()
    toast('Deal pair changed on this screen only — it is not saved (needs the SAP transaction change).')
  }

  // ------------------------------------------------------------------ Cancel Deal ID (Screen 9005)

  const showConfirm = (title: string, msg: string, onYes: () => void) => {
    setConfirmTitle(title)
    setConfirmMsg(msg)
    onConfirmYes.current = onYes
    confirmModal.open()
  }

  const requestCancelDeal = () => {
    if (!deal) return
    const dealId = deal.dealId
    cancelDealModal.close()
    showConfirm('Cancel Deal ID', CANCEL_CONFIRM_MSG, async () => {
      if (busy.current) return
      const row = dealRows.current.get(dealId)
      if (source === 'sap' && row) {
        busy.current = true
        try {
          await cancelDealRow(row)
        } catch (error) {
          status.show({
            tone: 'error',
            title: 'Deal ID Not Cancelled',
            message: error instanceof Error ? error.message : String(error),
          })
          return
        } finally {
          busy.current = false
        }
      }
      setStore((s) => cancelDeal(s, dealId))
      setDeal((d) => (d ? { ...d, status: CANCELLED_STATUS } : d))
      status.show({
        tone: 'success',
        title: 'Deal ID Cancelled',
        message: `Deal ID ${dealId} cancelled (ZSGTSFTR_DEALID). The Treasury transactions are not released in SAP.`,
        refLabel: 'Deal ID',
        refValue: dealId,
      })
    })
  }

  // ------------------------------------------------------------------ invoice plan

  const onExRateChange = (idx: number, value: string) => {
    setDeal((d) => (d ? { ...d, inv: setExRate(d.inv, idx, value) } : d))
  }

  const calculateInvoicePlan = () => {
    if (!deal) return
    setDeal({ ...deal, inv: recalculateInvoices(deal.inv) })
    setInvGeneration((g) => g + 1)
    toast('Invoice plan recalculated.')
  }

  // ------------------------------------------------------------------ render

  const results = searchDeals(store, search)
  const isOpen = deal ? isDealOpen(deal) : false
  const hasSelection = selectedIdx !== null
  const editPairDisabled = !(isOpen && hasSelection)
  const selectedRow = deal && selectedIdx !== null ? deal.top[selectedIdx] : undefined
  const txnRow = deal?.top[txnIdx]
  const editPairRow = deal && editPairIdx !== null ? deal.top[editPairIdx] : undefined

  return (
    <div className="fo-change-deal-id">
      <div className="app">
        {/* HEADER */}
        <div className="header">
          <div className="titleblock">
            {/* Inside a loaded deal, Back is the original's App.goToSelection: it returns to the Deal ID search. */}
            <BackButton className="fx-back-btn" onClick={deal ? goToSelection : undefined} />
            <img className="logo-mark" alt="FS logo" src={FS_SHORT_LOGO} />
            <div className="header-text">
              <h1>FO: Change Deal ID</h1>
            </div>
          </div>
          <div className="header-actions">
            <button type="button" className="btn btn-icon" title="Refresh" onClick={refresh}>
              <RefreshIcon />
            </button>
            <SignOutButton className="btn" />
          </div>
        </div>

        {/* DEAL ID SELECTION BAR */}
        <div className="card">
          <div className="card-body">
            <div className="selectbar">
              <div className="search-input-wrap" ref={searchWrap}>
                <SearchIcon />
                <input
                  type="text"
                  placeholder="Enter Deal ID..."
                  autoComplete="off"
                  value={search}
                  onChange={(e) => onSearchInput(e.target.value)}
                  onFocus={(e) => onSearchInput(e.target.value)}
                />
                <div className={`typeahead${typeaheadOpen ? '' : ' hidden'}`}>
                  {results.length === 0 ? (
                    <div className="typeahead-empty">No matching Deal ID found</div>
                  ) : (
                    results.map((d) => (
                      <div key={d.dealId} className="typeahead-item" onClick={() => pickDeal(d.dealId)}>
                        <div className="ti-id">{d.dealId}</div>
                        <div className="ti-meta">
                          {d.entStr} · {d.modId} · Trader {d.trdDesc} · <StatusPill code={d.status} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <ViewDealsButton onClick={() => setPickerOpen(true)} />
              {pickerOpen ? (
                <DealPickerModal
                  columns={['Deal ID', 'FX Model', 'Entity String', 'Status']}
                  rows={Object.values(store).map((d) => ({
                    dealId: d.dealId,
                    cells: [d.dealId, [d.modId, d.modDesc].filter(Boolean).join(' - '), d.entStr, `${d.status} - ${statusMeta(d.status).label}`],
                    text: [d.dealId, d.dealRef, d.entStr, d.modId, d.modDesc, d.status, statusMeta(d.status).label].join(' '),
                  }))}
                  emptyText={source === 'sap' || source === 'loading' ? 'No matching Deal IDs found.' : 'ZSGTSFTR_DEALID could not be read — no Deal IDs to show.'}
                  onClose={() => setPickerOpen(false)}
                  onPick={(id) => {
                    setPickerOpen(false)
                    pickDeal(id)
                  }}
                />
              ) : null}
              <span className="sub" style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                Search by Deal ID, entity string or trader to open the Deal ID analysis workbench.{' '}
                {source === 'loading'
                  ? 'Loading from MySQL…'
                  : source === 'sap'
                    ? 'ZSGTSFTR_DEALID · MySQL'
                    : 'ZSGTSFTR_DEALID could not be read — no Deal IDs to show.'}
              </span>
            </div>
          </div>
        </div>

        {!deal ? (
          /* PLACEHOLDER (no deal selected) */
          <div className="card">
            <div className="placeholder">
              <CalendarPlaceholderIcon />
              <div className="ph-title">No Deal ID selected</div>
              <div className="ph-sub">Search for a Deal ID above to view its FX deals, invoice plan and planned P&amp;L.</div>
            </div>
          </div>
        ) : (
          /* DEAL WORKBENCH */
          <div>
            {/* Deal ID summary */}
            <div className="card">
              <div className="card-head">
                <div className="htitle">
                  <h2>Deal ID {deal.dealId}</h2>
                  <span className="count">{deal.dealRef}</span>
                </div>
                <span>
                  <StatusPill code={deal.status} />
                </span>
              </div>
              <div className="card-body">
                <div className="field-grid">
                  {summaryFields(deal).map(([label, value]) => (
                    <div className="field" key={label}>
                      <label>{label}</label>
                      <div className="value">{value}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="toolbar">
                <button type="button" className="btn" disabled={!isOpen} onClick={openChangeModal}>
                  <EditIcon />
                  Change
                </button>
                <span className="tip-wrap" data-tip={hasSelection ? undefined : 'Select an FX Deal row first'}>
                  <button
                    type="button"
                    className={`btn${dragOver ? ' drag-over' : ''}`}
                    disabled={editPairDisabled}
                    onClick={openEditPairModal}
                    onDragOver={(e) => {
                      if (!dragging.current || editPairDisabled) return
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'copy'
                      setDragOver(true)
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault()
                      setDragOver(false)
                      // Same function the button's own click handler calls — no separate drag-only logic.
                      if (dragging.current && !editPairDisabled) openEditPairModal()
                    }}
                  >
                    <PlusBoxIcon />
                    Edit Deal Pair
                  </button>
                </span>
                <button type="button" className="btn" onClick={premiumModal.open}>
                  <DollarIcon />
                  Premium Adjustment
                </button>
                <span className="spacer" />
                <button type="button" className="btn btn-danger" disabled={!isOpen} onClick={cancelDealModal.open}>
                  <CancelCircleIcon />
                  Cancel Deal ID
                </button>
              </div>
            </div>

            {/* FX Deals table */}
            <div className="card">
              <div className="card-head">
                <div className="htitle">
                  <h2>FX Deals</h2>
                  <span className="count">{recordCount(deal.top.length)}</span>
                </div>
                <span className="sub" style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                  Select a row, then use <b>Edit Deal Pair</b> to reassign the underlying transaction
                </span>
              </div>
              <div className="table-scroll">
                <DealTable
                  rows={deal.top}
                  selectedIndex={selectedIdx}
                  draggingIndex={draggingIdx}
                  onSelect={selectTopRow}
                  onOpenTxn={openTxnModal}
                  onDragStart={startTopRowDrag}
                  onDragEnd={endTopRowDrag}
                />
              </div>
            </div>

            {showsInvoicePl(deal) ? (
              <>
                {/* Invoice Plan table */}
                <div className="card">
                  <div className="card-head">
                    <div className="htitle">
                      <h2>Deal ID: Planned Trade Invoices</h2>
                      <span className="count">{recordCount(deal.inv.length)}</span>
                    </div>
                    <button type="button" className="btn btn-sm" onClick={calculateInvoicePlan}>
                      <CalculatorIcon />
                      Calculate
                    </button>
                  </div>
                  <div className="table-scroll">
                    <InvoiceTable lines={deal.inv} generation={invGeneration} onExRateChange={onExRateChange} />
                  </div>
                </div>

                {/* Deal P&L table */}
                <PlCard />
              </>
            ) : null}
          </div>
        )}
      </div>

      {/* The drag image: off-screen (.drag-ghost), inside the scope so its styles apply. */}
      {selectedRow ? (
        <div className="drag-ghost" ref={ghostRef}>
          {selectedRow.rfha} — {selectedRow.entity}
        </div>
      ) : null}

      <TxnModal modal={txnModal} fields={txnRow ? txnFields(txnRow) : []} />
      <ChangeModal
        modal={changeModal}
        dealId={deal?.dealId ?? ''}
        dealDesc={deal?.dealRef ?? ''}
        mcInput={mcInput}
        editing={changeEditing}
        hint={changeHint}
        error={changeError}
        onToggle={toggleChangeEdit}
        onOpenPicker={openMcPicker}
        onConfirm={confirmChange}
      />
      <McPickerModal
        modal={mcPickerModal}
        // Only MCs under the deal's own FX model are offered (see mcChangeError).
        contracts={deal ? contracts.filter((c) => !c.model || !deal.modId || c.model === deal.modId) : contracts}
        onPick={pickMc}
      />
      <PremiumModal modal={premiumModal} fields={premiumFields(deal ? PREMIUMS[deal.dealId] : undefined)} />
      <EditPairModal
        modal={editPairModal}
        row={editPairRow}
        editing={editPairEditing}
        newRfha={newRfha}
        error={editPairError}
        onNewRfhaChange={setNewRfha}
        onToggle={() => setEditPairEditing((e) => !e)}
        onUpdate={dealUpdate}
      />
      <CancelDealModal
        modal={cancelDealModal}
        fields={
          deal
            ? [
                ['Deal ID', deal.dealId],
                ['MC Ref No', deal.mcRef],
                ['FX Model ID', deal.modId],
                ['Trader', traderLabel(deal)],
              ]
            : []
        }
        onRequestCancel={requestCancelDeal}
      />
      <ConfirmModal
        modal={confirmModal}
        title={confirmTitle}
        message={confirmMsg}
        onYes={() => onConfirmYes.current?.()}
      />
      {status.element}

      {toasts.map((t) => (
        <div key={t.id} className={`toast${t.isErr ? ' err' : ''}`}>
          {t.isErr ? <CancelCircleIcon /> : <CheckIcon />}
          {t.message}
        </div>
      ))}
    </div>
  )
}

/**
 * The legacy page derived these rows from the invoice amounts with fixed mock factors. That is
 * not a P&L, so the card stays empty until the real source (the P&L program's tables) exists.
 */
const NO_PL: PlTableData = { empty: true }

function PlCard() {
  return (
    <div className="card">
      <div className="card-head">
        <div className="htitle">
          <h2>Deal ID: Planned P&amp;L</h2>
          <span className="count">0 records</span>
        </div>
      </div>
      <div className="table-scroll">
        <PlTable data={NO_PL} />
      </div>
    </div>
  )
}

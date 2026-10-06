import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from 'react'
import { isAbort } from '../../shared/fx/mw.ts'
import { installMasters, loadBlotterMasters } from './masters.ts'
import { applyDealIds, assignmentsFromDealIds, attachLegToDealId, createPairDealId, loadDealRows, toDealRecord } from './dealIds.ts'
import { applyAppStr } from './appStr.ts'
import { statusAfterRelease } from '../../shared/fx/txn-status.ts'
import {
  createBlotterDeal,
  createBlotterSpot,
  loadBlotterDeals,
  releaseBlotterRows,
  retryPendingAppData,
  reverseBlotterDeal,
  saveDealLink,
  type Booked,
  type DealLink,
  type SaveOutcome,
} from './workflow.ts'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { AutoDealModal } from './AutoDealModal.tsx'
import { fromFxTransaction, sapMessage, toCreatePayload } from './api.ts'
import { AutoSpotModal } from './AutoSpotModal.tsx'
import { BlotterTable, type TableHandlers } from './BlotterTable.tsx'
import { ConfirmModal } from './ConfirmModal.tsx'
import { ContextDatePicker } from './ContextDatePicker.tsx'
import { BUSINESS_PARTNERS, GROUPS, TRADERS, modelOf } from './data.ts'
import { fmtCompactUsd, fmtDate } from './format.ts'
import {
  STATUS_LABEL,
  applyCreated,
  assignCheck,
  assignMc,
  assignToDeal,
  autoEligible,
  autoOrigins,
  autoSpotForm,
  changeGroup,
  checkedRows,
  computeKpis,
  confirmAutoDeal,
  confirmShortStraddle,
  copyRow,
  defaultListCriteria,
  deleteDrafts,
  editDate,
  editField,
  filterRows,
  findMc,
  hardReset,
  initAutoLegs,
  initialBlotter,
  insertRow,
  isPreassigned,
  isSpreadsheetFile,
  loadContext,
  mcCandidates,
  mergeLiveRows,
  nextSort,
  openDealsFor,
  pagerWindow,
  pairCheck,
  parseDelimitedUpload,
  canonicalUploadRow,
  processUpload,
  releaseRows,
  resultBadge,
  reverseTxn,
  rowRef,
  runTxnList,
  sampleUploadRows,
  saveNote,
  setAppDataPending,
  setCtx,
  settle,
  sortRows,
  spotPartners,
  ssEligible,
  toggleChecked,
  toleranceCheck,
  toolbarState,
  tradersOf,
  updateAutoLeg,
  validateAutoLegs,
  validateCreate,
  viewMcPairs,
  viewRowPairs,
} from './logic.ts'
import { FX_LOGO as BRAND_LOGO } from '../../shared/fx/logo.ts'
import { useModalStack } from './modal.tsx'
import { NotesModal } from './NotesModal.tsx'
import { AssignModal, McAssignModal, ShortStraddleModal } from './ReleaseModals.tsx'
import { TxnListModal } from './TxnListModal.tsx'
import { UploadModal, type UploadState } from './UploadModal.tsx'
import type { ViewContent } from './ViewModal.tsx'
import { ViewModal } from './ViewModal.tsx'
import './fx-blotter.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './fx-blotter.dark.css'
import type {
  AutoLeg,
  AutoSpotForm,
  Blotter,
  BlotterRow,
  DropAction,
  MasterContract,
  Sort,
  StatusFilter,
  ToastKind,
  TxnListCriteria,
} from './types.ts'

const DEFAULT_SORT: Sort = { key: 'seq', dir: -1 }
const ALL_ROWS = 9999
const loadedNote = (n: number) => `${n} transaction(s) loaded; 10 empty rows ready for new entries.`
const DROP_LABEL: Record<DropAction, string> = {
  create: 'Create Transaction',
  release: 'Release to MO',
  ss: 'Release to MO - SS',
}
const STATUS_SEGS: StatusFilter[] = ['ALL', 'DRAFT', 'CREATED', 'RELEASED', 'REVERSED']
const SEG_LABEL: Record<StatusFilter, string> = { ALL: 'All', ...STATUS_LABEL }

type ToastState = { message: string; kind: ToastKind; show: boolean }
type Confirm = { title: string; body: string; run: () => void }
type Drag = {
  ids: string[]
  rowId: string
  /** Drop targets the pointer has left since the drag began. */ left: DropAction[]
}

function freshUpload(b: Blotter, fileKey: number): UploadState {
  return {
    date: fmtDate(b.ctx.date),
    group: b.ctx.group,
    trader: uploadTrader(b.ctx.group, b.ctx.trader),
    level: 'ORDER',
    rows: [],
    notice: 'intro',
    previewed: false,
    results: null,
    processed: false,
    fileKey,
  }
}

/** The upload's trader list keeps the blotter's trader when that group has them, else its first. */
function uploadTrader(group: string, ctxTrader: string): string {
  const list = tradersOf(group)
  return list.some((t) => t.code === ctxTrader) ? ctxTrader : (list[0]?.code ?? '')
}

/**
 * DE6: TSF FX Blotter (ZSGTSFP008), converted from legacy/fx-deal-blotter.html.
 *
 * Traders enter FX deals in an editable draft grid, create them (a mock RFHA each), and
 * release them to Mid-Office — singly against an open Deal ID, as a D1 / D2 pair under a
 * Master Contract, or as a Short Straddle. Auto-create Deals derives both legs from a Master
 * Contract, and Upload books them from a CSV / TSV file.
 *
 * The original is a standalone demo that never called SAP, so this is the same UI-only
 * screen: every row, counter and Master Contract balance lives in component state for the
 * session, and Refresh (hard reset) puts them back.
 */
function FxBlotterScreen({ contracts }: { contracts: MasterContract[] }) {
  const [b, setB] = useState<Blotter>(() => {
    const now = new Date()
    return initialBlotter(now, contracts, [...BUSINESS_PARTNERS])
  })
  /** The latest blotter, for handlers that run after an await or from a stored confirm. */
  const latest = useRef(b)
  latest.current = b
  const [ctxNote, setCtxNote] = useState(() => loadedNote(2))

  // Table
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT)
  const [pageSize, setPageSize] = useState(ALL_ROWS)
  const [page, setPage] = useState(1)
  const [kpisHidden, setKpisHidden] = useState(false)
  const [drag, setDrag] = useState<Drag | null>(null)

  // Popups
  const modals = useModalStack()
  const [confirm, setConfirm] = useState<Confirm>({ title: 'Confirm', body: '', run: () => {} })
  const [view, setView] = useState<ViewContent>({ subtitle: '', pairs: [], kind: 'mc' })
  const [notes, setNotes] = useState<{ targetId: string | null; text: string }>({ targetId: null, text: '' })
  const [assign, setAssign] = useState<{ rowId: string; selected: string | null } | null>(null)
  const [mcPick, setMcPick] = useState<{ ids: string[]; selected: string | null } | null>(null)
  const [auto, setAuto] = useState<{ origin: string; mcNumber: string; legs: AutoLeg[] | null }>({
    origin: '',
    mcNumber: '',
    legs: null,
  })
  const [ssIds, setSsIds] = useState<string[]>([])
  // Not reset between openings, as in the original.
  const [noInvoice, setNoInvoice] = useState(false)
  const [spot, setSpot] = useState<AutoSpotForm>(() => autoSpotForm([], b))
  const [listCrit, setListCrit] = useState<TxnListCriteria>(() => defaultListCriteria(b.ctx, '', ''))
  const [listResult, setListResult] = useState<BlotterRow[] | null>(null)
  const [upload, setUpload] = useState<UploadState>(() => freshUpload(b, 0))

  // Toast
  const [toast, setToast] = useState<ToastState>({ message: '', kind: '', show: false })
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const showToast = useCallback((message: string, kind: ToastKind = '') => {
    clearTimeout(toastTimer.current)
    setToast({ message, kind, show: true })
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, kind: '', show: false })), 3600)
  }, [])

  useEffect(() => {
    showToast(`Blotter loaded for ${latest.current.ctx.trader} (${latest.current.ctx.group}).`)
    return () => clearTimeout(toastTimer.current)
  }, [showToast])

  /**
   * Adds the day's deals from SAP to the grid. A failure leaves the blotter as it was: the
   * rest of the screen still works on its own data, so the toast is the only signal.
   */
  const loadLive = useCallback(
    async (signal?: AbortSignal) => {
      try {
        // Application data that failed to save earlier is saved again first, so what is read back below includes it.
        // Only the save is repeated: the SAP transaction / release / reversal it belongs to already happened.
        const owed = latest.current.rows.filter((r) => r.appDataPending)
        if (owed.length) {
          const outs = await retryPendingAppData(owed, latest.current.ctx.date)
          if (signal?.aborted) return
          const fixed = new Map(outs.filter((o) => o.ok).map((o) => [o.row.id, {}]))
          if (fixed.size) commit(setAppDataPending(latest.current, fixed), false)
          const stillOwed = outs.filter((o) => !o.ok)
          if (stillOwed.length) showToast(`Application data for ${stillOwed.length} transaction(s) still could not be saved: ${stillOwed[0]!.error}`, 'warn')
        }
        const cur = latest.current
        // The Deal IDs in SAP replace the demo list the assign dialog used to offer.
        let dealRows: Awaited<ReturnType<typeof loadDealRows>> | null = null
        try {
          dealRows = await loadDealRows(signal)
        } catch (e) {
          if (signal?.aborted) return
          showToast(`Could not load Deal IDs from SAP: ${sapMessage(e)}`, 'warn')
        }
        const { deals, records, appDataError } = await loadBlotterDeals(cur.ctx.date, signal)
        if (appDataError) {
          showToast(`Could not read the application data (Released to MO status) from SAP: ${appDataError}`, 'warn')
        }
        let partners = cur.partners
        const rows: Parameters<typeof mergeLiveRows>[1] = []
        for (const d of deals) {
          const out = fromFxTransaction(d, cur.ctx, partners)
          if (!out) continue
          partners = out.partners
          rows.push(out.row)
        }
        if (signal?.aborted) return
        let next = latest.current
        // A deal released to MO comes back as Released from its stored TXN_STATUS (ZSGTSFTR_APP_STR), whichever browser
        // or user released it; the Deal ID each deal is on, with its Master Contract and leg, is read back from SAP's Deal ID table.
        const assignments = dealRows ? assignmentsFromDealIds(dealRows) : new Map()
        if (rows.length) next = mergeLiveRows(next, applyDealIds(applyAppStr(rows, records), assignments), partners)
        if (dealRows) next = { ...next, deals: dealRows.map(toDealRecord).filter((d): d is NonNullable<typeof d> => d !== null) }
        if (next !== latest.current) commit(next)
      } catch (e) {
        if (signal?.aborted) return
        showToast(`Could not load FX deals from SAP: ${sapMessage(e)}`, 'warn')
      }
    },
    // commit only touches refs and setState, so it is stable in effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showToast],
  )

  useEffect(() => {
    const ctl = new AbortController()
    void loadLive(ctl.signal)
    return () => ctl.abort()
  }, [loadLive])

  // Escape closes the top-most popup.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') modals.closeTop()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [modals])

  /**
   * Stores a new blotter. `refilter` is the original's applyFilters(): the grid is topped up
   * to ten empty rows, vanished rows are unchecked, and the pager returns to page 1.
   */
  const commit = (next: Blotter, refilter = true) => {
    const settled = refilter ? settle(next) : next
    latest.current = settled
    setB(settled)
    if (refilter) setPage(1)
  }
  const refilter = () => commit(latest.current)

  /** True while a SAP write is running: the confirm dialog closes at once, so a second click must not start another. */
  const sapBusy = useRef(false)
  const guarded = (run: () => Promise<void>) => async () => {
    if (sapBusy.current) {
      showToast('A SAP request is still running — wait for it to finish.', 'warn')
      return
    }
    sapBusy.current = true
    try {
      await run()
    } finally {
      sapBusy.current = false
    }
  }

  const askConfirm = (title: string, body: string, run: () => void) => {
    setConfirm({ title, body, run })
    modals.open('action', true)
  }

  const findRow = (id: string | null | undefined) => (id ? b.rows.find((r) => r.id === id) : undefined)

  /** The rows as the blotter holds them now, by id (a SAP call may have taken a while since the caller read them). */
  const rowsNow = (ids: readonly string[]): BlotterRow[] =>
    ids.map((id) => latest.current.rows.find((r) => r.id === id)).filter((r): r is BlotterRow => !!r)

  /**
   * Records how saving the application data (ZSGTSFTR_APP_STR) went: a saved row takes the status written for it, a row
   * whose save failed is flagged so the next Refresh saves it again. Returns the first failure's message, or ''.
   */
  const settleSaves = (outs: readonly SaveOutcome[], intent: 'create' | 'release', okStatus: (r: BlotterRow) => string): string => {
    const changes = new Map(
      outs.map((o) => [o.row.id, o.ok ? { txnStatus: okStatus(o.row) } : { pending: { intent } }] as const),
    )
    commit(setAppDataPending(latest.current, changes), false)
    return outs.find((o) => !o.ok)?.error ?? ''
  }

  /** Saves the Deal ID fields and status 03 for rows just released to MO; returns a failure message, or ''. */
  const saveRelease = async (ids: readonly string[], link?: DealLink): Promise<string> =>
    settleSaves(
      await releaseBlotterRows(rowsNow(ids), link, latest.current.ctx.date),
      'release',
      (r) => statusAfterRelease(r.txnStatus),
    )

  // ------------------------------------------------------------------ derived

  const filtered = useMemo(
    () => sortRows(filterRows(b.rows, b.partners, statusFilter, search), sort),
    [b.rows, b.partners, statusFilter, search, sort],
  )
  const kpis = useMemo(() => computeKpis(b.rows), [b.rows])
  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(page, totalPages)
  const start = (currentPage - 1) * pageSize
  const pageRows = filtered.slice(start, start + pageSize)
  const sel = checkedRows(b)
  const tb = toolbarState(sel, b.locked)

  // ------------------------------------------------------------------ context row

  const load = (from: Blotter) => {
    const { blotter, loaded } = loadContext(from)
    commit(blotter)
    setCtxNote(loadedNote(loaded))
    showToast(`Blotter loaded for ${blotter.ctx.trader} (${blotter.ctx.group}).`)
    void loadLive()
  }

  const reset = () => {
    commit(hardReset(latest.current, new Date()))
    setStatusFilter('ALL')
    setSearch('')
    setSort(DEFAULT_SORT)
    setPageSize(ALL_ROWS)
    setCtxNote(loadedNote(2))
    showToast('Blotter fully reset.')
    // The reset leaves the demo rows only; the day's deals come back from SAP, released ones as Released.
    void loadLive()
  }

  const changeStatusFilter = (key: StatusFilter) => {
    setStatusFilter(key)
    refilter()
  }

  // ------------------------------------------------------------------ row lifecycle

  const addRow = () => {
    if (b.locked) return
    commit(insertRow(b))
    showToast('New blank draft row inserted.')
  }

  const copySelected = () => {
    const first = sel[0]
    if (sel.length !== 1 || !first) return
    commit(copyRow(b, first.id))
    showToast('Row copied as a new draft. Generated/status fields were cleared.')
  }

  const deleteOne = (id: string) => {
    if (findRow(id)?.status !== 'DRAFT') return
    commit(deleteDrafts(b, [id]).blotter)
    showToast('Draft row deleted.')
  }

  const deleteSelected = () => {
    const { blotter, deleted } = deleteDrafts(
      b,
      sel.map((r) => r.id),
    )
    if (!deleted) return
    commit(blotter)
    showToast(`${deleted} draft row(s) deleted.`)
  }

  const reverseOne = (id: string) => {
    const row = findRow(id)
    if (!row || !(row.status === 'CREATED' || row.status === 'RELEASED')) return
    askConfirm(
      'Reverse Transaction',
      row.live
        ? `This will reverse transaction ${row.transactionNumber} in SAP (reason 04, Other reasons). This cannot be undone.`
        : `This will mark transaction ${row.transactionNumber} as reversed. This cannot be undone in this session.`,
      guarded(async () => {
        let saved: Awaited<ReturnType<typeof reverseBlotterDeal>> | undefined
        if (row.live) {
          try {
            saved = await reverseBlotterDeal(row, latest.current.ctx.date)
          } catch (e) {
            showToast(`SAP did not reverse ${row.transactionNumber}: ${sapMessage(e)}`, 'error')
            return
          }
        }
        commit(reverseTxn(latest.current, id))
        if (saved) {
          commit(setAppDataPending(latest.current, new Map([[id, { ...(saved.pending ? { pending: saved.pending } : {}), txnStatus: saved.status }]])), false)
        }
        if (saved?.error) showToast(saved.error, 'warn')
        else showToast(`Transaction ${row.transactionNumber} reversed.`, 'error')
      }),
    )
  }

  const createSelected = (rows: BlotterRow[]) => {
    const drafts = rows.filter((r) => r.status === 'DRAFT')
    if (!drafts.length) return
    const errs = validateCreate(drafts)
    if (errs[0]) {
      showToast(errs[0], 'error')
      return
    }
    askConfirm(
      'Create Transaction(s)',
      `Create ${drafts.length} transaction(s) in SAP? Each will receive its SAP transaction number and become mostly read-only.`,
      guarded(async () => {
        // One deal at a time, in the order the rows were checked. Each is its own SAP commit,
        // so a failure stops the run and the deals already booked stay booked. A deal's application
        // data is saved right after SAP books it; if that save fails the deal still counts as created.
        const created = new Map<string, Booked>()
        let failure = ''
        for (const r of drafts) {
          try {
            created.set(r.id, await createBlotterDeal(r, latest.current.ctx.date))
          } catch (e) {
            failure = sapMessage(e)
            break
          }
        }
        if (created.size) commit(applyCreated(latest.current, created))
        const unsaved = [...created.values()].filter((c) => c.appDataError)
        if (failure) {
          showToast(created.size ? `${created.size} of ${drafts.length} created. Stopped: ${failure}` : failure, 'error')
          return
        }
        const numbers = [...created.values()].map((c) => c.transaction).join(', ')
        if (unsaved.length) {
          showToast(unsaved.length === 1 ? unsaved[0]!.appDataError! : `${drafts.length} transaction(s) created in SAP: ${numbers}. The application data of ${unsaved.length} of them could not be saved; it is saved again on the next Refresh.`, 'warn')
          return
        }
        showToast(`${drafts.length} transaction(s) created in SAP: ${numbers}.`, 'success')
      }),
    )
  }

  // ------------------------------------------------------------------ view / notes / lock

  const viewRow = (id: string) => {
    const r = latest.current.rows.find((x) => x.id === id)
    if (!r) return
    // ZSGSLCFM_DISPLAY needs Company Code + RFHA; a draft has none.
    if (!r.transactionNumber) {
      showToast('Create the transaction first. View Transaction requires an RFHA.', 'warn')
      return
    }
    setView({ subtitle: `${rowRef(r)} – ${STATUS_LABEL[r.status]}`, pairs: viewRowPairs(r, b.partners), kind: 'row' })
    modals.open('view')
  }

  const viewMc = (mcNumber: string) => {
    const mc = findMc(b.contracts, mcNumber)
    if (!mc) return
    setView({ subtitle: `${mc.mcNumber} – ${mc.modelDesc}`, pairs: viewMcPairs(mc), kind: 'mc' })
    modals.open('view')
  }

  const openNotes = () => {
    const only = sel.length === 1 ? sel[0] : undefined
    setNotes({ targetId: only?.id ?? null, text: only?.notes ?? '' })
    modals.open('notes')
  }

  const notesRow = findRow(notes.targetId)

  const saveNotes = () => {
    modals.close('notes')
    if (!notesRow) return
    commit(saveNote(b, notesRow.id, notes.text), false)
    showToast('Row note saved.', 'success')
  }

  // The toolbar's Lock Blotter button is hidden in the original too; the lock still works.
  const toggleLock = () => {
    const locked = !b.locked
    commit({ ...b, locked }, false)
    showToast(
      locked ? 'Blotter locked for this trade date. Draft rows can no longer be edited.' : 'Blotter unlocked.',
      locked ? 'warn' : '',
    )
  }

  // ------------------------------------------------------------------ release to MO

  const openRelease = (rows: BlotterRow[]) => {
    const created = rows.filter((r) => r.status === 'CREATED')
    const first = created[0]
    if (!first) return
    const ids = created.map((r) => r.id)
    if (isPreassigned(created)) {
      askConfirm(
        'Release to MO',
        `Release ${created.length} created Auto Deal transaction(s) to Mid-Office? Their Master Contract and Deal ID assignment will be retained.`,
        guarded(async () => {
          commit(releaseRows(latest.current, ids))
          const failed = await saveRelease(ids)
          if (failed) showToast(failed, 'warn')
          else showToast(`${created.length} transaction(s) released to MO.`, 'success')
        }),
      )
      return
    }
    if (created.length === 1) {
      setAssign({ rowId: first.id, selected: null })
      modals.open('assign')
    } else if (created.length !== 2) {
      showToast(
        'Select exactly 1 (assign to existing Deal ID) or 2 (create new Deal ID) Created transactions.',
        'error',
      )
    } else {
      setMcPick({ ids, selected: null })
      modals.open('mc')
    }
  }

  const assignRow = findRow(assign?.rowId)
  const assignDeal = b.deals.find((d) => d.dealId === assign?.selected)
  const assignResult = assignRow && assignDeal ? assignCheck(assignRow, assignDeal, b.contracts) : null

  /** The signed-in trader's name as the blotter shows it ("Nidhi S"): the Deal ID description starts with it. */
  const traderName = () => {
    const code = latest.current.ctx.trader
    return TRADERS.find((t) => t.code === code)?.name ?? code
  }

  // A single leg joins an existing Deal ID: SAP's Deal ID row gets the transaction in its next free slot.
  const confirmAssign = guarded(async () => {
    if (!assignRow || !assignDeal) return
    let attached: Awaited<ReturnType<typeof attachLegToDealId>>
    try {
      attached = await attachLegToDealId(assignDeal.dealId, assignRow)
    } catch (e) {
      showToast(sapMessage(e), 'error')
      return
    }
    modals.close('assign')
    commit(assignToDeal(latest.current, assignRow.id, assignDeal.dealId))
    // The Deal ID is in SAP; now the application data: its Deal ID fields and TXN_STATUS 03 (FO -> MO Unmatched).
    const failed = await saveRelease([assignRow.id], {
      dealId: assignDeal.dealId,
      mcRef: attached.mcRef || assignDeal.mcNumber,
      dealDesc: attached.dealDesc,
      dealType: attached.dealType,
    })
    if (failed) showToast(failed, 'warn')
    else showToast(`Transaction ${assignRow.transactionNumber} released and added to Deal ID ${assignDeal.dealId} in SAP.`, 'success')
  })

  const mcLegs = (mcPick?.ids ?? []).map((id) => findRow(id)).filter((r): r is BlotterRow => !!r)
  const [legA, legB] = mcLegs
  const mcPair = legA && legB ? pairCheck(legA, legB) : null
  const mcSelected = mcPick?.selected ? findMc(b.contracts, mcPick.selected) : undefined
  const mcTolerance = legA && mcSelected ? toleranceCheck(legA, mcSelected, !!mcPair?.ok) : null

  // The pair gets a real Deal ID: the number comes from SAP's range, the row from the original's rules.
  const confirmMc = guarded(async () => {
    if (!legA || !legB || !mcSelected) return
    let pair: Awaited<ReturnType<typeof createPairDealId>>
    try {
      pair = await createPairDealId({
        mc: mcSelected,
        legs: [legA, legB],
        traderName: traderName(),
        year: latest.current.ctx.date.getFullYear(),
      })
    } catch (e) {
      showToast(sapMessage(e), 'error')
      return
    }
    const out = assignMc(latest.current, legA.id, legB.id, mcSelected.mcNumber, pair.dealId)
    if (!out) return
    modals.close('mc')
    commit(out.blotter)
    // The Deal ID is in SAP; now the application data of both legs: its Deal ID fields and TXN_STATUS 03 (FO -> MO Unmatched).
    const failed = await saveRelease([legA.id, legB.id], {
      dealId: pair.dealId,
      mcRef: mcSelected.mcNumber,
      dealDesc: pair.dealDesc,
      dealType: pair.dealType,
    })
    if (failed) showToast(failed, 'warn')
    else showToast(`Deal ID ${out.dealId} created in SAP and linked to ${mcSelected.mcNumber}. Both legs released to MO.`, 'success')
  })

  const openShortStraddle = (rows: BlotterRow[]) => {
    const created = rows.filter((r) => r.status === 'CREATED')
    if (created.length !== 2) return
    setSsIds(created.map((r) => r.id))
    modals.open('ss')
  }

  const ssLegs = ssIds.map((id) => findRow(id)).filter((r): r is BlotterRow => !!r)

  const confirmSs = () => {
    const { blotter, ssDealId } = confirmShortStraddle(b, ssIds, noInvoice)
    modals.close('ss')
    commit(blotter)
    showToast(`Short Straddle Deal ID ${ssDealId} assigned${noInvoice ? ' (no-invoice model).' : '.'}`, 'success')
  }

  // ------------------------------------------------------------------ auto deal

  const openAutoDeal = () => {
    if (b.locked) return
    setAuto({ origin: autoOrigins()[0] ?? '', mcNumber: '', legs: null })
    modals.open('auto')
  }

  const pickAutoMc = (mcNumber: string) => {
    const mc = findMc(b.contracts, mcNumber)
    if (!mc) {
      setAuto((a) => ({ ...a, mcNumber: '', legs: null }))
      return
    }
    setAuto({ origin: mc.origin, mcNumber, legs: initAutoLegs(mc, b.ctx.date) })
  }

  const autoMc = auto.mcNumber ? findMc(b.contracts, auto.mcNumber) : undefined
  const autoMsgs = autoMc && auto.legs ? validateAutoLegs(autoMc, auto.legs) : []

  /** The two leg rows an Auto Deal result holds, Deal 1 first. */
  const autoLegRows = (blotter: Blotter): BlotterRow[] => {
    const ids = blotter.deals[blotter.deals.length - 1]?.legs ?? []
    return ids.map((id) => blotter.rows.find((r) => r.id === id)).filter((r): r is BlotterRow => !!r)
  }

  /**
   * Books Deal 1 then Deal 2 in SAP; only when both are in does the pair get its Deal ID and
   * draw down the Master Contract (both of which exist on this screen only). If Deal 2 is
   * refused, Deal 1 stays booked — nothing is reversed on the user's behalf — and is shown in
   * the grid so it can be reversed or kept. The popup stays open in every failure case.
   */
  const confirmAuto = guarded(async () => {
    if (!autoMc || !auto.legs) return
    const preview = confirmAutoDeal(latest.current, autoMc.mcNumber, auto.legs)
    if (!preview) return
    const legs = autoLegRows(preview.blotter)
    try {
      legs.forEach((r) => toCreatePayload(r))
    } catch (e) {
      showToast(sapMessage(e), 'error')
      return
    }
    const created: Booked[] = []
    for (const [i, r] of legs.entries()) {
      try {
        created.push(await createBlotterDeal(r, latest.current.ctx.date))
      } catch (e) {
        const booked = created[0]
        showToast(
          booked
            ? `Deal 1 was created in SAP as ${booked.transaction}, but Deal 2 failed: ${sapMessage(e)} Deal 1 stays booked — reverse it in the grid if you do not want it.`
            : `Deal ${i + 1} failed: ${sapMessage(e)} Nothing was booked.`,
          'error',
        )
        if (booked) void loadLive()
        return
      }
    }
    // Both legs are in SAP; the Deal ID joins them, as the original's auto deal does straight after creating them.
    const inSap = legs.map((r, i) => ({ ...r, live: true, companyCode: created[i]!.companyCode, transactionNumber: created[i]!.transaction })) as [BlotterRow, BlotterRow]
    let pair: Awaited<ReturnType<typeof createPairDealId>>
    try {
      pair = await createPairDealId({ mc: autoMc, legs: inSap, traderName: traderName(), year: latest.current.ctx.date.getFullYear() })
    } catch (e) {
      // The legs exist: close the popup so they cannot be booked twice, and show them.
      modals.close('auto')
      showToast(
        `Both legs were created in SAP (${created.map((c) => c.transaction).join(', ')}) but the Deal ID was not: ${sapMessage(e)} Select the two and Release to MO to create it.`,
        'error',
      )
      void loadLive()
      return
    }
    // Rebuilt on the blotter as it is now, in case it changed while SAP was answering.
    const out = confirmAutoDeal(latest.current, autoMc.mcNumber, auto.legs, pair.dealId)
    if (!out) return
    const ids = autoLegRows(out.blotter).map((r) => r.id)
    modals.close('auto')
    commit(applyCreated(out.blotter, new Map(ids.map((id, i) => [id, created[i]!]))))
    // The legs now have a Deal ID: save it with their application data. Their status stays 01 until they are released to MO.
    const outs = await saveDealLink(rowsNow(ids), { dealId: pair.dealId, mcRef: autoMc.mcNumber, dealDesc: pair.dealDesc, dealType: pair.dealType }, latest.current.ctx.date)
    const unsaved = settleSaves(outs, 'create', (r) => r.txnStatus ?? '01') || created.find((c) => c.appDataError)?.appDataError || ''
    showToast(
      unsaved ||
        `Auto Deal created in SAP: Deal 1 ${created[0]?.transaction}, Deal 2 ${created[1]?.transaction}, under Deal ID ${out.dealId}. Select the Created transaction(s) and use Release to MO when ready.`,
      unsaved ? 'warn' : 'success',
    )
  })

  // ------------------------------------------------------------------ auto spot

  const openAutoSpot = () => {
    setSpot(autoSpotForm(sel, b))
    modals.open('autospot')
  }

  // The popup stays open when SAP refuses, so the partner, type or amounts can be changed and retried.
  const createSpot = guarded(async () => {
    try {
      const booked = await createBlotterSpot(spot, latest.current.ctx.date)
      modals.close('autospot')
      if (booked.appDataError) showToast(booked.appDataError, 'warn')
      else showToast(`Spot created in SAP: ${booked.transaction}.`, 'success')
      // The spot joins the grid from SAP; if its application data did not save, the row is flagged so Refresh saves it.
      void loadLive().then(() => {
        if (!booked.appDataPending) return
        const row = latest.current.rows.find((r) => r.companyCode === booked.companyCode && r.transactionNumber === booked.transaction)
        if (row) commit(setAppDataPending(latest.current, new Map([[row.id, { pending: booked.appDataPending! }]])), false)
      })
    } catch (e) {
      showToast(sapMessage(e), 'error')
    }
  })

  // ------------------------------------------------------------------ FX Txn List

  const openTxnList = () => {
    setListCrit(defaultListCriteria(b.ctx, b.ctx.group, b.ctx.trader))
    setListResult(null)
    modals.open('list')
  }

  const runList = (crit: TxnListCriteria) => {
    const rows = runTxnList(latest.current.rows, crit)
    if (!rows) {
      showToast('Enter a valid Blotter Date in dd-mm-yyyy format.', 'error')
      return
    }
    setListResult(rows)
    if (crit.email)
      showToast(
        `FX Txn List email simulated for ${rows.length} record(s); no email is sent from the standalone file.`,
        'warn',
      )
  }

  const resetList = () => {
    const crit = defaultListCriteria(b.ctx, '', '')
    setListCrit(crit)
    runList(crit)
  }

  // ------------------------------------------------------------------ upload

  const openUpload = () => {
    setUpload((u) => freshUpload(b, u.fileKey + 1))
    modals.open('upload')
  }

  const loadUploadRows = (rows: UploadState['rows']) =>
    setUpload((u) => ({ ...u, rows, notice: null, previewed: true, results: null, processed: false }))

  const readUploadFile = (file: File | undefined) => {
    if (!file) return
    if (isSpreadsheetFile(file.name || '')) {
      setUpload((u) => ({ ...u, rows: [], notice: 'xls', previewed: true, results: null, processed: false }))
      return
    }
    const reader = new FileReader()
    reader.onload = () => loadUploadRows(parseDelimitedUpload(String(reader.result ?? '')).map(canonicalUploadRow))
    reader.onerror = () => showToast('Could not read the selected upload file.', 'error')
    reader.readAsText(file)
  }

  const runUpload = () => {
    const out = processUpload(latest.current, upload.rows, upload.level, upload.group, upload.trader)
    if (!out) return
    commit({ ...out.blotter, checked: [] })
    setUpload((u) => ({ ...u, results: out.results, processed: true }))
    showToast(`${upload.rows.length} upload row(s) processed as ${upload.level}.`, 'success')
  }

  const viewUploadedRfha = (rfha: string) => {
    const r = latest.current.rows.find((x) => x.transactionNumber === rfha)
    if (r) viewRow(r.id)
  }

  // ------------------------------------------------------------------ drag to an action button

  const runDrop = (action: DropAction, rows: BlotterRow[]) => {
    if (action === 'create') createSelected(rows)
    else if (action === 'release') openRelease(rows)
    else openShortStraddle(rows)
  }

  const dropTarget = (action: DropAction, enabled: boolean) => ({
    'data-drop-action': action,
    onDragOver: (e: DragEvent<HTMLButtonElement>) => {
      if (!drag) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    },
    onDragEnter: () => setDrag((d) => (d ? { ...d, left: d.left.filter((a) => a !== action) } : d)),
    onDragLeave: () => setDrag((d) => (d ? { ...d, left: [...d.left, action] } : d)),
    onDrop: (e: DragEvent<HTMLButtonElement>) => {
      e.preventDefault()
      if (!drag) return
      setDrag((d) => (d ? { ...d, left: [...d.left, action] } : d))
      const next = { ...latest.current, checked: drag.ids }
      commit(next, false)
      if (!enabled) {
        showToast(`The current selection cannot be dropped on ${DROP_LABEL[action]}.`, 'error')
        return
      }
      runDrop(action, checkedRows(next))
    },
  })

  const dropClass = (action: DropAction, enabled: boolean) =>
    drag && !drag.left.includes(action) ? (enabled ? ' drag-armed' : ' drag-blocked') : ''

  const handlers: TableHandlers = {
    onSort: (key) => setSort((s) => nextSort(s, key)),
    onToggleAll: (on) => {
      let checked = b.checked
      for (const r of pageRows) checked = toggleChecked(checked, r.id, on)
      commit({ ...b, checked }, false)
    },
    onToggleCheck: (id, on) => commit({ ...b, checked: toggleChecked(b.checked, id, on) }, false),
    onRowClick: (e: MouseEvent<HTMLTableRowElement>, id) => {
      if ((e.target as HTMLElement).closest('button, input, select, a')) return
      commit({ ...b, checked: toggleChecked(b.checked, id, !b.checked.includes(id)) }, false)
    },
    onDragStart: (e, id) => {
      if ((e.target as HTMLElement).closest('input, select, button')) {
        e.preventDefault()
        return
      }
      let ids = checkedRows(b).map((r) => r.id)
      if (!b.checked.includes(id)) {
        ids = [id]
        commit({ ...b, checked: ids }, false)
      }
      setDrag({ ids, rowId: id, left: [] })
      try {
        e.dataTransfer.setData('text/plain', JSON.stringify(ids))
        e.dataTransfer.effectAllowed = 'move'
      } catch {
        // Some browsers refuse setData here; the drag still works from state.
      }
    },
    onDragEnd: () => setDrag(null),
    onField: (id, field, value) => commit(editField(b, id, field, value)),
    onDate: (id, field, value) => {
      if (findRow(id)?.status === 'DRAFT') commit(editDate(b, id, field, value))
    },
    onView: viewRow,
    onDelete: deleteOne,
    onReverse: reverseOne,
    onViewMc: viewMc,
  }

  const kpiCards: Array<{ key: StatusFilter; cls: string; val: number; lbl: string }> = [
    { key: 'ALL', cls: 'total', val: kpis.total, lbl: 'Total Rows' },
    { key: 'DRAFT', cls: 'draft', val: kpis.counts.DRAFT, lbl: 'Draft (Editable)' },
    { key: 'CREATED', cls: 'created', val: kpis.counts.CREATED, lbl: 'Created (RFHA)' },
    { key: 'RELEASED', cls: 'released', val: kpis.counts.RELEASED, lbl: 'Released to MO' },
    { key: 'REVERSED', cls: 'reversed', val: kpis.counts.REVERSED, lbl: 'Reversed' },
  ]

  return (
    <div className="fx-blotter">
      <div className="page-head app-ref-header">
        <div className="head-left">
          <BackButton className="nav-back" />
          <img className="brand-logo" src={BRAND_LOGO} alt="Application logo" />
          <div className="title-wrap">
            <div className="page-title-row">
              <div className="page-title">FX Deal Blotter</div>
              <div className="page-code">DE6</div>
            </div>
            <div className="page-subtitle">
              Create, review and release FX transactions in the same visual application style.
            </div>
          </div>
        </div>
        <div className="head-actions">
          <button className="tb-btn" type="button" onClick={reset}>
            Refresh
          </button>
          <SignOutButton className="tb-btn" />
        </div>
      </div>
      <div aria-hidden="true" style={{ display: 'none' }}>
        <div id="lock-pill" className={b.locked ? 'locked' : undefined}>
          <span id="lock-icon">{b.locked ? '🔒' : '🔓'}</span>
          <span id="lock-text">{b.locked ? 'Blotter Locked' : 'Blotter Open'}</span>
        </div>
      </div>

      <div className="sap-actionbar" aria-label="FX Blotter actions">
        <button
          type="button"
          className={`tb-btn primary drop-target${dropClass('create', tb.create)}`}
          id="btn-create"
          disabled={!tb.create}
          onClick={() => createSelected(sel)}
          {...dropTarget('create', tb.create)}
        >
          Create Transaction
        </button>
        <button
          type="button"
          className="tb-btn"
          id="btn-view"
          disabled={!tb.view}
          onClick={() => {
            if (sel.length === 1 && sel[0]) viewRow(sel[0].id)
          }}
        >
          View Transaction
        </button>
        <button type="button" className="tb-btn" id="btn-list" onClick={openTxnList}>
          View Txn List
        </button>
        <button type="button" className="tb-btn" id="btn-upload" onClick={openUpload}>
          Upload
        </button>
        <div className="tb-sep" />
        <button
          type="button"
          className={`tb-btn drop-target${dropClass('release', tb.release)}`}
          id="btn-release"
          disabled={!tb.release}
          title="Select 1 or 2 Created transactions"
          onClick={() => openRelease(sel)}
          {...dropTarget('release', tb.release)}
        >
          Release to MO
        </button>
        <button
          type="button"
          className={`tb-btn purple drop-target${dropClass('ss', tb.ss)}`}
          id="btn-ss"
          disabled={!tb.ss}
          onClick={() => openShortStraddle(sel)}
          {...dropTarget('ss', tb.ss)}
        >
          Release to MO - SS
        </button>
        <button
          type="button"
          className="tb-btn"
          id="btn-lock"
          onClick={toggleLock}
          style={{ display: 'none' }}
          aria-hidden="true"
          tabIndex={-1}
        >
          {b.locked ? 'Unlock Blotter' : 'Lock Blotter'}
        </button>
        <button type="button" className="tb-btn" id="btn-notes" onClick={openNotes}>
          Notes
        </button>
        <div className="tb-sep" />
        <button type="button" className="tb-btn warn" id="btn-auto" disabled={!tb.auto} onClick={openAutoDeal}>
          Auto-create Deals
        </button>
        <button type="button" className="tb-btn" id="btn-autospot" onClick={openAutoSpot}>
          Auto Spot
        </button>
      </div>

      <main>
        <div className="kpi-head">
          <button
            type="button"
            className={kpisHidden ? 'kpi-toggle collapsed' : 'kpi-toggle'}
            id="kpi-toggle"
            onClick={() => setKpisHidden((h) => !h)}
          >
            <span id="kpi-caret">▾</span>
          </button>
          <div className="kpi-head-title">Overview</div>
        </div>
        <div className={kpisHidden ? 'metrics-grid kpi-hidden' : 'metrics-grid'} id="kpi-grid">
          {kpiCards.map((c) => (
            <div
              key={c.key}
              className={`metric-card ${c.cls}${statusFilter === c.key ? ' active' : ''}`}
              onClick={() => changeStatusFilter(c.key)}
            >
              <div className="metric-inner">
                <div className="metric-val">{c.val}</div>
                <div className="metric-lbl">{c.lbl}</div>
              </div>
            </div>
          ))}
          <div className="metric-card notional">
            <div className="metric-inner">
              <div className="metric-val">{fmtCompactUsd(kpis.notional)}</div>
              <div className="metric-lbl">Total Notional (USD)</div>
            </div>
          </div>
          <div className="metric-card notional">
            <div className="metric-inner">
              <div className="metric-val">{b.deals.length}</div>
              <div className="metric-lbl">Deal IDs Generated</div>
            </div>
          </div>
        </div>

        <div className="panel fwd-input-blotter-panel" id="fx-blotter-panel">
          <div className="panel-title fwd-panel-title-modern">
            <div className="panel-title-left">
              <h2 className="fwd-panel-heading">FX Deal Input Blotter</h2>
            </div>
          </div>
          <div className="context-row">
            <ContextDatePicker date={b.ctx.date} onPick={(date) => commit(setCtx(b, { date }), false)} />
            <div className="context-field tight">
              <label htmlFor="ctx-group">Group</label>
              <select
                id="ctx-group"
                value={b.ctx.group}
                onChange={(e) => commit(changeGroup(b, e.target.value), false)}
              >
                {GROUPS.map((g) => (
                  <option key={g.code} value={g.code}>
                    {g.code} {g.desc}
                  </option>
                ))}
              </select>
            </div>
            <div className="context-field tight">
              <label htmlFor="ctx-trader">Trader / Trade Code</label>
              <select
                id="ctx-trader"
                value={b.ctx.trader}
                onChange={(e) => load(setCtx(b, { trader: e.target.value }))}
              >
                {tradersOf(b.ctx.group).map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.name}
                    {t.teamLead ? ' (Team Lead)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className="tb-btn primary" onClick={() => load(b)} style={{ alignSelf: 'flex-end' }}>
              Load Blotter
            </button>
            <span className="context-lock-note" id="ctx-note">
              {ctxNote}
            </span>
          </div>

          <div className="master-toolbar">
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
                placeholder="Search any column..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  refilter()
                }}
              />
            </div>
            <div className="seg-group" id="status-seg">
              {STATUS_SEGS.map((s) => (
                <button
                  type="button"
                  key={s}
                  className={statusFilter === s ? 'seg active' : 'seg'}
                  data-status={s}
                  onClick={() => changeStatusFilter(s)}
                >
                  {SEG_LABEL[s]}
                </button>
              ))}
            </div>
            <span className="selected-count" id="selected-count">
              {sel.length} selected
            </span>
            <span className="badge-blue" id="result-count-badge" style={{ marginLeft: 'auto' }}>
              {resultBadge(filtered)}
            </span>
          </div>
          <div className="toolbar-row2">
            <button type="button" className="tb-btn primary" id="btn-insert" disabled={!tb.insert} onClick={addRow}>
              + New Row
            </button>
            <button type="button" className="tb-btn" id="btn-copy" disabled={!tb.copy} onClick={copySelected}>
              Copy
            </button>
            <button type="button" className="tb-btn danger" id="btn-delete" disabled={!tb.del} onClick={deleteSelected}>
              Delete
            </button>
            <button
              type="button"
              className="tb-btn danger"
              id="btn-reverse"
              disabled={!tb.reverse}
              onClick={() => {
                if (sel.length === 1 && sel[0]) reverseOne(sel[0].id)
              }}
            >
              Reverse
            </button>
            <span className="badge-blue">Row tools from the SAP table-control: insert / copy / delete / reverse</span>
          </div>

          <div className="table-wrap">
            <BlotterTable
              rows={pageRows}
              checked={b.checked}
              locked={b.locked}
              partners={b.partners}
              sort={sort}
              draggingId={drag?.rowId ?? null}
              allChecked={pageRows.length > 0 && pageRows.every((r) => b.checked.includes(r.id))}
              h={handlers}
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
                <option value={ALL_ROWS}>All</option>
              </select>
            </div>
            <div className="pager-controls" id="pager-controls">
              <button type="button" className="pager-btn" disabled={currentPage <= 1} onClick={() => setPage(1)}>
                «
              </button>
              <button
                type="button"
                className="pager-btn"
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
              >
                ‹
              </button>
              {pagerWindow(currentPage, totalPages).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={p === currentPage ? 'pager-btn active' : 'pager-btn'}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              ))}
              <button
                type="button"
                className="pager-btn"
                disabled={currentPage >= totalPages}
                onClick={() => setPage(currentPage + 1)}
              >
                ›
              </button>
              <button
                type="button"
                className="pager-btn"
                disabled={currentPage >= totalPages}
                onClick={() => setPage(totalPages)}
              >
                »
              </button>
            </div>
            <div className="pager-info" id="pager-info">
              {total ? (
                <>
                  Showing{' '}
                  <strong>
                    {start + 1}-{Math.min(total, currentPage * pageSize)}
                  </strong>{' '}
                  of <strong>{total}</strong>
                </>
              ) : (
                'No records'
              )}
            </div>
          </div>
          <div className="sap-ref-note">
            <strong>Standalone demo:</strong> the main FX Blotter, transaction display, FX Txn List and Upload flows are
            represented from the supplied ABAP. Database/BAPI updates, email delivery and SAP transaction calls are
            simulated in-browser only.
          </div>
        </div>
      </main>

      <div className={`zfac-toast${toast.show ? ' show' : ''}${toast.kind ? ` ${toast.kind}` : ''}`} id="toast">
        {toast.message}
      </div>

      <ConfirmModal modals={modals} title={confirm.title} body={confirm.body} onConfirm={() => confirm.run()} />
      <ViewModal modals={modals} content={view} />
      <NotesModal
        modals={modals}
        target={notesRow ? rowRef(notesRow) : null}
        text={notes.text}
        onText={(text) => setNotes((n) => ({ ...n, text }))}
        onSave={saveNotes}
      />
      <AssignModal
        modals={modals}
        row={assignRow}
        deals={assignRow ? openDealsFor(assignRow, b.deals) : []}
        selected={assign?.selected ?? null}
        check={assignResult}
        onSelect={(dealId) => setAssign((a) => (a ? { ...a, selected: dealId } : a))}
        onConfirm={confirmAssign}
      />
      <McAssignModal
        modals={modals}
        legs={mcLegs}
        pair={mcPair}
        candidates={legA ? mcCandidates(legA, b.contracts) : []}
        selected={mcSelected}
        tolerance={mcTolerance}
        onSelect={(mcNumber) => setMcPick((m) => (m ? { ...m, selected: mcNumber } : m))}
        onConfirm={confirmMc}
      />
      <AutoDealModal
        modals={modals}
        origins={autoOrigins()}
        origin={auto.origin}
        eligible={autoEligible(b.contracts, auto.origin)}
        mc={autoMc}
        legs={auto.legs}
        msgs={autoMsgs}
        partners={b.partners}
        onOrigin={(origin) => setAuto({ origin, mcNumber: '', legs: null })}
        onMc={pickAutoMc}
        onLeg={(i, field, value) =>
          setAuto((a) => (a.legs ? { ...a, legs: updateAutoLeg(a.legs, i, field, value) } : a))
        }
        onConfirm={confirmAuto}
      />
      <ShortStraddleModal
        modals={modals}
        legs={ssLegs}
        eligible={ssEligible(ssLegs)}
        noInvoice={noInvoice}
        onNoInvoice={setNoInvoice}
        onConfirm={confirmSs}
      />
      <AutoSpotModal
        modals={modals}
        form={spot}
        partners={spotPartners(b.partners)}
        onChange={(patch) => setSpot((s) => ({ ...s, ...patch }))}
        onCreate={createSpot}
      />
      <TxnListModal
        modals={modals}
        crit={listCrit}
        result={listResult}
        partners={b.partners}
        onCrit={(patch) => setListCrit((c) => ({ ...c, ...patch }))}
        onGroup={(group) => setListCrit((c) => ({ ...c, group, trader: '' }))}
        onRun={() => runList(listCrit)}
        onReset={resetList}
        onViewRow={viewRow}
      />
      <UploadModal
        modals={modals}
        s={upload}
        onChange={(patch) => setUpload((u) => ({ ...u, ...patch }))}
        onGroup={(group) => setUpload((u) => ({ ...u, group, trader: uploadTrader(group, b.ctx.trader) }))}
        onFile={readUploadFile}
        onSample={() => loadUploadRows(sampleUploadRows(b.ctx.date))}
        onProcess={runUpload}
        onViewRfha={viewUploadedRfha}
      />
    </div>
  )
}

type MastersState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; contracts: MasterContract[] }

/**
 * DE6: TSF FX Blotter (ZSGTSFP008). The entity, profit centre, business area, FX model,
 * commodity and Master Contract lists come from the middleware, so the screen opens only once
 * they have loaded. A failed read is shown with a Retry — never replaced by stand-in values,
 * which would let a deal be booked against entities or contracts SAP does not hold.
 */
export default function FxBlotter() {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<MastersState>({ phase: 'loading' })

  useEffect(() => {
    const ctl = new AbortController()
    setState({ phase: 'loading' })
    loadBlotterMasters(ctl.signal)
      .then((masters) => {
        if (ctl.signal.aborted) return
        installMasters(masters)
        setState({ phase: 'ready', contracts: masters.contracts })
      })
      .catch((error: unknown) => {
        if (ctl.signal.aborted || isAbort(error)) return
        setState({ phase: 'error', message: error instanceof Error ? error.message : String(error) })
      })
    return () => ctl.abort()
  }, [attempt])

  if (state.phase === 'ready') return <FxBlotterScreen key={attempt} contracts={state.contracts} />
  return (
    <div className="fx-blotter" style={{ minHeight: '100vh', padding: 24 }}>
      {state.phase === 'loading' ? (
        <div role="status">Loading FX master data…</div>
      ) : (
        <div role="alert">
          <p>{state.message}</p>
          <p>The FX Deal Blotter needs these masters to open. Nothing has been substituted for them.</p>
          <button type="button" className="btn-confirm" onClick={() => setAttempt((n) => n + 1)}>
            Retry
          </button>
        </div>
      )}
    </div>
  )
}

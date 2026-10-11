import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { FS_SHORT_LOGO } from '../../shared/fx/logo.ts'
import { isAbort } from '../../shared/fx/mw.ts'
import { cancelDeal, loadDeal as loadDealFromSap, loadDealIndex, type DealIndexEntry, type LoadedDeal } from './api.ts'
import { loadReplacementCandidates, loadReplacementReference, partialFailureMessage, replaceDealTransaction, reverseMoConfirmation, type OpResult, type ReplacementCandidate } from './analysis.ts'
import { confirmPrepared, prepareConfirmation, type Prepared } from './analysisConfirm.ts'
import { GAPS } from './data.ts'
import { DealDetails } from './DetailTables.tsx'
import { FxLegTable } from './FxLegTable.tsx'
import { actionVisibility, legNote, nextSort, quickPickLabel, resolveDealId, sortedFilteredLegs, statusMeta, toggleLeg } from './logic.ts'
import { ConfirmModal, EditPairModal, PromptModal, type ConfirmPreview } from './Modals.tsx'
import { InvoiceTable, PlTable } from './PlanTables.tsx'
import './mo-confirm-fx-deal-id.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './mo-confirm-fx-deal-id.dark.css'
import './mo-confirm-fx-deal-id.overrides.css'
import { DealPickerModal, ViewDealsButton } from '../../shared/ui/DealPickerModal.tsx'
import { ResultQueue, type ResultItem } from '../../shared/ui/ResultQueue.tsx'
import type { ResultTone } from '../../shared/ui/ResultDialog.tsx'
import type { ModalId, Sort, SortKey, Toast, ToastType } from './types.ts'

const TOAST_MS = 3200
/** How many Deal IDs the quick picks list; the typeahead offers them all. */
const QUICK_PICKS = 8

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/**
 * MO: Confirm FX Deal ID — Single Deal ID (ZSGTSFP002 / ZSGTSF_PDEAL_ID_ANALYS), converted from
 * legacy/confirm-fx-deal.html and wired to SAP (api.ts lists every source).
 *
 * Wired: loading a Deal ID with its Master Contract, trader, model rules, transactions and saved
 * invoice plan, and Cancel Deal ID (status 30). Not wired, because the registered services cannot
 * do it, so the control is disabled and its tooltip gives the reason (data.ts GAPS): Change / Confirm,
 * Edit Deal Pair, Reverse MO Confirmation, Premium Adjustment, DMS and the SS confirmation.
 * Nothing is mocked and nothing is written that SAP has not accepted.
 */
/** The screen's view of a calculated confirmation. */
function previewOf(p: Prepared): ConfirmPreview {
  return {
    mcRef: p.mcRef,
    contracts: p.contracts.map((m) => ({ ref: String(m['ZMC_REF_NO'] ?? ''), desc: String(m['ZMC_DESC'] ?? '') })),
    rate: p.rate,
    rateDate: p.rateDate,
    lines: p.lines.map((l) => ({ ttype: l.ZTTYPE, link: l.linked, seller: l.seller, buyer: l.buyer, currency: l.ZTRD_CURR, amount: l.ZAMT, rate: l.ZEX_RATE, invAmount: l.ZINV_AMT, reused: l.reused })),
    pl: { amount: p.confirm.pl?.pl ?? 0, localAmount: p.confirm.pl?.localAmount ?? 0, localCurrency: p.confirm.pl?.localCurrency ?? '' },
  }
}

export default function MoConfirmFxDealId() {
  const [index, setIndex] = useState<readonly DealIndexEntry[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [loaded, setLoaded] = useState<LoadedDeal | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  const [searchText, setSearchText] = useState('')
  const [searchErr, setSearchErr] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [fxSearch, setFxSearch] = useState('')
  const [sort, setSort] = useState<Sort>({ key: null, dir: 1 })
  const [modal, setModal] = useState<ModalId | null>(null)
  const [pair, setPair] = useState<{ candidates: ReplacementCandidate[]; loading: boolean; error: string | null }>({ candidates: [], loading: false, error: null })
  /** Set when Reverse MO Confirmation stopped after the status step; the next run finishes the deletion only. */
  const [confirmState, setConfirmState] = useState<{ loading: boolean; reason: string | null; prepared: Prepared | null }>({ loading: false, reason: null, prepared: null })
  const [reverseResume, setReverseResume] = useState<string | null>(null)

  const [toast, setToast] = useState<Toast | null>(null)
  const toastSeq = useRef(0)
  const toastTimers = useRef(new Set<ReturnType<typeof setTimeout>>())

  const listId = useId()
  const inputId = useId()

  useEffect(() => {
    const timers = toastTimers.current
    return () => timers.forEach(clearTimeout)
  }, [])

  const [results, setResults] = useState<ResultItem[]>([])
  const dismissResult = (id: number) => setResults((r) => r.filter((x) => x.id !== id))

  /**
   * Success / error outcomes open the standard ResultDialog (queued, dismissed with OK). Only the plain
   * "Data refreshed from SAP" chatter stays on the small non-modal toast (replaced by the next, clears after 3.2 s).
   */
  const showToast = (msg: string, type: ToastType) => {
    const id = ++toastSeq.current
    if (msg !== 'Data refreshed from SAP') {
      const tone: ResultTone = type === 'success' ? 'success' : type === 'error' ? 'error' : 'info'
      const title = tone === 'success' ? 'Success' : tone === 'error' ? 'Error' : 'Information'
      setResults((r) => [...r, { id, tone, title, message: msg }])
      return
    }
    setToast({ id, msg, type })
    const timer = setTimeout(() => {
      toastTimers.current.delete(timer)
      setToast((t) => (t?.id === id ? null : t))
    }, TOAST_MS)
    toastTimers.current.add(timer)
  }

  const refreshIndex = async (signal?: AbortSignal) => {
    try {
      setIndex(await loadDealIndex(signal))
    } catch (error) {
      if (!isAbort(error)) showToast(`The Deal IDs could not be read: ${messageOf(error)}`, 'error')
    }
  }

  useEffect(() => {
    const ctl = new AbortController()
    void refreshIndex(ctl.signal)
    return () => ctl.abort()
  }, [])

  const deal = loaded?.deal ?? null
  const legs = useMemo(() => (deal ? sortedFilteredLegs(deal.legs, fxSearch, sort) : []), [deal, fxSearch, sort])
  const vis = deal ? actionVisibility(deal) : null

  const closeModals = () => setModal(null)

  /* ---------- Deal search ---------- */

  const readDeal = async (id: string): Promise<boolean> => {
    setLoading(true)
    try {
      const result = await loadDealFromSap(id)
      if (!result) {
        setSearchErr('Deal ID not found.')
        return false
      }
      setSearchErr(null)
      setLoaded(result)
      return true
    } catch (error) {
      setSearchErr(`The Deal ID could not be read: ${messageOf(error)}`)
      return false
    } finally {
      setLoading(false)
    }
  }

  const loadDeal = async (text: string) => {
    const r = resolveDealId(text)
    if (!r.ok) {
      setSearchErr(r.error)
      return
    }
    if (await readDeal(r.id)) setSelected(null)
  }

  const clearDeal = () => {
    setLoaded(null)
    setSelected(null)
    setSearchText('')
    setSearchErr(null)
  }

  /** Re-reads the loaded Deal ID (and the list) from SAP. */
  const refresh = async () => {
    if (!deal) {
      await refreshIndex()
      return
    }
    if (await readDeal(deal.dealId)) {
      await refreshIndex()
      showToast('Data refreshed from SAP', 'success')
    }
  }

  const selectLeg = (rfha: string) => setSelected((s) => toggleLeg(s, rfha))

  /* ---------- Cancel Deal ID (CAN): the only write the registered services allow ---------- */

  /** Sets ZDEAL_STAT = 30 in SAP, then drops the deal from the screen. A refusal changes nothing. */
  const confirmCancelDeal = async () => {
    if (!loaded) return
    setBusy(true)
    try {
      await cancelDeal(loaded.row)
    } catch (error) {
      setBusy(false)
      closeModals()
      showToast(messageOf(error), 'error')
      return
    }
    setBusy(false)
    closeModals()
    setLoaded(null)
    setSelected(null)
    setSearchText('')
    showToast('FX Deal ID deassigned successfully.', 'success')
    await refreshIndex()
  }


  /* ---------- Reverse MO Confirmation: Deal ID back to 01, invoice references deleted ---------- */

  /** Reports a finished or stopped run, then re-reads the deal: a partial failure says what was kept. */
  const finishOp = async (result: OpResult, success: string, dealId: string): Promise<boolean> => {
    closeModals()
    showToast(result.ok ? success : partialFailureMessage(result), result.ok ? 'success' : 'error')
    await readDeal(dealId)
    await refreshIndex()
    return result.ok
  }

  const confirmReverse = async () => {
    if (!deal) return
    setBusy(true)
    try {
      const result = await reverseMoConfirmation(deal.dealId, { resume: reverseResume === deal.dealId })
      const done = await finishOp(result, 'MO confirmation reversed; the Deal ID is Created again.', deal.dealId)
      setReverseResume(!done && result.steps.some((s) => s.status === 'done') ? deal.dealId : null)
    } catch (error) {
      closeModals()
      showToast(messageOf(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  /* ---------- Edit Deal Pair ---------- */

  const selectedLeg = deal?.legs.find((l) => l.rfha === selected) ?? null

  const openEditPair = async () => {
    if (!selectedLeg) return
    setPair({ candidates: [], loading: true, error: null })
    setModal('editPair')
    try {
      const ref = await loadReplacementReference({ bukrs: selectedLeg.bukrs, rfha: selectedLeg.rfha })
      setPair({ candidates: await loadReplacementCandidates(ref), loading: false, error: null })
    } catch (error) {
      setPair({ candidates: [], loading: false, error: messageOf(error) })
    }
  }

  const applyEditPair = async (newRfha: string) => {
    if (!deal || !selectedLeg) return
    const next = pair.candidates.find((c) => c.rfha === newRfha)
    if (!next) return
    setBusy(true)
    try {
      const result = await replaceDealTransaction({
        dealId: deal.dealId,
        slot: selectedLeg.dealType,
        oldTxn: { bukrs: selectedLeg.bukrs, rfha: selectedLeg.rfha },
        newTxn: { bukrs: next.bukrs, rfha: next.rfha },
        dealDesc: deal.dealDesc,
        mcRef: deal.mcRef,
      })
      if (await finishOp(result, `Transaction ${next.rfha} replaces ${selectedLeg.rfha} in ${selectedLeg.dealType}.`, deal.dealId)) setSelected(null)
    } catch (error) {
      closeModals()
      showToast(messageOf(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  /* ---------- Change / Confirm ---------- */

  /** Calculates the plan and P&L for the Deal ID (and the chosen Master Contract) and shows them; nothing is saved yet. */
  const openConfirm = async (mcRef = '') => {
    if (!deal) return
    setConfirmState({ loading: true, reason: null, prepared: null })
    setModal('confirm')
    try {
      const result = await prepareConfirmation(deal.dealId, deal.legs, mcRef)
      setConfirmState(result.ok ? { loading: false, reason: null, prepared: result } : { loading: false, reason: result.reason, prepared: null })
    } catch (error) {
      setConfirmState({ loading: false, reason: messageOf(error), prepared: null })
    }
  }

  const applyConfirm = async () => {
    if (!deal || !confirmState.prepared) return
    setBusy(true)
    try {
      const result = await confirmPrepared(confirmState.prepared)
      await finishOp(result, `Deal ID ${deal.dealId} confirmed.`, deal.dealId)
    } catch (error) {
      closeModals()
      showToast(messageOf(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mo-confirm-fx-deal-id">
      <div className="app">
        {/* ============ PAGE HEADER ============ */}
        <div className="page-header">
          <img className="logo-img" src={FS_SHORT_LOGO} alt="FS logo" />
          <div className="header-text">
            <h1>Confirm FX Deal ID</h1>
            <p>Treasury &amp; Trade Finance &middot; Middle Office &middot; Single Deal ID</p>
          </div>
          <div className="header-actions">
            <BackButton className="btn btn-secondary" />
            <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => void refresh()}>
              &#8635; Refresh
            </button>
            <SignOutButton className="btn btn-secondary" />
          </div>
        </div>

        <main>
          {/* ============ DEAL SELECTION ============ */}
          <section className="card">
            <div className="card-head">
              <h2>Deal Selection</h2>
              <span className="hint">Enter a Deal ID to load its FX legs and invoice plan</span>
            </div>
            <div className="card-body">
              <div className="selection-row">
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor={inputId}>Deal ID</label>
                  <input
                    id={inputId}
                    list={listId}
                    placeholder="Deal ID"
                    autoComplete="off"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void loadDeal(searchText)
                    }}
                  />
                  <datalist id={listId}>
                    {index.map((d) => (
                      <option key={d.dealId} value={d.dealId} />
                    ))}
                  </datalist>
                  {searchErr !== null && <div className="err-msg">{searchErr}</div>}
                </div>
                <button type="button" className="btn btn-primary" disabled={loading} onClick={() => void loadDeal(searchText)}>
                  {loading ? 'Loading…' : 'Load Deal'}
                </button>
                <ViewDealsButton onClick={() => setPickerOpen(true)} />
                {deal && (
                  <button type="button" className="btn btn-secondary" onClick={clearDeal}>
                    Clear
                  </button>
                )}
              </div>
            </div>
            <div className="quick-picks">
              {index.slice(0, QUICK_PICKS).map((d) => (
                <div
                  key={d.dealId}
                  className="quick-pick"
                  onClick={() => {
                    setSearchText(d.dealId)
                    void loadDeal(d.dealId)
                  }}
                >
                  {quickPickLabel(d)}
                </div>
              ))}
            </div>

            {deal && <DealDetails deal={deal} />}
          </section>

          {/* ============ WORK AREA ============ */}
          {deal && vis && (
            <section id="workArea">
              {/* Toolbar / Actions */}
              <div className="card toolbar">
                <div>
                  <h3 style={{ margin: 0 }}>FX Deals</h3>
                  <span className="table-note">
                    {legs.length} leg{legs.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="toolbar-actions">
                  {vis.upd && (
                    <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void openConfirm()}>
                      Change / Confirm
                    </button>
                  )}
                  {vis.ssDeal && (
                    <button type="button" className="btn btn-primary" disabled title={GAPS.ssDeal}>
                      Confirm &amp; Save SS Deal ID
                    </button>
                  )}
                  {vis.dealEdit && (
                    <button type="button" className="btn btn-secondary" disabled={busy || !selectedLeg} title={selectedLeg ? undefined : 'Select the leg to replace first'} onClick={() => void openEditPair()}>
                      Edit Deal Pair
                    </button>
                  )}
                  <button type="button" className="btn btn-secondary" disabled title={GAPS.premium}>
                    Premium Adjustment
                  </button>
                  <button type="button" className="btn btn-secondary" disabled title={GAPS.dms}>
                    DMS
                  </button>
                  {(vis.rev || reverseResume === deal.dealId) && (
                    <button type="button" className="btn btn-danger" disabled={busy} onClick={() => setModal('reverse')}>
                      Reverse MO Confirmation
                    </button>
                  )}
                  {vis.can && (
                    <button type="button" className="btn btn-danger" disabled={busy} onClick={() => setModal('cancelDeal')}>
                      Cancel Deal ID
                    </button>
                  )}
                </div>
              </div>
              <div className="inline-alert info" id="sapGapNote">
                Greyed-out actions need services that are not available yet. Hover one for the reason.
              </div>
              {deal.subType === 'FX2' && <div className="inline-alert info">{GAPS.options}</div>}

              {/* FX Deals table */}
              <div className="card">
                <div className="table-toolbar">
                  <input
                    className="search-mini"
                    placeholder="Search deal legs..."
                    value={fxSearch}
                    onChange={(e) => setFxSearch(e.target.value)}
                  />
                  <span className="table-note">{legNote(selected)}</span>
                </div>
                <FxLegTable
                  legs={legs}
                  mcRef={deal.mcRef}
                  sort={sort}
                  selected={selected}
                  onSort={(key: SortKey) => setSort((s) => nextSort(s, key))}
                  onSelect={selectLeg}
                />
              </div>

              {!deal.noInv && <InvoiceTable rows={deal.invoices} />}
              {!deal.noInv && <PlTable deal={deal} />}
            </section>
          )}

          {/* Empty state */}
          {!deal && (
            <div className="empty-state">
              <div className="icon">&#128269;</div>
              <h3>No deal loaded</h3>
              <p>Search for a Deal ID above, or pick one of the quick-access deals to see its FX legs and invoice plan.</p>
            </div>
          )}
        </main>
      </div>

      {pickerOpen ? (
        <DealPickerModal
          columns={['Deal ID', 'Status']}
          rows={index.map((d) => ({ dealId: d.dealId, cells: [d.dealId, statusMeta(d.status).desc], text: `${d.dealId} ${statusMeta(d.status).desc}` }))}
          onClose={() => setPickerOpen(false)}
          onPick={(id) => {
            setPickerOpen(false)
            setSearchText(id)
            void loadDeal(id)
          }}
        />
      ) : null}

      {/* ============ MODAL OVERLAY ============ */}
      <div
        className={modal && deal ? 'modal-overlay' : 'modal-overlay hidden'}
        onClick={(e) => {
          if (e.target === e.currentTarget && !busy) closeModals()
        }}
      >
        {deal && modal === 'confirm' && (
          <ConfirmModal
            loading={confirmState.loading}
            reason={confirmState.reason}
            preview={confirmState.prepared ? previewOf(confirmState.prepared) : null}
            busy={busy}
            onChangeMc={(mc) => void openConfirm(mc)}
            onConfirm={() => void applyConfirm()}
            onClose={closeModals}
          />
        )}
        {deal && selectedLeg && modal === 'editPair' && (
          <EditPairModal
            slot={selectedLeg.dealType}
            bukrs={selectedLeg.bukrs}
            oldRfha={selectedLeg.rfha}
            candidates={pair.candidates}
            loading={pair.loading}
            error={pair.error}
            busy={busy}
            onApply={(rfha) => void applyEditPair(rfha)}
            onClose={closeModals}
          />
        )}
      </div>

      {/* Outcome / confirmation popups carry their own overlay (shared ResultDialog). */}
      {deal && modal === 'reverse' && (
        <PromptModal
          title="Reverse MO Confirmation"
          icon="warn"
          message={`The Deal ID goes back to Created and its saved invoice references are deleted. Treasury transactions are not reversed.${deal.dealId === reverseResume ? ' A previous attempt stopped part-way; this finishes it.' : ''}`}
          noLabel="No"
          yesLabel="Yes, Reverse"
          yesClass="btn-danger"
          busy={busy}
          onYes={() => void confirmReverse()}
          onClose={closeModals}
        />
      )}
      {deal && modal === 'cancelDeal' && (
        <PromptModal
          title="Cancel Deal ID"
          icon="warn"
          message="FX Deal ID will be deassigned completely. Do you want to confirm?"
          noLabel="No"
          yesLabel="Yes, Cancel Deal ID"
          yesClass="btn-danger"
          busy={busy}
          onYes={() => void confirmCancelDeal()}
          onClose={closeModals}
        />
      )}

      <ResultQueue items={results} onDismiss={dismissResult} />

      {toast && (
        <div key={toast.id} id="toast" className={toast.type === 'error' ? 'toast toast-error' : 'toast'}>
          {/* One text node, as the page's innerHTML was, so the flex gap does not split it. */}
          {(toast.type === 'success' ? '✓ ' : toast.type === 'error' ? '⚠ ' : '') + toast.msg}
        </div>
      )}
    </div>
  )
}

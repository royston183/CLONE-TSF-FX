import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { FS_SHORT_LOGO } from '../../shared/fx/logo.ts'
import { isAbort } from '../../shared/fx/mw.ts'
import { cancelDeal, loadDeal as loadDealFromSap, loadDealIndex, type DealIndexEntry, type LoadedDeal } from './api.ts'
import { GAPS } from './data.ts'
import { DealDetails } from './DetailTables.tsx'
import { FxLegTable } from './FxLegTable.tsx'
import { actionVisibility, legNote, nextSort, quickPickLabel, resolveDealId, sortedFilteredLegs, toggleLeg } from './logic.ts'
import { PromptModal } from './Modals.tsx'
import { InvoiceTable, PlTable } from './PlanTables.tsx'
import './mo-confirm-fx-deal-id.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './mo-confirm-fx-deal-id.dark.css'
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
export default function MoConfirmFxDealId() {
  const [index, setIndex] = useState<readonly DealIndexEntry[]>([])
  const [loaded, setLoaded] = useState<LoadedDeal | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  const [searchText, setSearchText] = useState('')
  const [searchErr, setSearchErr] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [fxSearch, setFxSearch] = useState('')
  const [sort, setSort] = useState<Sort>({ key: null, dir: 1 })
  const [modal, setModal] = useState<ModalId | null>(null)

  const [toast, setToast] = useState<Toast | null>(null)
  const toastSeq = useRef(0)
  const toastTimers = useRef(new Set<ReturnType<typeof setTimeout>>())

  const listId = useId()
  const inputId = useId()

  useEffect(() => {
    const timers = toastTimers.current
    return () => timers.forEach(clearTimeout)
  }, [])

  /** One toast at a time: a new one replaces the old, and each clears itself after 3.2 s. */
  const showToast = (msg: string, type: ToastType) => {
    const id = ++toastSeq.current
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
                    <button type="button" className="btn btn-primary" disabled title={GAPS.confirm}>
                      Change / Confirm
                    </button>
                  )}
                  {vis.ssDeal && (
                    <button type="button" className="btn btn-primary" disabled title={GAPS.ssDeal}>
                      Confirm &amp; Save SS Deal ID
                    </button>
                  )}
                  {vis.dealEdit && (
                    <button type="button" className="btn btn-secondary" disabled title={GAPS.editPair}>
                      Edit Deal Pair
                    </button>
                  )}
                  <button type="button" className="btn btn-secondary" disabled title={GAPS.premium}>
                    Premium Adjustment
                  </button>
                  <button type="button" className="btn btn-secondary" disabled title={GAPS.dms}>
                    DMS
                  </button>
                  {vis.rev && (
                    <button type="button" className="btn btn-danger" disabled title={GAPS.reverse}>
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
                SAP gap: the greyed-out actions cannot run on the services registered today. Hover one for the reason.
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

      {/* ============ MODAL OVERLAY ============ */}
      <div
        className={modal && deal ? 'modal-overlay' : 'modal-overlay hidden'}
        onClick={(e) => {
          if (e.target === e.currentTarget && !busy) closeModals()
        }}
      >
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
      </div>

      {toast && (
        <div key={toast.id} id="toast" className={toast.type === 'error' ? 'toast toast-error' : 'toast'}>
          {/* One text node, as the page's innerHTML was, so the flex gap does not split it. */}
          {(toast.type === 'success' ? '✓ ' : toast.type === 'error' ? '⚠ ' : '') + toast.msg}
        </div>
      )}
    </div>
  )
}

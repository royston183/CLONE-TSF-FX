import { Fragment, useEffect, useMemo, useState } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import './fo-create-deal-id-manually.legacy.css'
// eslint-disable-next-line import/no-duplicates -- scoped dark-mode overrides, loaded after the base stylesheet so its rules win
import './fo-create-deal-id-manually.dark.css'
import { ChangeModal } from './ChangeModal.tsx'
import { CreateModal } from './CreateModal.tsx'
import { DealPickerModal } from './DealPickerModal.tsx'
import { EditPairModal } from './EditPairModal.tsx'
import { PremiumModal } from './PremiumModal.tsx'
import { TxnModal } from './TxnModal.tsx'
import { isAbort } from '../../shared/fx/mw.ts'
import { useStatusPopup, type StatusOptions } from '../../shared/popup/Popup.tsx'
import { createDealId, loadWorkbench, type Workbench } from './api.ts'
import { dealStatusLabel, money } from './format.ts'
import {
  derivePnlRows,
  filterFxRows,
  filterInvoiceRows,
  filterPnlRows,
  findMc,
  nextSort,
  paginate,
  sortFxRows,
  sortInvoiceRows,
  sortPnlRows,
  txnByRfha,
  unique,
} from './logic.ts'
import type { Deal, FxRow, MasterContract, PoolTxn, SortState, Toast } from './types.ts'

const FX_COLUMNS: Array<{ key: keyof FxRow; label: string; num?: boolean }> = [
  { key: 'dealType', label: 'Deal Type' },
  { key: 'bukrs', label: 'CoCode' },
  { key: 'rfha', label: 'Transaction' },
  { key: 'sfhaart', label: 'Product Type' },
  { key: 'start', label: 'Start Date' },
  { key: 'end', label: 'End Date' },
  { key: 'text', label: 'Text' },
  { key: 'entity', label: 'Entity' },
  { key: 'side1', label: 'Side 1' },
  { key: 'curr1', label: 'Curr 1' },
  { key: 'amt1', label: 'Amount 1', num: true },
  { key: 'side2', label: 'Side 2' },
  { key: 'curr2', label: 'Curr 2' },
  { key: 'amt2', label: 'Amount 2', num: true },
  { key: 'spot', label: 'Spot', num: true },
  { key: 'swap', label: 'Swap', num: true },
  { key: 'allIn', label: 'All in Rate', num: true },
  { key: 'mcRef', label: 'MC Ref No' },
  { key: 'txnStatus', label: 'Txn Status' },
]

const INV_COLUMNS: Array<{ key: string; label: string; num?: boolean }> = [
  { key: 'tradeType', label: 'Trade Type' },
  { key: 'dealType', label: 'Deal Type' },
  { key: 'sell', label: 'Sell' },
  { key: 'buy', label: 'Buy' },
  { key: 'currency', label: 'Invoice Currency' },
  { key: 'amount', label: 'Invoice Amount (USD)', num: true },
  { key: 'exchangeRate', label: 'Exchange Rate', num: true },
  { key: 'invAmount', label: 'Inv Amount', num: true },
  { key: 'invTrmNo', label: 'Inv TRM Ref No' },
  { key: 'mcPurchase', label: 'MC Ref Purchase' },
  { key: 'mcSale', label: 'MC Ref Sale' },
]

const PNL_COLUMN_LABEL = 'Type'

function Pager({ page, pages, kind, onPage }: { page: number; pages: number; kind: string; onPage: (p: number) => void }) {
  const nums = Array.from({ length: Math.min(pages, 5) }, (_, i) => i + 1)
  return (
    <div className="pager">
      <button className="page-btn" type="button" disabled={page === 1} onClick={() => onPage(Math.max(1, page - 1))}>
        ‹
      </button>
      {nums.map((p) => (
        <button key={p} className={`page-btn${p === page ? ' active' : ''}`} type="button" onClick={() => onPage(p)}>
          {p}
        </button>
      ))}
      <button className="page-btn" type="button" disabled={page === pages} onClick={() => onPage(Math.min(pages, page + 1))}>
        ›
      </button>
    </div>
  )
}

/**
 * The workbench on the data read from SAP. Changes made here that have no write path yet (Change /
 * Confirm, Edit Deal Pair, the invoice rates) stay on the screen; Create Deal ID is real, and
 * reloads everything from the sources afterwards.
 */
function WorkbenchScreen({
  data,
  startDealId,
  onReload,
  showStatus,
}: {
  data: Workbench
  startDealId: string
  onReload: (dealId: string) => void
  /** The outcome popup; owned by the page so it survives the reload that follows a create. */
  showStatus: (opts: StatusOptions) => void
}) {
  const [deals, setDeals] = useState<Record<string, Deal>>(data.deals)
  const [masterContracts] = useState<MasterContract[]>(data.masterContracts)
  const pool = data.pool
  const firstDealId = startDealId && data.deals[startDealId] ? startDealId : (Object.keys(data.deals)[0] ?? '')
  const [currentDealId, setCurrentDealId] = useState(firstDealId)
  const [dealLookup, setDealLookup] = useState(firstDealId)
  const [creating, setCreating] = useState(false)
  const [selectedFxIndex, setSelectedFxIndex] = useState(-1)
  const [dragOver, setDragOver] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])

  const [fxSearch, setFxSearch] = useState('')
  const [fxEntity, setFxEntity] = useState('')
  const [fxType, setFxType] = useState('')
  const [fxSort, setFxSort] = useState<SortState<string>>({ key: 'rfha', dir: 1 })
  const [fxPage, setFxPage] = useState(1)

  const [invSearch, setInvSearch] = useState('')
  const [invTrade, setInvTrade] = useState('')
  const [invSort, setInvSort] = useState<SortState<string>>({ key: 'tradeType', dir: 1 })
  const [invPage, setInvPage] = useState(1)

  const [pnlSearch, setPnlSearch] = useState('')
  const [pnlSort, setPnlSort] = useState<SortState<string>>({ key: 'type', dir: 1 })
  const [pnlPage, setPnlPage] = useState(1)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [txnRow, setTxnRow] = useState<FxRow | null>(null)
  const [changeOpen, setChangeOpen] = useState(false)
  const [premiumOpen, setPremiumOpen] = useState(false)
  const [editPairOpen, setEditPairOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  const deal = deals[currentDealId]

  const toast = (message: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, message, kind }])
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2900)
  }

  const loadDeal = (id: string) => {
    if (!deals[id]) {
      toast('Select a valid Deal ID.', 'error')
      return
    }
    setCurrentDealId(id)
    setDealLookup(id)
    setSelectedFxIndex(-1)
    setFxPage(1)
    setInvPage(1)
    setPnlPage(1)
    setFxSearch('')
    setFxEntity('')
    setFxType('')
    setInvSearch('')
    setInvTrade('')
    setPnlSearch('')
  }

  const fxRows = useMemo(() => (deal ? sortFxRows(filterFxRows(deal.fxRows, fxSearch, fxEntity, fxType), fxSort) : []), [deal, fxSearch, fxEntity, fxType, fxSort])
  const fxMeta = paginate(fxRows, fxPage, 8)

  const invRows = useMemo(() => (deal ? sortInvoiceRows(filterInvoiceRows(deal.invoices, invSearch, invTrade), invSort) : []), [deal, invSearch, invTrade, invSort])
  const invMeta = paginate(invRows, invPage, 8)

  const pnlAll = useMemo(() => (deal ? derivePnlRows(deal.invoices) : []), [deal])
  const pnlRows = useMemo(() => sortPnlRows(filterPnlRows(pnlAll, pnlSearch), pnlSort), [pnlAll, pnlSearch, pnlSort])
  const pnlMeta = paginate(pnlRows, pnlPage, 8)

  const fxEntities = useMemo(() => (deal ? unique(deal.fxRows.map((r) => r.entity)) : []), [deal])
  const fxTypes = useMemo(() => (deal ? unique(deal.fxRows.map((r) => r.dealType)) : []), [deal])
  const invTrades = useMemo(() => (deal ? unique(deal.invoices.map((r) => r.tradeType)) : []), [deal])

  const updateDeal = (id: string, fn: (d: Deal) => Deal) => {
    setDeals((prev) => ({ ...prev, [id]: fn(prev[id]!) }))
  }

  const confirmDeal = (mcRef: string): string => {
    if (!deal) return ''
    const blocked = deal.fxRows.find((r) => r.rfha && Number(r.txnStatus || 0) < 7)
    if (blocked) return `Transaction ${blocked.rfha} is below status 07.`
    const mc = findMc(masterContracts, mcRef)
    updateDeal(deal.id, (d) => ({
      ...d,
      mcRef,
      mcDesc: mc ? mc.desc : d.mcDesc,
      mcDate: mc ? mc.mcDate : d.mcDate,
      shipEnd: mc ? mc.shipEnd : d.shipEnd,
      fxModel: mc ? mc.model : d.fxModel,
      entityString: mc ? mc.entity : d.entityString,
      currencyString: mc ? mc.currency : d.currencyString,
      status: '02',
      fxRows: d.fxRows.map((r) => (r.rfha ? { ...r, mcRef } : r)),
      invoices: d.invoices.map((r) => ({ ...r, mcPurchase: mcRef, mcSale: mcRef })),
    }))
    setChangeOpen(false)
    toast('Deal Confirmed Successfully', 'success')
    return ''
  }

  const updateDealPair = (newRfha: string) => {
    if (!deal) return
    const replacement = txnByRfha(pool, newRfha)
    updateDeal(deal.id, (d) => ({
      ...d,
      fxRows: d.fxRows.map((r, idx) => {
        if (idx !== selectedFxIndex) return r
        if (replacement) {
          return {
            ...r,
            rfha: replacement.rfha,
            bukrs: replacement.bukrs,
            entity: replacement.entity,
            start: replacement.start,
            end: replacement.end,
            side1: replacement.side1,
            curr1: replacement.curr1,
            amt1: replacement.amt1,
            side2: replacement.side2,
            curr2: replacement.curr2,
            amt2: replacement.amt2,
          }
        }
        return { ...r, rfha: '3100099999' }
      }),
    }))
    setEditPairOpen(false)
    toast('Deal pair updated in the demo.', 'success')
  }

  /**
   * Creates the Deal ID in SAP's tables (number drawn from the range, MC moved to In Use) and then
   * reloads the screen from them, opened on the new Deal ID. It stops the dialog from being
   * submitted twice while the number is being drawn.
   */
  const createDeal = async (mc: MasterContract, a: PoolTxn, b: PoolTxn) => {
    if (creating) return
    setCreating(true)
    try {
      const { dealId } = await createDealId(mc, a, b)
      setCreateOpen(false)
      showStatus({ tone: 'success', title: 'Deal ID Created', message: `Created Deal ID ${dealId}.`, refLabel: 'Deal ID', refValue: dealId })
      onReload(dealId)
    } catch (error) {
      showStatus({ tone: 'error', title: 'Deal ID Not Created', message: error instanceof Error ? error.message : String(error) })
    } finally {
      setCreating(false)
    }
  }

  const calculateInvoices = () => {
    if (!deal) return
    updateDeal(deal.id, (d) => ({
      ...d,
      invoices: d.invoices.map((r) => ({ ...r, invAmount: r.amount * r.exchangeRate })),
    }))
    toast('Invoice amounts and planned P&L recalculated.', 'success')
  }

  const setInvoiceRate = (index: number, rate: number) => {
    if (!deal || Number.isNaN(rate)) return
    updateDeal(deal.id, (d) => ({ ...d, invoices: d.invoices.map((r, i) => (i === index ? { ...r, exchangeRate: rate } : r)) }))
  }

  const refreshAll = () => onReload(currentDealId)

  const selectedRow = deal && selectedFxIndex >= 0 ? deal.fxRows[selectedFxIndex] : null

  return (
    <div className="dealanal">
      <header className="topbar">
        <BackButton className="fx-back-btn" />
        <div className="brand-mark" aria-hidden="true">
          <i /><i /><i /><i />
        </div>
        <div className="title-wrap">
          <div className="page-title">Deal ID Analysis</div>
        </div>
        <div className="top-actions">
          <button className="btn primary" type="button" onClick={() => setCreateOpen(true)}>
            +&nbsp; Create Deal ID
          </button>
          <span className="live-dot" title="Workbench ready" />
          <button className="btn" type="button" disabled={!deal || deal.status === 'X'} onClick={() => setChangeOpen(true)}>
            Change / Confirm
          </button>
          <button className="btn" type="button" onClick={() => setPremiumOpen(true)}>
            Premium Adjustment
          </button>
          <button className="btn" type="button" disabled={selectedFxIndex < 0} onClick={() => setEditPairOpen(true)}>
            Edit Deal Pair
          </button>
          <button className="btn" type="button" onClick={refreshAll}>
            Refresh
          </button>
          <SignOutButton className="btn ghost" />
        </div>
      </header>

      <main>
        <section className="card" id="selectionCard">
          <div className="card-head">
            <div className="card-title">Selection Criteria</div>
            <div className="record-count">Select a Deal ID to load the analysis</div>
          </div>
          <div className="selection-body">
            <div className="selection-grid">
              <div className="field selection-field">
                <label>Deal ID<span className="req">*</span></label>
                <div className="lookup-wrap">
                  <input
                    className="input"
                    list="dealOptions"
                    placeholder="Type Deal ID"
                    value={dealLookup}
                    onChange={(e) => setDealLookup(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && loadDeal(dealLookup.trim())}
                  />
                  <datalist id="dealOptions">
                    {Object.values(deals).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.description}
                      </option>
                    ))}
                  </datalist>
                  <button className="view-deals-btn" type="button" title="Search and select a Deal ID" onClick={() => setPickerOpen(true)}>
                    View Deals
                  </button>
                </div>
              </div>
              <div className="selection-note">Type a Deal ID and press Enter, or use View Deals to search and select.</div>
            </div>
          </div>
        </section>

        {deal ? (
          <>
            <section className="card" id="basicCard">
              <div className="card-head">
                <div className="card-title">Basic Details</div>
                <div className="record-count">{deal.status === '02' ? 'Confirmed Deal ID' : deal.status === 'X' ? 'Status X Deal ID' : 'Created Deal ID'}</div>
              </div>
              <div className="basic-grid">
                <div className="basic-row row-primary">
                  <div className="field">
                    <label>Deal ID Reference / Description</label>
                    <input className="input" readOnly value={`${deal.ref}  ·  ${deal.description}`} />
                  </div>
                  <div className="field">
                    <label>Deal Start Date</label>
                    <input className="input" readOnly value={deal.startDate} />
                  </div>
                  <div className="field">
                    <label>Deal End Date</label>
                    <input className="input" readOnly value={deal.endDate} />
                  </div>
                  <div className="field">
                    <label>Deal ID Status</label>
                    <select className="select" disabled value={deal.status}>
                      <option value="01">01 - Created</option>
                      <option value="02">02 - Confirmed</option>
                      <option value="X">X - Status X</option>
                    </select>
                  </div>
                </div>
                <div className="basic-row row-contract">
                  <div className="field">
                    <label>MC Ref No</label>
                    <input className="input" readOnly value={deal.mcRef} />
                  </div>
                  <div className="field">
                    <label>MC Description</label>
                    <input className="input" readOnly value={deal.mcDesc} />
                  </div>
                  <div className="field">
                    <label>MC Date</label>
                    <input className="input" readOnly value={deal.mcDate} />
                  </div>
                  <div className="field">
                    <label>Ship End Date</label>
                    <input className="input" readOnly value={deal.shipEnd} />
                  </div>
                  <div className="field">
                    <label>FX Model ID</label>
                    <input className="input" readOnly value={deal.fxModel} />
                  </div>
                </div>
                <div className="basic-row row-structure">
                  <div className="field">
                    <label>Entity String</label>
                    <input className="input" readOnly value={deal.entityString} />
                  </div>
                  <div className="field">
                    <label>Currency String</label>
                    <input className="input" readOnly value={deal.currencyString} />
                  </div>
                  <div className="field">
                    <label>Trader</label>
                    <select className="select" disabled value={deal.trader}>
                      <option>{deal.trader}</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Trader Code</label>
                    <input className="input" readOnly value={deal.traderCode} />
                  </div>
                </div>
              </div>
            </section>

            <section className="card work-section">
              <div className="card-head">
                <div>
                  <span className="card-title">FX Deals</span>
                  <span className="record-count">{fxMeta.total} records</span>
                </div>
                <div className="head-spacer" />
                <div className="section-tools">
                  <input className="toolbar-input" placeholder="Search FX deals..." value={fxSearch} onChange={(e) => (setFxSearch(e.target.value.toLowerCase()), setFxPage(1))} />
                  <select className="compact-select" value={fxEntity} onChange={(e) => (setFxEntity(e.target.value), setFxPage(1))}>
                    <option value="">All entities</option>
                    {fxEntities.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <select className="compact-select" value={fxType} onChange={(e) => (setFxType(e.target.value), setFxPage(1))}>
                    <option value="">All deal types</option>
                    {fxTypes.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn ghost"
                    type="button"
                    onClick={() => {
                      setFxSearch('')
                      setFxEntity('')
                      setFxType('')
                      setFxSort({ key: 'rfha', dir: 1 })
                      setFxPage(1)
                      setSelectedFxIndex(-1)
                    }}
                  >
                    Reset
                  </button>
                </div>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th className="check-cell" />
                      {FX_COLUMNS.map((c) => (
                        <th
                          key={c.key}
                          className={`sortable${c.num ? ' num' : ''}`}
                          onClick={() => setFxSort((s) => nextSort(s, c.key))}
                        >
                          {c.label} ↕
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fxMeta.rows.map((r) => {
                      const idx = deal.fxRows.indexOf(r)
                      const selected = idx === selectedFxIndex
                      return (
                        <tr
                          key={`${r.rfha}-${idx}`}
                          draggable={!!r.rfha}
                          className={selected ? 'selected' : ''}
                          onDragStart={() => {
                            if (!r.rfha) return
                            setSelectedFxIndex(idx)
                          }}
                          onClick={() => r.rfha && setSelectedFxIndex(idx)}
                        >
                          <td className="check-cell">
                            <input className="row-check" type="checkbox" disabled={!r.rfha} checked={selected} onChange={() => r.rfha && setSelectedFxIndex(idx)} onClick={(e) => e.stopPropagation()} />
                          </td>
                          <td className="deal-type-accent">{r.dealType}</td>
                          <td>{r.bukrs}</td>
                          <td>
                            {r.rfha ? (
                              <span
                                className="hotspot"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setTxnRow(r)
                                }}
                              >
                                {r.rfha}
                              </span>
                            ) : null}
                          </td>
                          <td>{r.sfhaart}</td>
                          <td>{r.start}</td>
                          <td>{r.end}</td>
                          <td>{r.text}</td>
                          <td>{r.entity}</td>
                          <td>{r.side1}</td>
                          <td>{r.curr1}</td>
                          <td className="num">{money(r.amt1)}</td>
                          <td>{r.side2}</td>
                          <td>{r.curr2}</td>
                          <td className="num">{money(r.amt2)}</td>
                          <td className="num">{r.spot === '' ? '' : money(r.spot, 4)}</td>
                          <td className="num">{r.swap === '' ? '' : money(r.swap, 4)}</td>
                          <td className="num">{r.allIn === '' ? '' : money(r.allIn, 4)}</td>
                          <td>{r.mcRef}</td>
                          <td>{r.txnStatus}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {fxMeta.total === 0 ? <div className="empty-state" style={{ display: 'block' }}>No FX deals match the current search or filters.</div> : null}
              </div>
              <div className="card-foot">
                <span>
                  {fxMeta.total ? `Showing ${fxMeta.start + 1}–${Math.min(fxMeta.start + 8, fxMeta.total)} of ${fxMeta.total}` : 'Showing 0 of 0'}
                </span>
                <Pager page={fxMeta.page} pages={fxMeta.pages} kind="fx" onPage={setFxPage} />
              </div>
            </section>

            <section
              className="card work-section"
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                if (selectedFxIndex >= 0) setEditPairOpen(true)
              }}
              style={dragOver ? { boxShadow: '0 0 0 3px rgba(10,110,209,.13)' } : undefined}
            >
              <div className="card-head">
                <div>
                  <span className="card-title">Deal ID: Planned Trade Invoices</span>
                  <span className="record-count">{invMeta.total} records</span>
                </div>
                <div className="head-spacer" />
                <div className="section-tools">
                  <input className="toolbar-input" placeholder="Search planned invoices..." value={invSearch} onChange={(e) => (setInvSearch(e.target.value.toLowerCase()), setInvPage(1))} />
                  <select className="compact-select" value={invTrade} onChange={(e) => (setInvTrade(e.target.value), setInvPage(1))}>
                    <option value="">All trade types</option>
                    {invTrades.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn ghost"
                    type="button"
                    onClick={() => {
                      setInvSearch('')
                      setInvTrade('')
                      setInvSort({ key: 'tradeType', dir: 1 })
                      setInvPage(1)
                    }}
                  >
                    Reset
                  </button>
                  <button className="btn primary" type="button" onClick={calculateInvoices}>
                    Calculate
                  </button>
                </div>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th className="check-cell" />
                      {INV_COLUMNS.map((c) => (
                        <th key={c.key} className={`sortable${c.num ? ' num' : ''}`} onClick={() => setInvSort((s) => nextSort(s, c.key))}>
                          {c.label} ↕
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {invMeta.rows.map((r) => {
                      const idx = deal.invoices.indexOf(r)
                      return (
                        <tr key={r.invTrmNo}>
                          <td className="check-cell">
                            <input className="row-check" type="checkbox" />
                          </td>
                          <td>{r.tradeType}</td>
                          <td className="deal-type-accent">{r.dealType}</td>
                          <td>{r.sell}</td>
                          <td>{r.buy}</td>
                          <td>{r.currency}</td>
                          <td className="num">{money(r.amount)}</td>
                          <td className="num">
                            <input
                              className="calc-input"
                              defaultValue={r.exchangeRate.toFixed(4)}
                              onBlur={(e) => {
                                // Rates carry four decimals: round what was typed and show it that way.
                                const rate = Number(e.target.value)
                                if (Number.isNaN(rate)) return
                                e.target.value = rate.toFixed(4)
                                setInvoiceRate(idx, Number(rate.toFixed(4)))
                              }}
                            />
                          </td>
                          <td className="num">{money(r.invAmount)}</td>
                          <td>{r.invTrmNo}</td>
                          <td>{r.mcPurchase}</td>
                          <td>{r.mcSale}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {invMeta.total === 0 ? <div className="empty-state" style={{ display: 'block' }}>No planned invoices match the current search or filters.</div> : null}
              </div>
              <div className="card-foot">
                <span>{invMeta.total ? `Showing ${invMeta.start + 1}–${Math.min(invMeta.start + 8, invMeta.total)} of ${invMeta.total}` : 'Showing 0 of 0'}</span>
                <Pager page={invMeta.page} pages={invMeta.pages} kind="inv" onPage={setInvPage} />
              </div>
            </section>

            <section className="card work-section">
              <div className="card-head">
                <div>
                  <span className="card-title">Deal ID: Planned P&amp;L</span>
                  <span className="record-count">{pnlMeta.total} records</span>
                </div>
                <div className="head-spacer" />
                <div className="section-tools">
                  <input className="toolbar-input" placeholder="Search P&amp;L..." value={pnlSearch} onChange={(e) => (setPnlSearch(e.target.value.toLowerCase()), setPnlPage(1))} />
                  <button
                    className="btn ghost"
                    type="button"
                    onClick={() => {
                      setPnlSearch('')
                      setPnlSort({ key: 'type', dir: 1 })
                      setPnlPage(1)
                    }}
                  >
                    Reset
                  </button>
                </div>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th className="check-cell" />
                      <th className="sortable" onClick={() => setPnlSort((s) => nextSort(s, 'type'))}>
                        {PNL_COLUMN_LABEL} ↕
                      </th>
                      {['T1', 'T2', 'T3'].map((t, i) => (
                        <Fragment key={t}>
                          <th className="sortable num" onClick={() => setPnlSort((s) => nextSort(s, `famt${i + 1}`))}>
                            {t} Foreign Amount ↕
                          </th>
                          <th className="sortable num" onClick={() => setPnlSort((s) => nextSort(s, `lamt${i + 1}`))}>
                            {t} Local Amount ↕
                          </th>
                        </Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pnlMeta.rows.map((r) => {
                      const isPct = r.type === 'P&L Orign(%)'
                      return (
                        <tr key={r.type}>
                          <td className="check-cell">
                            <input className="row-check" type="checkbox" />
                          </td>
                          <td className={r.type === 'P&L' || isPct ? 'deal-type-accent' : ''}>{r.type}</td>
                          <td className="num">{isPct ? `${money(r.famt1)}%` : money(r.famt1)}</td>
                          <td className="num">{isPct ? `${money(r.lamt1)}%` : money(r.lamt1)}</td>
                          <td className="num">{isPct ? `${money(r.famt2)}%` : money(r.famt2)}</td>
                          <td className="num">{isPct ? `${money(r.lamt2)}%` : money(r.lamt2)}</td>
                          <td className="num">{isPct ? `${money(r.famt3)}%` : money(r.famt3)}</td>
                          <td className="num">{isPct ? `${money(r.lamt3)}%` : money(r.lamt3)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {pnlMeta.total === 0 ? <div className="empty-state" style={{ display: 'block' }}>No P&amp;L rows match the current search.</div> : null}
              </div>
              <div className="card-foot">
                <span>{pnlMeta.total ? `Showing ${pnlMeta.start + 1}–${Math.min(pnlMeta.start + 8, pnlMeta.total)} of ${pnlMeta.total}` : 'Showing 0 of 0'}</span>
                <Pager page={pnlMeta.page} pages={pnlMeta.pages} kind="pnl" onPage={setPnlPage} />
              </div>
            </section>
          </>
        ) : null}
      </main>

      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.message}
          </div>
        ))}
      </div>

      {pickerOpen ? (
        <DealPickerModal
          deals={deals}
          onClose={() => setPickerOpen(false)}
          onPick={(id) => {
            setPickerOpen(false)
            loadDeal(id)
          }}
        />
      ) : null}
      {txnRow ? <TxnModal row={txnRow} onClose={() => setTxnRow(null)} /> : null}
      {changeOpen && deal ? <ChangeModal deal={deal} masterContracts={masterContracts} onClose={() => setChangeOpen(false)} onConfirm={confirmDeal} /> : null}
      {premiumOpen && deal ? <PremiumModal premium={deal.premium} onClose={() => setPremiumOpen(false)} /> : null}
      {editPairOpen && selectedRow ? <EditPairModal row={selectedRow} pool={pool} onClose={() => setEditPairOpen(false)} onUpdate={updateDealPair} /> : null}
      {createOpen ? <CreateModal masterContracts={masterContracts} pool={pool} onClose={() => setCreateOpen(false)} onCreate={createDeal} /> : null}
    </div>
  )
}

type State = { phase: 'loading' } | { phase: 'error'; message: string } | { phase: 'ready'; data: Workbench }

/**
 * FO: Create Deal ID Manually (ZSGTSFR079). The Master Contracts, Deal IDs and the Treasury
 * transactions come from SAP, so the workbench opens once they have loaded. A failed read is shown
 * with a Retry; no stand-in contracts or transactions are ever offered, since a Deal ID created
 * against them would be written to the real tables.
 */
export default function FoCreateDealIdManually() {
  const [load, setLoad] = useState({ attempt: 0, dealId: '' })
  const [state, setState] = useState<State>({ phase: 'loading' })
  const status = useStatusPopup()

  useEffect(() => {
    const ctl = new AbortController()
    setState({ phase: 'loading' })
    loadWorkbench(ctl.signal)
      .then((data) => {
        if (!ctl.signal.aborted) setState({ phase: 'ready', data })
      })
      .catch((error: unknown) => {
        if (ctl.signal.aborted || isAbort(error)) return
        setState({ phase: 'error', message: error instanceof Error ? error.message : String(error) })
      })
    return () => ctl.abort()
  }, [load])

  if (state.phase === 'ready') {
    return (
      <>
        <WorkbenchScreen
          key={load.attempt}
          data={state.data}
          startDealId={load.dealId}
          onReload={(dealId) => setLoad((l) => ({ attempt: l.attempt + 1, dealId }))}
          showStatus={status.show}
        />
        {status.element}
      </>
    )
  }
  return (
    <div className="dealanal" style={{ minHeight: '100vh', padding: 24 }}>
      {status.element}
      {state.phase === 'loading' ? (
        <div role="status">Loading Master Contracts, Deal IDs and transactions…</div>
      ) : (
        <div role="alert">
          <p>{state.message}</p>
          <p>The workbench needs these to open. Nothing has been substituted for them.</p>
          <button className="btn primary" type="button" onClick={() => setLoad((l) => ({ attempt: l.attempt + 1, dealId: '' }))}>
            Retry
          </button>
        </div>
      )}
    </div>
  )
}

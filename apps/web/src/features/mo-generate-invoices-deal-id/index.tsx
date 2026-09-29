import { useMemo, useState } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import './mo-generate-invoices-deal-id.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './mo-generate-invoices-deal-id.dark.css'
import { BankModal } from './BankModal.tsx'
import { BlModal } from './BlModal.tsx'
import { ComplianceModal } from './ComplianceModal.tsx'
import { ConfirmModal } from './ConfirmModal.tsx'
import { DateCell } from './DateCell.tsx'
import { DealLookupModal } from './DealLookupModal.tsx'
import { DiffModal } from './DiffModal.tsx'
import { RemarkModal } from './RemarkModal.tsx'
import { TxnModal } from './TxnModal.tsx'
import { DEFAULT_DEAL_ID, INITIAL_DEALS } from './data.ts'
import { money, parseNum, statusText, validDMY } from './format.ts'
import { computeInvoiceConfirmation, getDealUsdAmount, getInvoiceUsdAmount, hasRollover, invSearchText, paginate, recalcInvoiceRow, searchRows, sortRows } from './logic.ts'
import type { ConfirmDialogState, Deal, DealStatus, FxRow, InvRow, Sort, Toast } from './types.ts'

const FX_COLS: Array<{ key: keyof FxRow; label: string; num?: number }> = [
  { key: 'dealType', label: 'Deal Type' },
  { key: 'roll', label: 'Roll Deal Type' },
  { key: 'bukrs', label: 'CoCode' },
  { key: 'bp', label: 'Business Partner' },
  { key: 'rfha', label: 'Transaction No' },
  { key: 'start', label: 'Start Date' },
  { key: 'end', label: 'End Date' },
  { key: 'entity', label: 'Entity' },
  { key: 'bs1', label: 'Side 1' },
  { key: 'curr1', label: 'Crcy 1' },
  { key: 'amt1', label: 'Amount 1', num: 2 },
  { key: 'bs2', label: 'Side 2' },
  { key: 'curr2', label: 'Crcy 2' },
  { key: 'amt2', label: 'Amount 2', num: 2 },
  { key: 'allIn', label: 'All in Rate', num: 9 },
  { key: 'strike', label: 'Strike', num: 9 },
  { key: 'mc', label: 'MC Ref No' },
  { key: 'txn', label: 'Txn Status' },
]

const INV_COLS: Array<{ key: string; label: string }> = [
  { key: 'ttype', label: 'Trade Type' },
  { key: 'invType', label: 'Inv Type' },
  { key: 'seller', label: 'Seller' },
  { key: 'buyer', label: 'Buyer' },
  { key: 'bp', label: 'Business Partner' },
  { key: 'bank', label: 'Partner Bank' },
  { key: 'assign', label: 'Assign House Bank' },
  { key: 'invDate', label: 'Invoice Date' },
  { key: 'dueDate', label: 'Due Date' },
  { key: 'commodity', label: 'Invoice Commodity' },
  { key: 'gtComm', label: 'GT Commodity ID' },
  { key: 'qty', label: 'Quantity' },
  { key: 'usdPrice', label: 'Price (USD)' },
  { key: 'rate', label: 'Exchange Rate' },
  { key: 'price', label: 'Price' },
  { key: 'amt', label: 'Final Inv Amt' },
  { key: 'amtUsd', label: 'Inv Amt (USD)' },
  { key: 'planned', label: 'Planned Inv Amt' },
  { key: 'invNo', label: 'Invoice No' },
  { key: 'pc', label: 'P/C' },
]

const PAGE_SIZE = 8

function Pager({ page, pages, onGo }: { page: number; pages: number; onGo: (p: number) => void }) {
  const nums = Array.from({ length: Math.min(pages, 5) }, (_, i) => i + 1)
  return (
    <div className="pager">
      <button className="page-btn" type="button" disabled={page <= 1} onClick={() => onGo(page - 1)}>
        ‹
      </button>
      {nums.map((p) => (
        <button key={p} className={`page-btn${p === page ? ' active' : ''}`} type="button" onClick={() => onGo(p)}>
          {p}
        </button>
      ))}
      <button className="page-btn" type="button" disabled={page >= pages} onClick={() => onGo(page + 1)}>
        ›
      </button>
    </div>
  )
}

export default function MoGenerateInvoicesDealId() {
  const [deals, setDeals] = useState<Record<string, Deal>>(INITIAL_DEALS)
  const [dealId, setDealId] = useState(DEFAULT_DEAL_ID)
  const [dealLookupInput, setDealLookupInput] = useState(DEFAULT_DEAL_ID)

  const [fxSearch, setFxSearch] = useState('')
  const [invSearch, setInvSearch] = useState('')
  const [fxSort, setFxSort] = useState<Sort<string>>({ key: 'dealType', dir: 1 })
  const [invSort, setInvSort] = useState<Sort<string>>({ key: 'ttype', dir: 1 })
  const [fxPage, setFxPage] = useState(1)
  const [invPage, setInvPage] = useState(1)
  const [selectedFx, setSelectedFx] = useState(-1)
  const [selectedInv, setSelectedInv] = useState(-1)
  const [amendMode, setAmendMode] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])

  const [dealLookupOpen, setDealLookupOpen] = useState(false)
  const [txnRow, setTxnRow] = useState<FxRow | null>(null)
  const [confirmState, setConfirmState] = useState<ConfirmDialogState | null>(null)
  const [pendingInvoiceStatus, setPendingInvoiceStatus] = useState<DealStatus>('05')
  const [complianceOpen, setComplianceOpen] = useState(false)
  const [blOpen, setBlOpen] = useState(false)
  const [blVersion, setBlVersion] = useState(0)
  const [remarkBlIndex, setRemarkBlIndex] = useState(-1)
  const [diffOpen, setDiffOpen] = useState(false)
  const [bankRow, setBankRow] = useState(-1)

  const deal = deals[dealId] ?? null

  const toast = (message: string, kind: Toast['kind'] = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, message, kind }])
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200)
  }

  const updateDeal = (fn: (d: Deal) => Deal) => {
    setDeals((prev) => ({ ...prev, [dealId]: fn(prev[dealId]!) }))
  }

  const selectDeal = (id: string) => {
    setDealId(id)
    setDealLookupInput(id)
    setFxSearch('')
    setInvSearch('')
    setFxPage(1)
    setInvPage(1)
    setSelectedFx(-1)
    setSelectedInv(-1)
    setAmendMode(false)
  }

  const loadTypedDeal = (value: string) => {
    const id = value.trim()
    if (!id) {
      setDealId('')
      return
    }
    if (deals[id]) {
      selectDeal(id)
      return
    }
    toast(`Deal ID ${id} was not found. Use View Deals to search.`, 'warn')
  }

  const refreshAll = () => {
    setDeals(INITIAL_DEALS)
    setDealId('')
    setDealLookupInput('')
    setFxSearch('')
    setInvSearch('')
    setFxPage(1)
    setInvPage(1)
    setSelectedFx(-1)
    setSelectedInv(-1)
    setAmendMode(false)
    setMoreOpen(false)
    toast('Workbench refreshed to its initial state.', 'info')
  }

  const fxRows = useMemo(() => (deal ? sortRows(searchRows(deal.fx, fxSearch, FX_COLS.map((c) => c.key)), fxSort) : []), [deal, fxSearch, fxSort])
  const fxMeta = paginate(fxRows, fxPage, PAGE_SIZE)

  const invRows = useMemo(() => {
    if (!deal) return []
    const rows = fxSearchInv(deal.inv, invSearch)
    return sortRows(rows, invSort)
  }, [deal, invSearch, invSort])
  const invMeta = paginate(invRows, invPage, PAGE_SIZE)

  function fxSearchInv(rows: InvRow[], q: string): InvRow[] {
    if (!q) return rows
    const u = q.toUpperCase()
    return rows.filter((r) => INV_COLS.some((c) => String(invSearchText(r, c.key)).toUpperCase().indexOf(u) >= 0))
  }

  const amendable = deal ? deal.status === '05' || deal.status === '07' : false
  const canConfirmInvoice = !!deal && !deal.dm && deal.status === '04'
  const rollover = hasRollover(deal)

  const calculateInvoices = (showMessage: boolean) => {
    if (!deal) return
    updateDeal((d) => ({ ...d, inv: d.inv.map(recalcInvoiceRow) }))
    if (showMessage) toast('Adjusted Price / Qty recalculated.', 'info')
  }

  const initiateInvoiceConfirmation = () => {
    if (!deal) return
    calculateInvoices(false)
    const fresh = deals[dealId]!
    const { status, message } = computeInvoiceConfirmation(fresh)
    const dealAmt = getDealUsdAmount(fresh)
    const invAmt = getInvoiceUsdAmount(fresh)
    setPendingInvoiceStatus(status)
    setConfirmState({
      title: 'Generate Invoice',
      text: message,
      note: `FX Deal Amount: USD ${money(dealAmt, 2)} • Invoice Amount: USD ${money(invAmt, 2)}`,
      yesLabel: 'Yes',
      onYes: () => {
        setConfirmState(null)
        setComplianceOpen(true)
      },
    })
  }

  const saveInvoice = () => {
    if (!deal) return
    const base = 9000051200
    updateDeal((d) => ({
      ...d,
      status: pendingInvoiceStatus,
      inv: d.inv.map((r, i) => ({ ...r, invNo: r.invNo || String(base + i + 1), pc: pendingInvoiceStatus === '07' ? 'P' : 'C', locked: true })),
    }))
    setAmendMode(false)
    setComplianceOpen(false)
    toast('SAP GT Invoice Data Updated Successfully')
  }

  const cancelInvoice = () => {
    if (!deal) return
    setConfirmState({
      title: 'Cancel TRM Invoice',
      text: 'Do you really want to cancel the invoice?',
      note: `Deal ID ${deal.dealId}`,
      yesLabel: 'Yes',
      onYes: () => {
        updateDeal((d) => ({ ...d, status: '04', inv: d.inv.map((r) => ({ ...r, invNo: '', pc: '', locked: false })) }))
        setAmendMode(false)
        setConfirmState(null)
        toast('TRM Invoice has been canceled successfully.', 'warn')
      },
    })
  }

  const toggleAmendDeal = () => {
    if (!deal) return
    const next: DealStatus = deal.status === '05' ? '07' : '05'
    setConfirmState({
      title: 'Amend Deal Status',
      text: `Deal ID ${deal.dealId} status will change to ${statusText(next)}.`,
      note: 'This action mirrors the source-proven amendment status toggle.',
      yesLabel: 'Yes',
      onYes: () => {
        updateDeal((d) => ({ ...d, status: next }))
        setConfirmState(null)
        toast(`Deal status amended to ${statusText(next)}.`, 'info')
      },
    })
  }

  const enableAmendment = () => {
    setAmendMode(true)
    setMoreOpen(false)
    toast('Amendment mode enabled: Invoice Date and Price (USD) are editable.', 'info')
  }

  const confirmAmendment = () => {
    if (!deal) return
    updateDeal((d) => ({ ...d, inv: d.inv.map((r) => ({ ...r, locked: true })) }))
    setAmendMode(false)
    setMoreOpen(false)
    toast(`Amendment confirmed for Deal ID ${deal.dealId}.`)
  }

  const saveInitial = () => {
    if (!deal) return
    setMoreOpen(false)
    toast(`Initial invoice data saved for Deal ID ${deal.dealId}.`)
  }

  const recalcUpdate = () => {
    setMoreOpen(false)
    calculateInvoices(false)
    toast('Invoice values recalculated and updated.')
  }

  const letter = (kind: string) => {
    if (!deal) return
    setMoreOpen(false)
    toast(`${kind} letter prepared for Deal ID ${deal.dealId}.`, 'info')
  }

  const setInvField = (index: number, edit: string, rawValue: string) => {
    if (!deal) return
    if (edit === 'invDate') {
      if (!validDMY(rawValue)) {
        toast('Use a valid date in dd-mm-yyyy format.', 'error')
        return
      }
      updateDeal((d) => ({ ...d, inv: d.inv.map((r, i) => (i === index ? { ...r, invDate: rawValue } : r)) }))
      return
    }
    const n = parseNum(rawValue)
    if (Number.isNaN(n) || n < 0) {
      toast('Enter a valid non-negative number.', 'error')
      return
    }
    updateDeal((d) => ({ ...d, inv: d.inv.map((r, i) => (i === index ? recalcInvoiceRow({ ...r, [edit]: n }) : r)) }))
  }

  const openBank = (index: number) => setBankRow(index)
  const saveBank = (houseBank: string, accountId: string, partnerBank: string) => {
    updateDeal((d) => ({ ...d, inv: d.inv.map((r, i) => (i === bankRow ? { ...r, houseBank, accountId, partnerBank } : r)) }))
    setBankRow(-1)
    toast('House Bank / Partner Bank updated.')
  }

  const openDeassign = (index: number) => setRemarkBlIndex(index)
  const saveRemark = (remark: string) => {
    updateDeal((d) => ({ ...d, bl: d.bl.map((b, i) => (i === remarkBlIndex ? { ...b, status: 'De-assigned', remark, invType: '', invDate: '' } : b)) }))
    setRemarkBlIndex(-1)
    setBlVersion((v) => v + 1)
    toast('BL de-assigned and status updated.')
  }

  const nextFxSort = (key: keyof FxRow) => setFxSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }))
  const nextInvSort = (key: string) => setInvSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }))

  const canEditInvRow = (r: InvRow) => (!r.locked && Number(deal?.status) <= 4) || amendMode

  return (
    <div className="invblotter">
      <div className="app">
        <header className="topbar">
          <div className="top-left">
            <BackButton className="back-btn" />
            <div className="brand-mark" aria-label="FourthSignal">
              <span className="b1" />
              <span className="b2" />
              <span className="b3" />
              <span className="b4" />
            </div>
            <div className="title-wrap">
              <div className="app-title">Invoice Finalisation Blotter</div>
            </div>
          </div>
          <div className="top-right">
            <button className="hdr-btn primary" type="button" disabled={!canConfirmInvoice} onClick={initiateInvoiceConfirmation}>
              <svg viewBox="0 0 24 24">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span>Confirm Invoice</span>
            </button>
            <span className="live-dot" title="Workbench active" />
            <button className="hdr-btn" type="button" disabled={!deal || deal.dm} onClick={() => setBlOpen(true)}>
              <svg viewBox="0 0 24 24">
                <path d="M4 5h16v14H4zM4 9h16M8 5v14" />
              </svg>
              <span>View BLs</span>
            </button>
            <button className="hdr-btn" type="button" disabled={!deal} onClick={() => setDiffOpen(true)}>
              <svg viewBox="0 0 24 24">
                <path d="M4 19h16M6 16l4-5 3 2 5-7" />
              </svg>
              <span>Invoice Difference</span>
            </button>
            <button className="hdr-btn" type="button" onClick={refreshAll}>
              <svg viewBox="0 0 24 24">
                <path d="M20 6v5h-5M19 11a7 7 0 10.2 4" />
              </svg>
              <span>Refresh</span>
            </button>
            <div className="more-wrap">
              <button className="icon-btn" type="button" title="More actions" onClick={() => setMoreOpen((v) => !v)}>
                <span style={{ fontSize: 18, lineHeight: 1 }}>⋯</span>
              </button>
              <div className={`more-menu${moreOpen ? ' open' : ''}`}>
                <button className="more-item" type="button" disabled={!deal} onClick={saveInitial}>
                  Save Initial Data
                </button>
                <button className="more-item" type="button" disabled={!deal} onClick={recalcUpdate}>
                  Re-calculate &amp; Update
                </button>
                <button className="more-item" type="button" disabled={!deal || !amendable} onClick={enableAmendment}>
                  Amendment
                </button>
                <button className="more-item" type="button" disabled={!deal || !amendable || !amendMode} onClick={confirmAmendment}>
                  Amendment Confirm
                </button>
                <button className="more-item" type="button" disabled={!deal || !amendable || !rollover} onClick={toggleAmendDeal}>
                  Amend Deal Status
                </button>
                <button className="more-item" type="button" disabled={!deal || !(Number(deal?.status) > 4)} onClick={() => letter('Import')}>
                  Import Letter
                </button>
                <button className="more-item" type="button" disabled={!deal || !(Number(deal?.status) > 4)} onClick={() => letter('Export')}>
                  Export Letter
                </button>
                <button className="more-item danger" type="button" disabled={!deal} onClick={cancelInvoice}>
                  Cancel TRM Invoice
                </button>
              </div>
            </div>
            <SignOutButton className="hdr-btn" />
          </div>
        </header>

        <main className="workspace">
          <section className="card context-card selection-card">
            <div className="section-head">
              <div className="section-title">Selection Criteria</div>
              <div className="section-meta">Select a Deal ID to load invoice data</div>
            </div>
            <div className="selection-grid">
              <div className="field">
                <label>
                  Deal ID <span className="req">*</span>
                </label>
                <div className="deal-picker">
                  <input
                    className="control"
                    list="dealOptions"
                    placeholder="Type / select Deal ID..."
                    autoComplete="off"
                    value={dealLookupInput}
                    onChange={(e) => setDealLookupInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && loadTypedDeal(dealLookupInput)}
                  />
                  <datalist id="dealOptions">
                    {Object.values(deals).map((d) => (
                      <option key={d.dealId} value={d.dealId}>
                        {`${d.entityString} — ${statusText(d.status)}`}
                      </option>
                    ))}
                  </datalist>
                  <button className="view-deals-btn" type="button" onClick={() => setDealLookupOpen(true)}>
                    View Deals
                  </button>
                </div>
              </div>
              <div className="selection-note">Type a Deal ID and press Enter, or use View Deals to search and select.</div>
            </div>
          </section>

          <section className="card context-card" id="basicCard">
            <div className="section-head">
              <div className="section-title">Basic Details</div>
              <div className="section-meta">{deal ? `Deal ${deal.dealId} • ${statusText(deal.status)} • Tolerance ${money(deal.tolerance, 2)}%` : 'Select a Deal ID to load invoice data'}</div>
            </div>
            <div className="basic-grid">
              <div className="basic-row row-deal">
                <div className="field">
                  <label>Deal ID Reference</label>
                  <input className="control readonly" disabled value={deal?.dealRef ?? ''} />
                </div>
                <div className="field">
                  <label>Deal Start Date</label>
                  <div className="date-value">{deal?.dealStart ?? '—'}</div>
                </div>
                <div className="field">
                  <label>Deal End Date</label>
                  <div className="date-value">{deal?.dealEnd ?? '—'}</div>
                </div>
                <div className="field">
                  <label>Deal ID Status</label>
                  <select className="control status-control" disabled value={deal?.status ?? ''}>
                    {deal ? <option value={deal.status}>{statusText(deal.status)}</option> : null}
                  </select>
                </div>
              </div>

              <div className="basic-row row-contract">
                <div className="field">
                  <label>MC Ref No</label>
                  <input className="control readonly" disabled value={deal?.mcRef ?? ''} />
                </div>
                <div className="field">
                  <label>MC Description</label>
                  <input className="control readonly" disabled value={deal?.mcDesc ?? ''} />
                </div>
                <div className="field">
                  <label>MC Date</label>
                  <div className="date-value">{deal?.mcDate ?? '—'}</div>
                </div>
                <div className="field">
                  <label>Ship Start Date</label>
                  <div className="date-value">{deal?.shipStart ?? '—'}</div>
                </div>
                <div className="field">
                  <label>Ship End Date</label>
                  <div className="date-value">{deal?.shipEnd ?? '—'}</div>
                </div>
              </div>

              <div className="basic-row row-structure">
                <div className="field">
                  <label>Entity String</label>
                  <input className="control readonly" disabled value={deal?.entityString ?? ''} />
                </div>
                <div className="field">
                  <label>Currency String</label>
                  <input className="control readonly" disabled value={deal?.currencyString ?? ''} />
                </div>
                <div className="field">
                  <label>Trader</label>
                  <input className="control readonly" disabled value={deal?.trader ?? ''} />
                </div>
                <div className="field">
                  <label>Trader Name</label>
                  <input className="control readonly" disabled value={deal?.traderDesc ?? ''} />
                </div>
                <div className="field">
                  <label>FX Model ID</label>
                  <input className="control readonly" disabled value={deal?.modelId ?? ''} />
                </div>
                <div className="field">
                  <label>FX Inv Model</label>
                  <input className="control readonly" disabled value={deal?.fxInvModel ?? ''} />
                </div>
              </div>

              <div className="basic-row row-model">
                <div className="field">
                  <label>Model Description</label>
                  <input className="control readonly" disabled value={deal?.modelDesc ?? ''} />
                </div>
              </div>
            </div>
          </section>

          <div className="tables">
            <section className="card table-card">
              <div className="table-toolbar">
                <div className="table-title">
                  FX Deals <span className="count">{fxMeta.total} records</span>
                </div>
                <div className="toolbar-tools">
                  <input
                    className="search"
                    placeholder="Search FX deals..."
                    disabled={!deal}
                    value={fxSearch}
                    onChange={(e) => {
                      setFxSearch(e.target.value)
                      setFxPage(1)
                    }}
                  />
                </div>
              </div>
              <div className="grid-wrap">
                {!deal ? (
                  <div className="empty">Select a Deal ID to view FX deals.</div>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th className="select-cell" />
                        {FX_COLS.map((c) => (
                          <th key={c.key} className={`sortable${fxSort.key === c.key ? (fxSort.dir === 1 ? ' sorted-asc' : ' sorted-desc') : ''}`} onClick={() => nextFxSort(c.key)}>
                            {c.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {fxMeta.rows.map((r) => {
                        const idx = deal.fx.indexOf(r)
                        const selected = idx === selectedFx
                        return (
                          <tr
                            key={r.rfha}
                            draggable
                            className={selected ? 'selected' : ''}
                            onClick={() => setSelectedFx(idx)}
                            onDoubleClick={() => setTxnRow(r)}
                            onDragStart={(e) => {
                              setSelectedFx(idx)
                              e.dataTransfer.setData('text/plain', `fx:${idx}`)
                            }}
                          >
                            <td className="select-cell">
                              <input className="row-check" type="checkbox" checked={selected} onChange={() => setSelectedFx(idx)} onClick={(e) => e.stopPropagation()} />
                            </td>
                            {FX_COLS.map((c) => {
                              if (c.key === 'rfha')
                                return (
                                  <td key={c.key}>
                                    <span
                                      className="link"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setTxnRow(r)
                                      }}
                                    >
                                      {r.rfha}
                                    </span>
                                  </td>
                                )
                              if (c.key === 'txn')
                                return (
                                  <td key={c.key}>
                                    <span className="status-text status-ok">{r.txn}</span>
                                  </td>
                                )
                              const val = r[c.key]
                              return (
                                <td key={c.key} className={c.num != null ? 'num' : undefined}>
                                  {c.num != null ? money(val as number, c.num) : String(val)}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="table-footer">
                <span>{fxMeta.total ? `Showing ${fxMeta.start + 1}–${Math.min(fxMeta.start + PAGE_SIZE, fxMeta.total)} of ${fxMeta.total}` : 'Showing 0 of 0'}</span>
                <Pager page={fxMeta.page} pages={fxMeta.pages} onGo={setFxPage} />
              </div>
            </section>

            <section className="card table-card">
              <div className="table-toolbar">
                <div className="table-title">
                  Adjusted Price / Qty <span className="count">{invMeta.total} records</span>
                </div>
                <div className="toolbar-tools">
                  <input
                    className="search"
                    placeholder="Search adjusted invoice..."
                    disabled={!deal}
                    value={invSearch}
                    onChange={(e) => {
                      setInvSearch(e.target.value)
                      setInvPage(1)
                    }}
                  />
                  <button className="small-btn primary" type="button" disabled={!deal} onClick={() => calculateInvoices(true)}>
                    <svg viewBox="0 0 24 24">
                      <path d="M5 4h14v16H5zM8 8h8M8 12h2M12 12h2M16 12h1M8 16h2M12 16h2M16 16h1" />
                    </svg>
                    Calculate
                  </button>
                </div>
              </div>
              <div className="grid-wrap">
                {!deal ? (
                  <div className="empty">Select a Deal ID to view adjusted price / quantity.</div>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th className="select-cell" />
                        {INV_COLS.map((c) =>
                          c.key === 'assign' ? (
                            <th key={c.key}>{c.label}</th>
                          ) : (
                            <th key={c.key} className={`sortable${invSort.key === c.key ? (invSort.dir === 1 ? ' sorted-asc' : ' sorted-desc') : ''}`} onClick={() => nextInvSort(c.key)}>
                              {c.label}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {invMeta.rows.map((r) => {
                        const idx = deal.inv.indexOf(r)
                        const selected = idx === selectedInv
                        const canEdit = canEditInvRow(r)
                        return (
                          <tr
                            key={`${r.ttype}-${idx}`}
                            draggable
                            className={selected ? 'selected' : ''}
                            onClick={() => setSelectedInv(idx)}
                            onDragStart={(e) => {
                              setSelectedInv(idx)
                              e.dataTransfer.setData('text/plain', `inv:${idx}`)
                            }}
                          >
                            <td className="select-cell">
                              <input className="row-check" type="checkbox" checked={selected} onChange={() => setSelectedInv(idx)} onClick={(e) => e.stopPropagation()} />
                            </td>
                            <td>{r.ttype}</td>
                            <td>{r.invType}</td>
                            <td>{r.seller}</td>
                            <td>{r.buyer}</td>
                            <td>{r.partnerBank || r.houseBank || '—'}</td>
                            <td>
                              <button
                                className="assign-btn"
                                type="button"
                                disabled={r.locked && !amendMode}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openBank(idx)
                                }}
                              >
                                Assign
                              </button>
                            </td>
                            <td className="editable-cell">
                              <DateCell value={r.invDate} disabled={!canEdit} onChange={(v) => setInvField(idx, 'invDate', v)} />
                            </td>
                            <td>{r.dueDate}</td>
                            <td>{r.commodity}</td>
                            <td>{r.gtComm}</td>
                            <td className="editable-cell">
                              <input className="cell-input" disabled={!canEdit} defaultValue={money(r.qty, 2)} onBlur={(e) => setInvField(idx, 'qty', e.target.value)} />
                            </td>
                            <td className="editable-cell">
                              <input className="cell-input" disabled={!canEdit} defaultValue={money(r.usdPrice, 9)} onBlur={(e) => setInvField(idx, 'usdPrice', e.target.value)} />
                            </td>
                            <td className="editable-cell">
                              <input className="cell-input" disabled={!canEdit || amendMode || !!r.partnerBank} defaultValue={money(r.rate, 9)} onBlur={(e) => setInvField(idx, 'rate', e.target.value)} />
                            </td>
                            <td className="num">{money(r.price, 9)}</td>
                            <td className="num">{money(r.amt, 2)}</td>
                            <td className="num">{money(r.amtUsd, 2)}</td>
                            <td className="num">{money(r.planned, 2)}</td>
                            <td>{r.invNo || '—'}</td>
                            <td>
                              <span className={`status-text ${r.pc === 'C' ? 'status-ok' : r.pc === 'P' ? 'status-warn' : 'status-info'}`}>{r.pc || '—'}</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="table-footer">
                <span>{invMeta.total ? `Showing ${invMeta.start + 1}–${Math.min(invMeta.start + PAGE_SIZE, invMeta.total)} of ${invMeta.total}` : 'Showing 0 of 0'}</span>
                <Pager page={invMeta.page} pages={invMeta.pages} onGo={setInvPage} />
              </div>
            </section>
          </div>
        </main>
      </div>

      <div className="toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'success' ? '' : t.kind}`}>
            {t.message}
          </div>
        ))}
      </div>

      {dealLookupOpen ? (
        <DealLookupModal
          deals={deals}
          onClose={() => setDealLookupOpen(false)}
          onPick={(id) => {
            setDealLookupOpen(false)
            selectDeal(id)
          }}
        />
      ) : null}
      {txnRow ? <TxnModal row={txnRow} onClose={() => setTxnRow(null)} /> : null}
      {confirmState ? <ConfirmModal state={confirmState} onClose={() => setConfirmState(null)} /> : null}
      {complianceOpen && deal ? <ComplianceModal resultingStatus={pendingInvoiceStatus} onClose={() => setComplianceOpen(false)} onProceed={saveInvoice} /> : null}
      {blOpen && deal ? <BlModal key={blVersion} rows={deal.bl} onClose={() => setBlOpen(false)} onDeassign={openDeassign} /> : null}
      {remarkBlIndex >= 0 ? <RemarkModal onClose={() => setRemarkBlIndex(-1)} onUpdate={saveRemark} /> : null}
      {diffOpen && deal ? <DiffModal deal={deal} onClose={() => setDiffOpen(false)} /> : null}
      {bankRow >= 0 && deal ? <BankModal row={deal.inv[bankRow]!} onClose={() => setBankRow(-1)} onUpdate={saveBank} /> : null}
    </div>
  )
}

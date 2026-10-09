import { useEffect, useState, type ReactNode } from 'react'
import { NDF_FIXING_API_MISSING, TXN, fixNdf, fixNdfAvailable } from '../../shared/fx/ndf.ts'
import { Dropdown, DateField } from './controls.tsx'
import { LOOKUPS } from './data.ts'
import { bookSpot, findDeal, findTxn, runExercise, runExpire, type Wb } from './flows.ts'
import { dmyToIso, formatAmount, formatDMY, formatRate, isoToDMY, numStr, parseDMY, parseNum } from './format.ts'
import {
  bpItemsForGroup,
  bpName,
  buildNdoSpot,
  calcCashSettlement,
  calcNdfSettlement,
  convertViaRate,
  decideExercise,
  defaultFixingRate,
  inSpotFor,
  invoiceAmountFor,
  leadCurr,
  marketRate,
  recalcSpotAmounts,
  setCoverTxn,
  spotRateFor,
  ssSpotFor,
  txnTypeText,
  updateTxnStatus,
} from './logic.ts'
import { Fld, InlineMsg, ModalFrame, type FrameProps, type PopupSpec } from './modal.tsx'
import type { SpotDraft, Txn } from './types.ts'

type Msg = { text: string; kind: 'error' | 'info' } | null

/** A rate box value -> the rate the amounts use: blank, invalid or negative counts as 0. */
const rateOf = (text: string) => {
  const r = parseNum(text)
  return isNaN(r) || r < 0 ? 0 : r
}
const rateText = (r: number) => (r ? r.toFixed(4) : '')
/** Rate boxes take at most four decimal places; a keystroke that would add a fifth is ignored. */
const overRateDp = (text: string) => /\.\d{5,}/.test(text)
const todayDmy = () => formatDMY(new Date())

function CoDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Dropdown
      items={LOOKUPS.companies}
      value={value}
      valueOf={(c) => c.code}
      primary={(c) => `${c.code} · ${c.name}`}
      display={(c) => `${c.code} - ${c.name}`}
      search={(c) => `${c.code} ${c.name}`}
      onChange={onChange}
    />
  )
}

function BpDropdown({ grp, value, onChange }: { grp: string; value: string; onChange: (v: string) => void }) {
  return (
    <Dropdown
      items={bpItemsForGroup(grp)}
      value={value}
      valueOf={(b) => b.bp}
      primary={(b) => b.name}
      secondary={(b) => b.bp}
      display={(b) => `${b.name} (${b.bp})`}
      search={(b) => `${b.bp} ${b.name}`}
      onChange={onChange}
    />
  )
}

/** One read-only currency leg: label, currency, buy/sell, amount. */
function Leg({ label, curr, bs, amt, note }: { label: string; curr: string; bs: string; amt: number; note?: string }) {
  return (
    <div className="pf-row leg">
      <div className="leg-label">{label}</div>
      <Fld label="Curr">
        <input className="control calc" readOnly value={curr} />
      </Fld>
      <Fld label="B/S">
        <input className="control calc" readOnly value={bs} />
      </Fld>
      <Fld
        label={
          <>
            Amount <span className="hint">{note ? `· ${note}` : ''}</span>
          </>
        }
      >
        <input className="control mono calc" readOnly value={numStr(amt)} />
      </Fld>
    </div>
  )
}

/** spotFormHtml: Co. Code, BP, optional Trade Date, the two legs and the Rate. */
function SpotForm({
  msg,
  sp,
  grp,
  co,
  bp,
  trade,
  rate,
  rateError,
  onCo,
  onBp,
  onTrade,
  onRate,
}: {
  msg: Msg
  sp: SpotDraft
  grp: string
  co: string
  bp: string
  trade: string | null
  rate: string
  rateError: string
  onCo: (v: string) => void
  onBp: (v: string) => void
  onTrade: (v: string) => void
  onRate: (v: string) => void
}) {
  return (
    <>
      <InlineMsg msg={msg} />
      <div className="pf-row c3">
        <Fld label="Co. Code" req>
          <CoDropdown value={co} onChange={onCo} />
        </Fld>
        <Fld label="BP" req>
          <BpDropdown grp={grp} value={bp} onChange={onBp} />
        </Fld>
        {trade !== null ? (
          <Fld label="Trade Date" req>
            <DateField value={trade} onCommit={onTrade} />
          </Fld>
        ) : (
          <div></div>
        )}
      </div>
      <Leg label="Currency 1" curr={sp.curr1} bs={sp.bs1} amt={sp.amt1} note={sp.invText1} />
      <Leg label="Currency 2" curr={sp.curr2} bs={sp.bs2} amt={sp.amt2} note={sp.invText2} />
      <div className="pf-row c3">
        <Fld label="Rate" req error={rateError}>
          <input className="control mono" inputMode="decimal" placeholder="0.0000" value={rate} onChange={(e) => { if (!overRateDp(e.target.value)) onRate(e.target.value) }} />
        </Fld>
      </div>
    </>
  )
}

const Buttons = ({ frame, label, onOk, okCls = 'btn-primary', disabled = false }: { frame: FrameProps; label: string; onOk: () => void; okCls?: string; disabled?: boolean }) => (
  <>
    <button type="button" className="btn btn-secondary" onClick={frame.onClose}>
      Cancel
    </button>
    <button type="button" className={`btn ${okCls}`} disabled={disabled} onClick={onOk}>
      {label}
    </button>
  </>
)

/* ---------------- Screen 9001 — Update Rate (Option Exercise / Expire) ---------------- */

export function RatePopup({ frame, spec, wb }: { frame: FrameProps; spec: Extract<PopupSpec, { kind: 'rate' }>; wb: Wb }) {
  const { ctx } = spec
  const data = wb.get()
  const txn = findTxn(data, ctx.rfha)
  const deal = findDeal(data, ctx.dealId)
  const [rate, setRate] = useState(() => {
    const r = txn ? marketRate(txn) : 0 /* gv_n_rate */
    return r ? r.toFixed(4) : ''
  })
  const [msg, setMsg] = useState<Msg>(null)
  if (!txn || !deal) return null
  const cash = txn.settlfl === '2'
  const r = isNaN(parseNum(rate)) ? 0 : parseNum(rate)
  const d = decideExercise(txn, r)

  const update = () => {
    const rv = parseNum(rate)
    if (!rv || isNaN(rv) || rv <= 0) {
      setMsg({ text: 'Please update the rate', kind: 'error' }) /* TEXT-009 */
      return
    }
    const decision = decideExercise(txn, rv)
    const inv = invoiceAmountFor(wb.get(), deal.id, txn.dealType)
    const hasInvoice = !!(inv && inv.fAmt)
    const cs = cash ? calcCashSettlement(txn, rv) : 0
    const go = () => {
      if (!wb.post(decision === 'Exercise' ? 'exercise' : 'expire')) return
      frame.onClose()
      if (decision === 'Exercise') runExercise(wb, ctx, txn, rv, cs)
      else runExpire(wb, ctx, txn, rv)
    }
    const warn = 'Invoice amount not saved for Spot creation.Do you want to continue ?' /* TEXT-105 */
    if (decision === 'Exercise') {
      if (deal.ss === 'X' || txn.settlfl === '1') go()
      else if (txn.settlfl === '2') {
        if (hasInvoice) go()
        else wb.confirm({ title: 'Option Exercise', message: warn }, go)
      } else go()
    } else if (deal.ss === 'X' || hasInvoice) go()
    else wb.confirm({ title: 'Option Expiry', message: warn }, go)
  }

  return (
    <ModalFrame
      frame={frame}
      title="Update Rate"
      sub={`Option ${txn.rfha} · ${txn.pc1 || ''} strike ${formatRate(txn.strike)}`}
      cls="sm-modal"
      actions={<Buttons frame={frame} label="Update" onOk={update} />}
    >
      <InlineMsg msg={msg} />
      <div className="pf-row c2">
        <Fld label="Cover No">
          <input className="control mono" readOnly value={txn.rfha} />
        </Fld>
        <Fld label="Current Market Rate" req>
          <input
            className="control mono"
            inputMode="decimal"
            placeholder="Enter rate"
            autoFocus
            value={rate}
            onFocus={(e) => e.target.select()}
            onChange={(e) => {
              if (overRateDp(e.target.value)) return
              setMsg(null)
              setRate(e.target.value)
            }}
          />
        </Fld>
      </div>
      <div className="pf-row c2">
        <Fld label="Outcome">
          <div className={`chip${d === 'Exercise' ? ' ok' : d === 'Expire' ? ' warn' : ''}`}>
            {d ? (d === 'Exercise' ? 'Option Exercised' : 'Option Expires') : '—'}
          </div>
        </Fld>
        {cash ? (
          <Fld label="Cash Settlement">
            <input className="control mono calc" readOnly value={d === 'Exercise' ? numStr(calcCashSettlement(txn, r)) : ''} />
          </Fld>
        ) : (
          <div></div>
        )}
      </div>
    </ModalFrame>
  )
}

/* ---------------- Screens 9003 / 9011 / 9012 — Create Spot ---------------- */

function initialSpot(wb: Wb, spec: Extract<PopupSpec, { kind: 'spot' }>, txn: Txn): SpotDraft {
  if (spec.variant === 'dndf') {
    /* PROCESS_DNDF_SPOT — cash currency against USD; sell/buy as the NDF cash amount is not negative */
    return recalcSpotAmounts({
      bukrs: txn.bukrs,
      curr1: txn.cashCurr || leadCurr(txn.curr1, txn.curr2).follow,
      bs1: 'Sell',
      amt1: Math.abs(txn.cashAmt || 0),
      curr2: 'USD',
      bs2: 'Buy',
      amt2: 0,
      rate: txn.ndfRate || 0,
      bp: txn.cpty,
      invText1: '',
      invText2: '',
      base: 1,
    })
  }
  const inv = invoiceAmountFor(wb.get(), spec.ctx.dealId, txn.dealType)
  const sp = buildNdoSpot(txn, { invoice: inv && inv.fAmt ? inv : null, rate: spec.rate })
  /* 9011: the rate is entered by the user */
  return spec.variant === 'ndf' ? recalcSpotAmounts({ ...sp, rate: 0 }) : sp
}

export function SpotPopup({ frame, spec, wb }: { frame: FrameProps; spec: Extract<PopupSpec, { kind: 'spot' }>; wb: Wb }) {
  const txn = findTxn(wb.get(), spec.ctx.rfha)
  const [sp, setSp] = useState<SpotDraft | null>(() => (txn ? initialSpot(wb, spec, txn) : null))
  const [co, setCo] = useState(sp?.bukrs ?? '')
  const [bp, setBp] = useState(sp?.bp ?? '')
  const [trade, setTrade] = useState(todayDmy)
  const [rate, setRate] = useState(rateText(sp?.rate ?? 0))
  const [rateError, setRateError] = useState('')
  const [msg, setMsg] = useState<Msg>(null)
  if (!txn || !sp) return null
  const showTrade = !txn.dealType /* group VIS hidden when a deal type exists */
  const variantText = spec.variant === 'ndo' ? 'Option settlement spot' : spec.variant === 'ndf' ? 'NDF settlement spot' : 'DNDF settlement spot'

  const create = () => {
    const errs: string[] = []
    if (!co) errs.push('Co. Code is required.')
    if (!bp) errs.push('BP is required.')
    if (showTrade && !parseDMY(trade)) errs.push('Enter a valid trade date (dd-mm-yyyy).')
    if (!sp.rate) {
      setRateError('Rate is required')
      errs.push('Rate is required.')
    }
    if (!sp.amt1 || !sp.amt2) errs.push('Amounts could not be derived – check the rate.')
    if (errs.length) {
      setMsg({ text: errs.join(' '), kind: 'error' })
      return
    }
    /* 9003 books through create_bapi (ORDERCREATE + ORDEREXECUTE); 9011 / 9012 through FXT_CREATE */
    if (!wb.post(spec.variant === 'ndo' ? 'spotOrder' : 'spotNdf')) return
    const rfha = bookSpot(wb, {
      dealId: spec.ctx.dealId,
      dealType: txn.dealType,
      sourceRfha: txn.rfha,
      bukrs: co,
      sfhaart: spec.sfhaart || '605',
      bs1: sp.bs1,
      curr1: sp.curr1,
      amt1: sp.amt1,
      bs2: sp.bs2,
      curr2: sp.curr2,
      amt2: sp.amt2,
      rate: sp.rate,
      bp,
      tradeDate: showTrade ? dmyToIso(trade) : '',
      text: 'Spot – settlement',
    })
    frame.onClose()
    wb.outcome({ tone: 'success', title: 'Spot Created', message: `Spot Transaction created Successfully: ${rfha}` })
  }

  return (
    <ModalFrame frame={frame} title="Create Spot" sub={`Transaction ${txn.rfha} · ${variantText}`} cls="md-modal" actions={<Buttons frame={frame} label="Create Spot" onOk={create} />}>
      <SpotForm
        msg={msg}
        sp={sp}
        grp={txn.grp}
        co={co}
        bp={bp}
        trade={showTrade ? trade : null}
        rate={rate}
        rateError={rateError}
        onCo={setCo}
        onBp={setBp}
        onTrade={setTrade}
        onRate={(v) => {
          setRate(v)
          setRateError('')
          setMsg(null)
          setSp(recalcSpotAmounts({ ...sp, rate: rateOf(v) }))
        }}
      />
    </ModalFrame>
  )
}

/* ---------------- Screen 9004 — short straddle spot (+ optional opposite spot) ---------------- */

type FwdDraft = { bukrs: string; bp: string; curr1: string; curr2: string; bs1: string; bs2: string; amt1: number; amt2: number; rate: number }

export function SsSpotPopup({ frame, spec, wb }: { frame: FrameProps; spec: Extract<PopupSpec, { kind: 'ssSpot' }>; wb: Wb }) {
  const txn = findTxn(wb.get(), spec.ctx.rfha)
  const [init] = useState(() => {
    if (!txn) return null
    const deal = findDeal(wb.get(), spec.ctx.dealId)
    const def = ssSpotFor(deal?.model ?? '', txn.sfhaart, txn.pc1)
    let sp: SpotDraft = {
      bukrs: txn.bukrs,
      bp: txn.cpty,
      curr1: def?.curr1 ?? '',
      curr2: def?.curr2 ?? '',
      bs1: def?.bs1 ?? '',
      bs2: def?.bs2 ?? '',
      amt1: 0,
      amt2: 0,
      rate: txn.strike,
      invText1: '',
      invText2: '',
      base: 1,
    }
    sp.amt1 = Math.abs(txn.curr1 === sp.curr1 ? txn.amt1 : txn.amt2)
    sp = recalcSpotAmounts(sp)
    const fwd: FwdDraft = { bukrs: sp.bukrs, bp: sp.bp, curr1: sp.curr1, curr2: sp.curr2, bs1: sp.bs2, bs2: sp.bs1, amt1: sp.amt1, amt2: sp.amt2, rate: 0 }
    if (fwd.curr1 === 'USD') fwd.amt1 = 0
    else if (fwd.curr2 === 'USD') fwd.amt2 = 0
    return { sp, fwd }
  })
  const [sp, setSp] = useState(init?.sp ?? null)
  const [fwd, setFwd] = useState(init?.fwd ?? null)
  const [co, setCo] = useState(init?.sp.bukrs ?? '')
  const [bp, setBp] = useState(init?.sp.bp ?? '')
  const [trade, setTrade] = useState(todayDmy)
  const [fwTrade, setFwTrade] = useState(todayDmy)
  const [rate, setRate] = useState(rateText(init?.sp.rate ?? 0))
  const [fwRate, setFwRate] = useState('')
  const [rateError, setRateError] = useState('')
  const [msg, setMsg] = useState<Msg>(null)
  if (!txn || !sp || !fwd) return null
  const showTrade = !txn.dealType

  /* fwdCalc: the non-USD side is fixed, the USD side follows the rate */
  const fwdCalc = (f: FwdDraft): FwdDraft => {
    const n = { ...f }
    if (n.curr1 === 'USD') {
      if (n.amt2 && n.rate) n.amt1 = n.amt2 / n.rate
    } else if (n.amt1 && n.rate) n.amt2 = n.amt1 / n.rate
    return n
  }

  const create = () => {
    const errs: string[] = []
    if (!co) errs.push('Co. Code is required.')
    if (!bp) errs.push('BP is required.')
    if (showTrade && !parseDMY(trade)) errs.push('Enter a valid trade date (dd-mm-yyyy).')
    if (!sp.rate) {
      setRateError('Rate is required')
      errs.push('Rate is required.')
    }
    if (errs.length) {
      setMsg({ text: errs.join(' '), kind: 'error' })
      return
    }
    if (!wb.post('spotOrder')) return
    const base = { dealId: spec.ctx.dealId, dealType: txn.dealType, sourceRfha: txn.rfha, sfhaart: spec.sfhaart || '605' }
    const made = [
      bookSpot(wb, {
        ...base,
        bukrs: co,
        bs1: sp.bs1,
        curr1: sp.curr1,
        amt1: sp.amt1,
        bs2: sp.bs2,
        curr2: sp.curr2,
        amt2: sp.amt2,
        rate: sp.rate,
        bp,
        tradeDate: showTrade ? dmyToIso(trade) : '',
        text: 'Spot – straddle settlement',
      }),
    ]
    if (fwd.amt1 && fwd.amt2) {
      /* opposite spot only when both amounts are filled */
      made.push(
        bookSpot(wb, {
          ...base,
          bukrs: fwd.bukrs,
          bs1: fwd.bs1,
          curr1: fwd.curr1,
          amt1: fwd.amt1,
          bs2: fwd.bs2,
          curr2: fwd.curr2,
          amt2: fwd.amt2,
          rate: fwd.rate,
          bp: fwd.bp,
          tradeDate: dmyToIso(fwTrade),
          text: 'Opposite spot',
        }),
      )
    }
    frame.onClose()
    wb.outcome({
      tone: 'success',
      title: 'Spot Created',
      message: `Spot Transaction created Successfully: ${made.join(', ')}`,
    })
  }

  return (
    <ModalFrame frame={frame} title="Create Spot" sub={`Short straddle · Transaction ${txn.rfha}`} cls="md-modal" actions={<Buttons frame={frame} label="Create Spot" onOk={create} />}>
      <SpotForm
        msg={msg}
        sp={sp}
        grp={txn.grp}
        co={co}
        bp={bp}
        trade={showTrade ? trade : null}
        rate={rate}
        rateError={rateError}
        onCo={setCo}
        onBp={setBp}
        onTrade={setTrade}
        onRate={(v) => {
          setRate(v)
          setRateError('')
          setSp(recalcSpotAmounts({ ...sp, rate: rateOf(v) }))
        }}
      />
      <div className="pf-block-title">Create Opp Spot</div>
      <div className="pf-row c3">
        <Fld label="Co Code">
          <input className="control calc" readOnly value={fwd.bukrs} />
        </Fld>
        <Fld label="BP">
          <input className="control calc" readOnly value={bpName(fwd.bp)} />
        </Fld>
        <Fld label="Trade Date">
          <DateField value={fwTrade} onCommit={setFwTrade} />
        </Fld>
      </div>
      <Leg label="Currency 1" curr={fwd.curr1} bs={fwd.bs1} amt={fwd.amt1} />
      <Leg label="Currency 2" curr={fwd.curr2} bs={fwd.bs2} amt={fwd.amt2} />
      <div className="pf-row c3">
        <Fld label="Rate">
          <input
            className="control mono"
            inputMode="decimal"
            placeholder="Optional – enter to create the opposite spot"
            value={fwRate}
            onChange={(e) => {
              if (overRateDp(e.target.value)) return
              setFwRate(e.target.value)
              setFwd(fwdCalc({ ...fwd, rate: rateOf(e.target.value) }))
            }}
          />
        </Fld>
      </div>
    </ModalFrame>
  )
}

/* ---------------- Screen 9005 — FX forward (short straddle) opposite spot ---------------- */

export function FwdSsSpotPopup({ frame, spec, wb }: { frame: FrameProps; spec: Extract<PopupSpec, { kind: 'fwdSsSpot' }>; wb: Wb }) {
  const txn = findTxn(wb.get(), spec.ctx.rfha)
  /* derive: fill whichever amount is still empty from the other and the rate */
  const derive = (s: SpotDraft): SpotDraft => {
    const n = { ...s }
    if (n.curr1 !== 'USD') {
      if (!n.amt2 && n.rate) n.amt2 = n.amt1 / n.rate
      else if (!n.amt1 && n.rate) n.amt1 = n.amt2 * n.rate
    } else if (!n.amt2 && n.rate) n.amt2 = n.amt1 * n.rate
    else if (!n.amt1 && n.rate) n.amt1 = n.amt2 / n.rate
    return n
  }
  const [sp, setSp] = useState<SpotDraft | null>(() => {
    if (!txn) return null
    const s: SpotDraft = {
      bukrs: txn.bukrs,
      bp: txn.cpty,
      curr1: txn.curr1,
      curr2: txn.curr2,
      amt1: Math.abs(txn.amt1),
      amt2: Math.abs(txn.amt2),
      bs1: txn.bs2,
      bs2: txn.bs1,
      rate: txn.rate,
      invText1: '',
      invText2: '',
      base: 1,
    }
    if (!txn.dealType || txn.dealType === '00') {
      if (s.curr1 === 'USD') {
        s.amt1 = 0
        s.rate = 0
      } else if (s.curr2 === 'USD') {
        s.amt2 = 0
        s.rate = 0
      }
    }
    return derive(s)
  })
  const [co, setCo] = useState(sp?.bukrs ?? '')
  const [bp, setBp] = useState(sp?.bp ?? '')
  const [trade, setTrade] = useState(todayDmy)
  const [rate, setRate] = useState(rateText(sp?.rate ?? 0))
  const [rateError, setRateError] = useState('')
  const [msg, setMsg] = useState<Msg>(null)
  if (!txn || !sp) return null
  const showTrade = !txn.dealType

  const create = () => {
    const errs: string[] = []
    if (!co) errs.push('Co. Code is required.')
    if (!bp) errs.push('BP is required.')
    if (!sp.rate) {
      setRateError('Rate is required')
      errs.push('Rate is required.')
    }
    if (!sp.amt1 || !sp.amt2) errs.push('Amounts could not be derived – check the rate.')
    if (errs.length) {
      setMsg({ text: errs.join(' '), kind: 'error' })
      return
    }
    if (!wb.post('spotOrder')) return
    const rfha = bookSpot(wb, {
      dealId: spec.ctx.dealId,
      dealType: txn.dealType,
      sourceRfha: txn.rfha,
      bukrs: co,
      sfhaart: '605',
      bs1: sp.bs1,
      curr1: sp.curr1,
      amt1: sp.amt1,
      bs2: sp.bs2,
      curr2: sp.curr2,
      amt2: sp.amt2,
      rate: sp.rate,
      bp,
      tradeDate: showTrade ? dmyToIso(trade) : '',
      text: 'Opposite spot for forward',
    })
    /* the new spot covers the forward: the forward's action item turns green (COLOR_CODE_ACTION_ITEMS) */
    wb.set(setCoverTxn(wb.get(), rfha, txn.rfha))
    frame.onClose()
    wb.outcome({ tone: 'success', title: 'Spot Created', message: `Spot Transaction created Successfully: ${rfha}` })
  }

  return (
    <ModalFrame frame={frame} title="Create Spot" sub={`Forward cover ${txn.rfha} · opposite spot`} cls="md-modal" actions={<Buttons frame={frame} label="Create Spot" onOk={create} />}>
      <SpotForm
        msg={msg}
        sp={sp}
        grp={txn.grp}
        co={co}
        bp={bp}
        trade={showTrade ? trade : null}
        rate={rate}
        rateError={rateError}
        onCo={setCo}
        onBp={setBp}
        onTrade={setTrade}
        onRate={(v) => {
          setRate(v)
          setRateError('')
          setMsg(null)
          setSp(derive({ ...sp, rate: rateOf(v) }))
        }}
      />
    </ModalFrame>
  )
}

/* ---------------- Screen 9010 — NDF Details (fixing) ---------------- */

export function NdfPopup({ frame, spec, wb }: { frame: FrameProps; spec: Extract<PopupSpec, { kind: 'ndf' }>; wb: Wb }) {
  const txn = findTxn(wb.get(), spec.ctx.rfha)
  const [rate, setRate] = useState(() => {
    const def = txn ? defaultFixingRate(txn) : 0
    return def ? def.toFixed(4) : ''
  })
  const [rateError, setRateError] = useState('')
  const [msg, setMsg] = useState<Msg>(null)
  const [busy, setBusy] = useState(false)
  // ZFS_SD_TRMFX NdfFixing (BAPI_FTR_FXT_NDF_FIXING): null while the service's $metadata is read.
  const [canFix, setCanFix] = useState<boolean | null>(null)
  useEffect(() => {
    let live = true
    fixNdfAvailable().then((ok) => live && setCanFix(ok))
    return () => {
      live = false
    }
  }, [])
  if (!txn) return null
  const isDndf = txn.sfhaart === '632'
  const r = rateOf(rate)
  const res = calcNdfSettlement(txn, r)
  const amount = r ? numStr(isDndf ? res.dndf : res.ndf) : ''

  const update = async () => {
    if (busy) return
    const rv = parseNum(rate)
    if (!rv || isNaN(rv) || rv <= 0) {
      setRateError('Fixing rate is required')
      setMsg({ text: 'Enter the fixing rate to update the transaction.', kind: 'error' })
      return
    }
    if (!canFix) {
      setMsg({ text: NDF_FIXING_API_MISSING, kind: 'error' })
      return
    }
    if (!txn.etag) {
      setMsg({ text: `Transaction ${txn.rfha} has no TSF record (TrmFxApp) to set its status on; reload the workbench.`, kind: 'error' })
      return
    }
    // BAPI_FTR_FXT_NDF_FIXING through FxTransaction/NdfFixing, then TXN_STATUS 10 on the TSF append.
    setBusy(true)
    const result = await fixNdf({ bukrs: txn.bukrs, rfha: txn.rfha, etag: txn.etag }, rv, TXN.FIXED)
    setBusy(false)
    if (!result.ok) {
      setMsg({ text: result.message, kind: 'error' })
      return
    }
    const out = calcNdfSettlement(txn, rv)
    // The ETag changed with the update: a second change needs the row read again.
    wb.set(updateTxnStatus(wb.get(), txn.rfha, TXN.FIXED, { ndfRate: rv, cashAmt: isDndf ? out.dndf : out.ndf, cashCurr: isDndf ? out.scurr2 : out.scurr, etag: '' }))
    frame.onClose()
    wb.toast(`Confirmation Sent — ${result.message}`, 'success') /* TEXT-003 */
    wb.confirm({ title: 'Create Spot', message: 'Do you want to create the Spot?' }, () =>
      wb.open({ kind: 'spot', ctx: spec.ctx, variant: isDndf ? 'dndf' : 'ndf', sfhaart: '605', rate: 0 }),
    )
  }

  return (
    <ModalFrame
      frame={frame}
      title="NDF Details"
      sub={`Transaction ${txn.rfha} · ${txnTypeText(txn.sfhaart)}`}
      cls="md-modal"
      actions={<Buttons frame={frame} label={busy ? 'Updating …' : 'Update'} onOk={() => void update()} />}
    >
      <InlineMsg msg={msg ?? (canFix === false ? { text: NDF_FIXING_API_MISSING, kind: 'error' } : null)} />
      <div className="pf-row c2">
        <Fld label="Fixing Date">
          <input className="control mono" readOnly value={isoToDMY(txn.ndfDate)} />
        </Fld>
        <Fld label="Fixing Ref">
          <input className="control" readOnly value={txn.ndfRef} />
        </Fld>
      </div>
      <div className="pf-row">
        <Fld label="Fixing Reference Name">
          <input className="control" readOnly value={txn.ndfRefName} />
        </Fld>
      </div>
      <div className="pf-row c2">
        <Fld label="Contract Rate">
          <input className="control mono" readOnly value={formatRate(txn.rate)} />
        </Fld>
        <Fld label="Fixing Rate" req error={rateError}>
          <input
            className="control mono"
            inputMode="decimal"
            placeholder="Enter fixing rate"
            autoFocus
            value={rate}
            onFocus={(e) => e.target.select()}
            onChange={(e) => {
              if (overRateDp(e.target.value)) return
              setRate(e.target.value)
              setRateError('')
              setMsg(null)
            }}
          />
        </Fld>
      </div>
      <div className="pf-row">
        <Fld label="Settlement Amt" cls="has-unit">
          <input className="control mono calc" readOnly value={amount} />
          <span className="unit">{isDndf ? res.scurr2 : res.scurr}</span>
        </Fld>
      </div>
    </ModalFrame>
  )
}

/* ---------------- Settlement spot for the invoice difference (create_sett_spot / Diff Spot) ---------------- */

export function SettlementSpotPopup({ frame, spec, wb }: { frame: FrameProps; spec: Extract<PopupSpec, { kind: 'settlementSpot' }>; wb: Wb }) {
  const data = wb.get()
  const txn = findTxn(data, spec.ctx.rfha)
  const deal = findDeal(data, spec.ctx.dealId)
  if (!txn || !deal) return null
  const rec = inSpotFor(data, deal.id, txn.dealType)
  const created = !!rec && rec.spotCreate === 'X'
  const info: Msg = !rec
    ? { text: 'No invoice difference is stored for this deal type.', kind: 'info' }
    : created
      ? { text: 'The settlement spot for this deal type has already been created.', kind: 'info' }
      : null
  const kvItem = (l: string, v: ReactNode) => (
    <div className="detail-item" key={l}>
      <span className="detail-label">{l}</span>
      <span className="detail-value">{v === undefined || v === '' ? '—' : v}</span>
    </div>
  )

  const create = () => {
    if (!rec || !rec.dAmt) return
    if (!wb.post('settlementSpot')) return
    const other = txn.curr1 === rec.curr ? txn.curr2 : txn.curr1
    const rate = spotRateFor(rec.curr, other)
    const amt1 = Math.abs(rec.dAmt)
    const amt2 = convertViaRate(amt1, rec.curr, other, rate)
    const sell = rec.bs === 'Sell' || rec.bs.charAt(0) === 'S'
    const rfha = bookSpot(wb, {
      dealId: deal.id,
      dealType: txn.dealType,
      sourceRfha: txn.rfha,
      bukrs: txn.bukrs,
      sfhaart: '604',
      bs1: sell ? 'Sell' : 'Buy',
      curr1: rec.curr,
      amt1,
      bs2: sell ? 'Buy' : 'Sell',
      curr2: other,
      amt2,
      rate,
      bp: txn.cpty,
      text: 'Spot – invoice difference',
    })
    frame.onClose()
    wb.outcome({ tone: 'success', title: 'Spot Created', message: `Spot Transaction created Successfully: ${rfha}` })
  }

  return (
    <ModalFrame
      frame={frame}
      title="Settlement Spot"
      sub={`Deal ${deal.id} · Deal Type ${txn.dealType || '—'}`}
      cls="md-modal"
      actions={
        <>
          <button type="button" className="btn btn-secondary" onClick={frame.onClose}>
            Close
          </button>
          <button type="button" className="btn btn-primary" disabled={!rec || created} onClick={create}>
            Create Spot
          </button>
        </>
      }
    >
      <InlineMsg msg={info} />
      <div className="kv-grid">
        {kvItem('Date', todayDmy())}
        {kvItem('Deal ID', deal.id)}
        {kvItem('Deal Type', txn.dealType)}
        {kvItem('Transaction', txn.rfha)}
        {kvItem('Invoice Amount', rec ? `${formatAmount(rec.fAmt)} ${rec.curr}` : '')}
        {kvItem('FX Deal Amount', rec ? `${formatAmount(rec.fxAmt)} ${rec.curr}` : '')}
        {kvItem('Difference', rec ? `${formatAmount(rec.dAmt)} ${rec.curr}` : '')}
        {kvItem('Buy / Sell', rec ? rec.bs : '')}
        {kvItem('Spot', created ? `Created (${rec!.spotTxn})` : 'Pending')}
      </div>
    </ModalFrame>
  )
}

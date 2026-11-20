import { useEffect, useState } from 'react'
import { useAsync } from '@slc/api-client/react'
import { Overlay, type Modal } from '../fo-create-master-contract/modal.tsx'
import { Amount, Notice, Skeleton, fmt, opener } from '../../shared/report/ui.tsx'
import { fmtCcy } from './calc.ts'
import { getDealPnl, getPlanned, getSettlement } from './api.ts'
import { exportDeal } from './export.ts'
import { statusClass } from './status.ts'
import type { DealPnl, DealSummary, EntityPnl, Leg, PlannedCalc, SettlementCalc, SettlementEntity } from './types.ts'

const dmy = (iso: string | null) => (iso ? iso.split('-').reverse().join('-') : '—')
type Panel = 'planned' | 'settlement' | null

const DrillIcon = () => (
  <svg className="rpt-drill-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7M21 3l-9 9M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" /></svg>
)

/** The Master Contract pop-up, for one Deal ID: its entity-wise P&L, and the two calculations behind it in a side panel. */
export function DealPnlModal({ modal, deal }: { modal: Modal; deal: DealSummary | null }) {
  const [panel, setPanel] = useState<Panel>(null)
  const [exporting, setExporting] = useState(false)
  const id = deal?.id ?? ''
  const pnl = useAsync((signal) => (id ? getDealPnl(id, signal) : Promise.resolve(undefined)), [id])
  const planned = useAsync((signal) => (id && panel === 'planned' ? getPlanned(id, signal) : Promise.resolve(undefined)), [id, panel])
  const settlement = useAsync((signal) => (id && panel === 'settlement' ? getSettlement(id, signal) : Promise.resolve(undefined)), [id, panel])

  useEffect(() => setPanel(null), [id])
  useEffect(() => {
    if (modal.state !== 'open') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      if (panel) setPanel(null)
      else modal.close()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [modal, panel])

  async function download() {
    if (!pnl.data) return
    setExporting(true)
    try {
      const [p, s] = await Promise.all([getPlanned(id), getSettlement(id)])
      await exportDeal(pnl.data, p, s)
    } finally {
      setExporting(false)
    }
  }

  const drillTitle = panel === 'planned' ? 'Planned P&L Calculation' : 'Settlement P&L Breakdown'
  return (
    <Overlay modal={modal} onBackdrop={modal.close}>
      <div className={`modal modal-left modal-scrollable rpt-modal rpt-base${panel ? ' shifted' : ''}`} role="dialog" aria-modal="true" aria-labelledby="rpt-title">
        <div className="modal-head-row">
          <h2 id="rpt-title">{deal ? <>P&amp;L Breakdown — <span className="rpt-deal-id">{deal.id}</span></> : 'P&L Breakdown'}</h2>
          <button type="button" className="modal-close-btn" aria-label="Close" onClick={modal.close}>×</button>
        </div>
        {deal ? (
          <p className="rpt-modal-sub">
            {deal.description} · {deal.pair} · <span className={statusClass(deal.status)}>{deal.status}</span>
          </p>
        ) : null}

        <div className="modal-body-scroll">
          {pnl.loading && !pnl.data ? <Skeleton rows={5} /> : null}
          {pnl.error ? <Notice tone="error" title="Could not load the P&L of this deal." action={<button type="button" className="btn btn-secondary btn-sm" onClick={pnl.reload}>Retry</button>}>{pnl.error.message}</Notice> : null}
          {pnl.data ? <EntityTable data={pnl.data} active={panel} onDrill={setPanel} /> : null}
        </div>
        <div className="modal-actions contract-detail-actions">
          <button className="btn btn-secondary" type="button" onClick={() => void download()} disabled={!pnl.data || exporting}>{exporting ? 'Exporting…' : 'Export to Excel'}</button>
          <button className="btn btn-primary" type="button" onClick={modal.close}>Close</button>
        </div>
      </div>

      {panel ? (
        <div className="modal modal-left modal-scrollable rpt-modal rpt-drill-modal" key={panel} role="dialog" aria-label={drillTitle}>
          <div className="modal-head-row">
            <h3>{drillTitle} — Deal {id}</h3>
            <span className="rpt-drill-btns">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPanel(null)}>← Back</button>
              <button type="button" className="modal-close-btn" aria-label="Close calculation" onClick={() => setPanel(null)}>×</button>
            </span>
          </div>
          <div className="modal-body-scroll">
            {panel === 'planned' ? (
              planned.loading && !planned.data ? <Skeleton rows={6} />
              : planned.error ? <Notice tone="error" title="Could not load the planned P&L calculation." action={<button type="button" className="btn btn-secondary btn-sm" onClick={planned.reload}>Retry</button>}>{planned.error.message}</Notice>
              : planned.data ? <PlannedView data={planned.data} /> : null
            ) : settlement.loading && !settlement.data ? <Skeleton rows={6} />
              : settlement.error ? <Notice tone="error" title="Could not load the settlement breakdown." action={<button type="button" className="btn btn-secondary btn-sm" onClick={settlement.reload}>Retry</button>}>{settlement.error.message}</Notice>
              : settlement.data && deal ? <SettlementView data={settlement.data} status={deal.status} /> : null}
          </div>
        </div>
      ) : null}
    </Overlay>
  )
}

// ---------------------------------------------------------------- entity table

function EntityTable({ data, active, onDrill }: { data: DealPnl; active: Panel; onDrill: (p: Panel) => void }) {
  const basisNote = data.basis === 'actual'
    ? 'Net P&L is the actual P&L: settlement P&L converted to USD.'
    : data.basis === 'planned'
      ? 'Not settled yet: Net P&L is the planned P&L, the expected result.'
      : 'No P&L has been booked for this deal yet.'
  return (
    <>
      <div className="detail-section">
        <div className="detail-section-title">Entity-wise P&amp;L</div>
        <div className="popup-table-wrap">
          <table className="popup-table">
            <thead>
              <tr><th>Entity</th><th className="num">Planned P&amp;L</th><th className="num">Settlement P&amp;L</th><th className="num">Actual P&amp;L</th><th className="num">Net P&amp;L</th></tr>
            </thead>
            <tbody>
              {data.entities.map((e) => <EntityRow key={e.entity} e={e} active={active} onDrill={onDrill} />)}
            </tbody>
          </table>
        </div>
      </div>
      <div className="kv-list">
        <div className="kv-row kv-total" title={basisNote}>
          <span className="kv-label">Consolidated Net P&amp;L</span>
          <span className="kv-value"><Amount value={data.consolidatedNetUsd} ccy={data.reportingCcy} plain /></span>
        </div>
      </div>
      <p className="rpt-note">{basisNote} Planned, settlement and actual are different measures of the same result, so they are not added together; entity amounts are converted to {data.reportingCcy} before they are totalled.</p>
    </>
  )
}

function EntityRow({ e, active, onDrill }: { e: EntityPnl; active: Panel; onDrill: (p: Panel) => void }) {
  const usdNote = (usd: number | null) => (e.ccy !== 'USD' && usd !== null ? <span className="rpt-sub">= {fmtCcy(usd, 'USD')} @ {fmt(e.rate, 2)}</span> : null)
  return (
    <tr>
      <td><b>{e.entity}</b><span className="rpt-sub">{e.company}</span></td>
      <DrillCell value={e.planned} ccy={e.ccy} note={usdNote(e.plannedUsd)} label="planned P&L calculation" on={active === 'planned'} onOpen={() => onDrill('planned')} />
      <DrillCell value={e.settlement} ccy={e.ccy} note={usdNote(e.settlementUsd)} label="settlement P&L breakdown" on={active === 'settlement'} onOpen={() => onDrill('settlement')} />
      <td className="num"><Amount value={e.actualUsd} ccy="USD" /></td>
      <td className="num"><b><Amount value={e.netUsd} ccy="USD" /></b></td>
    </tr>
  )
}

function DrillCell({ value, ccy, note, label, on, onOpen }: { value: number | null; ccy: string; note: React.ReactNode; label: string; on: boolean; onOpen: () => void }) {
  if (value === null) return <td className="num"><span className="rpt-nil">—</span></td>
  return (
    <td className={`num rpt-drill${on ? ' on' : ''}`} tabIndex={0} role="button" aria-label={`Open ${label}`} title="Double-click to view calculation details." {...opener(() => onOpen())}>
      <DrillIcon />
      <Amount value={value} ccy={ccy} />
      {note}
    </td>
  )
}

// ---------------------------------------------------------------- planned P&L

function PlannedView({ data }: { data: PlannedCalc }) {
  const [hover, setHover] = useState<string | null>(null)
  if (!data.legs.length) return <Notice title="No linked transactions">This Deal ID has no linked FX transactions to calculate from.</Notice>
  const buy = data.legs.find((l) => l.direction === 'Buy USD')
  const sell = data.legs.find((l) => l.direction === 'Sell USD')
  const focus = data.legs.find((l) => l.ref === hover)
  return (
    <>
      <div className="detail-section">
        <div className="detail-section-title">Linked transactions</div>
        <div className="popup-table-wrap">
          <table className="popup-table">
            <thead>
              <tr><th>Leg</th><th>Type</th><th>Entity</th><th>Direction</th><th className="num">USD</th><th className="num">{data.localCcy}</th><th className="num">USD/{data.localCcy} rate</th><th>Trade date</th><th>Maturity</th></tr>
            </thead>
            <tbody>
              {data.legs.map((l) => (
                <tr key={l.ref} className={hover === l.ref ? 'rpt-hot' : ''} onMouseEnter={() => setHover(l.ref)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(l.ref)} onBlur={() => setHover(null)} tabIndex={0}>
                  <td><b>{l.ref}</b> — {l.label}</td>
                  <td>{l.type}</td>
                  <td>{l.entity}</td>
                  <td><span className={l.direction === 'Buy USD' ? 'status-text status-text-in-use' : 'status-text status-text-rejected'}>{l.direction}</span></td>
                  <td className="num"><Amount value={l.usd} plain /></td>
                  <td className="num"><Amount value={l.local} plain /></td>
                  <td className="num">{fmt(l.rate, 2)}</td>
                  <td>{dmy(l.tradeDate)}</td>
                  <td>{dmy(l.maturityDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rpt-legs" aria-label="The two linked transactions">
        {buy ? <LegCard leg={buy} active={hover === buy.ref} dim={!!hover && hover !== buy.ref} onHover={setHover} /> : null}
        <div className="rpt-link" aria-hidden="true">
          <span className="arrow">⇄</span>
          <span className="spread">{buy && sell ? `${fmt(buy.rate, 2)} → ${fmt(sell.rate, 2)}` : ''}</span>
          <small>spread {fmt(data.rateSpread, 2)}</small>
        </div>
        {sell ? <LegCard leg={sell} active={hover === sell.ref} dim={!!hover && hover !== sell.ref} onHover={setHover} /> : null}
      </div>
      <p className="rpt-inputs" aria-live="polite">
        {focus ? <>Inputs for <b>{focus.ref}</b>: {fmtCcy(focus.local, focus.localCcy)} ÷ {fmtCcy(Math.abs(focus.usd), 'USD')} = {fmt(Math.abs(focus.local / focus.usd), 4)} {focus.localCcy} per USD (dealt at {fmt(focus.rate, 2)}).</> : 'Hover or focus a transaction to see its calculation inputs.'}
      </p>

      <div className="detail-section">
        <div className="detail-section-title">Arbitrage calculation</div>
        <div className="kv-list">
          <KvRow label={`Total ${data.localCcy} from sell leg`} value={fmt(data.receivedLocal)} />
          <KvRow label={`Total ${data.localCcy} from buy leg`} value={fmt(data.paidLocal)} />
          <KvRow label={`Arbitrage gain (${data.localCcy})`} value={<Amount value={data.arbitrageLocal} plain />} total />
          <KvRow label="Reporting conversion rate" value={`${fmt(data.reportingRate, 2)} ${data.localCcy}/USD`} />
          <KvRow label="Arbitrage gain (USD)" value={<Amount value={data.arbitrageUsd} ccy="USD" plain />} total />
        </div>
        <p className="rpt-note">Arbitrage ({data.localCcy}) = {data.localCcy} received − {data.localCcy} paid · Arbitrage (USD) = Arbitrage ({data.localCcy}) ÷ {fmt(data.reportingRate, 2)}. Booked by {data.plannedEntity}.</p>
      </div>
    </>
  )
}

function KvRow({ label, value, total = false }: { label: string; value: React.ReactNode; total?: boolean }) {
  return (
    <div className={`kv-row${total ? ' kv-total' : ''}`}>
      <span className="kv-label">{label}</span>
      <span className="kv-value">{value}</span>
    </div>
  )
}

function LegCard({ leg, active, dim, onHover }: { leg: Leg; active: boolean; dim: boolean; onHover: (ref: string | null) => void }) {
  return (
    <div className={`rpt-leg ${leg.direction === 'Buy USD' ? 'buy' : 'sell'}${active ? ' active' : ''}${dim ? ' dim' : ''}`} tabIndex={0}
      onMouseEnter={() => onHover(leg.ref)} onMouseLeave={() => onHover(null)} onFocus={() => onHover(leg.ref)} onBlur={() => onHover(null)}>
      <div className="rpt-leg-t"><b>{leg.ref}</b> {leg.label}</div>
      <div className="rpt-leg-d">{leg.direction}</div>
      <div className="rpt-leg-r">{fmt(leg.rate, 2)}</div>
      <div className="rpt-leg-a"><Amount value={leg.usd} ccy="USD" plain /> <Amount value={leg.local} ccy={leg.localCcy} plain /></div>
    </div>
  )
}

// ---------------------------------------------------------------- settlement P&L

function SettlementView({ data, status }: { data: SettlementCalc; status: string }) {
  const [detail, setDetail] = useState('')
  const columns = data.flows
  const row = (label: string, pick: (f: SettlementEntity) => number, tone: string, note: (f: SettlementEntity) => string) => (
    <tr className={`rpt-flow-${tone}`}>
      <th scope="row">{label}</th>
      {columns.map((f) => {
        const text = note(f)
        return (
          <td key={f.entity} className="num rpt-flow" tabIndex={0} title={text} onMouseEnter={() => setDetail(text)} onFocus={() => setDetail(text)} onClick={() => setDetail(text)}>
            <Amount value={pick(f)} />
          </td>
        )
      })}
    </tr>
  )
  const totalUsd = Math.round(columns.reduce((s, f) => s + f.netUsd, 0) * 100) / 100
  return (
    <>
      <div className="detail-section">
        <div className="detail-section-title">A · Maturity (FX Deal)</div>
        <div className="popup-table-wrap">
          <table className="popup-table">
            <thead>
              <tr><th>Linked deal / leg</th><th>Type</th><th>Entity</th><th className="num">USD</th><th className="num">{data.localCcy}</th><th className="num">Maturity / fixing rate</th><th className="num">Realised gain / loss (USD)</th><th>Maturity date</th></tr>
            </thead>
            <tbody>
              {data.maturity.map((m) => (
                <tr key={m.legRef}>
                  <td><b>{m.legRef}</b> — {m.label}</td>
                  <td>{m.type}</td>
                  <td>{m.entity}</td>
                  <td className="num"><Amount value={m.usd} plain /></td>
                  <td className="num"><Amount value={m.local} plain /></td>
                  <td className="num">{m.fixingRate === null ? <span className="rpt-nil">—</span> : fmt(m.fixingRate, 2)}</td>
                  <td className="num"><Amount value={m.realised} /></td>
                  <td>{dmy(m.date)}</td>
                </tr>
              ))}
              <tr className="rpt-total-row"><td colSpan={6}>Realised G/L</td><td className="num"><Amount value={data.realisedTotal} ccy="USD" /></td><td /></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="detail-section">
        <div className="detail-section-title">B · Settlement (20)</div>
        {columns.length === 0 ? (
          <Notice title="Not settled yet">This deal is {status.toLowerCase()}: there are no settlement flows to show.</Notice>
        ) : (
          <>
            <div className="popup-table-wrap">
              <table className="popup-table rpt-flows">
                <thead>
                  <tr><th>Flow</th>{columns.map((f) => <th key={f.entity} className="num">{f.entity}<span className="rpt-sub">{f.company} · {f.ccy}</span></th>)}</tr>
                </thead>
                <tbody>
                  {row('Pay', (f) => f.pay, 'pay', (f) => `${f.payRef}: paid ${fmtCcy(f.pay, f.ccy)}. ${f.note}`)}
                  {row('Receive', (f) => f.receive, 'receive', (f) => `${f.receiveRef}: received ${fmtCcy(f.receive, f.ccy)}. ${f.note}`)}
                  {row('Net', (f) => f.net, 'net', (f) => `Net = pay + receive = ${fmtCcy(f.pay, f.ccy)} + ${fmtCcy(f.receive, f.ccy)} = ${fmtCcy(f.net, f.ccy)}${f.ccy !== 'USD' ? ` (${fmtCcy(f.netUsd, 'USD')} at ${fmt(f.rate, 2)})` : ''}.`)}
                </tbody>
              </table>
            </div>
            <p className="rpt-inputs" aria-live="polite">{detail || 'Hover, focus or tap a settlement value to see the flow behind it.'}</p>
            <div className="rpt-summary">
              <div><span>Settlement outcome</span><strong><Amount value={totalUsd} ccy="USD" plain /></strong><small>net flows of all entities in USD, before the realised G/L</small></div>
              <div><span>Realised G/L</span><strong><Amount value={data.realisedTotal} ccy="USD" plain /></strong><small>from the maturity step above</small></div>
              <div><span>Settlement date</span><strong>{dmy(data.settlementDate)}</strong><small>accounting date</small></div>
            </div>
          </>
        )}
      </div>
    </>
  )
}

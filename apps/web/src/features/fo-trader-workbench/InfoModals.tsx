import type { ReactNode } from 'react'
import { KPI_DUE_DAYS } from './data.ts'
import { formatAmount, formatRate, isoToDMY, kpiCompact, todayIso } from './format.ts'
import { KPI_DEFS, dealStatusInfo, kpiCountRows, kpiToUsd, leadCurr, modelDesc, spotRateFor, txnTypeText, type KpiId, type Kpis } from './logic.ts'
import { ModalFrame, type FrameProps } from './modal.tsx'
import type { Deal } from './types.ts'

const closeBtn = (frame: FrameProps) => (
  <button type="button" className="btn btn-secondary" onClick={frame.onClose}>
    Close
  </button>
)

/* ---------------- KPI breakdown (openKpiDetail) ---------------- */

type Bar = { label: string; value: number; text: string; cls?: string }

function KpiBars({ rows }: { rows: readonly Bar[] }) {
  if (!rows.length) return <div className="kpi-empty">Nothing to show for the current filters.</div>
  const max = Math.max(0, ...rows.map((r) => Math.abs(r.value)))
  return (
    <div className="kpi-bars">
      {rows.map((r, i) => {
        const w = max ? Math.max(3, Math.round((Math.abs(r.value) / max) * 100)) : 0
        return (
          <div className="kpi-bar-row" key={`${r.label}-${i}`}>
            <div className="kpi-bar-label" title={r.label}>
              {r.label}
            </div>
            <div className="kpi-bar-track">
              <div className={`kpi-bar-fill ${r.cls ?? ''}`} style={{ width: `${w}%` }}></div>
            </div>
            <div className={`kpi-bar-val ${r.cls ?? ''}`}>{r.text}</div>
          </div>
        )
      })}
    </div>
  )
}

const DONUT_COLORS = ['#0A6ED1', '#E9730C', '#107E3E', '#6C4BC1', '#0097A7', '#BB0000']
const DONUT_OTHER = '#8396A8'

/** Share-of-total donut with a legend; more than six slices fold the smallest into "Other". */
function KpiDonut({ rows, total }: { rows: readonly { label: string; value: number }[]; total: number }) {
  if (!rows.length || !total) return <div className="kpi-empty">Nothing to show for the current filters.</div>
  const head = rows.slice(0, DONUT_COLORS.length)
  const rest = rows.slice(DONUT_COLORS.length).reduce((sum, r) => sum + r.value, 0)
  const slices = [...head.map((r, i) => ({ ...r, color: DONUT_COLORS[i]! })), ...(rest ? [{ label: 'Other', value: rest, color: DONUT_OTHER }] : [])]
  const R = 40
  const C = 2 * Math.PI * R
  let offset = 0
  return (
    <div className="kpi-donut">
      <svg viewBox="0 0 100 100" width="150" height="150" role="img" aria-label="Deals by FX model">
        {slices.map((sl) => {
          const len = (sl.value / total) * C
          const el = (
            <circle key={sl.label} cx="50" cy="50" r={R} fill="none" stroke={sl.color} strokeWidth="16" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} transform="rotate(-90 50 50)">
              <title>{`${sl.label}: ${sl.value}`}</title>
            </circle>
          )
          offset += len
          return el
        })}
        <text x="50" y="49" textAnchor="middle" className="donut-total">{total}</text>
        <text x="50" y="61" textAnchor="middle" className="donut-caption">deals</text>
      </svg>
      <ul className="kpi-legend">
        {slices.map((sl) => (
          <li key={sl.label}>
            <span className="swatch" style={{ background: sl.color }}></span>
            <span className="lg-label" title={sl.label}>{sl.label}</span>
            <span className="lg-val">{sl.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

type KCol = { key: string; label: string; num?: boolean; cls?: string }
type KRow = { dealId: string; cells: Record<string, ReactNode> }

function KpiTable({ cols, rows, onOpen }: { cols: readonly KCol[]; rows: readonly KRow[]; onOpen: (dealId: string) => void }) {
  if (!rows.length) return <div className="kpi-empty">Nothing to show for the current filters.</div>
  return (
    <div className="grid-wrap">
      <table className="grid">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key} className={c.num ? 'num' : ''}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.dealId}-${i}`}>
              {cols.map((c) => (
                <td key={c.key} className={`${c.num ? 'num mono ' : ''}${c.cls ?? ''}`.trim() || undefined}>
                  {c.key === 'id' ? (
                    <a
                      className="deal-id-link"
                      href={`#deal-${encodeURIComponent(r.dealId)}`}
                      aria-haspopup="dialog"
                      title={`Open transactions and action items for deal ${r.dealId}`}
                      onClick={(e) => {
                        e.preventDefault()
                        onOpen(r.dealId)
                      }}
                    >
                      {r.cells[c.key]}
                    </a>
                  ) : r.cells[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const Section = ({ title, hint, children }: { title: string; hint?: string | undefined; children: ReactNode }) => (
  <div className="sub-section">
    <div className="sub-title">
      <span className="dot"></span>
      {title}
    </div>
    {hint ? <p className="sub-hint">{hint}</p> : null}
    {children}
  </div>
)

const statusHtml = (d: Deal) => {
  const s = dealStatusInfo(d.status)
  return <span className={`status-text ${s.cls}`}>{s.desc}</span>
}
const signed = (n: number) => (n > 0 ? '+' : '') + formatAmount(n)

export function KpiDetailModal({ frame, id, k, onOpenDeal }: { frame: FrameProps; id: KpiId; k: Kpis; onOpenDeal: (dealId: string) => void }) {
  const def = KPI_DEFS.find((d) => d.id === id)!
  const sub = `${k.count}${k.count === 1 ? ' deal' : ' deals'} in the current view · as of ${isoToDMY(todayIso())}`
  const noAuthNote = k.noAuth.length ? (
    <div className="kpi-note">
      {k.noAuth.length} deal(s) excluded: no authorization for the company code ({k.noAuth.map((d) => d.id).join(', ')}).
    </div>
  ) : null
  let body: ReactNode = null

  if (id === 'deals') {
    const notional = new Map(k.deals.map((d) => [d.id, kpiToUsd(d.mcAmt, d.mcAmtCurr)]))
    const exposures = k.deals
      .filter((d) => notional.get(d.id)! > 0)
      .sort((a, b) => notional.get(b.id)! - notional.get(a.id)!)
      .slice(0, 6)
    const noRate = k.deals.filter((d) => d.mcAmt && !notional.get(d.id)).length
    const expCols: KCol[] = [
      { key: 'id', label: 'Deal ID', cls: 'mono strong' },
      { key: 'model', label: 'Model' },
      { key: 'mc', label: 'MC Amount', num: true },
      { key: 'usd', label: 'USD Equiv.', num: true },
    ]
    const expRows: KRow[] = exposures.map((d) => ({
      dealId: d.id,
      cells: {
        id: d.id,
        model: d.model,
        mc: `${d.mcAmtCurr} ${kpiCompact(d.mcAmt)}`,
        usd: kpiCompact(notional.get(d.id)!),
      },
    }))
    body = (
      <>
        <Section title="By deal status" hint="Number of deals at each workflow status.">
          <KpiBars rows={kpiCountRows(k.byStatus).map((r) => ({ ...r, text: `${r.value}` }))} />
        </Section>
        <Section title="By FX model" hint="Number of deals in view on each FX model.">
          <KpiDonut rows={kpiCountRows(k.byModel).map((r) => ({ label: `${r.label} · ${modelDesc(r.label)}`, value: r.value }))} total={k.count} />
        </Section>
        <Section title="Largest exposures (USD equivalent)" hint={exposures.length ? `The six deals with the largest MC amount, converted to USD at today's rate.` : undefined}>
          <KpiTable cols={expCols} rows={expRows} onOpen={onOpenDeal} />
          {noRate ? <p className="sub-hint">{noRate} deal{noRate === 1 ? '' : 's'} not shown: no MC amount or no USD conversion rate.</p> : null}
        </Section>
      </>
    )
  } else if (id === 'due' || id === 'overdue') {
    const src = id === 'due' ? k.due : k.overdue
    const cols: KCol[] = [
      { key: 'id', label: 'Deal ID', cls: 'mono strong' },
      { key: 'model', label: 'Model' },
      { key: 'status', label: 'Status' },
      { key: 'end', label: 'Settlement Date', cls: 'mono' },
      { key: 'days', label: id === 'due' ? 'Due In' : 'Overdue By', num: true },
    ]
    const rows: KRow[] = src.map((x) => ({
      dealId: x.deal.id,
      cells: {
        id: x.deal.id,
        model: x.deal.model,
        status: statusHtml(x.deal),
        end: isoToDMY(x.deal.end),
        days: id === 'due' ? (x.days === 0 ? 'Today' : `${x.days} d`) : `${x.days} d late`,
      },
    }))
    const urgency: Record<string, number> = {}
    for (const x of k.due) {
      const lbl = x.days === 0 ? 'Today' : x.days <= 3 ? '1–3 days' : `4–${KPI_DUE_DAYS} days`
      urgency[lbl] = (urgency[lbl] || 0) + 1
    }
    body = (
      <>
        <Section title={id === 'due' ? `Deals settling within ${KPI_DUE_DAYS} days` : 'Open deals past their settlement date'}>
          <KpiTable cols={cols} rows={rows} onOpen={onOpenDeal} />
        </Section>
        {id === 'due' ? (
          <Section title="Urgency">
            <KpiBars rows={kpiCountRows(urgency)} />
          </Section>
        ) : null}
      </>
    )
  } else if (id === 'pending') {
    const byAct: Record<string, number> = {}
    for (const p of k.pendingItems) byAct[p.item.text] = (byAct[p.item.text] || 0) + 1
    const cols: KCol[] = [
      { key: 'id', label: 'Deal ID', cls: 'mono strong' },
      { key: 'txn', label: 'Transaction', cls: 'mono' },
      { key: 'type', label: 'Type' },
      { key: 'action', label: 'Action Required' },
      { key: 'due', label: 'Date', cls: 'mono' },
    ]
    const rows: KRow[] = k.pendingItems.map((p) => ({
      dealId: p.deal.id,
      cells: {
        id: p.deal.id,
        txn: p.item.rfha,
        type: txnTypeText(p.item.sfhaart) || p.item.sfhaart,
        action: p.item.text,
        due: isoToDMY(p.item.eDate || p.item.valueDate),
      },
    }))
    body = (
      <>
        <Section title="By action type">
          <KpiBars rows={kpiCountRows(byAct)} />
        </Section>
        <Section title="Pending items">
          <KpiTable cols={cols} rows={rows} onOpen={onOpenDeal} />
        </Section>
        {noAuthNote}
      </>
    )
  } else if (id === 'progress') {
    body = (
      <>
        <Section title="Completion by deal">
          <KpiBars
            rows={k.perDealProgress.map((p) => {
              const pct = Math.round((p.done / (p.done + p.pending)) * 100)
              return { label: p.deal.id, value: pct, text: `${p.done}/${p.done + p.pending} · ${pct}%`, cls: pct === 100 ? 'pos' : pct === 0 ? 'neg' : '' }
            })}
          />
        </Section>
        {noAuthNote}
      </>
    )
  } else if (id === 'pl') {
    const asOf = todayIso()
    const rows = k.pl.slice().sort((x, y) => y.usd - x.usd)
    const gainsUsd = rows.filter((p) => p.usd >= 0).reduce((sum, p) => sum + p.usd, 0)
    const lossesUsd = rows.filter((p) => p.usd < 0).reduce((sum, p) => sum + p.usd, 0)
    const rateText = (p: (typeof rows)[number]) => {
      if (!p.deal.plCurr || p.deal.plCurr === 'USD') return '–'
      const lc = leadCurr(p.deal.plCurr, 'USD')
      const r = spotRateFor(p.deal.plCurr, 'USD', asOf)
      return r ? `1 ${lc.lead} = ${formatRate(r)} ${lc.follow}` : 'No rate'
    }
    const tone = (n: number) => (n > 0 ? 'kpi-pos' : n < 0 ? 'kpi-neg' : '')
    const dealCols: KCol[] = [
      { key: 'id', label: 'Deal ID', cls: 'mono strong' },
      { key: 'model', label: 'Model' },
      { key: 'pl', label: 'P&L (booked)', num: true },
      { key: 'rate', label: 'Rate Used' },
      { key: 'usd', label: 'P&L (USD)', num: true },
    ]
    const dealRows: KRow[] = rows.map((p) => ({
      dealId: p.deal.id,
      cells: {
        id: p.deal.id,
        model: p.deal.model,
        pl: `${p.deal.plCurr} ${signed(p.deal.pl)}`,
        rate: rateText(p),
        usd: <span className={tone(p.usd)}>{signed(p.usd)}</span>,
      },
    }))
    const models = [...new Set(rows.map((p) => p.deal.model))].sort()
    const modelCols: KCol[] = [
      { key: 'model', label: 'FX Model' },
      { key: 'n', label: 'Deals', num: true },
      { key: 'usd', label: 'P&L (USD)', num: true },
    ]
    const modelRows: KRow[] = models.map((m) => {
      const part = rows.filter((p) => p.deal.model === m)
      const sum = part.reduce((acc, p) => acc + p.usd, 0)
      return { dealId: '', cells: { model: m, n: part.length, usd: <span className={tone(sum)}>{signed(sum)}</span> } }
    })
    const excluded = k.count - rows.length
    body = (
      <>
        <div className="pl-summary">
          <div className="pl-stat"><span>Net P&amp;L</span><strong className={tone(k.plTotal)}>{signed(k.plTotal)}</strong></div>
          <div className="pl-stat"><span>Gains · {k.gains} deal{k.gains === 1 ? '' : 's'}</span><strong className="kpi-pos">{signed(gainsUsd)}</strong></div>
          <div className="pl-stat"><span>Losses · {k.losses} deal{k.losses === 1 ? '' : 's'}</span><strong className="kpi-neg">{signed(lossesUsd)}</strong></div>
        </div>
        <Section title="P&L by deal">
          <KpiTable cols={dealCols} rows={dealRows} onOpen={onOpenDeal} />
        </Section>
        <Section title="P&L by FX model">
          <KpiTable cols={modelCols} rows={modelRows} onOpen={onOpenDeal} />
        </Section>
        <Section title="How it is calculated">
          <div className="pl-formula">
            <p><strong>Net P&amp;L (USD)</strong> = sum of each deal's P&amp;L in USD</p>
            <p><strong>P&amp;L in USD</strong> = booked P&amp;L (ZPL) when its currency is USD; otherwise the booked P&amp;L × the rate, or ÷ the rate when USD is the lead currency of the pair.</p>
            <p><strong>Rate</strong> = today's market rate (TCURR rate type M, {isoToDMY(asOf)}) for the P&amp;L currency against USD.</p>
            <p><strong>Gain</strong> = P&amp;L ≥ 0 · <strong>Loss</strong> = P&amp;L &lt; 0 · deals with no booked P&amp;L are left out{excluded > 0 ? ` (${excluded} of ${k.count} here)` : ''}.</p>
            {rows.length ? <p className="pl-sum">{rows.map((p, i) => `${i && p.usd >= 0 ? '+ ' : ''}${i && p.usd < 0 ? '− ' : ''}${formatAmount(i && p.usd < 0 ? -p.usd : p.usd)}`).join(' ')} = <strong className={tone(k.plTotal)}>{signed(k.plTotal)} USD</strong></p> : null}
          </div>
        </Section>
      </>
    )
  }

  return (
    <ModalFrame frame={frame} title={def.label} sub={sub} cls="lg-modal" actions={closeBtn(frame)}>
      {body}
    </ModalFrame>
  )
}

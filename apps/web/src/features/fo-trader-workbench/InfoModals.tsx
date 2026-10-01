import type { ReactNode } from 'react'
import { KPI_DUE_DAYS } from './data.ts'
import { findDeal, findTxn, type Wb } from './flows.ts'
import { formatAmount, formatRate, isoToDMY, todayIso } from './format.ts'
import { KPI_DEFS, companyName, dealStatusInfo, kpiCountRows, kpiToUsd, modelDesc, txnStatusInfo, txnTypeText, type KpiId, type Kpis } from './logic.ts'
import { ModalFrame, type FrameProps } from './modal.tsx'
import type { Deal } from './types.ts'

const closeBtn = (frame: FrameProps) => (
  <button type="button" className="btn btn-secondary" onClick={frame.onClose}>
    Close
  </button>
)

/* ---------------- ZSGSLCFM_DISPLAY: the transaction hotspot ---------------- */

const kv = (l: string, v: string | number | null | undefined) => (
  <div className="detail-item" key={l}>
    <span className="detail-label">{l}</span>
    <span className="detail-value">{v === undefined || v === null || v === '' ? '—' : v}</span>
  </div>
)

export function TxnDetailsModal({ frame, rfha, wb }: { frame: FrameProps; rfha: string; wb: Wb }) {
  const t = findTxn(wb.get(), rfha)
  if (!t) return null
  return (
    <ModalFrame
      frame={frame}
      title={`Transaction ${t.rfha}`}
      sub={`${txnTypeText(t.sfhaart) || t.sfhaart} · ${companyName(t.bukrs)}`}
      cls="md-modal"
      actions={closeBtn(frame)}
    >
      <div className="detail-section">
        <div className="detail-section-title">General</div>
        <div className="kv-grid">
          {kv('Company Code', `${t.bukrs} · ${companyName(t.bukrs)}`)}
          {kv('Transaction', t.rfha)}
          {kv('Status', txnStatusInfo(t.status).desc)}
          {kv('Deal ID', t.dealId)}
          {kv('Deal Type', t.dealType)}
          {kv('Counterparty', t.cptyName)}
          {kv('Trade Date', isoToDMY(t.tradeDate))}
          {kv('Value Date', isoToDMY(t.valueDate))}
          {kv('Execution Date', isoToDMY(t.eDate))}
        </div>
      </div>
      <div className="detail-section">
        <div className="detail-section-title">Amounts</div>
        <div className="kv-grid">
          {kv('Leg 1', `${t.bs1 ? `${t.bs1} ` : ''}${t.curr1} ${formatAmount(t.amt1)}`)}
          {kv('Leg 2', `${t.bs2 ? `${t.bs2} ` : ''}${t.curr2} ${formatAmount(t.amt2)}`)}
          {kv('All in Rate', formatRate(t.rate))}
          {kv('Strike', formatRate(t.strike))}
          {kv('Premium', t.preAmt ? `${formatAmount(t.preAmt)} ${t.preCurr}` : '')}
          {kv('Put / Call', t.pc1)}
          {kv('Portfolio', t.portfolio)}
          {kv('Master Contract', t.mcRef)}
        </div>
      </div>
      {t.ndfRef ? (
        <div className="detail-section">
          <div className="detail-section-title">NDF</div>
          <div className="kv-grid">
            {kv('Fixing Date', isoToDMY(t.ndfDate))}
            {kv('Fixing Reference', t.ndfRef)}
            {kv('Fixing Rate', formatRate(t.ndfRate))}
          </div>
        </div>
      ) : null}
    </ModalFrame>
  )
}

/* ---------------- View Settlement Data (V_EX) ---------------- */

export function SettlementDataModal({ frame, dealId, wb }: { frame: FrameProps; dealId: string; wb: Wb }) {
  const data = wb.get()
  const deal = findDeal(data, dealId)
  if (!deal) return null
  const rows = data.inSpot.filter((s) => s.dealId === dealId)
  return (
    <ModalFrame frame={frame} title="Settlement Data" sub={`Deal ${deal.id} · ${deal.desc}`} cls="lg-modal" actions={closeBtn(frame)}>
      <div className="grid-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>Deal Type</th>
              <th>Straddle</th>
              <th className="num">Invoice Amount</th>
              <th className="num">FX Deal Amount</th>
              <th>Curr</th>
              <th className="num">Difference</th>
              <th>Buy/Sell</th>
              <th>Spot Created</th>
              <th>Spot Transaction</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="no-hover">
                <td colSpan={9} className="empty-row">
                  No settlement data stored for this deal.
                </td>
              </tr>
            ) : (
              rows.map((s) => (
                <tr className="no-hover" key={s.dealType}>
                  <td className="cell-type">{s.dealType}</td>
                  <td>{s.dssType ? 'Yes' : ''}</td>
                  <td className="num">{formatAmount(s.fAmt)}</td>
                  <td className="num">{formatAmount(s.fxAmt)}</td>
                  <td>{s.curr}</td>
                  <td className="num">{formatAmount(s.dAmt)}</td>
                  <td>{s.bs}</td>
                  <td>
                    <span className={`status-text ${s.spotCreate === 'X' ? 'status-text-in-use' : 'status-text-pending'}`}>
                      {s.spotCreate === 'X' ? 'Yes' : 'Pending'}
                    </span>
                  </td>
                  <td className="mono">{s.spotTxn}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </ModalFrame>
  )
}

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
            <tr key={`${r.dealId}-${i}`} title="Double-click to open the deal" onDoubleClick={() => onOpen(r.dealId)}>
              {cols.map((c) => (
                <td key={c.key} className={`${c.num ? 'num mono ' : ''}${c.cls ?? ''}`.trim() || undefined}>
                  {r.cells[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="sub-section">
    <div className="sub-title">
      <span className="dot"></span>
      {title}
    </div>
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
    const notional = new Map(k.deals.map((d) => [d.id, kpiToUsd(d.mcAmt, d.mcCurr)]))
    body = (
      <>
        <Section title="By deal status">
          <KpiBars rows={kpiCountRows(k.byStatus)} />
        </Section>
        <Section title="By FX model">
          <KpiBars rows={kpiCountRows(k.byModel).map((r) => ({ ...r, label: `${r.label} · ${modelDesc(r.label)}` }))} />
        </Section>
        <Section title="Largest exposures (USD equivalent)">
          <KpiBars
            rows={k.deals
              .slice()
              .sort((a, b) => notional.get(b.id)! - notional.get(a.id)!)
              .slice(0, 6)
              .map((d) => ({ label: d.id, value: notional.get(d.id)!, text: formatAmount(notional.get(d.id)!, 0) }))}
          />
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
    const byModel: Record<string, number> = {}
    for (const p of k.pl) byModel[p.deal.model] = (byModel[p.deal.model] || 0) + p.usd
    body = (
      <>
        <Section title="P&L by deal (USD)">
          <KpiBars
            rows={k.pl
              .slice()
              .sort((a, b) => b.usd - a.usd)
              .map((p) => ({ label: p.deal.id, value: p.usd, text: signed(p.usd), cls: p.usd >= 0 ? 'pos' : 'neg' }))}
          />
        </Section>
        <Section title="P&L by FX model (USD)">
          <KpiBars
            rows={Object.keys(byModel)
              .sort()
              .map((m) => ({ label: m, value: byModel[m]!, text: signed(byModel[m]!), cls: byModel[m]! >= 0 ? 'pos' : 'neg' }))}
          />
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

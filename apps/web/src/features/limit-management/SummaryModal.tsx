import { useMemo, useState } from 'react'
import { dmyFromIso } from '../../shared/fx/sap.ts'
import { buildBankSummary, formatAmount, formatPct } from './logic.ts'
import type { Limit, LimitDeal } from './types.ts'

type DealCol = { key: keyof LimitDeal; label: string; pin?: boolean; num?: boolean; date?: boolean }

const DEAL_COLS: readonly DealCol[] = [
  { key: 'dealId', label: 'Deal ID', pin: true },
  { key: 'desc', label: 'Deal ID Desc' },
  { key: 'bpName', label: 'BP Name' },
  { key: 'model', label: 'Model' },
  { key: 'dealAmt', label: 'Deal Amount', num: true },
  { key: 'pair', label: 'Currency Pair' },
  { key: 'statusDesc', label: 'Deal Status' },
  { key: 'startDate', label: 'Deal Start Date', date: true },
  { key: 'endDate', label: 'Deal End Date', date: true },
  { key: 'mcRef', label: 'Mc Reference' },
  { key: 'mcDate', label: 'Mc Date', date: true },
  { key: 'mcAmt', label: 'MC Amount', num: true },
  { key: 'region', label: 'Region ID' },
  { key: 'txnNo', label: 'Transaction No' },
  { key: 'tradeDate', label: 'Trade Date', date: true },
  { key: 'valueDate', label: 'Value Date', date: true },
]

const TOTAL = '__TOTAL__'
const arrow = (on: boolean, dir: 'asc' | 'desc') => (on ? (dir === 'asc' ? '▲' : '▼') : '⇅')

function dealCell(d: LimitDeal, c: DealCol): string {
  const v = d[c.key]
  if (c.date) return dmyFromIso(String(v))
  if (c.num) return formatAmount(Number(v))
  return v === undefined || v === null ? '' : String(v)
}

const compare = (x: unknown, y: unknown): number => (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y)))

/** Bank-wise summary of a limit, with the Deal ID list of a double-clicked bank. */
export function SummaryModal({
  limit,
  deals,
  onClose,
  onOpenDeal,
}: {
  limit: Limit
  deals: readonly LimitDeal[]
  onClose: () => void
  onOpenDeal: (deal: LimitDeal) => void
}) {
  const summary = useMemo(() => buildBankSummary(deals), [deals])
  const [bank, setBank] = useState<string | null>(null)
  const [bankSort, setBankSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null)
  const [dealSort, setDealSort] = useState<{ key: keyof LimitDeal; dir: 'asc' | 'desc' }>({ key: 'tradeDate', dir: 'asc' })
  const [shownBank, setShownBank] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [pickedDeal, setPickedDeal] = useState<string | null>(null)

  const bankRows = useMemo(() => {
    const rows = [...summary.rows]
    if (bankSort) {
      const k = bankSort.key as keyof (typeof rows)[number]
      rows.sort((a, b) => compare(a[k], b[k]) * (bankSort.dir === 'asc' ? 1 : -1))
    }
    return rows
  }, [summary, bankSort])

  const dealRows = useMemo(() => {
    if (shownBank === null) return []
    const q = search.trim().toLowerCase()
    return deals
      .filter((d) => shownBank === TOTAL || d.bpNo === shownBank)
      .filter((d) => {
        if (!q) return true
        const hay = DEAL_COLS.flatMap((c) => {
          const t = dealCell(d, c)
          return c.num ? [t, t.replace(/,/g, '')] : [t]
        })
        return hay.join(' | ').toLowerCase().includes(q)
      })
      .sort((a, b) => compare(a[dealSort.key], b[dealSort.key]) * (dealSort.dir === 'asc' ? 1 : -1))
  }, [deals, shownBank, search, dealSort])

  const bankCols = [
    { key: 'name', label: 'Business Partner' },
    { key: 'usd', label: 'USD Volume', num: true },
    { key: 'pct', label: 'Percentage Total', num: true },
    { key: 'rank', label: 'Ranking', num: true },
    { key: 'txn', label: 'No of Txn', num: true },
  ] as const

  const sortBanks = (key: string) => setBankSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  const sortDeals = (key: keyof LimitDeal) => setDealSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  const bankLabel = shownBank === TOTAL ? 'All banks' : (summary.rows.find((r) => r.bpNo === shownBank)?.name ?? shownBank)

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal m-wide" role="dialog" aria-modal="true" aria-labelledby="summaryTitle">
        <div className="modal-head-row">
          <h2 id="summaryTitle">Bank-wise Summary</h2>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div className="modal-body-scroll">
          <div className="summary-line">
            <span>
              Currency pair <b>{limit.pair}</b>
            </span>
            <span>
              Year <b>{limit.year}</b>
            </span>
            <span>
              Validity{' '}
              <b>
                {dmyFromIso(limit.startDt)} to {dmyFromIso(limit.endDt)}
              </b>
            </span>
            <span>
              Status <b>{limit.statusText}</b>
            </span>
            <span>
              Utilized{' '}
              <b>
                {formatAmount(limit.utl)} {limit.curr}
              </b>
            </span>
          </div>
          <div className="sub-title">
            Bank wise summary<span className="hint-r">Double-click a bank to list its deals</span>
          </div>
          {!summary.rows.length ? (
            <div className="popup-table-wrap">
              <table className="popup-table">
                <tbody>
                  <tr>
                    <td className="popup-empty">No deals found in the validity period.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="popup-table-wrap">
              <table className="popup-table">
                <thead>
                  <tr>
                    {bankCols.map((c) => (
                      <th key={c.key} className={`${'num' in c ? 'num ' : ''}${bankSort?.key === c.key ? 'sorted' : ''}`} onClick={() => sortBanks(c.key)}>
                        {c.label}
                        <span className="sort-ind">{arrow(bankSort?.key === c.key, bankSort?.dir ?? 'asc')}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bankRows.map((r) => (
                    <tr key={r.bpNo} className={bank === r.bpNo ? 'selected' : ''} onClick={() => setBank(r.bpNo)} onDoubleClick={() => { setBank(r.bpNo); setShownBank(r.bpNo); setSearch('') }}>
                      <td>{r.name}</td>
                      <td className="num">{formatAmount(r.usd)}</td>
                      <td className="num">{formatPct(r.pct)}</td>
                      <td className="num">{r.rank}</td>
                      <td className="num">{r.txn}</td>
                    </tr>
                  ))}
                  <tr className={`total-row${bank === TOTAL ? ' selected' : ''}`} onClick={() => setBank(TOTAL)} onDoubleClick={() => { setBank(TOTAL); setShownBank(TOTAL); setSearch('') }}>
                    <td>Total</td>
                    <td className="num">{formatAmount(summary.total.usd)}</td>
                    <td className="num">{formatPct(summary.total.pct)}</td>
                    <td className="num">{'—'}</td>
                    <td className="num">{summary.total.txn}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          {shownBank !== null && (
            <>
              <div className="sub-title">
                Deal ID details {'—'} {bankLabel}
                <span className="hint-r">
                  <span className="mini-search">
                    <span className="icon">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                        <circle cx="11" cy="11" r="7" />
                        <line x1="21" y1="21" x2="16.5" y2="16.5" />
                      </svg>
                    </span>
                    <input placeholder="Search deals..." autoComplete="off" value={search} onChange={(e) => setSearch(e.target.value)} />
                  </span>
                </span>
              </div>
              <div className="popup-table-wrap" style={{ maxHeight: 280 }}>
                <table className="popup-table">
                  <thead>
                    <tr>
                      {DEAL_COLS.map((c) => (
                        <th key={c.key} className={`${c.num ? 'num ' : ''}${c.pin ? 'pin ' : ''}${dealSort.key === c.key ? 'sorted' : ''}`} onClick={() => sortDeals(c.key)}>
                          {c.label}
                          <span className="sort-ind">{arrow(dealSort.key === c.key, dealSort.dir)}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {!dealRows.length && (
                      <tr>
                        <td className="popup-empty" colSpan={DEAL_COLS.length}>
                          No deals found.
                        </td>
                      </tr>
                    )}
                    {dealRows.map((d) => (
                      <tr key={d.dealId} className={pickedDeal === d.dealId ? 'selected' : ''} onClick={() => setPickedDeal(d.dealId)}>
                        {DEAL_COLS.map((c) =>
                          c.key === 'dealId' ? (
                            <td key={c.key} className="pin">
                              <button type="button" className="deal-link" title="Open deal details" onClick={() => onOpenDeal(d)}>
                                {d.dealId}
                              </button>
                            </td>
                          ) : (
                            <td key={c.key} className={c.num ? 'num' : ''}>
                              {dealCell(d, c)}
                            </td>
                          ),
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                {dealRows.length} {dealRows.length === 1 ? 'deal' : 'deals'}
              </div>
            </>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

import { useMemo, useState } from 'react'
import type { FxOverviewRaw } from '../live/fxOverview.ts'
import { compact } from '../live/fxOverview.ts'
import { rankRecords, RANKING_COLUMNS, type RankingKind } from '../live/rankings.ts'
import { BarChart } from './Charts.tsx'
import { DetailCard, DrillContext } from './DetailCard.tsx'

export function RankedChart({ raw, kind, company }: { raw: FxOverviewRaw; kind: RankingKind; company: string }) {
  const [limit, setLimit] = useState(5)
  const [askN, setAskN] = useState(false)
  const [draft, setDraft] = useState('5')
  const applyN = () => { const n = Math.trunc(Number(draft)); if (n >= 1) setLimit(Math.min(500, n)); setAskN(false) }
  const [category, setCategory] = useState(kind === 'contracts' ? 'USD' : '')
  const [openOnly, setOpenOnly] = useState(kind === 'fx')
  const rows = kind === 'contracts' ? raw.mcs : kind === 'fx' ? raw.fxDeals : raw.bls
  const categoryKey = kind === 'contracts' ? 'ZCURR' : kind === 'fx' ? 'SGSART' : 'ZBU'
  const categories = [...new Set((rows ?? []).map(row => row[categoryKey]).filter((s): s is string => !!s))].sort()
  if (kind === 'contracts' && !categories.includes('USD')) categories.unshift('USD')
  const selected = useMemo(() => rankRecords(raw, kind, { limit, category, openOnly, company }, new Date()), [raw, kind, limit, category, openOnly, company])
  const title = kind === 'contracts' ? 'Top master contracts by amount' : kind === 'fx' ? 'Top FX deals by USD notional' : 'Top trade flows by value (USD)'
  const currency = kind === 'contracts' ? category : 'USD'
  const format = (value: number) => currency + ' ' + compact(value)
  const names: Record<string, string> = { '12A': 'Spot', '12B': 'Forward', '12D': 'NDF' }
  return <DrillContext.Provider value={(heading, mark) => ({ title: heading + (mark ? ' - ' + mark : ''), rows: selected.filter(item => !mark || item.label === mark).map(item => item.row), unavailable: rows === null, columns: RANKING_COLUMNS[kind] })}>
    <DetailCard title={title}><div className="mp-panel mp-ranked-panel">
      <div className="mp-panel-head"><div className="mp-panel-title">{title}</div></div>
      <div className="mp-ranking-filters" aria-label={title + ' filters'}>
        <label>Top<select value={[5, 10, 20, 50].includes(limit) ? limit : 'N'} onChange={e => { if (e.target.value === 'N') { setDraft(String(limit)); setAskN(true) } else setLimit(Number(e.target.value)) }} aria-label={title + ': count'}>{[5, 10, 20, 50].map(n => <option key={n} value={n}>{n}</option>)}<option value="N">{[5, 10, 20, 50].includes(limit) ? 'N' : 'N (' + limit + ')'}</option></select></label>
        <label>{kind === 'contracts' ? 'Currency' : kind === 'fx' ? 'Product' : 'Business unit'}<select value={category} onChange={e => setCategory(e.target.value)} aria-label={title + ': category'}>{kind !== 'contracts' && <option value="">All</option>}{categories.map(code => <option key={code} value={code}>{kind === 'fx' ? names[code] ?? code : code}</option>)}</select></label>
        {kind !== 'trade' && <label>Show<select value={openOnly ? 'open' : 'all'} onChange={e => setOpenOnly(e.target.value === 'open')} aria-label={title + ': scope'}><option value="all">All</option><option value="open">{kind === 'contracts' ? 'In use' : 'Not matured'}</option></select></label>}
      </div>
      <p className="mp-ranking-note">{kind === 'contracts' ? 'One currency at a time; amounts are not converted.' : kind === 'fx' ? 'Uses the company filter. Only deals with a USD leg are ranked.' : 'Ranked by bill of lading trade value.'}</p>
      {rows === null ? <p className="mp-scope-note">Source unavailable. Refresh to retry.</p> : selected.length ? <div className="mp-ranking-scroll"><BarChart large data={selected} unit={currency} format={format} title={title} /></div> : <p className="mp-scope-note">No amounts match these filters.</p>}
      {askN && <div className="mp-n-backdrop" role="presentation" onClick={() => setAskN(false)}>
        <form className="mp-n-dialog" role="dialog" aria-modal="true" aria-label="Enter N" onClick={e => e.stopPropagation()} onSubmit={e => { e.preventDefault(); applyN() }}>
          <label>Number of rows to show<input type="number" min="1" max="500" autoFocus value={draft} onChange={e => setDraft(e.target.value)} /></label>
          <div className="mp-n-actions"><button type="button" onClick={() => setAskN(false)}>Cancel</button><button type="submit" disabled={!(Math.trunc(Number(draft)) >= 1)}>Apply</button></div>
        </form>
      </div>}
    </div></DetailCard>
  </DrillContext.Provider>
}

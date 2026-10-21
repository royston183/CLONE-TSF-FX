import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import type { Detail } from '../live/fxDrilldown.ts'

const FIELD_LABELS: Record<string, string> = {
  RFHA: 'Transaction', BUKRS: 'Company code', ZCOM_ID: 'Entity / company', DCRDAT: 'Trade date',
  DELFZ: 'Value date', SGSART: 'Product', CURR1: 'Lead currency', CURR2: 'Follow currency',
  BS_1: 'Buy / sell', AMT1: 'Lead amount', USD_NOTIONAL: 'USD notional', T_RATE: 'Rate', SAKTIV: 'Active status',
  ZMC_REF_NO: 'Master contract', ZMC_REF: 'Master contract', ZMC_DESC: 'Description', ZMC_DATE: 'Contract date',
  ZCOM_DESC: 'Commodity', ZAMT: 'Amount', ZCURR: 'Currency', ZSHIP_START: 'Shipment start', ZSHIP_END: 'Shipment end',
  ZMC_STAT: 'Status', ZMOD_DESC: 'FX model', ZDEAL_ID: 'Deal ID', ZDEAL_DESC: 'Description', ZDEAL_STAT: 'Status',
  ZTSF_MODEL: 'FX model', ZCREATED_DATE: 'Created date', ZBL_NO: 'Bill of lading', ZTF_NO: 'Trade flow',
  ZBU: 'Business unit', ZTTV: 'Trade value (USD)', ZBL_STAT_ID: 'Status', ZINV_NO: 'Invoice',
  ZINV_DATE: 'Invoice date', ZAMT_USD: 'Amount (USD)', RECORD_TYPE: 'Record type', RECORD_ID: 'Reference',
  ZORIGIN: 'Origin entity', ZBL_SPLIT: 'Bill split',
}

export const DrillContext = createContext<(title: string, mark?: string) => Detail>(() => ({ title: '', rows: [], columns: [], unavailable: false }))

function markOf(target: EventTarget | null): string {
  return target instanceof Element ? target.closest('[data-drill]')?.getAttribute('data-drill') ?? '' : ''
}

export function DetailCard({ title, children, kpi = false }: { title: string; children: ReactNode; kpi?: boolean }) {
  const resolve = useContext(DrillContext)
  const [opened, setOpened] = useState<{ detail: Detail; table: boolean; resolve: typeof resolve; chart: ReactNode } | null>(null)
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const isOpen = opened !== null
  useEffect(() => {
    if (!isOpen) return
    dialog.current?.showModal()
    const old = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = old }
  }, [isOpen])
  const close = () => { setTip(null); setOpened(null) }
  const open = (mark = '', table = kpi) => {
    const snapshot = opened?.resolve ?? resolve
    setTip(null)
    setOpened({ detail: snapshot(title, mark), table, resolve: snapshot, chart: opened?.chart ?? children })
  }
  const hover = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target : null
    let node = target
    let text = ''
    while (node && node !== event.currentTarget) {
      text = node.getAttribute('title') || Array.from(node.children).find(child => child.tagName.toLowerCase() === 'title')?.textContent || ''
      if (text) break
      node = node.parentElement
    }
    setTip(text ? { text, x: Math.max(8, Math.min(event.clientX + 14, window.innerWidth - 295)), y: Math.min(event.clientY + 14, window.innerHeight - 100) } : null)
  }
  return <>
    <div className={kpi ? 'mp-detail-card mp-detail-kpi' : 'mp-detail-card'} onDoubleClick={e => { if (!(e.target instanceof Element && e.target.closest('button, input, select, label'))) open(markOf(e.target), kpi || !!markOf(e.target)) }} onMouseMove={hover} onMouseLeave={() => setTip(null)}>
      {children}
      <button type="button" className="mp-detail-open" aria-label={'View details: ' + title} onClick={() => open()}>View details</button>
    </div>
    {tip && !opened && createPortal(<div className="mp-chart-tooltip" role="tooltip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>, document.body)}
    {opened && createPortal(<dialog ref={dialog} className="mp-detail-dialog" aria-labelledby="mp-detail-title" onCancel={close} onClick={e => { if (e.target === e.currentTarget) close() }}>
      {tip && <div className="mp-chart-tooltip" role="tooltip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>}<header className="mp-detail-head"><div><h2 id="mp-detail-title">{opened.detail.title}</h2><p>Current dashboard filters retained - {opened.detail.rows.length.toLocaleString()} records</p></div><button type="button" className="mp-scope" aria-label="Close details" onClick={close}>Close</button></header>
      {!kpi && <div className="mp-detail-tabs"><button type="button" className="mp-scope" aria-pressed={!opened.table} onClick={() => setOpened({ ...opened, detail: opened.resolve(title), table: false })}>Chart</button><button type="button" className="mp-scope" aria-pressed={opened.table} onClick={() => setOpened({ ...opened, table: true })}>Table</button></div>}
      {opened.table ? <div className="mp-detail-scroll">{opened.detail.unavailable ? <p>Source unavailable. Refresh the dashboard to retry.</p> : !opened.detail.rows.length ? <p>No contributing records for this selection.</p> : <table className="mp-activity mp-detail-table"><thead><tr>{opened.detail.columns.map(col => <th key={col}>{FIELD_LABELS[col] ?? col.replaceAll('_', ' ')}</th>)}</tr></thead><tbody>{opened.detail.rows.map((row, i) => <tr key={i}>{opened.detail.columns.map(col => <td key={col}>{row[col] ?? '\u2014'}</td>)}</tr>)}</tbody></table>}</div> : <><p className="mp-scope-note">Click a chart value to view its contributing records.</p><div className="mp-detail-chart" onMouseMove={hover} onMouseLeave={() => setTip(null)} onClick={e => { const mark = markOf(e.target); if (mark) open(mark, true) }}>{opened.chart}</div></>}
    </dialog>, document.body)}
  </>
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { isAbort } from '../../shared/fx/mw.ts'
import { loadScreen, type DataSource } from './api.ts'
import { DateField } from './DateField.tsx'
import { MODELS, ORIGIN_OPTIONS, REGION_OPTIONS } from './data.ts'
import { DealWorkspace } from './DealWorkspace.tsx'
import { DetailModal } from './DetailModal.tsx'
import { dateToIso, formatAmount, parseDisplayDate, toDisplayDate } from './format.ts'
import { buildCsv, filterRows, nextSort, sortRows, statusClass } from './logic.ts'
import './mo-deal-id-invoice-status.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './mo-deal-id-invoice-status.dark.css'
import type { DealRow, DmsDocState, ModalState, Sort, SortKey } from './types.ts'

const PAGE_SIZE = 20

type Column = { key: keyof DealRow; label: string; width: number; date?: boolean; amount?: boolean; status?: boolean; hotspot?: 'deal' | 'invoice'; sticky?: boolean }

const COLUMNS: Column[] = [
  { key: 'dealId', label: 'Deal ID', width: 118, hotspot: 'deal', sticky: true },
  { key: 'dealDesc', label: 'Deal ID Desc', width: 185 },
  { key: 'mcRef', label: 'MC Ref No', width: 118 },
  { key: 'startDate', label: 'Start Date', width: 105, date: true },
  { key: 'endDate', label: 'End Date', width: 105, date: true },
  { key: 'rfha1', label: 'FX Deal 1', width: 112 },
  { key: 'rfha2', label: 'FX Deal 2', width: 112 },
  { key: 'rfha3', label: 'FX Deal 3', width: 112 },
  { key: 'rfha4', label: 'FX Deal 4', width: 112 },
  { key: 'rfha5', label: 'FX Deal 5', width: 112 },
  { key: 'dealStatus', label: 'Deal Status', width: 104 },
  { key: 'dealStatusDesc', label: 'Deal Status Desc', width: 142, status: true },
  { key: 'origin', label: 'Origin Entity', width: 112 },
  { key: 'modelId', label: 'FX Model', width: 100 },
  { key: 'region', label: 'Region', width: 88 },
  { key: 'modelDesc', label: 'FX Model Desc', width: 150 },
  { key: 'utiAmt', label: 'D1(USD)', width: 122, amount: true },
  { key: 'invStatus', label: 'Inv Status', width: 105, hotspot: 'invoice' },
  { key: 't1Amt', label: 'T1(USD)', width: 122, amount: true },
]

const SORTABLE_KEYS = new Set(['dealId', 'dealDesc', 'mcRef', 'startDate', 'endDate', 'dealStatus', 'dealStatusDesc', 'origin', 'modelId', 'region', 'modelDesc', 'utiAmt', 'invStatus', 't1Amt'])

function cellDisplay(row: DealRow, col: Column): { text: string; empty: boolean } {
  const raw = row[col.key]
  if (col.date) {
    const d = toDisplayDate(String(raw ?? ''))
    return { text: d || '\u2014', empty: !d }
  }
  if (col.amount) {
    const text = formatAmount(raw as number | null)
    return { text, empty: raw === null || raw === undefined || raw === '' }
  }
  const text = raw === null || raw === undefined || raw === '' ? '' : String(raw)
  return { text: text || '\u2014', empty: !text }
}

/**
 * MO: Deal ID Invoice Status (ZSGTSFR014), converted from
 * legacy/ZSGTSF_RDEAL_ID_INV_STAT_NO_TXN_UNDERLINE.html.
 *
 * The Deal IDs come from ZSGTSFTR_DEALID through the SLC middleware (api.ts), read-only as in
 * the report. Nothing falls back to sample data: when the middleware cannot be read the list
 * stays empty and says WAITING FOR DEAL ID API. The Deal ID workspace (ZSGTSF_PDEAL_ID_ANALYS,
 * not in this export) shows the Deal ID / MC fields; its FX legs, planned invoices and P&L say
 * WAITING FOR API, and its popups WAITING FOR ACTION API.
 */
export default function MoDealIdInvoiceStatus() {
  const [rows, setRows] = useState<DealRow[]>([])
  /** Where the rows came from; 'unavailable' means ZSGTSFTR_DEALID could not be read. */
  const [source, setSource] = useState<DataSource | 'loading'>('loading')
  /** Why the list is empty, or which columns wait for an API. */
  const [notes, setNotes] = useState<string[]>([])
  /** Bumped by Refresh, which re-reads MySQL. */
  const [generation, setGeneration] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setSource('loading')
    loadScreen(controller.signal)
      .then((loaded) => {
        setRows(loaded.rows)
        setSource(loaded.source)
        setNotes(loaded.notes)
      })
      .catch((error: unknown) => {
        if (!isAbort(error)) console.error('[fx] Deal ID invoice status failed to load', error)
      })
    return () => controller.abort()
  }, [generation])

  const [search, setSearch] = useState('')
  const [origin, setOrigin] = useState('')
  const [region, setRegion] = useState('')
  const [model, setModel] = useState('')
  const [keyDate, setKeyDate] = useState('')
  const [sort, setSort] = useState<Sort>({ key: null, dir: 1 })
  const [page, setPage] = useState(1)

  const [openDealId, setOpenDealId] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>(null)
  const dmsState = useRef<Record<string, Record<string, DmsDocState>>>({})
  const [dmsFeedback, setDmsFeedback] = useState('')
  const [, forceRender] = useState(0)

  const keyIso = useMemo(() => {
    const d = parseDisplayDate(keyDate.trim())
    return d ? dateToIso(d) : ''
  }, [keyDate])

  const filtered = useMemo(() => filterRows(rows, search, origin, region, model, keyIso), [rows, search, origin, region, model, keyIso])
  const sorted = useMemo(() => sortRows(filtered, sort), [filtered, sort])
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const start = (currentPage - 1) * PAGE_SIZE
  const pageRows = sorted.slice(start, start + PAGE_SIZE)

  const findRow = (id: string): DealRow | undefined => rows.find((r) => r.dealId === id)
  const openRow = openDealId ? findRow(openDealId) : undefined

  const resetAll = () => {
    setSearch('')
    setOrigin('')
    setRegion('')
    setModel('')
    setKeyDate('')
    setSort({ key: null, dir: 1 })
    setPage(1)
    setOpenDealId(null)
    setModal(null)
  }

  const refreshAll = () => {
    setGeneration((g) => g + 1)
    resetAll()
  }

  const downloadCsv = () => {
    const blob = new Blob([buildCsv(sorted)], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'deal_id_invoice_status.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const dmsStateForOpen = openDealId ? (dmsState.current[openDealId] ??= {}) : {}

  const pagerButtons = Array.from({ length: totalPages }, (_, i) => i + 1)

  return (
    <div className="modinvstat">
      <header className="topbar">
        <BackButton className="back-btn" />
        <div className="brand-mark" aria-label="Fourth Signal">
          <span className="m1" />
          <span className="m2" />
          <span className="m3" />
          <span className="m4" />
        </div>
        <div className="title-wrap">
          <h1>Deal ID Invoice Status</h1>
          <span className="title-sub">FX</span>
        </div>
        <div className="header-actions">
          <button className="header-btn" type="button" onClick={refreshAll}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 11a8 8 0 10-2.3 5.7" />
              <path d="M20 5v6h-6" />
            </svg>
            <span>Refresh</span>
          </button>
          <SignOutButton className="header-btn" />
        </div>
      </header>

      <main className="app">
        <section className="card" aria-label="Deal ID List Report: Invoice Status">
          <div className="card-titlebar">
            <div className="card-title">Deal ID List Report: Invoice Status</div>
            <div className="record-count">
              {sorted.length + (sorted.length === 1 ? ' record' : ' records')}
              <SourceNote source={source} notes={notes} />
            </div>
            <div className="card-title-actions">
              <button className="icon-btn" type="button" title="Download CSV" onClick={downloadCsv}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 3v12" />
                  <path d="M7 10l5 5 5-5" />
                  <path d="M5 20h14" />
                </svg>
              </button>
            </div>
          </div>

          <div className="toolbar">
            <div className="search-wrap">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-4-4" />
              </svg>
              <input
                className="search-input"
                type="text"
                placeholder="Search Deal IDs..."
                autoComplete="off"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
              />
            </div>
            <div className="select-wrap">
              <select
                className="control"
                title="Origin Entity"
                value={origin}
                onChange={(e) => {
                  setOrigin(e.target.value)
                  setPage(1)
                }}
              >
                <option value="">Origin Entity</option>
                {ORIGIN_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.id} {'\u2014'} {o.desc}
                  </option>
                ))}
              </select>
            </div>
            <div className="select-wrap">
              <select
                className="control"
                title="Region"
                value={region}
                onChange={(e) => {
                  setRegion(e.target.value)
                  setPage(1)
                }}
              >
                <option value="">Region</option>
                {REGION_OPTIONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.desc ? `${r.id} \u2014 ${r.desc}` : r.id}
                  </option>
                ))}
              </select>
            </div>
            <div className="select-wrap">
              <select
                className="control"
                title="FX Model"
                value={model}
                onChange={(e) => {
                  setModel(e.target.value)
                  setPage(1)
                }}
              >
                <option value="">FX Model</option>
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id} {'\u2014'} {m.desc}
                  </option>
                ))}
              </select>
            </div>
            <DateField
              id="keyDateInput"
              value={keyDate}
              onChange={(v) => {
                setKeyDate(v)
                setPage(1)
              }}
            />
            <button className="reset-btn" type="button" onClick={resetAll}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 4v6h6" />
                <path d="M5.5 9A8 8 0 1120 13" />
              </svg>
              Reset
            </button>
            <div className="toolbar-spacer" />
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="sel-col">
                    <span title="Single-row selection">{'\u2610'}</span>
                  </th>
                  {COLUMNS.map((col) => {
                    const sortable = SORTABLE_KEYS.has(col.key)
                    const mark = sort.key === col.key ? (sort.dir === 1 ? '\u25B2' : '\u25BC') : '\u2195'
                    return (
                      <th
                        key={col.key}
                        className={`${sortable ? 'sortable' : ''}${col.sticky ? ' deal-sticky' : ''}`}
                        style={{ width: col.width, minWidth: col.width, maxWidth: col.width }}
                        onClick={sortable ? () => setSort((s) => nextSort(s, col.key as SortKey)) : undefined}
                      >
                        {col.label}
                        {sortable ? <span className="sort-mark">{mark}</span> : null}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td className="no-rows" colSpan={COLUMNS.length + 1}>
                      {source === 'unavailable' ? notes.join(' · ') : 'No record found'}
                    </td>
                  </tr>
                ) : (
                  pageRows.map((row) => (
                    <tr key={row.dealId} className={openDealId === row.dealId ? 'selected' : ''} onClick={() => setOpenDealId(row.dealId)}>
                      <td className="sel-col">
                        <input className="row-check" type="checkbox" readOnly checked={openDealId === row.dealId} aria-label={`Select ${row.dealId}`} onClick={(e) => e.stopPropagation()} />
                      </td>
                      {COLUMNS.map((col) => {
                        const { text, empty } = cellDisplay(row, col)
                        const classes = [col.amount ? 'amount' : '', col.status ? `status-text ${statusClass(String(row[col.key]))}` : '', empty ? 'empty-value' : '', col.hotspot ? 'link-cell' : '', col.sticky ? 'deal-sticky' : '']
                          .filter(Boolean)
                          .join(' ')
                        if (col.hotspot === 'deal') {
                          return (
                            <td key={col.key} className={classes} title={text}>
                              <span
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setOpenDealId(row.dealId)
                                }}
                              >
                                {text}
                              </span>
                            </td>
                          )
                        }
                        if (col.hotspot === 'invoice') {
                          return (
                            <td key={col.key} className={classes} title={text}>
                              <span
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setModal({ kind: 'invoice', row })
                                }}
                              >
                                {text}
                              </span>
                            </td>
                          )
                        }
                        return (
                          <td key={col.key} className={classes} title={text}>
                            {text}
                          </td>
                        )
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="footer">
            <span>{sorted.length ? `Showing ${start + 1}\u2013${Math.min(start + PAGE_SIZE, sorted.length)} of ${sorted.length}` : 'Showing 0 of 0'}</span>
            <div className="pager">
              <button className="page-btn" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>
                &lsaquo;
              </button>
              {pagerButtons.map((p) => (
                <button key={p} className={`page-btn ${p === currentPage ? 'active' : ''}`} onClick={() => setPage(p)}>
                  {p}
                </button>
              ))}
              <button className="page-btn" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>
                &rsaquo;
              </button>
            </div>
          </div>
        </section>
      </main>

      {openRow ? (
        <DealWorkspace
          row={openRow}
          onClose={() => setOpenDealId(null)}
          onRefresh={() => forceRender((n) => n + 1)}
          onChange={() => setModal({ kind: 'change', row: openRow })}
          onPremium={() => setModal({ kind: 'premium', row: openRow })}
          onEditPair={() => setModal({ kind: 'editPair', row: openRow })}
          onCancel={() => setModal({ kind: 'cancel', row: openRow })}
          onDms={() => setModal({ kind: 'dms', row: openRow })}
          onReverse={() => setModal({ kind: 'info', title: 'Reverse MO Confirmation', message: 'Confirmation is required before reversing MO confirmation.' })}
        />
      ) : null}

      {modal ? (
        <DetailModal
          state={modal}
          dmsState={dmsStateForOpen}
          dmsFeedback={dmsFeedback}
          onDmsFile={(docCode, file) => {
            if (!openDealId) return
            const state = (dmsState.current[openDealId] ??= {})
            state[docCode] = { fileName: file.name, filePath: `C:\\fakepath\\${file.name}`, fileSize: file.size || 0, dmsCode: `DMS-${openDealId.slice(-4)}-${docCode}`, comment: state[docCode]?.comment ?? '' }
            setDmsFeedback(`${file.name} selected for ${docCode}.`)
            forceRender((n) => n + 1)
          }}
          onDmsClear={(docCode) => {
            if (!openDealId) return
            const state = (dmsState.current[openDealId] ??= {})
            state[docCode] = { fileName: '', filePath: '', fileSize: 0, dmsCode: '', comment: state[docCode]?.comment ?? '' }
            setDmsFeedback(`Attachment cleared for ${docCode}.`)
            forceRender((n) => n + 1)
          }}
          onDmsComment={(docCode, value) => {
            if (!openDealId) return
            const state = (dmsState.current[openDealId] ??= {})
            state[docCode] = { ...(state[docCode] ?? { fileName: '', filePath: '', fileSize: 0, dmsCode: '' }), comment: value }
            forceRender((n) => n + 1)
          }}
          onClose={() => {
            setModal(null)
            setDmsFeedback('')
          }}
        />
      ) : null}
    </div>
  )
}

/** Says where the rows came from, and which columns are waiting for an API. */
function SourceNote({ source, notes }: { source: DataSource | 'loading'; notes: readonly string[] }) {
  const text = source === 'loading' ? 'Loading from MySQL…' : source === 'sap' ? ['ZSGTSFTR_DEALID · MySQL', ...notes].join(' · ') : notes.join(' · ')
  return <span style={{ marginLeft: 10, fontSize: 11, fontWeight: 500, opacity: 0.7 }}>{text}</span>
}

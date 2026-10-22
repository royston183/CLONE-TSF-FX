import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { FS_SHORT_LOGO } from '../../shared/fx/logo.ts'
import { isAbort } from '../../shared/fx/mw.ts'
import { dmyFromIso } from '../../shared/fx/sap.ts'
import { createAdditionalLimit, createInitialLimit, loadCurrencyPairs, loadDeals, loadLimits } from './api.ts'
import { MailModal, DealModal } from './InfoModals.tsx'
import { SetLimitModal, leadCurrency, type SetLimitRequest } from './SetLimitModal.tsx'
import { SummaryModal } from './SummaryModal.tsx'
import { buildLimitEmail, canSetAdditional, dealsForLimit, deriveLimit, formatAmount, STATUS_LIST } from './logic.ts'
import type { Limit, LimitDeal, MailPreview, RawLimit } from './types.ts'
import './limit-management.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './limit-management.dark.css'

type Col = { key: keyof Limit; label: string; type: 'date' | 'num' | 'text' | 'status' | 'light'; cls?: 'c-total' | 'c-util' | 'bal'; sortKey?: keyof Limit }

const COLS: readonly Col[] = [
  { key: 'startDt', label: 'Start Date', type: 'date' },
  { key: 'year', label: 'Year', type: 'text' },
  { key: 'endDt', label: 'End Date', type: 'date' },
  { key: 'zad', label: 'Total Approved Amt', type: 'num', cls: 'c-total' },
  { key: 'total', label: 'Total Limit Amount', type: 'num', cls: 'c-total' },
  { key: 'zin', label: 'Initial Limit Amt', type: 'num' },
  { key: 'zadd', label: 'Add Limit Amt', type: 'num' },
  { key: 'utl', label: 'Utilized Amt', type: 'num', cls: 'c-util' },
  { key: 'statusText', label: 'Status Description', type: 'status' },
  { key: 'light', label: 'Status', type: 'light', sortKey: 'statusText' },
  { key: 'curr', label: 'Limit Curr', type: 'text' },
  { key: 'balance', label: 'Balance Amt', type: 'num', cls: 'bal' },
]

const DASH = '—'
const yearIsValid = (y: string) => /^\d{4}$/.test(y)

function cellText(row: Limit, col: Col): string {
  const v = row[col.key]
  if (col.type === 'date') return dmyFromIso(String(v))
  if (col.type === 'num') return formatAmount(Number(v))
  if (col.type === 'light') return row.kind === 'ok' ? 'Green' : row.kind === 'bad' ? 'Red' : 'Yellow'
  return v === '' || v === null || v === undefined ? '' : String(v)
}

type Alert = { text: string; kind: 'warn' | 'info' } | null

/**
 * Limit Management Dashboard (supplied limit-management-dashboard.html). Limits are read from the middleware (api.ts says which
 * table it needs and reports exactly what is missing); utilisation and the bank-wise summary come from the real D1 Deal IDs.
 */
export default function LimitManagement() {
  const [limits, setLimits] = useState<RawLimit[]>([])
  const [deals, setDeals] = useState<LimitDeal[] | null>(null)
  const [pairMaster, setPairMaster] = useState<string[]>([])
  const [notices, setNotices] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [generation, setGeneration] = useState(0)

  const [pair, setPair] = useState('')
  const [year, setYear] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [sort, setSort] = useState<{ key: keyof Limit; dir: 'asc' | 'desc' }>({ key: 'startDt', dir: 'asc' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newRowId, setNewRowId] = useState<string | null>(null)
  const [alert, setAlert] = useState<Alert>(null)
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null)
  const [setMode, setSetMode] = useState<'initial' | 'additional' | null>(null)
  const [saving, setSaving] = useState(false)
  const [summaryId, setSummaryId] = useState<string | null>(null)
  const [dealOpen, setDealOpen] = useState<LimitDeal | null>(null)
  const [mail, setMail] = useState<MailPreview | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const showToast = useCallback((text: string, error = false) => {
    setToast({ text, error })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3200)
  }, [])
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    Promise.all([loadLimits(controller.signal), loadDeals(controller.signal), loadCurrencyPairs(controller.signal)])
      .then(([l, d, p]) => {
        setLimits(l.rows)
        setDeals(d.unavailable ? null : d.rows)
        setPairMaster(p)
        setNotices([l.unavailable, d.unavailable].filter((n): n is string => !!n))
        setLoading(false)
      })
      .catch((error) => {
        if (!isAbort(error)) {
          setNotices([error instanceof Error ? error.message : String(error)])
          setLoading(false)
        }
      })
    return () => controller.abort()
  }, [generation])

  const derived = useMemo(() => limits.map((r) => deriveLimit(r)), [limits])
  const pairs = useMemo(() => [...new Set([...pairMaster, ...limits.map((l) => l.pair)])].filter(Boolean).sort(), [pairMaster, limits])
  const selected = useMemo(() => derived.find((r) => r.id === selectedId) ?? null, [derived, selectedId])

  const loaded = pair && yearIsValid(year) ? derived.filter((r) => r.pair === pair && String(r.year) === year) : null
  const rows = useMemo(() => {
    if (!loaded) return null
    const q = search.trim().toLowerCase()
    const out = loaded.filter((r) => {
      if (status && r.statusText !== status) return false
      if (!q) return true
      const hay = COLS.flatMap((c) => {
        const t = cellText(r, c)
        return c.type === 'num' ? [t, t.replace(/,/g, '')] : [t]
      })
      return hay.join(' | ').toLowerCase().includes(q)
    })
    const dir = sort.dir === 'asc' ? 1 : -1
    return out.sort((a, b) => {
      const x = a[sort.key]
      const y = b[sort.key]
      let c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''))
      if (c === 0) c = a.startDt < b.startDt ? -1 : a.startDt > b.startDt ? 1 : 0
      return c * dir
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derived, pair, year, search, status, sort])

  const total = rows?.length ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(page, pageCount)
  const start = (current - 1) * pageSize
  const pageRows = rows ? rows.slice(start, start + pageSize) : []

  const resetFilters = () => {
    setPair('')
    setYear('')
    setSearch('')
    setStatus('')
    setSort({ key: 'startDt', dir: 'asc' })
    setPage(1)
    setSelectedId(null)
    setAlert(null)
  }
  const refreshAll = () => {
    setSetMode(null)
    setSummaryId(null)
    setDealOpen(null)
    setMail(null)
    setPageSize(20)
    resetFilters()
    setGeneration((g) => g + 1)
    showToast('Dashboard refreshed')
  }

  const doSetAdditional = (row: Limit | null) => {
    if (!row) {
      setAlert({ text: 'Select a limit first.', kind: 'info' })
      return
    }
    if (!canSetAdditional(row)) {
      setAlert({ text: `An additional limit can only be set on an approved limit. This limit is "${row.statusText}".`, kind: 'warn' })
      return
    }
    setAlert(null)
    setSelectedId(row.id)
    setSetMode('additional')
  }

  const submitLimit = async (request: SetLimitRequest) => {
    setSaving(true)
    try {
      if (request.mode === 'initial') {
        await createInitialLimit({ pair: request.pair, startDt: request.startDt, endDt: request.endDt, year: request.year, curr: leadCurrency(request.pair), amount: request.amount })
        const draft: RawLimit = { id: '', pair: request.pair, year: request.year, startDt: request.startDt, endDt: request.endDt, curr: leadCurrency(request.pair), zini: 0, zad: 0, zunaprov: request.amount, utl: 0, app: false, rej: false, addlim: false }
        setMail(buildLimitEmail(draft, 'initial', request.amount, 0))
        setPair(request.pair)
        setYear(String(request.year))
        setSearch('')
        setStatus('')
        setPage(1)
        setNewRowId([request.pair, request.startDt, request.endDt].join('|'))
      } else {
        const raw = limits.find((l) => l.id === request.row.id)
        if (!raw) throw new Error('The limit is no longer in the list. Refresh and try again.')
        await createAdditionalLimit(raw, request.amount)
        setMail(buildLimitEmail(raw, 'additional', raw.zini, request.amount))
        setNewRowId(raw.id)
      }
      setSetMode(null)
      setSelectedId(null)
      showToast(request.mode === 'initial' ? 'Initial limit submitted for approval' : 'Additional limit submitted for approval')
      setGeneration((g) => g + 1)
    } catch (error) {
      showToast(`The limit was not saved: ${error instanceof Error ? error.message : String(error)}`, true)
    } finally {
      setSaving(false)
    }
  }

  const summaryLimit = summaryId ? (derived.find((r) => r.id === summaryId) ?? null) : null
  const summaryDeals = useMemo(() => (summaryLimit && deals ? dealsForLimit(summaryLimit, deals) : []), [summaryLimit, deals])

  const sortBy = (key: keyof Limit) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
    setPage(1)
  }

  const pageButtons = useMemo(() => {
    const out: (number | '...')[] = []
    for (let p = 1; p <= pageCount; p++) {
      if (p === 1 || p === pageCount || Math.abs(p - current) <= 1) out.push(p)
      else if (out[out.length - 1] !== '...') out.push('...')
    }
    return out
  }, [pageCount, current])

  const yearTyping = year !== '' && !yearIsValid(year)
  const anyLoaded = !!loaded && loaded.length > 0

  return (
    <div className="limitmgmt">
      <div className="app">
        <div className="page-header">
          <BackButton className="btn btn-secondary" />
          <img className="logo-img" src={FS_SHORT_LOGO} alt="Fourth Signal" />
          <div className="header-text">
            <h1>Limit Management Dashboard</h1>
            <p>Merchanting dashboard &mdash; FX limits by currency pair and year</p>
          </div>
          <div className="header-actions">
            <button className="btn btn-secondary" type="button" onClick={refreshAll} title="Reload data and restore the initial screen">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-3-6.7" />
                <polyline points="21 3 21 9 15 9" />
              </svg>
              Refresh
            </button>
            <SignOutButton className="btn btn-secondary" />
          </div>
        </div>

        {notices.map((n) => (
          <div key={n} className="inline-alert show warn" role="alert" style={{ margin: '0 0 10px' }}>
            <span>WAITING FOR API &mdash; {n}</span>
          </div>
        ))}

        <div className="table-col">
          <div className="card">
            <div className="section-title">
              <span className="dot" />
              List of Limits
              <span className="section-note">{rows ? `${pair} · ${year} · double-click a limit for the bank-wise summary` : ''}</span>
            </div>
            <div className="table-toolbar">
              <div className="search-box">
                <span className="icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <circle cx="11" cy="11" r="7" />
                    <line x1="21" y1="21" x2="16.5" y2="16.5" />
                  </svg>
                </span>
                <input placeholder="Search limits..." autoComplete="off" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
              </div>
              <select className="control filter-select" title="Currency pair" aria-label="Currency pair" value={pair} onChange={(e) => { setPair(e.target.value); setPage(1); setSelectedId(null) }}>
                <option value="">Select currency pair ...</option>
                {pairs.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <input
                className="control filter-year"
                placeholder="Limit year"
                maxLength={4}
                inputMode="numeric"
                autoComplete="off"
                title="Limit year (yyyy)"
                aria-label="Limit year"
                value={year}
                onChange={(e) => { setYear(e.target.value.replace(/\D/g, '')); setPage(1); setSelectedId(null) }}
              />
              <select className="control filter-select" title="Status" aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
                <option value="">All statuses</option>
                {STATUS_LIST.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button className="btn btn-secondary btn-sm" type="button" onClick={resetFilters}>
                Reset
              </button>
              <span className="toolbar-divider" />
              <button className="btn btn-primary btn-sm" type="button" onClick={() => { setAlert(null); setSetMode('initial') }}>
                Set Initial Limit
              </button>
              <button
                className={`btn btn-secondary btn-sm${dragId !== null ? ' drag-valid' : ''}${dragOver ? ' drag-over' : ''}`}
                type="button"
                disabled={selectedId === null}
                onClick={() => doSetAdditional(selected)}
                onDragOver={(e) => {
                  if (dragId === null) return
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  const row = derived.find((r) => r.id === dragId) ?? null
                  setDragId(null)
                  setDragOver(false)
                  if (row) doSetAdditional(row)
                }}
              >
                Set Additional Limit
              </button>
              <div className="toolbar-spacer" />
              <span className="result-count">{rows ? `${total} ${total === 1 ? 'limit' : 'limits'}` : ''}</span>
            </div>
            {alert && (
              <div className={`inline-alert show ${alert.kind}`} role="alert">
                <span>{alert.text}</span>
                <button className="alert-close" type="button" aria-label="Dismiss" onClick={() => setAlert(null)}>
                  &times;
                </button>
              </div>
            )}
            <div className="table-scroll">
              {rows && total > 0 && (
                <table className="mc-table">
                  <thead>
                    <tr>
                      <th className="no-sort action-col" />
                      {COLS.map((c) => {
                        const sk = c.sortKey ?? c.key
                        const on = sort.key === sk
                        if (c.type === 'light')
                          return (
                            <th key={c.key} className="no-sort">
                              {c.label}
                            </th>
                          )
                        return (
                          <th key={c.key} className={`${c.type === 'num' ? 'num ' : ''}${on ? 'sorted' : ''}`} onClick={() => sortBy(sk)}>
                            {c.label}
                            <span className="sort-ind">{on ? (sort.dir === 'asc' ? '▲' : '▼') : '⇅'}</span>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((r) => {
                      const on = selectedId === r.id
                      return (
                        <tr
                          key={r.id}
                          draggable
                          className={`${on ? 'selected ' : ''}${newRowId === r.id ? 'row-new ' : ''}${dragId === r.id ? 'dragging' : ''}`}
                          onClick={(e) => {
                            const isCb = (e.target as HTMLElement).classList.contains('row-select-checkbox')
                            setSelectedId(isCb && on ? null : r.id)
                            setAlert(null)
                          }}
                          onDoubleClick={() => { setSelectedId(r.id); setSummaryId(r.id) }}
                          onDragStart={(e) => {
                            setSelectedId(r.id)
                            setDragId(r.id)
                            e.dataTransfer.effectAllowed = 'copy'
                            e.dataTransfer.setData('text/plain', r.id)
                          }}
                          onDragEnd={() => { setDragId(null); setDragOver(false) }}
                        >
                          <td className="action-col">
                            <input type="checkbox" className="row-select-checkbox" aria-label="Select limit row" checked={on} readOnly />
                          </td>
                          {COLS.map((c) => {
                            const txt = cellText(r, c)
                            const cls = [
                              c.type === 'num' ? 'num' : '',
                              c.cls === 'c-total' ? 'c-total' : '',
                              c.cls === 'c-util' ? 'c-util' : '',
                              c.cls === 'bal' ? (r.balance < 0 ? 'c-bal-neg' : 'c-bal-pos') : '',
                            ]
                              .filter(Boolean)
                              .join(' ')
                            return (
                              <td key={c.key} className={cls}>
                                {c.type === 'status' ? (
                                  <span className={`status-text st-${r.kind}`}>{txt}</span>
                                ) : c.type === 'light' ? (
                                  <span className={`light ${r.light}`} title={txt} role="img" aria-label={txt} />
                                ) : txt === '' ? (
                                  DASH
                                ) : (
                                  txt
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
              {(!rows || total === 0) && (
                <div className="empty-state">
                  <div className="big">
                    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="16" rx="2" />
                      <line x1="3" y1="9" x2="21" y2="9" />
                      <line x1="9" y1="9" x2="9" y2="20" />
                    </svg>
                  </div>
                  {loading ? (
                    <div className="title">Loading limits…</div>
                  ) : !rows ? (
                    <>
                      <div className="title">{yearTyping ? 'Enter the 4-digit limit year' : 'Select a currency pair and limit year'}</div>
                      <div>{yearTyping ? 'Use the format yyyy, e.g. 2026.' : 'The list of limits is loaded once both are chosen.'}</div>
                    </>
                  ) : (
                    <>
                      <div className="title">{anyLoaded ? 'No limits match your search or filters' : 'No limits found'}</div>
                      <div>{anyLoaded ? 'Try clearing the search or status filter.' : `No limits are set for ${pair} in ${year}. Use Set Initial Limit to create one.`}</div>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="table-footer">
              <div className="page-size-select">
                Rows per page
                <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}>
                  {[8, 12, 20].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <span className="page-info">{rows && total ? `Showing ${start + 1}–${start + pageRows.length} of ${total}` : ''}</span>
              <div className="pagination">
                {pageCount > 1 && (
                  <>
                    <button type="button" disabled={current === 1} aria-label="Previous page" onClick={() => setPage(current - 1)}>
                      &lsaquo;
                    </button>
                    {pageButtons.map((p, i) =>
                      p === '...' ? (
                        <span key={`gap${i}`} className="gap">
                          &hellip;
                        </span>
                      ) : (
                        <button key={p} type="button" className={p === current ? 'active' : ''} onClick={() => setPage(p)}>
                          {p}
                        </button>
                      ),
                    )}
                    <button type="button" disabled={current === pageCount} aria-label="Next page" onClick={() => setPage(current + 1)}>
                      &rsaquo;
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {setMode && (
        <SetLimitModal
          mode={setMode}
          row={setMode === 'additional' ? selected : null}
          pairs={pairs}
          limits={limits}
          busy={saving}
          onClose={() => setSetMode(null)}
          onSubmit={submitLimit}
        />
      )}
      {summaryLimit && <SummaryModal limit={summaryLimit} deals={summaryDeals} onClose={() => setSummaryId(null)} onOpenDeal={setDealOpen} />}
      {dealOpen && <DealModal deal={dealOpen} onClose={() => setDealOpen(null)} />}
      {mail && <MailModal mail={mail} onClose={() => setMail(null)} />}
      {toast && (
        <div className={`toast${toast.error ? ' error' : ''}`} role="status">
          {toast.text}
        </div>
      )}
    </div>
  )
}

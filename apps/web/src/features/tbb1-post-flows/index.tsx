import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { sapMessage } from '../../shared/fx/ndf.ts'
import { isAbort } from '../../shared/fx/mw.ts'
import { loadDueFlows, loadMasters, postingServiceAvailable, runPosting, type MastersResult } from './api.ts'
import { DateField, MultiSelect } from './controls.tsx'
import { APPLICATIONS, DEFAULT_PAGE_SIZE, MSG_NAMES, PAGE_SIZES, TOAST_MS } from './data.ts'
import {
  defaultForm,
  directionLabel,
  emptyRun,
  filterSortLog,
  flowTypeLabel,
  formatAmount,
  logFilterOptions,
  logKpis,
  nextSort,
  packageAvailable,
  pageOf,
  previewLines,
  productLabel,
  selectDueFlows,
  txnTypeLabel,
  validateForm,
} from './logic.ts'
import './tbb1-post-flows.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './tbb1-post-flows.dark.css'
import type { FieldErrors, Form, Loaded, LogLine, Masters, MultiKey, Option, Run, SortField, TableState } from './types.ts'

const BRAND_LOGO =
  'https://raw.githubusercontent.com/ryannayak/fs-assets/e82f35a83e28689167b22b4300d4994a249acee0/fs-short-logo.png'
const EMPTY_MASTERS: Masters = { companies: [], productTypes: [], transactionTypes: [], flowTypes: [] }
const freshTable = (pageSize: number): TableState => ({ search: '', typeFilter: '', companyFilter: '', sort: { field: '', dir: 'asc' }, page: 1, pageSize, selectedId: null })
const errorText = (e: unknown) => sapMessage(e) || (e instanceof Error ? e.message : String(e))

/** A code appears once in a value help, even when SAP defines it per product type / contract type. */
function uniqueOptions(list: readonly Option[]): Option[] {
  const seen = new Set<string>()
  return list.filter((o) => !seen.has(o.v) && !!seen.add(o.v))
}

const COLUMNS: { field: SortField; label: string; pin?: string }[] = [
  { field: 'typeName', label: 'Type', pin: 'pin pin2' },
  { field: 'bukrs', label: 'Company Code', pin: 'pin pin3' },
  { field: 'rfha', label: 'Transaction', pin: 'pin pin4' },
  { field: 'sgsart', label: 'Product Type' },
  { field: 'sfhaart', label: 'Transaction Type' },
  { field: 'sfhazba', label: 'Flow Type' },
  { field: 'dzKey', label: 'Due Date' },
  { field: 'ssign', label: 'Direction' },
  { field: 'belnr', label: 'Document No. / Year' },
  { field: 'prkey', label: 'Payment Request' },
  { field: 'text', label: 'Message' },
]

function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  return (
    <div
      role="status"
      style={{
        margin: '0 0 12px',
        padding: '8px 12px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border)',
        background: tone === 'warn' ? 'var(--warning-tint)' : 'var(--primary-tint)',
        color: 'var(--text)',
        fontSize: 12,
        lineHeight: 1.45,
      }}
    >
      {children}
    </div>
  )
}

function KvList({ rows }: { rows: [string, string][] }) {
  return (
    <div className="kv-list">
      {rows.map(([k, v]) => (
        <div className="kv-row" key={k}>
          <span className="kv-label">{k}</span>
          <span className="kv-value">{v || '—'}</span>
        </div>
      ))}
    </div>
  )
}

type Pick = { title: string; body: ReactNode }

/**
 * TBB1 — Treasury: Post Flows (RFTBBB00), converted from legacy/post-flows-tbb1.html.
 *
 * Value helps (company codes, product / transaction / flow types) and the flows due for posting
 * (VTBFHAPO) are read from SAP. The posting run itself needs the proposed posting service
 * (docs/abap/ZFS_SD_TRMPOSTING.md); until SAP answers for it, Execute lists the due flows read-only.
 */
export default function Tbb1PostFlows() {
  const [form, setForm] = useState<Form>(() => defaultForm(new Date()))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [masters, setMasters] = useState<Loaded<MastersResult>>({ state: 'loading' })
  const [canPost, setCanPost] = useState<boolean | null>(null)
  const [view, setView] = useState<'selection' | 'log'>('selection')
  const [run, setRun] = useState<Run>(emptyRun)
  const [table, setTable] = useState<TableState>(() => freshTable(DEFAULT_PAGE_SIZE))
  const [busy, setBusy] = useState(false)
  const [pick, setPick] = useState<Pick | null>(null)
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const loadAbort = useRef<AbortController | null>(null)

  const showToast = useCallback((message: string, error = false) => {
    clearTimeout(toastTimer.current)
    setToast({ message, error })
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS)
  }, [])

  const reloadMasters = useCallback(() => {
    loadAbort.current?.abort()
    const ctl = new AbortController()
    loadAbort.current = ctl
    setMasters({ state: 'loading' })
    loadMasters(ctl.signal).then(
      (value) => setMasters({ state: 'ok', value }),
      (e) => {
        if (!isAbort(e)) setMasters({ state: 'error', reason: errorText(e) })
      },
    )
  }, [])

  useEffect(() => {
    reloadMasters()
    postingServiceAvailable().then(setCanPost)
    return () => {
      loadAbort.current?.abort()
      clearTimeout(toastTimer.current)
    }
  }, [reloadMasters])

  const m = masters.state === 'ok' ? masters.value.masters : EMPTY_MASTERS
  const helps = useMemo(
    () => ({
      bukrs: m.companies,
      sgsart: uniqueOptions(m.productTypes),
      sfhaar: uniqueOptions(m.transactionTypes),
      fhazba: uniqueOptions(m.flowTypes),
      bkklas: uniqueOptions(m.flowTypes.filter((f) => f.flowClass).map((f) => ({ v: f.flowClass, t: f.flowClass }))).sort((a, b) => a.v.localeCompare(b.v)),
    }),
    [m],
  )

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => {
      const next = { ...f, [key]: value }
      if (!packageAvailable(next)) next.pack = false
      return next
    })
  const clearError = (key: keyof FieldErrors) => setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e))
  const multi = (key: MultiKey, free = false) => (
    <MultiSelect value={form[key]} items={free ? [] : helps[key as keyof typeof helps] ?? []} free={free} onChange={(v) => set(key, v)} />
  )
  const fieldCls = (base: string, key: keyof FieldErrors) => `field ${base}${errors[key] ? ' has-error' : ''}`
  const err = (key: keyof FieldErrors) => <div className="error-msg">{errors[key] ?? ''}</div>
  const dateField = (key: 'dzterm' | 'dbuchu' | 'budat' | 'bldat') => (
    <DateField
      value={form[key]}
      onChange={(v) => {
        set(key, v)
        clearError(key)
      }}
    />
  )

  const onExecute = async () => {
    const e = validateForm(form)
    setErrors(e)
    if (Object.keys(e).length) {
      showToast('Please correct the highlighted entries.', true)
      return
    }
    if (masters.state !== 'ok') {
      showToast('The value helps are still loading from SAP.', true)
      return
    }
    setBusy(true)
    try {
      let next: Run
      if (canPost) {
        next = { lines: await runPosting(form), test: form.test, preview: false, notes: [] }
      } else {
        const flows = await loadDueFlows(form, masters.value.flowTypes)
        const sel = selectDueFlows(flows, form)
        next = { lines: previewLines(sel.flows), test: form.test, preview: true, notes: sel.notes }
      }
      if (!next.lines.length) {
        showToast(next.notes.length ? `No flows found for the selection criteria. ${next.notes.join(' ')}` : 'No flows found for the selection criteria.')
        return
      }
      setRun(next)
      setTable((t) => freshTable(t.pageSize))
      setView('log')
      window.scrollTo(0, 0)
    } catch (error) {
      showToast(`SAP could not ${canPost ? 'run the posting' : 'read the flows'}: ${errorText(error)}`, true)
    } finally {
      setBusy(false)
    }
  }

  const onRefresh = () => {
    setForm(defaultForm(new Date()))
    setErrors({})
    setRun(emptyRun())
    setTable(freshTable(DEFAULT_PAGE_SIZE))
    setPick(null)
    setView('selection')
    reloadMasters()
  }

  /* ---------------- log ---------------- */
  const list = useMemo(() => filterSortLog(m, run.lines, table), [m, run.lines, table])
  const paged = pageOf(list, table.page, table.pageSize)
  const kpis = logKpis(run.lines)
  const filterOpts = logFilterOptions(run.lines)
  const selected = run.lines.find((l) => l.id === table.selectedId) ?? null
  const companyName = (code: string) => m.companies.find((c) => c.v === code)?.t ?? code

  /** USER_COMMAND PICK: payment request -> FI document -> message -> (preview) the due flow. */
  const pickLine = (l: LogLine) => {
    const flow = l.sfhazba ? flowTypeLabel(m, l.sfhazba) : ''
    const amount = l.currency ? `${formatAmount(l.amount)} ${l.currency}` : ''
    if (l.prkey) {
      setPick({
        title: 'Payment Request',
        body: <KvList rows={[['Payment Request', l.prkey], ['Company Code', companyName(l.bukrs)], ['Transaction', l.rfha], ['Flow', flow], ['Due Date', l.dzterm], ['Direction', directionLabel(l.ssign)], ['Amount', amount]]} />,
      })
    } else if (l.belnr) {
      setPick({
        title: 'Accounting Document',
        body: (
          <>
            <KvList rows={[['Document No.', l.belnr], ['Fiscal Year', l.gjahr], ['Company Code', companyName(l.bukrs)], ['Transaction', l.rfha], ['Flow', flow], ['Amount', amount]]} />
            <div className="mt-note">The line items are shown in SAP (FB03).</div>
          </>
        ),
      })
    } else if (l.msgno || l.text) {
      setPick({
        title: l.hasFlow ? `Flow ${l.dzterm} · ${l.sfhazba} · ${directionLabel(l.ssign)}` : `Transaction ${l.rfha} · ${l.bukrs}`,
        body: (
          <>
            <KvList
              rows={[
                ['Message', l.msgid ? `${l.msgid} ${l.msgno}` : ''],
                ['Type', l.typeName],
                ['Company Code', companyName(l.bukrs)],
                ['Transaction', l.rfha],
                ['Product Type', productLabel(m, l.sgsart)],
                ['Transaction Type', txnTypeLabel(m, l.sgsart, l.sfhaart)],
                ['Flow', flow],
                ['Amount', amount],
              ]}
            />
            <div className="lt-block">
              <h4>Message</h4>
              <p>{l.text}</p>
            </div>
            {run.preview ? <div className="mt-note">Preview: SAP has no posting service yet, so nothing was posted.</div> : null}
          </>
        ),
      })
    } else if (run.test) showToast('Document display is not available in a test run.', true)
  }
  const select = (id: number | null) => setTable((t) => ({ ...t, selectedId: id }))

  const sapState =
    masters.state === 'loading' ? (
      <Notice>Reading company codes and FTR customizing from SAP …</Notice>
    ) : masters.state === 'error' ? (
      <Notice tone="warn">The value helps could not be read from SAP: {masters.reason}</Notice>
    ) : masters.value.problems.length ? (
      <Notice tone="warn">{masters.value.problems.join(' ')} The affected lists are empty.</Notice>
    ) : null

  return (
    <div className="tbb1">
      <div className="app">
        <div className="page-header">
          <BackButton className="btn btn-secondary" />
          <img className="logo-img" src={BRAND_LOGO} alt="Fourth Signal" />
          <div className="header-text">
            <h1>Post Flows</h1>
            <p>Treasury: Post Flows &middot; TBB1</p>
          </div>
          <div className="header-actions" style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" type="button" title="Restore the selection screen and re-read the value helps from SAP" onClick={onRefresh}>
              &#8635; Refresh
            </button>
            <SignOutButton className="btn btn-secondary" />
          </div>
        </div>

        {view === 'selection' ? (
          <div>
            {sapState}
            {canPost === false ? (
              <Notice>
                SAP has no posting service for TBB1 yet (docs/abap/ZFS_SD_TRMPOSTING.md). Execute lists the flows due for posting from VTBFHAPO; nothing is posted.
              </Notice>
            ) : null}
            <div className="sel-layout">
              <div className="stack">
                <div className="card plain">
                  <div className="section-title">
                    <span className="dot" />
                    General Selections
                  </div>
                  <div className="section-body">
                    <div className="form-grid-12">
                      <div className="field gc-4">
                        <label>Company Code</label>
                        {multi('bukrs')}
                      </div>
                      <div className={fieldCls('gc-4', 'rfhaFrom')}>
                        <label>Transaction (From)</label>
                        <input className="control" inputMode="numeric" maxLength={13} placeholder="From" autoComplete="off" value={form.rfhaFrom} onChange={(e) => { set('rfhaFrom', e.target.value.trim()); clearError('rfhaFrom') }} />
                        {err('rfhaFrom')}
                      </div>
                      <div className={fieldCls('gc-4', 'rfhaTo')}>
                        <label>Transaction (To)</label>
                        <input className="control" inputMode="numeric" maxLength={13} placeholder="To" autoComplete="off" value={form.rfhaTo} onChange={(e) => { set('rfhaTo', e.target.value.trim()); clearError('rfhaTo') }} />
                        {err('rfhaTo')}
                      </div>

                      <div className="field gc-4">
                        <label>Product Type</label>
                        {multi('sgsart')}
                      </div>
                      <div className="field gc-4">
                        <label>Transaction Type</label>
                        {multi('sfhaar')}
                      </div>
                      <div className="field gc-4">
                        <label>Counterparty</label>
                        {multi('kontrh', true)}
                      </div>

                      <div className="field gc-4">
                        <label>Security ID Number</label>
                        {multi('ranl', true)}
                      </div>
                      <div className="field gc-4">
                        <label>Securities Account</label>
                        {multi('rldepo', true)}
                      </div>
                      <div className="field gc-4">
                        <label>Position Account (Futures)</label>
                        {multi('posacc', true)}
                      </div>

                      <div className="field gc-4">
                        <label>Portfolio</label>
                        {multi('rportb', true)}
                      </div>
                      <div className="field gc-4">
                        <label>Currency</label>
                        {multi('wzbetr', true)}
                      </div>
                      <div className="field gc-4">
                        <label>Flow Classification</label>
                        {multi('bkklas')}
                      </div>

                      <div className="field gc-4">
                        <label>Flow Type</label>
                        {multi('fhazba')}
                      </div>
                      <div className="field gc-4">
                        <label>Direction of Flow</label>
                        <select className="control" value={form.sign} onChange={(e) => set('sign', e.target.value as Form['sign'])}>
                          <option value="">Select ...</option>
                          <option value="+">+ Incoming</option>
                          <option value="-">&minus; Outgoing</option>
                        </select>
                      </div>
                      <div className="field gc-4" />
                    </div>

                    <div className="divider" />

                    <div className="form-grid-12">
                      <div className={fieldCls('gc-4 req-field', 'dzterm')}>
                        <label>
                          Up to and Including Due Date<span className="req">*</span>
                        </label>
                        {dateField('dzterm')}
                        {err('dzterm')}
                      </div>
                      <div className={fieldCls('gc-4', 'dbuchu')}>
                        <label>Up to and Incl. Posting Date</label>
                        {dateField('dbuchu')}
                        {err('dbuchu')}
                      </div>
                      <div className="field gc-4">
                        <label>&nbsp;</label>
                        <div className="hint">(For example, to separate accrual/deferral and to reset the transaction)</div>
                      </div>
                    </div>

                    <div className="check-grid">
                      <label className="check-row">
                        <input type="checkbox" checked={form.wzbetrFlag} onChange={(e) => set('wzbetrFlag', e.target.checked)} /> According to Currencies Chosen
                      </label>
                      <label className="check-row">
                        <input type="checkbox" checked={form.releas} onChange={(e) => set('releas', e.target.checked)} /> Released Transactions Only
                      </label>
                    </div>
                  </div>
                </div>

                <div className="card plain">
                  <div className="section-title">
                    <span className="dot" />
                    Multitasking Settings
                  </div>
                  <div className="section-body">
                    <label className="check-row">
                      <input type="checkbox" checked={form.mtA} onChange={(e) => set('mtA', e.target.checked)} /> Use Multitasking
                    </label>
                    <div className="form-grid-12" style={{ margin: '8px 0 0' }}>
                      <div className="field gc-6">
                        <label>Server</label>
                        <input className="control" autoComplete="off" placeholder="Any application server" value={form.mtS} onChange={(e) => set('mtS', e.target.value)} />
                      </div>
                      <div className="field gc-6">
                        <label>Server Group</label>
                        <input className="control" autoComplete="off" placeholder="RFC server group" value={form.mtRg} onChange={(e) => set('mtRg', e.target.value)} />
                      </div>
                      <div className={fieldCls('gc-6', 'mtNr')}>
                        <label>Number of Processes{form.mtA ? <span className="req">*</span> : null}</label>
                        <input className="control text-right" inputMode="numeric" maxLength={3} autoComplete="off" value={form.mtNr} onChange={(e) => { set('mtNr', e.target.value.trim()); clearError('mtNr') }} />
                        {err('mtNr')}
                      </div>
                      <div className={fieldCls('gc-6', 'mtPs')}>
                        <label>Package Size{form.mtA ? <span className="req">*</span> : null}</label>
                        <input className="control text-right" inputMode="numeric" maxLength={4} autoComplete="off" value={form.mtPs} onChange={(e) => { set('mtPs', e.target.value.trim()); clearError('mtPs') }} />
                        {err('mtPs')}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="stack">
                <div className="card plain">
                  <div className="section-title">
                    <span className="dot" />
                    Application<span className="req">*</span>
                  </div>
                  <div className="section-body">
                    <div className="check-grid">
                      {APPLICATIONS.map((a) => (
                        <label className="check-row" key={a.key}>
                          <input
                            type="checkbox"
                            checked={form.apps[a.key]}
                            onChange={(e) => {
                              set('apps', { ...form.apps, [a.key]: e.target.checked })
                              clearError('apps')
                            }}
                          />{' '}
                          {a.name}
                        </label>
                      ))}
                    </div>
                    <div className={`group-error${errors.apps ? ' show' : ''}`}>{errors.apps ?? 'Select at least one application.'}</div>
                  </div>
                </div>

                <div className="card plain">
                  <div className="section-title">
                    <span className="dot" />
                    Posting Control
                  </div>
                  <div className="section-body">
                    <div className="form-grid-12">
                      <div className={fieldCls('gc-6', 'budat')}>
                        <label>Posting Date</label>
                        {dateField('budat')}
                        <div className="hint">Instead of Due Date</div>
                        {err('budat')}
                      </div>
                      <div className={fieldCls('gc-6', 'bldat')}>
                        <label>Document Date</label>
                        {dateField('bldat')}
                        <div className="hint">Instead of Current Date</div>
                        {err('bldat')}
                      </div>
                      <div className={fieldCls('gc-6', 'monat')}>
                        <label>Posting Period</label>
                        <input className="control" inputMode="numeric" maxLength={2} placeholder="MM" autoComplete="off" value={form.monat} onChange={(e) => { set('monat', e.target.value.trim()); clearError('monat') }} />
                        {err('monat')}
                      </div>
                    </div>

                    <label className="check-row">
                      <input type="checkbox" checked={form.postda} onChange={(e) => set('postda', e.target.checked)} /> Use Posting Date for Foreign Currency Translation
                    </label>
                    <label className="check-row">
                      <input type="checkbox" checked={form.test} onChange={(e) => set('test', e.target.checked)} /> Test Run
                    </label>

                    <div className="divider" />
                    <div className="sub-title">Posting Scope</div>
                    {(
                      [
                        ['payonl', 'Pay Only'],
                        ['opval', 'Post Operational Only'],
                        ['allval', 'Post All Valuation Areas'],
                      ] as const
                    ).map(([v, label]) => (
                      <label className="check-row" key={v}>
                        <input type="radio" name="tbb1-mode" value={v} checked={form.mode === v} onChange={() => set('mode', v)} /> {label}
                      </label>
                    ))}

                    {packageAvailable(form) ? (
                      <div style={{ marginTop: 6 }}>
                        <label className="check-row">
                          <input type="checkbox" checked={form.pack} onChange={(e) => set('pack', e.target.checked)} /> Process Business Transactions in Packages
                        </label>
                        <div className="form-grid-12" style={{ margin: '4px 0 0' }}>
                          <div className={fieldCls('gc-6', 'psize')}>
                            <label>Package Size{form.pack ? <span className="req">*</span> : null}</label>
                            <input className="control text-right" inputMode="numeric" maxLength={2} autoComplete="off" value={form.psize} onChange={(e) => { set('psize', e.target.value.trim()); clearError('psize') }} />
                            {err('psize')}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div className="action-bar">
              <span className="run-hint">
                {canPost === false ? (
                  <>
                    <span className="pill test">Preview</span> Lists the flows due for posting. Nothing will be posted.
                  </>
                ) : form.test ? (
                  <>
                    <span className="pill test">Test Run</span> Nothing will be posted.
                  </>
                ) : (
                  <>
                    <span className="pill live">Live Run</span> Flows will be posted.
                  </>
                )}
              </span>
              <button className="btn btn-primary btn-lg" type="button" disabled={busy || canPost === null || masters.state === 'loading'} onClick={onExecute}>
                {busy ? 'Executing …' : 'Execute'}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="kpi-row compact">
              <div className="kpi-card">
                <div className="kpi-value">{kpis.deals}</div>
                <div className="kpi-label">Transactions</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-value">{kpis.flows}</div>
                <div className="kpi-label">{run.preview ? 'Flows Due' : 'Flows Processed'}</div>
              </div>
              <div className="kpi-card k-warn">
                <div className="kpi-value">{kpis.warn}</div>
                <div className="kpi-label">Warnings</div>
              </div>
              <div className="kpi-card k-error">
                <div className="kpi-value">{kpis.err}</div>
                <div className="kpi-label">Errors</div>
              </div>
            </div>

            {run.preview ? <Notice>Preview from VTBFHAPO: these flows are due for posting. SAP has no posting service yet, so nothing was posted.</Notice> : null}
            {run.notes.length ? <Notice tone="warn">{run.notes.join(' ')}</Notice> : null}

            <div className="log-col">
              <div className="card">
                <div className="log-title-row">
                  <button className="btn btn-secondary btn-sm" type="button" onClick={() => { setView('selection'); window.scrollTo(0, 0) }}>
                    &#8592; Back
                  </button>
                  <div className="section-title">
                    <span className="dot" />
                    <span>{run.preview ? 'Flows Due for Posting' : run.test ? 'Posting Log: Test Run' : 'Posting Log'}</span>
                  </div>
                  <span className={`run-chip ${run.preview || run.test ? 'test' : 'live'}`}>{run.preview ? 'Preview' : run.test ? 'Test Run' : 'Live Posting'}</span>
                  <span className="log-sub">Messages</span>
                </div>

                <div className="table-toolbar">
                  <div className="search-box">
                    <span className="icon">&#128269;</span>
                    <input placeholder="Search transactions, flows, documents, messages..." value={table.search} onChange={(e) => setTable((t) => ({ ...t, search: e.target.value, page: 1 }))} />
                  </div>
                  <select className="control filter-select" title="Message type" value={table.typeFilter} onChange={(e) => setTable((t) => ({ ...t, typeFilter: e.target.value, page: 1 }))}>
                    <option value="">All types</option>
                    {filterOpts.types.map((t) => (
                      <option key={t} value={t}>
                        {MSG_NAMES[t]}
                      </option>
                    ))}
                  </select>
                  <select className="control filter-select" title="Company code" value={table.companyFilter} onChange={(e) => setTable((t) => ({ ...t, companyFilter: e.target.value, page: 1 }))}>
                    <option value="">All company codes</option>
                    {filterOpts.companies.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <button className="btn btn-secondary btn-sm" type="button" onClick={() => setTable((t) => freshTable(t.pageSize))}>
                    Reset
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    type="button"
                    disabled={!selected}
                    title="Display the document, payment request or message text of the selected line"
                    onClick={() => selected && pickLine(selected)}
                  >
                    Display
                  </button>
                  <div className="toolbar-spacer" />
                  <span className="result-count">
                    {list.length} {list.length === 1 ? 'entry' : 'entries'}
                  </span>
                </div>

                <div className="table-scroll">
                  {list.length ? (
                    <table className="mc-table log-table">
                      <thead>
                        <tr>
                          <th className="no-sort action-col pin pin1" />
                          {COLUMNS.map((c) => {
                            const on = table.sort.field === c.field
                            return (
                              <th key={c.field} className={[c.pin, on ? 'sorted' : ''].filter(Boolean).join(' ') || undefined} onClick={() => setTable((t) => ({ ...t, sort: nextSort(t.sort, c.field), page: 1 }))}>
                                {c.label}
                                <span className="sort-ind">{on ? (table.sort.dir === 'asc' ? '▲' : '▼') : ''}</span>
                              </th>
                            )
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {paged.rows.map((l) => {
                          const isSel = table.selectedId === l.id
                          const openLine = (e: React.MouseEvent) => {
                            e.stopPropagation()
                            select(l.id)
                            pickLine(l)
                          }
                          const link = (text: string) => (
                            <span className="mc-link" onClick={openLine}>
                              {text}
                            </span>
                          )
                          return (
                            <tr key={l.id} className={isSel ? 'selected' : undefined} title={'Click to select · double-click to display'} onClick={() => select(l.id)} onDoubleClick={() => { select(l.id); pickLine(l) }}>
                              <td className="action-col pin pin1">
                                <input type="checkbox" className="row-select-checkbox" title="Select line" checked={isSel} onClick={(e) => e.stopPropagation()} onChange={(e) => select(e.target.checked ? l.id : null)} />
                              </td>
                              <td className="pin pin2">
                                <span className={`msg-${l.type}`}>{l.typeName}</span>
                              </td>
                              <td className="pin pin3">{l.bukrs}</td>
                              <td className="pin pin4 mono">{l.rfha}</td>
                              <td>{productLabel(m, l.sgsart) || '—'}</td>
                              <td>{txnTypeLabel(m, l.sgsart, l.sfhaart) || '—'}</td>
                              <td>{l.sfhazba ? flowTypeLabel(m, l.sfhazba) : '—'}</td>
                              <td className="mono">{l.dzterm || '—'}</td>
                              <td>{l.ssign ? directionLabel(l.ssign) : '—'}</td>
                              <td className="mono">
                                {l.belnr ? (
                                  <>
                                    {link(l.belnr)} / {l.gjahr}
                                  </>
                                ) : null}
                              </td>
                              <td className="mono">{l.prkey ? link(l.prkey) : null}</td>
                              <td className="msg-cell">{l.msgno && !l.belnr && !l.prkey ? link(l.text) : l.text}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  ) : null}
                </div>
                <div className={`empty-state${list.length ? '' : ' show'}`}>
                  <div className="big">&#128196;</div>
                  No log entries match your search or filters.
                </div>

                <div className="table-footer">
                  <div className="page-size-select">
                    Rows per page
                    <select value={table.pageSize} onChange={(e) => setTable((t) => ({ ...t, pageSize: Number(e.target.value), page: 1 }))}>
                      {PAGE_SIZES.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="pagination">
                    <button type="button" disabled={paged.page <= 1} onClick={() => setTable((t) => ({ ...t, page: paged.page - 1 }))}>
                      {'‹'}
                    </button>
                    {Array.from({ length: paged.pageCount }, (_, i) => i + 1).map((p) => (
                      <button type="button" key={p} className={p === paged.page ? 'active' : undefined} onClick={() => setTable((t) => ({ ...t, page: p }))}>
                        {p}
                      </button>
                    ))}
                    <button type="button" disabled={paged.page >= paged.pageCount} onClick={() => setTable((t) => ({ ...t, page: paged.page + 1 }))}>
                      {'›'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className={`modal-overlay${pick ? ' open' : ''}`} onClick={(e) => e.target === e.currentTarget && setPick(null)}>
        <div className="modal modal-left modal-scrollable pick-modal" role="dialog" aria-modal="true">
          <div className="modal-head-row">
            <h2>{pick?.title ?? 'Details'}</h2>
            <button type="button" className="modal-close-btn" aria-label="Close" onClick={() => setPick(null)}>
              &times;
            </button>
          </div>
          <div className="modal-body-scroll">{pick?.body}</div>
          <div className="modal-actions" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
            <button className="btn btn-secondary" type="button" onClick={() => setPick(null)}>
              Close
            </button>
          </div>
        </div>
      </div>

      <div className={`toast${toast ? ' show' : ''}${toast?.error ? ' error' : ''}`}>{toast?.message}</div>
    </div>
  )
}

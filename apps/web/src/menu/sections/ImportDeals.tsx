import { useMemo, useState } from 'react'
import { useAsync } from '@slc/api-client/react'
import { fxList, fxUpdate, type FxRow } from '../../shared/fx/mw.ts'
import { createDeal, listDeals, listMasterContracts, messageOf } from '../../shared/fx/master-contract.ts'
import { txt } from '../../shared/fx/masters.ts'
import './fx-dash.css'

/**
 * Creates real Deal IDs (ZSGTSFTR_DEALID) from the deal dump, through the same middleware call the Create screens use, with
 * the signed-in user's own session. Deal numbers come from the Deal ID range, so they are new numbers, not the sheet's.
 *
 * What the sheet cannot say is taken from the Deal IDs already there: the deal type and sub type of an FX model are the
 * ones its existing Deal IDs use, and a status is the sheet's own status when the Deal ID status table has a text for it
 * (otherwise 01, created). The sheet's Master Contracts rarely exist here, so each deal is put under an existing Master Contract of
 * the same FX model (any model when it has none), spread evenly. The counterparty bank has no column on a Deal ID, so it is written after a "|" in the description.
 */

type Sheet = Record<string, string>
type Plan = { sheet: Sheet; row: Record<string, string> | null; problem: string; mc: string }

const KEY = 'importDeals.created'
const clip = (s: string, n: number) => s.slice(0, n)

const readLog = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}
const writeLog = (log: Record<string, string>) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(log))
  } catch {
    /* the list on screen still shows what was created */
  }
}

/** The most common value of a list. */
function mode<T>(values: T[], key: (v: T) => string): T | undefined {
  const counts = new Map<string, { v: T; n: number }>()
  for (const v of values) {
    const c = counts.get(key(v)) ?? { v, n: 0 }
    c.n++
    counts.set(key(v), c)
  }
  return [...counts.values()].sort((a, b) => b.n - a.n)[0]?.v
}

/** Master Contracts a deal can sit under: confirmed or in use, never created-only or cancelled. */
const usableMc = (m: FxRow) => !['01', '99'].includes(txt(m, 'ZMC_STAT')) && !!txt(m, 'ZMC_REF_NO')

function plan(sheet: Sheet[], deals: FxRow[], mcs: FxRow[], statuses: FxRow[]): Plan[] {
  const known = new Set(mcs.map((m) => txt(m, 'ZMC_REF_NO')))
  const pool = mcs.filter(usableMc)
  const used = new Map<string, number>()
  const mcFor = (s: Sheet): string => {
    const model = s['ZTSF_MODEL'] ?? ''
    const same = pool.filter((m) => txt(m, 'ZTSF_MODEL') === model)
    const from = same.length ? same : pool
    if (!from.length) return known.has(s['ZMC_REF'] ?? '') ? s['ZMC_REF']! : ''
    const n = used.get(model) ?? 0
    used.set(model, n + 1)
    return txt(from[n % from.length]!, 'ZMC_REF_NO')
  }
  const pairOf = (d: FxRow) => ({ type: txt(d, 'ZDEAL_TYPE'), sub: txt(d, 'ZSUB_TYPE') })
  const usable = deals.filter((d) => pairOf(d).type && pairOf(d).sub)
  const overall = mode(usable.map(pairOf), (p) => p.type + '|' + p.sub)
  return sheet.map((s) => {
    const model = s['ZTSF_MODEL'] ?? ''
    const pair = mode(usable.filter((d) => txt(d, 'ZTSF_MODEL') === model).map(pairOf), (p) => p.type + '|' + p.sub) ?? overall
    const mc = mcFor(s)
    if (!pair) return { sheet: s, row: null, mc, problem: 'No Deal ID exists yet to take a deal type and sub type from.' }
    if (!mc) return { sheet: s, row: null, mc, problem: 'No usable Master Contract exists.' }
    const status = statuses.find((r) => txt(r, 'ZDEAL_TYPE') === pair.type && txt(r, 'ZSUB_TYPE') === pair.sub && txt(r, 'ZDEAL_SDESC') === s['STATUS_TEXT'])
    const bank = s['ZDEAL_REF'] ?? ''
    return {
      sheet: s, mc, problem: '',
      row: {
        ZDEAL_TYPE: pair.type, ZSUB_TYPE: pair.sub,
        ZDEAL_DESC: clip([s['ZDEAL_DESC'], bank].filter(Boolean).join(' | '), 80),
        ZTSF_MODEL: clip(model, 10), ZMC_REF: clip(mc, 10),
        ZS_DATE: s['ZS_DATE'] ?? '', ZE_DATE: s['ZE_DATE'] ?? '',
        ZDEAL_AMT: s['ZDEAL_AMT'] ?? '0.00', ZPL: s['ZPL'] ?? '0.00', ZPL_CURR: 'USD',
        ZDEAL_STAT: status ? txt(status, 'ZDEAL_STAT') : '01',
      },
    }
  })
}

type Context = { sheet: Sheet[]; deals: FxRow[]; mcs: FxRow[]; statuses: FxRow[] }

async function load(signal: AbortSignal): Promise<Context> {
  const response = await fetch('/import/deals.json', { signal })
  if (!response.ok) throw new Error('The deal list (import/deals.json) was not found.')
  const sheet = (await response.json()) as Sheet[]
  const [deals, mcs, statuses] = await Promise.all([
    listDeals(undefined, signal),
    listMasterContracts({}, signal),
    fxList('tsfDealStatus', {}, { signal }),
  ])
  return { sheet, deals, mcs, statuses }
}

export function ImportDeals() {
  const read = useAsync((signal) => load(signal), [])
  const [created, setCreated] = useState<Record<string, string>>(readLog)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ctx = read.data
  const plans = useMemo(() => (ctx ? plan(ctx.sheet, ctx.deals, ctx.mcs, ctx.statuses) : []), [ctx])

  const todo = plans.filter((p) => p.row && !created[p.sheet['ZDEAL_ID'] ?? ''])
  const blocked = plans.filter((p) => !p.row).length
  const [fixed, setFixed] = useState('')

  /** Puts deals already created under the Master Contract this page now assigns them. */
  async function repoint() {
    setBusy(true)
    setError('')
    try {
      let n = 0
      for (const p of plans) {
        const newId = created[p.sheet['ZDEAL_ID'] ?? '']
        if (!newId || !p.row) continue
        await fxUpdate('tsfDealId', { ZDEAL_ID: newId, ZDEAL_TYPE: p.row['ZDEAL_TYPE']!, ZSUB_TYPE: p.row['ZSUB_TYPE']! }, { ZMC_REF: p.mc })
        n++
      }
      setFixed(`${n} created deal${n === 1 ? '' : 's'} now sit under their assigned Master Contract.`)
    } catch (e) {
      setError(`Could not update the created deals: ${messageOf(e)}`)
    } finally {
      setBusy(false)
    }
  }

  async function run(limit: number) {
    setBusy(true)
    setError('')
    const log = { ...readLog() }
    try {
      for (const p of todo.slice(0, limit)) {
        const id = p.sheet['ZDEAL_ID'] ?? ''
        try {
          log[id] = await createDeal(p.row!)
        } catch (e) {
          setError(`Sheet deal ${id} was not created: ${messageOf(e)}`)
          break
        }
        writeLog(log)
        setCreated({ ...log })
      }
    } finally {
      writeLog(log)
      setCreated({ ...log })
      setBusy(false)
    }
  }

  const made = Object.keys(created).length
  return (
    <>
      <div className="hub-title">Import Deal IDs</div>
      <div className="hub-sub">Creates real Deal IDs from the deal dump, with your own session. New Deal ID numbers are issued by the Deal ID range.</div>
      {read.loading && !ctx ? <p className="fxd-note">Reading the deal list and what already exists…</p> : null}
      {!ctx && !read.loading ? (
        <p className="fxd-note">Could not prepare the import{read.error ? `: ${read.error.message}` : '.'} <button type="button" className="fxd-btn" onClick={read.reload}>Retry</button></p>
      ) : null}
      {ctx ? (
        <div className="fxd">
          <div className="fxd-bar-top fxd-keybar">
            <span className="fxd-chip">{plans.length} deals in the sheet · {made} created · {todo.length} ready · {blocked} cannot be created</span>
            <button type="button" className="fxd-btn" disabled={busy || !todo.length} onClick={() => void run(1)}>Create 1 deal first</button>
            <button type="button" className="fxd-btn" disabled={busy || !todo.length} onClick={() => void run(todo.length)}>Create all {todo.length}</button>
            {made ? <button type="button" className="fxd-btn" disabled={busy} onClick={() => void repoint()}>Fix Master Contract on created deals</button> : null}
          </div>
          {fixed ? <div className="fxd-warn"><span>{fixed}</span></div> : null}
          {error ? <div className="fxd-warn"><b>Stopped.</b><span>{error}</span></div> : null}
          <section className="fxd-card">
            <div className="fxd-card-b">
              <div className="fxd-tw">
                <table className="fxd-tbl">
                  <thead><tr><th>Sheet deal</th><th>Model</th><th>Type / sub</th><th>Master Contract</th><th>Start</th><th>End</th><th className="num">USD amount</th><th>Status</th><th>New Deal ID</th></tr></thead>
                  <tbody>
                    {plans.map((p) => {
                      const id = p.sheet['ZDEAL_ID'] ?? ''
                      return (
                        <tr key={id}>
                          <td className="key">{id}</td>
                          <td>{p.sheet['ZTSF_MODEL']}</td>
                          <td>{p.row ? `${p.row['ZDEAL_TYPE']} / ${p.row['ZSUB_TYPE']}` : '—'}</td>
                          <td>{p.mc || '—'}</td>
                          <td>{p.sheet['ZS_DATE']}</td>
                          <td>{p.sheet['ZE_DATE']}</td>
                          <td className="num">{Number(p.sheet['ZDEAL_AMT']).toLocaleString('en-US')}</td>
                          <td>{p.row?.['ZDEAL_STAT'] ?? '—'}</td>
                          <td>{created[id] ?? p.problem}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}

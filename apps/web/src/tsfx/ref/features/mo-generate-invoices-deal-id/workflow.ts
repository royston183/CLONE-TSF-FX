/**
 * The multi-resource business operations of ZSGTSF_RBILL_ADJUST, as explicit, ordered steps.
 *
 *   confirmInvoiceGeneration   FORM save_data (PAI 'YES' on 9002)
 *   reverseInvoiceConfirmation FORM cancel_trm_invoice (PAI 'CAN')
 *   deassignBls                MODULE user_command_9003 'UPDATE'
 *   amendDealStatus            FORM ammend_deal (+ reconcileInvoicePc)
 *
 * The ABAP does these in one LUW per statement with COMMIT WORK AND WAIT after each; here each is a
 * separate middleware call, so a failure can leave the earlier steps written. Every operation
 * therefore (1) checks what it needs before its first write, (2) stops at the first failing step,
 * (3) reports exactly which steps were done, which failed and which never ran, and (4) is safe to run
 * again after a reload: every write is an UPDATE / MODIFY of a fixed value, invoice numbers already
 * drawn are reused, never redrawn.
 *
 * What this module can touch is the `Ports` interface, and nothing in it is APP_STR, an FX / Option
 * transaction or a Treasury reverse: Bill Adjustment moves Deal ID (ZDEAL_STAT), invoice (BIL_ADJ,
 * IF_INV), BL (BL, BL_RUSE, BL_DASS, PRE_INV) and Trade Flow state only, never TXN_STATUS.
 */
import { txt } from '../../shared/fx/masters.ts'
import type { FxRow as MwRow } from '../../shared/fx/mw.ts'
import { mapLimit } from '../../shared/fx/pool.ts'
import { dec, num } from '../../shared/fx/sap.ts'
import { ADJ_KEY, adjRecordOf, amendDealWrites, dealBls, messageOf, toWire } from './api.ts'
import { DEAL_INVOICE_STATUS, canReverseInvoice, isFinalInvoiceStatus, pcForStatus, toggledStatus, type InvoiceFinalStatus } from './invoice-status.ts'
import { invoiceKeyProblem } from './confirm-guard.ts'
import { dats, invoiceDifference } from './invoice.ts'
import type { AdjRecord, Deal, InvRow } from './types.ts'

/**
 * Writes a row, and when the middleware refuses a decimal field for having more places than the
 * column holds ("Invalid value for field 'ZINV_PRICE': '169453.1250' exceeds the 2 decimal
 * place(s) allowed; refusing to round"), rounds just that field to the stated scale and writes
 * again. The middleware never rounds for us and the BL columns are narrower than the invoice
 * price they receive (the BL's ZINV_PRICE holds 2 places, the invoice's ZUSD_PRICE 4), so the
 * scale is taken from its own message rather than guessed.
 */
export async function updateFitting(
  update: (resource: string, key: Record<string, string>, changes: Record<string, string>) => Promise<unknown>,
  resource: string,
  key: Record<string, string>,
  changes: Record<string, string>,
): Promise<void> {
  const fitted = { ...changes }
  for (let attempt = 0; attempt < Object.keys(changes).length + 1; attempt++) {
    try {
      await update(resource, key, fitted)
      return
    } catch (error) {
      const hit = /field '([A-Z0-9_]+)'.*exceeds the (\d+) decimal place/.exec(error instanceof Error ? error.message : String(error))
      const field = hit?.[1]
      const value = field ? fitted[field] : undefined
      if (!hit || !field || value === undefined || !Number.isFinite(Number(value))) throw error
      fitted[field] = Number(value).toFixed(Number(hit[2]))
    }
  }
}

/** Middleware resource names. Those not already used elsewhere in the app are unconfirmed (see RESOURCE_NOTE). */
export const RESOURCE = {
  dealId: 'tsfDealId',
  billAdj: 'billAdjustment',
  invRef: 'invRef',
  ifInv: 'ifInv',
  bl: 'billOfLading',
  blReuse: 'blReuse',
  blDeassign: 'blDeassign',
  preInv: 'preInv',
  tradeFlow: 'tradeFlow',
} as const

export const RESOURCE_NOTE =
  'ifInv, blDeassign, preInv and tradeFlow are the names the middleware registry is expected to use for ZSGTSFTR_IF_INV, _BL_DASS, _PRE_INV and _TRDFLOW; a step on one that is not registered fails with WAITING FOR API instead of writing.'

/** Key columns of the rows these steps address, from the ABAP's own WHERE clauses. */
export const KEY = {
  dealId: ['ZDEAL_ID', 'ZDEAL_TYPE', 'ZSUB_TYPE'],
  bl: ['ZTF_NO', 'ZTF_SPLIT', 'ZBL_NO', 'ZBL_SPLIT', 'ZBL_REUSE'],
  blReuse: ['ZTF_NO', 'ZTF_SPLIT', 'ZBL_NO', 'ZBL_SPLIT', 'ZBL_REUSE'],
  tradeFlow: ['ZTF_NO', 'ZTF_SPLIT'],
  preInv: ['ZDEAL_ID', 'ZTF_NO', 'ZTF_SPLIT', 'ZBL_LOT'],
  ifInv: ['ZINT_INV_NO', 'ZBUKRS', 'ZINV_TYPE', 'ZLEG_ID', 'ZDEAL_ID'],
} as const

export const WAITING_ACTION = 'WAITING FOR ACTION API'
export const NOTIFICATION_GAP = (what: string) => `${WAITING_ACTION} — ${what} has no backend notification action; no e-mail was sent.`
export const NUMBER_RANGE_GAP =
  'WAITING FOR ACTION API — invoice numbers come from number range ZSGTSFNR08/01 (NUMBER_GET_NEXT) and the middleware has no number range bound to ZSGTSFTR_BIL_ADJ. No invoice number was invented and nothing was written.'

/* ------------------------------------------------------------------ ports */

export type Stamp = { user: string; date: string; time: string }

/** Everything the operations may do. Deliberately small: there is no APP_STR or transaction method. */
export type Ports = {
  list(resource: string, filter?: Record<string, string>): Promise<MwRow[]>
  /** Inserts a row. A field range (ZINV_NO) is NOT filled by an insert — see `allocate`. */
  create(resource: string, data: Record<string, unknown>): Promise<unknown>
  update(resource: string, key: Record<string, string>, changes: Record<string, unknown>): Promise<void>
  remove(resource: string, key: Record<string, string>): Promise<void>
  /** The column names a resource serves; rejects when the resource is not registered. */
  columns(resource: string): Promise<string[]>
  /** Whether a non-key column has a field number range bound (ZINV_NO of BIL_ADJ: ZSGTSFNR08/01). */
  hasFieldRange(resource: string, field: string): Promise<boolean>
  /** Draws the next number of that field range into one existing row; undefined if none came back. */
  allocate(resource: string, key: Record<string, string>, field: string): Promise<string | undefined>
  now(): Promise<Stamp>
}

const changedBy = (s: Stamp) => ({ ZCHANGED_BY: s.user, ZCHANGED_DATE: s.date, ZCHANGED_TIME: s.time })
const createdBy = (s: Stamp) => ({ ZCREATED_BY: s.user, ZCREATED_DATE: s.date, ZCREATED_TIME: s.time })

/* ------------------------------------------------------------------ steps */

export type StepStatus = 'done' | 'failed' | 'skipped' | 'not-run'
export type StepResult = { step: string; status: StepStatus; detail: string }
export type WorkflowResult = { ok: boolean; steps: StepResult[]; message: string }

type StepOutcome = string | void | { skipped: string }
type Step = { name: string; run: () => Promise<StepOutcome> }

/** Runs the steps in order; the first failure stops the run and the rest are reported as not run. */
export async function runSteps(title: string, steps: readonly Step[]): Promise<WorkflowResult> {
  const results: StepResult[] = []
  let failed: StepResult | undefined
  for (const step of steps) {
    if (failed) {
      results.push({ step: step.name, status: 'not-run', detail: '' })
      continue
    }
    try {
      const out = await step.run()
      if (out && typeof out === 'object') results.push({ step: step.name, status: 'skipped', detail: out.skipped })
      else results.push({ step: step.name, status: 'done', detail: out ?? '' })
    } catch (error) {
      failed = { step: step.name, status: 'failed', detail: messageOf(error) }
      results.push(failed)
    }
  }
  return { ok: !failed, steps: results, message: summarize(title, results, failed) }
}

function summarize(title: string, steps: readonly StepResult[], failed: StepResult | undefined): string {
  const names = (status: StepStatus) => steps.filter((s) => s.status === status).map((s) => s.step)
  const gaps = steps.filter((s) => s.status === 'skipped').map((s) => `${s.step}: ${s.detail}`)
  if (!failed) return gaps.length ? `${title} done. ${gaps.join(' ')}` : `${title} done.`
  const done = names('done')
  const rest = names('not-run')
  return (
    `${title} stopped at "${failed.step}": ${failed.detail} ` +
    `Already written: ${done.length ? done.join(', ') : 'nothing'}. Not run: ${rest.length ? rest.join(', ') : 'nothing'}. ` +
    'Reload and run it again — the finished steps are repeat-safe.'
  )
}

const keyOf = (row: MwRow, columns: readonly string[]): Record<string, string> => Object.fromEntries(columns.map((c) => [c, txt(row, c)]))
const sameDeal = (rows: readonly MwRow[]): MwRow[] => {
  const seen = new Set<string>()
  return rows.filter((r) => {
    const k = KEY.dealId.map((c) => txt(r, c)).join('|')
    return !seen.has(k) && !!seen.add(k)
  })
}

/** A resource that is not registered must stop the operation before it writes anything. */
async function requireResource(ports: Ports, resource: string): Promise<void> {
  try {
    await ports.columns(resource)
  } catch {
    throw new Error(`WAITING FOR API — middleware resource "${resource}" is not registered. ${RESOURCE_NOTE}`)
  }
}

async function setDealStatus(ports: Ports, dealRows: readonly MwRow[], status: string, withStamp = true): Promise<number> {
  const rows = sameDeal(dealRows)
  if (!rows.length) throw new Error('The Deal ID row could not be read, so its status cannot be changed.')
  const stamp = withStamp ? changedBy(await ports.now()) : {}
  for (const d of rows) await ports.update(RESOURCE.dealId, keyOf(d, KEY.dealId), { ZDEAL_STAT: status, ...stamp })
  return rows.length
}

/* ------------------------------------------------------------------ Confirm Invoice Generation */

export type ConfirmInput = {
  deal: Deal
  dealRows: readonly MwRow[]
  /** The rule row used for the Invoice Difference (RULE_BT of the model with its currency). */
  diffRule: MwRow | undefined
  status: InvoiceFinalStatus
  /** TVARVC rows named sy-tcode: the sellers whose BLs the finalisation stamps (none = all, as an empty range is in ABAP). */
  sellers: readonly string[]
}

/** Rows FORM save_data / the BL update act on: those whose BL does not yet carry an invoice type. */
export const rowsToFinalise = (inv: readonly InvRow[]): InvRow[] => inv.filter((r) => !r.locked)

/** The saved BIL_ADJ row of the same key, if any. */
const savedRow = (saved: readonly MwRow[], rec: AdjRecord): MwRow | undefined =>
  saved.find((b) => ADJ_KEY.every((k) => txt(b, k) === String(rec[k] ?? '')))

/**
 * FORM save_data: ZINV_NO (new rows only), ZPC, ZBP, ZUSD_PRICE and the created stamp onto each
 * row; ZPC = 'P' for 07, else 'C'. A row that already has a saved ZINV_NO keeps it.
 */
export function finalRecord(row: InvRow, dealId: string, status: InvoiceFinalStatus, stamp: Stamp, saved: MwRow | undefined): AdjRecord {
  const invNo = saved ? txt(saved, 'ZINV_NO') : row.invNo
  return {
    ...adjRecordOf(row, dealId),
    ZINV_NO: invNo,
    ZPC: pcForStatus(status),
    ZBP: row.bp,
    ZUSD_PRICE: row.usdPrice,
    ...createdBy(stamp),
  }
}

export async function confirmInvoiceGeneration(input: ConfirmInput, ports: Ports): Promise<WorkflowResult> {
  const { deal, status } = input
  const rows = rowsToFinalise(deal.inv)
  const dealId = deal.dealId

  return runSteps(`Confirm Invoice Generation for Deal ID ${dealId} (${status})`, [
    {
      name: 'check',
      run: async () => {
        if (!isFinalInvoiceStatus(status)) throw new Error(`${status} is not an invoice status.`)
        if (!rows.length) throw new Error('There is no invoice row left to confirm for this Deal ID: it has no invoice rows (Trade Invoices), or every row already carries an invoice type.')
        const keyProblem = invoiceKeyProblem(dealId, deal.inv)
        if (keyProblem) throw new Error(keyProblem)
        await requireResource(ports, RESOURCE.ifInv)
        const saved = await ports.list(RESOURCE.billAdj, { ZDEAL_ID: dealId })
        const needNumber = rows.some((r) => !r.invNo && !txt(savedRow(saved, adjRecordOf(r, dealId)) ?? {}, 'ZINV_NO'))
        if (needNumber && !(await ports.hasFieldRange(RESOURCE.billAdj, 'ZINV_NO'))) throw new Error(NUMBER_RANGE_GAP)
      },
    },
    {
      name: 'invoice rows (BIL_ADJ)',
      run: async () => {
        const stamp = await ports.now()
        const saved = await ports.list(RESOURCE.billAdj, { ZDEAL_ID: dealId })
        let n = 0
        for (const r of rows) {
          const base = adjRecordOf(r, dealId)
          const existing = savedRow(saved, base)
          const rec = finalRecord(r, dealId, status, stamp, existing)
          if (existing) {
            const key = keyOf(existing, ADJ_KEY)
            const wire = toWire({ ...rec, ...(txt(existing, 'ZCREATED_BY') ? { ZCREATED_BY: txt(existing, 'ZCREATED_BY'), ZCREATED_DATE: existing['ZCREATED_DATE'] ?? null, ZCREATED_TIME: txt(existing, 'ZCREATED_TIME') } : {}) })
            await ports.update(RESOURCE.billAdj, key, wire)
          } else if (rec['ZINV_NO']) {
            await ports.create(RESOURCE.billAdj, toWire(rec))
          } else {
            // ZINV_NO is a field range, so the row goes in first and the number is drawn into it.
            const key = Object.fromEntries(ADJ_KEY.map((k) => [k, String(rec[k] ?? '')]))
            await ports.create(RESOURCE.billAdj, toWire({ ...rec, ZINV_NO: '' }))
            let drawn: string | undefined
            try {
              drawn = await ports.allocate(RESOURCE.billAdj, key, 'ZINV_NO')
            } catch (error) {
              await ports.remove(RESOURCE.billAdj, key)
              throw error
            }
            if (!drawn) {
              await ports.remove(RESOURCE.billAdj, key)
              throw new Error(NUMBER_RANGE_GAP)
            }
          }
          n++
        }
        return `${n} invoice row(s)`
      },
    },
    {
      name: 'invoice interface (IF_INV)',
      run: async () => {
        // FORM save_data: UPDATE zsgtsftr_if_inv ... WHERE zdeal_id, zinv_type, zleg_id — a set-based
        // update of the rows that already exist (ZINT_INV_NO / ZBUKRS are never given; an upstream
        // process fills them). No INSERT, and no row is no error: the invoice carries on.
        let n = 0
        for (const r of rows) {
          const found = await ports.list(RESOURCE.ifInv, { ZDEAL_ID: dealId, ZINV_TYPE: r.invType, ZLEG_ID: r.ttype.slice(1, 2) })
          for (const f of found) {
            await ports.update(RESOURCE.ifInv, keyOf(f, KEY.ifInv), { ZPTNR_BKID: r.partnerBank, ZHOUSEBKID: r.houseBank, ZHOUSEKTID: r.accountId, ZBP: r.bp })
            n++
          }
        }
        return n ? `${n} row(s)` : { skipped: 'no IF_INV row exists for this Deal ID / invoice type / leg yet — nothing to update, as in the ABAP UPDATE' }
      },
    },
    { name: 'Deal ID status', run: async () => `ZDEAL_STAT ${status} on ${await setDealStatus(ports, input.dealRows, status)} row(s)` },
    {
      name: 'BL status (BL, BL_RUSE)',
      run: async () => {
        const stamp = changedBy(await ports.now())
        const [normal, reuse] = await Promise.all([ports.list(RESOURCE.bl, { ZDEAL_ID: dealId }), ports.list(RESOURCE.blReuse, { ZDEAL_ID: dealId })])
        const data = dealBls(normal, reuse)
        // One update per BL row, each independent of the others: run them a few at a time, not one after another.
        const updates: Array<() => Promise<void>> = []
        for (const r of rowsToFinalise(deal.inv).filter((x) => !input.sellers.length || input.sellers.includes(x.seller))) {
          const pdate = dats(String(r.rec['ZINV_PDATE'] ?? ''))
          const matches = data.filter(
            (b) => dats(txt(b, 'ZINV_DATE')) === pdate && txt(b, 'ZINV_COMM') === String(r.rec['ZINV_COMM'] ?? '') && txt(b, 'ZTRM_COM_ID') === String(r.rec['ZGT_COMM'] ?? '') && txt(b, 'ZBL_NO') !== '',
          )
          for (const b of matches) {
            const reused = txt(b, 'ZBL_REUSE') !== ''
            const changes = {
              ZINV_TYPE: r.invType,
              ZINV_PRICE: dec(r.usdPrice, 4),
              ZUSD_PRICE: dec(r.usdPrice, 4),
              ...(reused ? {} : { ZINV_USD_AMT: dec(r.amtUsd, 2) }),
              ZBL_STAT_ID: DEAL_BL_INVOICED,
              ...stamp,
            }
            updates.push(() => updateFitting(ports.update, reused ? RESOURCE.blReuse : RESOURCE.bl, keyOf(b, reused ? KEY.blReuse : KEY.bl), changes))
          }
        }
        await mapLimit(updates, 8, (run) => run())
        const n = updates.length
        return `${n} BL row(s)`
      },
    },
    {
      name: 'invoice difference (BIL_ADJ ZDIFF_AMT)',
      run: async () => {
        const [invRef, bilAdj] = await Promise.all([ports.list(RESOURCE.invRef, { ZDEAL_ID: dealId }), ports.list(RESOURCE.billAdj, { ZDEAL_ID: dealId })])
        const diffs = invoiceDifference(invRef, bilAdj, input.diffRule, deal.fxReason ? null : deal.fx)
        let n = 0
        for (const d of diffs) {
          if (d.diff2 === null) return { skipped: 'the deal amounts could not be read, so no difference was stored.' }
          const ref = `${dealId}-${d.ttype}`
          for (const b of bilAdj.filter((x) => txt(x, 'ZINV_REF') === ref)) {
            await ports.update(RESOURCE.billAdj, keyOf(b, ADJ_KEY), { ZDIFF_AMT: dec(d.diff2, 2) })
            n++
          }
        }
        return `${n} row(s)`
      },
    },
    { name: 'notification', run: async () => ({ skipped: NOTIFICATION_GAP('the invoice e-mail (ZSGTSFIF_EMAIL~INV_CON)') }) },
  ])
}

/** ZSGTSFTR_BL-ZBL_STAT_ID once an invoice is generated. */
export const DEAL_BL_INVOICED = '05'
/** ZSGTSFTR_BL-ZBL_STAT_ID after Reverse Confirm Invoice Generation. */
export const DEAL_BL_REVERSED = '02'
/** ZSGTSFTR_BL-ZBL_STAT_ID once a BL is de-assigned from its Deal ID. */
export const DEAL_BL_DEASSIGNED = '01'

/* ------------------------------------------------------------------ Reverse Confirm Invoice Generation */

/**
 * FORM cancel_trm_invoice: delete the Deal ID's invoice rows, Deal ID back to 04, normal BLs back to 02
 * with no invoice type. It does NOT reverse a Treasury transaction and writes no TXN_STATUS.
 */
export async function reverseInvoiceConfirmation(deal: Deal, dealRows: readonly MwRow[], ports: Ports): Promise<WorkflowResult> {
  const dealId = deal.dealId
  return runSteps(`Reverse Confirm Invoice Generation for Deal ID ${dealId}`, [
    {
      name: 'check',
      run: async () => {
        if (!canReverseInvoice(deal.status)) throw new Error('Selected Deal ID can not be canceled')
      },
    },
    {
      name: 'delete invoice rows (BIL_ADJ)',
      run: async () => {
        const rows = await ports.list(RESOURCE.billAdj, { ZDEAL_ID: dealId })
        for (const b of rows) await ports.remove(RESOURCE.billAdj, keyOf(b, ADJ_KEY))
        return `${rows.length} row(s)`
      },
    },
    { name: 'Deal ID status', run: async () => `ZDEAL_STAT ${DEAL_INVOICE_STATUS.INVOICE_REVERSED} on ${await setDealStatus(ports, dealRows, DEAL_INVOICE_STATUS.INVOICE_REVERSED)} row(s)` },
    {
      name: 'BL status (BL)',
      run: async () => {
        const stamp = changedBy(await ports.now())
        const bls = await ports.list(RESOURCE.bl, { ZDEAL_ID: dealId })
        for (const b of bls) await ports.update(RESOURCE.bl, keyOf(b, KEY.bl), { ZBL_STAT_ID: DEAL_BL_REVERSED, ZINV_TYPE: '', ...stamp })
        return `${bls.length} BL row(s)`
      },
    },
  ])
}

/* ------------------------------------------------------------------ BL de-assign */

/** FORM user_command_9003: no assigned BL -> '01'; assigned quantity equal to the Trade Flow's -> '04'; otherwise '03'. */
export function tradeFlowStatus(tradeFlowQty: number, assignedQtys: readonly number[]): '01' | '03' | '04' {
  if (!assignedQtys.length) return '01'
  const sum = assignedQtys.reduce((s, q) => s + q, 0)
  return Math.abs(sum - tradeFlowQty) < 0.0005 ? '04' : '03'
}

/** The PRE_INV rows go when every BL of the group (Deal ID, lot, Trade Flow, split) is being de-assigned. */
export function preInvoiceGroups(all: readonly MwRow[], selected: readonly MwRow[]): Array<{ ZDEAL_ID: string; ZBL_LOT: string; ZTF_NO: string; ZTF_SPLIT: string }> {
  const id = (r: MwRow) => [txt(r, 'ZDEAL_ID'), txt(r, 'ZBL_LOT'), txt(r, 'ZTF_NO'), txt(r, 'ZTF_SPLIT')]
  const same = (a: MwRow, b: MwRow) => id(a).join('|') === id(b).join('|')
  const out = new Map<string, { ZDEAL_ID: string; ZBL_LOT: string; ZTF_NO: string; ZTF_SPLIT: string }>()
  for (const s of selected) {
    const total = all.filter((r) => same(r, s)).length
    const marked = selected.filter((r) => same(r, s)).length
    if (total === marked) {
      const [ZDEAL_ID, ZBL_LOT, ZTF_NO, ZTF_SPLIT] = id(s)
      out.set(id(s).join('|'), { ZDEAL_ID: ZDEAL_ID!, ZBL_LOT: ZBL_LOT!, ZTF_NO: ZTF_NO!, ZTF_SPLIT: ZTF_SPLIT! })
    }
  }
  return [...out.values()]
}

/** The BL fields cleared on de-assignment (both tables). */
export const DEASSIGN_CHANGES = {
  ZBL_STAT_ID: DEAL_BL_DEASSIGNED,
  ZDEAL_ID: '',
  ZBL_LOT: '',
  ZINV_COMM: '',
  ZINV_DATE: null,
  ZINV_TYPE: '',
  ZINCO: '',
} as const

export type DeassignInput = { deal: Deal; dealRows: readonly MwRow[]; allBls: readonly MwRow[]; selected: readonly MwRow[]; remark: string }

export async function deassignBls(input: DeassignInput, ports: Ports): Promise<WorkflowResult> {
  const { deal, selected, allBls } = input
  const dealId = deal.dealId
  const reused = (b: MwRow) => txt(b, 'ZBL_REUSE') !== ''
  return runSteps(`De-assign ${selected.length} BL(s) from Deal ID ${dealId}`, [
    {
      name: 'check',
      run: async () => {
        if (!selected.length) throw new Error('Select a BL to de-assign.')
        await requireResource(ports, RESOURCE.blDeassign)
      },
    },
    {
      name: 'BL linkage (BL, BL_RUSE)',
      run: async () => {
        const stamp = changedBy(await ports.now())
        for (const b of selected) await ports.update(reused(b) ? RESOURCE.blReuse : RESOURCE.bl, keyOf(b, reused(b) ? KEY.blReuse : KEY.bl), { ...DEASSIGN_CHANGES, ...stamp })
        return `${selected.length} BL(s)`
      },
    },
    {
      name: 'de-assignment history (BL_DASS)',
      run: async () => {
        const stamp = changedBy(await ports.now())
        const columns = new Set((await ports.columns(RESOURCE.blDeassign)).map((c) => c.toUpperCase()))
        for (const b of selected) {
          const record: Record<string, unknown> = {}
          for (const [c, v] of Object.entries({ ...b, ZREMARK: input.remark, ...stamp })) if (columns.has(c.toUpperCase())) record[c] = v
          const key = keyOf(b, reused(b) ? KEY.blReuse : KEY.bl)
          const found = await ports.list(RESOURCE.blDeassign, key)
          if (found.length) {
            await ports.update(RESOURCE.blDeassign, key, record)
          } else await ports.create(RESOURCE.blDeassign, record)
        }
        return `${selected.length} record(s)`
      },
    },
    { name: 'notification', run: async () => ({ skipped: NOTIFICATION_GAP('the BL de-assignment e-mail (ZSGTSIF_EMAIL~TFBL, E002)') }) },
    {
      name: 'pre-invoice cleanup (PRE_INV)',
      run: async () => {
        const groups = preInvoiceGroups(allBls, selected)
        let n = 0
        for (const g of groups) {
          for (const p of await ports.list(RESOURCE.preInv, g)) {
            await ports.remove(RESOURCE.preInv, keyOf(p, KEY.preInv))
            n++
          }
        }
        return `${n} row(s)`
      },
    },
    {
      name: 'Deal ID status',
      run: async () => {
        const left = await ports.list(RESOURCE.bl, { ZDEAL_ID: dealId })
        if (left.length) return { skipped: 'a BL is still assigned, so the Deal ID keeps its status.' }
        return `ZDEAL_STAT ${DEAL_INVOICE_STATUS.PRE_INVOICE} on ${await setDealStatus(ports, input.dealRows, DEAL_INVOICE_STATUS.PRE_INVOICE)} row(s)`
      },
    },
    {
      name: 'Trade Flow status (TRDFLOW)',
      run: async () => {
        const stamp = changedBy(await ports.now())
        const flows = new Map<string, { ZTF_NO: string; ZTF_SPLIT: string }>()
        for (const b of selected) flows.set(`${txt(b, 'ZTF_NO')}|${txt(b, 'ZTF_SPLIT')}`, { ZTF_NO: txt(b, 'ZTF_NO'), ZTF_SPLIT: txt(b, 'ZTF_SPLIT') })
        let n = 0
        for (const key of flows.values()) {
          const tf = (await ports.list(RESOURCE.tradeFlow, key))[0]
          const qty = tf ? num(tf['ZQUANTITY']) : 0
          if (!qty) continue
          const assigned = (await ports.list(RESOURCE.bl, key)).filter((b) => txt(b, 'ZDEAL_ID') !== '').map((b) => num(b['ZQUANTITY']))
          await ports.update(RESOURCE.tradeFlow, key, { ZFLW_COD1: tradeFlowStatus(qty, assigned), ...stamp })
          n++
        }
        return `${n} Trade Flow(s)`
      },
    },
  ])
}

/* ------------------------------------------------------------------ Amend Deal Status */

/** Rows whose ZPC disagrees with the Deal ID status: 05 <=> C, 07 <=> P. */
export function pcMismatches(status: string, bilAdj: readonly MwRow[]): MwRow[] {
  if (!isFinalInvoiceStatus(status)) return []
  const want = pcForStatus(status)
  return bilAdj.filter((b) => txt(b, 'ZPC') !== want)
}

/**
 * FORM ammend_deal: 05 <-> 07 on the Deal ID, then ZPC on its invoice rows (C for 05, P for 07).
 * The invariant (05 <=> C, 07 <=> P) holds again after a clean run; if the second step fails it is
 * broken and the result says so — reconcileInvoicePc restores it.
 */
export async function amendDealStatus(deal: Deal, dealRows: readonly MwRow[], ports: Ports): Promise<WorkflowResult> {
  const next = toggledStatus(deal.status)
  return runSteps(`Amend Deal Status of ${deal.dealId}`, [
    {
      name: 'check',
      run: async () => {
        if (!next) throw new Error('Deal ID status can be amended only from 05 or 07.')
      },
    },
    // FORM ammend_deal sets zdeal_stat with no audit stamp.
    { name: 'Deal ID status', run: async () => `ZDEAL_STAT ${next} on ${await setDealStatus(ports, dealRows, next!, false)} row(s)` },
    {
      name: 'invoice P/C (BIL_ADJ ZPC)',
      run: async () => {
        const rows = await ports.list(RESOURCE.billAdj, { ZDEAL_ID: deal.dealId })
        const writes = amendDealWrites(next!, rows)
        for (const w of writes) await ports.update(RESOURCE.billAdj, w.key, w.changes)
        return `${writes.length} row(s)`
      },
    },
  ])
}

/** Repeat-safe repair of a half-done amendment: only ZPC, only on the rows that disagree with the Deal ID status. */
export async function reconcileInvoicePc(deal: Deal, ports: Ports): Promise<WorkflowResult> {
  return runSteps(`Reconcile invoice P/C of ${deal.dealId}`, [
    {
      name: 'invoice P/C (BIL_ADJ ZPC)',
      run: async () => {
        if (!isFinalInvoiceStatus(deal.status)) throw new Error('Only a Deal ID at 05 or 07 has a P/C to reconcile.')
        const stale = pcMismatches(deal.status, await ports.list(RESOURCE.billAdj, { ZDEAL_ID: deal.dealId }))
        for (const b of stale) await ports.update(RESOURCE.billAdj, keyOf(b, ADJ_KEY), { ZPC: pcForStatus(deal.status) })
        return `${stale.length} row(s)`
      },
    },
  ])
}


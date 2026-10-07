import { buildBlPayload } from '../tf-upload/fields.ts'
import type { BlRow, TrdFlowKey } from './types.ts'

/** Rows per page in the BL Details grid — the legacy page's BL_DATA1_PAGE_SIZE. */
export const BL_PAGE_SIZE = 5

function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * A BL's amount: ZCPM_AMT when one is stored, otherwise quantity x CPMT — the legacy grid's
 * own formula (recalcBlData1RowAmount). A BL created by the Excel upload carries no CPMT
 * amount, since the workbook has no such column, so the stored value is often zero.
 */
export function blAmount(row: BlRow): number {
  const stored = num(row.ZcpmAmt)
  return stored !== 0 ? stored : num(row.Zquantity) * num(row.Zcprice)
}

/**
 * Total already-assigned amount per Deal ID, summed over every BL row that carries one —
 * across however many trade flows it was assigned from, not just one. Used to tell a Deal ID
 * with no remaining value apart from one that is unassigned or still partially open.
 */
export function dealAssignedTotals(rows: readonly BlRow[]): Map<string, number> {
  const totals = new Map<string, number>()
  for (const row of rows) {
    const dealId = String(row.ZdealId ?? '').trim()
    if (!dealId) continue
    totals.set(dealId, (totals.get(dealId) ?? 0) + blAmount(row))
  }
  return totals
}

export type BlTotals = { quantity: number; cpmt: number; amount: number }

/** The grid's Total row, summed over every BL of the trade flow, not just the visible page. */
export function blTotals(rows: readonly BlRow[]): BlTotals {
  return rows.reduce<BlTotals>(
    (t, row) => ({
      quantity: t.quantity + num(row.Zquantity),
      cpmt: t.cpmt + num(row.Zcprice),
      amount: t.amount + blAmount(row),
    }),
    { quantity: 0, cpmt: 0, amount: 0 },
  )
}

/** Page count (at least one) and a page index clamped into range, as the legacy pager did. */
export function blPage(rowCount: number, requested: number): { page: number; pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(rowCount / BL_PAGE_SIZE))
  return { page: Math.min(Math.max(0, requested), pageCount - 1), pageCount }
}

/** Grade where the BL has one, else the commodity it was created with. */
export function blGradeCommodity(row: BlRow): string {
  return String(row.Zgrade ?? '').trim() || String(row.Zcmmd ?? '').trim()
}

/** Identifies one BL row within its trade flow's grid — there is no single SAP key field. */
export function blRowId(row: Pick<BlRow, 'ZblNo' | 'ZblSplit' | 'ZblReuse' | 'localId'>): string {
  return row.localId ?? `${row.ZblNo}-${row.ZblSplit}-${row.ZblReuse ?? ''}`
}

/**
 * A BL's Deal ID assignment is held in the workspace (not on the row) until Update is clicked,
 * keyed by trade flow + BL row so an assignment made for one split never leaks onto another.
 */
export function dealAssignmentKey(tfKey: TrdFlowKey, blId: string): string {
  return `${tfKey.ZtfNo}|${tfKey.ZtfSplit}|${blId}`
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/**
 * The split id a BL Split should assign next for one BL ID: one more than however many rows
 * already carry it, so the first split is always "02" and a further split — on either the
 * original row or a row an earlier split produced — continues the same count. Counted per BL
 * ID rather than off a global split counter, so two different BLs split independently.
 */
export function nextBlSplitId(rows: readonly BlRow[], blNo: string): string {
  const count = rows.filter((row) => String(row.ZblNo ?? '') === blNo).length
  return pad2(count + 1)
}

/** The BL Details cells a line item keeps editable until a Deal ID is assigned to it. */
export const BL_EDITABLE_FIELDS = ['Zblno', 'ZblVsslName', 'Zgrade', 'Zquantity', 'Zcprice'] as const

/** One ZSGTSFTR_BL key, less the client. */
export type BlSaveKey = { ZtfNo: string; ZtfSplit: string; ZblNo: string; ZblSplit: string; ZblReuse: string }

export type BlSavePlan = {
  /** Existing BLs whose editable cells changed — including the quantity a split left behind. */
  updates: Array<{ key: BlSaveKey; changes: Record<string, unknown> }>
  /**
   * Rows added on screen. `allocate` means ZBL_NO is left to the SNRO range (Create BL).
   * `localId` is the row's own id on screen, not sent to the middleware — it is how the
   * success message after a Deal ID assignment matches an issued BL number back to the row
   * it was assigned to (see saveBlChanges).
   */
  inserts: Array<{ row: Record<string, unknown>; allocate: boolean; localId: string }>
}

/** Fields never sent on insert: the client (injected server-side), the audit stamps, and derived text. */
const NOT_INSERTED = /^(Mandt|Client|Zcreated|Zchanged|ZblStat$|ZcpmAmt$|localId$)/

const same = (a: unknown, b: unknown) => String(a ?? '').trim() === String(b ?? '').trim()

/**
 * What Update has to write for BL Data 1: the difference between the BLs as read and the grid
 * as it now stands. A created row is inserted with ZBL_NO blank, so the middleware draws it from
 * the range mirroring SNRO ZSGTSFNR02; a split row is inserted under its source's BL ID with the
 * next split; an existing row sends only the editable cells that changed.
 */
export function planBlSave(original: readonly BlRow[], current: readonly BlRow[]): BlSavePlan {
  const before = new Map(original.map((row) => [blRowId(row), row]))
  const plan: BlSavePlan = { updates: [], inserts: [] }
  for (const row of current) {
    if (row.localId) {
      const allocate = !String(row.ZblNo ?? '').trim()
      const payload: Record<string, unknown> = {}
      for (const [field, value] of Object.entries(row)) {
        if (!NOT_INSERTED.test(field) && value !== undefined) payload[field] = value
      }
      payload['ZblNo'] = allocate ? '' : row.ZblNo
      payload['ZblReuse'] = row.ZblReuse ?? ''
      plan.inserts.push({ row: payload, allocate, localId: row.localId })
      continue
    }
    const was = before.get(blRowId(row))
    if (!was) continue
    const changes: Record<string, unknown> = {}
    for (const field of BL_EDITABLE_FIELDS) {
      if (!same(row[field], was[field])) changes[field] = row[field]
    }
    if (Object.keys(changes).length) {
      plan.updates.push({
        key: {
          ZtfNo: String(row.ZtfNo ?? ''),
          ZtfSplit: String(row.ZtfSplit ?? ''),
          ZblNo: String(row.ZblNo ?? ''),
          ZblSplit: String(row.ZblSplit ?? ''),
          ZblReuse: String(row.ZblReuse ?? ''),
        },
        changes,
      })
    }
  }
  return plan
}

/**
 * True for a row the grid holds but ZSGTSFTR_BL does not yet: a Create BL row ("new-...") or a
 * BL Split row ("split-..."). Such a row has no stored key to update, so anything assigned to it
 * must travel in its insert.
 */
export function isUnsavedBl(blId: string): boolean {
  return blId.startsWith('new-') || blId.startsWith('split-')
}

/**
 * Puts a Deal ID assigned in this Update onto the unsaved rows it targets, with the assigned
 * status, so the insert writes both. The alternative — assigning by key after the insert —
 * cannot work for a Create BL row, whose BL ID only exists once the insert has drawn it from
 * the SNRO range. Rows already stored are left alone; their assignment is an update.
 */
export function withPendingDeals(
  rows: readonly BlRow[],
  dealsByBlId: ReadonlyMap<string, string>,
  assignedStatus: string,
  details?: Readonly<Record<string, string>>,
): BlRow[] {
  const filled = invoiceDetailChanges(details)
  return rows.map((row) => {
    const id = blRowId(row)
    const dealId = dealsByBlId.get(id)
    if (!dealId || !isUnsavedBl(id)) return row
    return { ...row, ...filled, ZdealId: dealId, ZblStatId: assignedStatus }
  })
}

/** The Assign Deal popup's Invoice Details that were entered: a blank one never clears a stored value. */
export function invoiceDetailChanges(details: Readonly<Record<string, string>> | undefined): Record<string, string> {
  return Object.fromEntries(Object.entries(details ?? {}).filter(([, value]) => String(value ?? '').trim() !== ''))
}

/** Stored by the middleware or never copied: the client, the audit stamps. */
const NOT_COPIED_FROM_TF = /^(Mandt|Client|Zcreated|Zchanged)/

/**
 * A new BL built from its trade flow, the way the Excel upload builds one (buildBlPayload):
 * every trade-flow field the BL shares — vessel name, grade, CPMT, BL Number, commodity,
 * dates — with ZBL_NO blank for the SNRO range, split 01, status 01. Used by Create BL when no
 * line item is selected to copy, so the new rows are not left without vessel name or CPMT.
 */
export function blFromTradeFlow(tradeFlow: Readonly<Record<string, unknown>>, key: TrdFlowKey): BlRow {
  const fields: Record<string, string | number> = {}
  for (const [field, value] of Object.entries(tradeFlow)) {
    if (NOT_COPIED_FROM_TF.test(field)) continue
    if (typeof value === 'string' || typeof value === 'number') fields[field] = value
  }
  return buildBlPayload(fields, key.ZtfNo, key.ZtfSplit) as BlRow
}

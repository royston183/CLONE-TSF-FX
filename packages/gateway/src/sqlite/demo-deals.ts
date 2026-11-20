import type { Fields, SqliteStore } from './store.ts'

/**
 * Demo Deal IDs, loaded from the "Deal Dump" sheet (View List of All Transactions) into the local SQLite store, so the
 * FX Position Dashboard has data to show without touching SAP or the middleware. Three collections of the `local` service:
 *
 *   demo_dealid  one record per Deal ID, shaped like ZSGTSFTR_DEALID (ZDEAL_ID, ZDEAL_STAT, ZE_DATE, ZDEAL_AMT, ZPL ...)
 *   demo_fx      the counterparty of each, shaped like ZSGTSFV_FX (BUKRS, RFHA, KONTRH, BP_NAME)
 *   demo_status  the status texts the sheet uses, shaped like the Deal ID status table
 *
 * The sheet has one row per leg (D1 forward, D2 NDF, DSS1 settlement spot ...) and total rows without a deal type, which
 * are skipped. It has no maturity column, so a Deal ID ends on its latest trade date.
 */

export const DEMO_COLLECTIONS = ['demo_dealid', 'demo_fx', 'demo_status'] as const

export type DemoDeals = { dealIds: Fields[]; fx: Fields[]; statuses: Fields[]; skipped: number }

const COLUMN = {
  tradeDate: 0, company: 1, model: 2, dealId: 3, dealType: 4, amount1: 7, partner: 11, mcRef: 12, status: 13, commodity: 16, pl: 17,
} as const

const cell = (row: readonly unknown[], index: number) => String(row[index] ?? '').trim()
const amount = (text: string) => {
  const n = Number(text.replaceAll(',', ''))
  return Number.isFinite(n) ? n : 0
}

/** "11/9/27" (month/day/year) to "2027-11-09"; '' when it is not a date. */
export function isoDate(text: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(text)
  if (!m) return ''
  const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  return `${year}-${m[1]!.padStart(2, '0')}-${m[2]!.padStart(2, '0')}`
}

const split = (text: string): [string, string] => {
  const at = text.indexOf(' - ')
  return at < 0 ? [text, ''] : [text.slice(0, at).trim(), text.slice(at + 3).trim()]
}

/** `rows` is the whole sheet; the header row is found by its "Deal ID" cell. */
export function parseDealDump(rows: readonly (readonly unknown[])[]): DemoDeals {
  const header = rows.findIndex((r) => cell(r, COLUMN.dealId) === 'Deal ID')
  if (header < 0) throw new Error('This is not the deal dump: no "Deal ID" column heading was found.')
  const legs = new Map<string, (readonly unknown[])[]>()
  let skipped = 0
  for (const row of rows.slice(header + 1)) {
    const id = cell(row, COLUMN.dealId)
    if (!id || !cell(row, COLUMN.dealType)) {
      if (id) skipped++
      continue
    }
    legs.set(id, [...(legs.get(id) ?? []), row])
  }

  const texts = [...new Set([...legs.values()].map((l) => cell(main(l), COLUMN.status)).filter(Boolean))].sort()
  const codeOf = new Map(texts.map((t, i) => [t, 'D' + String(i + 1).padStart(2, '0')]))
  const fx = new Map<string, Fields>()
  const dealIds: Fields[] = []
  for (const [id, group] of legs) {
    const lead = main(group)
    const [company] = split(cell(lead, COLUMN.company))
    const [bankCode, bankName] = split(cell(lead, COLUMN.partner))
    const rfha = 'DEMO' + id
    const dates = group.map((r) => isoDate(cell(r, COLUMN.tradeDate))).filter(Boolean).sort()
    const end = dates.at(-1) ?? ''
    const pl = group.map((r) => amount(cell(r, COLUMN.pl))).find((v) => v !== 0) ?? 0
    fx.set(`${company}-${rfha}`, { id: `${company}-${rfha}`, BUKRS: company, RFHA: rfha, KONTRH: bankCode, BP_NAME: bankName })
    dealIds.push({
      id, ZDEAL_ID: id, ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1',
      ZDEAL_DESC: [cell(lead, COLUMN.commodity), cell(lead, COLUMN.model)].filter(Boolean).join(' - '),
      ZDEAL_STAT: codeOf.get(cell(lead, COLUMN.status)) ?? '', ZTSF_MODEL: cell(lead, COLUMN.model),
      ZS_DATE: dates[0] ?? '', ZE_DATE: end, ZDEAL_AMT: Math.max(...group.map((r) => Math.abs(amount(cell(r, COLUMN.amount1))))).toFixed(2),
      ZPL: pl.toFixed(2), ZPL_CURR: 'USD', ZMC_REF: cell(lead, COLUMN.mcRef), ZDEAL_REF: cell(lead, COLUMN.partner),
      STATUS_TEXT: cell(lead, COLUMN.status), ZBUKRS1: company, ZRFHA1: rfha, DEMO: 'X',
    })
  }
  const statuses = texts.map((t) => ({ id: codeOf.get(t)!, ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_STAT: codeOf.get(t)!, ZDEAL_SDESC: t }))
  return { dealIds, fx: [...fx.values()], statuses, skipped }
}

/** The forward (D1) leg describes the Deal ID; any leg will do when there is none. */
function main(group: readonly (readonly unknown[])[]): readonly unknown[] {
  return group.find((r) => cell(r, COLUMN.dealType) === 'D1') ?? group[0]!
}

const ALL = { where: [], orderBy: [], top: 5000, skip: 0 }

/** Replaces the demo Deal IDs with these. Returns how many Deal IDs were saved. */
export function saveDemoDeals(store: SqliteStore, data: DemoDeals, user = 'import'): number {
  clearDemoDeals(store)
  for (const [collection, rows] of [['demo_dealid', data.dealIds], ['demo_fx', data.fx], ['demo_status', data.statuses]] as const) {
    for (const row of rows) store.create(collection, row, user)
  }
  return data.dealIds.length
}

export function clearDemoDeals(store: SqliteStore): number {
  let removed = 0
  for (const collection of DEMO_COLLECTIONS) {
    for (const record of store.list(collection, ALL)) if (store.remove(collection, record.id)) removed++
  }
  return removed
}

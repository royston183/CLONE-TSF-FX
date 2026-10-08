import type Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO_ROOT } from '../config.ts'
import { ddicRepository } from './repositories/ddic-table.ts'
import { TRD_ACC_CLIENT, TRD_ACC_COLUMNS } from './repositories/trd-acc-columns.ts'
import type { LookupValue } from './schema.ts'

/**
 * Baseline data the application ships with. Static values only — never a copy of anyone's
 * transactions. Edit this list and re-run `npm run db:seed`; it is idempotent, so rows are
 * inserted or brought up to date and never duplicated.
 */
export const LOOKUP_SEED: readonly LookupValue[] = [
  { category: 'strategy', code: 'HEDGE_01', label: 'Hedge', sortOrder: 10 },
  { category: 'strategy', code: 'TRADING_01', label: 'Trading', sortOrder: 20 },
]

/** Upserts the seed rows and returns how many it processed. */
export function runSeeds(db: Database.Database, lookups: readonly LookupValue[] = LOOKUP_SEED): number {
  const upsert = db.prepare(`
    INSERT INTO lookup_value (category, code, label, sort_order)
    VALUES (@category, @code, @label, @sortOrder)
    ON CONFLICT (category, code) DO UPDATE SET
      label = excluded.label,
      sort_order = excluded.sort_order
  `)
  db.transaction(() => {
    for (const row of lookups) upsert.run(row)
  })()
  return lookups.length
}

export const TRD_ACC_SEED_FILE = resolve(REPO_ROOT, 'database/seed/zsgtsftr_trd_acc.json')

/**
 * ZSGTSFTR_TRD_ACC (Trade Invoice posting configuration) is SAP customizing, so it is loaded from an export of the
 * SAP table (database/seed/zsgtsftr_trd_acc.json, SAP field names), not typed in. Idempotent: each row is upserted
 * by ZFI_TYPE and every other field takes the file's value. Returns how many rows it processed.
 */
export function seedTrdAcc(db: Database.Database, file = TRD_ACC_SEED_FILE): number {
  const rows = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>[]
  const repo = ddicRepository(db, { table: 'zsgtsftr_trd_acc', client: TRD_ACC_CLIENT, columns: TRD_ACC_COLUMNS })
  db.transaction(() => {
    for (const { ZFI_TYPE, ...fields } of rows) repo.upsert({ ZFI_TYPE: ZFI_TYPE ?? '' }, fields)
  })()
  return rows.length
}

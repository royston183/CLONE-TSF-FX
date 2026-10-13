import type { Database } from './db.ts'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO_ROOT } from '../config.ts'
import { ddicRepository, type DdicRow } from './repositories/ddic-table.ts'
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
export function runSeeds(db: Database, lookups: readonly LookupValue[] = LOOKUP_SEED): number {
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

/** Loads the shipped posting configuration, keyed by ZFI_TYPE; safe to run again. */
export function seedTrdAcc(db: Database): number {
  const rows = JSON.parse(readFileSync(resolve(REPO_ROOT, 'database/seed/zsgtsftr_trd_acc.json'), 'utf8')) as DdicRow[]
  const repo = ddicRepository(db, { table: 'zsgtsftr_trd_acc', client: TRD_ACC_CLIENT, columns: TRD_ACC_COLUMNS })
  db.transaction(() => {
    for (const row of rows) {
      const { ZFI_TYPE, ...fields } = row
      if (typeof ZFI_TYPE !== 'string') throw new Error('Posting seed requires a ZFI_TYPE string.')
      repo.upsert({ ZFI_TYPE }, fields)
    }
  })()
  return rows.length
}

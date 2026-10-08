import type { Database } from './db.ts'
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

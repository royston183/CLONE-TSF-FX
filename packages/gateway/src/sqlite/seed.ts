import type { Database } from './db.ts'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO_ROOT } from '../config.ts'
import { ddicRepository, type DdicRow } from './repositories/ddic-table.ts'
import { DMS_TYP_CLIENT, DMS_TYP_COLUMNS } from './repositories/dms-typ-columns.ts'
import { TRD_ACC_CLIENT, TRD_ACC_COLUMNS } from './repositories/trd-acc-columns.ts'
import { SET_FX_CLIENT, SET_FX_COLUMNS } from './repositories/set-fx-columns.ts'
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

/** Restores the Excel-exported settlement configuration by its full client/model/deal/side key. */
export function seedSetFx(db: Database, rows = JSON.parse(readFileSync(resolve(REPO_ROOT, 'database/seed/zsgtsftr_set_fx.json'), 'utf8')) as DdicRow[]): number {
  const columns = ['CLIENT', ...SET_FX_COLUMNS.map((c) => c.name)]
  const repo = ddicRepository(db, { table: 'zsgtsftr_set_fx', client: SET_FX_CLIENT, columns: SET_FX_COLUMNS })
  const seen = new Set<string>()
  return db.transaction(() => {
    for (const row of rows) {
      if (Object.keys(row).length !== columns.length || columns.some((name) => typeof row[name] !== 'string') || Object.keys(row).some((name) => !columns.includes(name))) {
        throw new Error('SET_FX seed requires exactly the DDIC columns, all stored as text.')
      }
      if (row['CLIENT'] !== SET_FX_CLIENT) throw new Error(`SET_FX seed requires client ${SET_FX_CLIENT}.`)
      const { CLIENT: _client, ZMOD_ID, ZD_MAP, ZBS, ...fields } = row
      if (typeof ZMOD_ID !== 'string' || typeof ZD_MAP !== 'string' || typeof ZBS !== 'string' || !['B', 'S'].includes(ZBS)) {
        throw new Error('SET_FX seed requires model, deal and buy/sell keys.')
      }
      const signature = JSON.stringify([ZMOD_ID, ZD_MAP, ZBS])
      if (seen.has(signature)) throw new Error(`Duplicate SET_FX seed key: ${signature}.`)
      seen.add(signature)
      repo.upsert({ ZMOD_ID, ZD_MAP, ZBS }, fields)
    }
    return rows.length
  })()
}

/** Loads the exported DMS document types only when the table is empty. */
export function seedDmsTyp(db: Database): number {
  return db.transaction(() => {
    if (db.prepare('SELECT 1 FROM zsgtsftr_dms_typ LIMIT 1').get()) return 0
    const rows = JSON.parse(readFileSync(resolve(REPO_ROOT, 'database/seed/zsgtsftr_dms_typ.json'), 'utf8')) as DdicRow[]
    // SAP exports can contain an initial (blank) category; preserve those rows too.
    const insert = db.prepare(`INSERT INTO zsgtsftr_dms_typ
      (client, ${DMS_TYP_COLUMNS.map((c) => c.name.toLowerCase()).join(', ')})
      VALUES (@CLIENT, ${DMS_TYP_COLUMNS.map((c) => `@${c.name}`).join(', ')})`)
    for (const row of rows) {
      for (const column of DMS_TYP_COLUMNS) {
        const value = row[column.name]
        if (typeof value !== 'string' || value.length > column.max) throw new Error(`Invalid DMS type seed field: ${column.name}.`)
      }
      if (!row['ZDMS_TYPE']) throw new Error('DMS type seed requires ZDMS_TYPE.')
      insert.run({ CLIENT: DMS_TYP_CLIENT, ...row })
    }
    return rows.length
  })()
}

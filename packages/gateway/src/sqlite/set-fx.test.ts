import { deepStrictEqual, strictEqual, throws } from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it } from 'node:test'
import { REPO_ROOT } from '../config.ts'
import { openDatabase } from './db.ts'
import { runMigrations } from './migrate.ts'
import { seedSetFx } from './seed.ts'
import { ddicRepository, type DdicRow } from './repositories/ddic-table.ts'
import { SET_FX_CLIENT, SET_FX_COLUMNS } from './repositories/set-fx-columns.ts'

const seed = () => JSON.parse(readFileSync(resolve(REPO_ROOT, 'database/seed/zsgtsftr_set_fx.json'), 'utf8')) as DdicRow[]
const fresh = () => {
  const db = openDatabase(':memory:')
  runMigrations(db)
  return db
}

describe('Excel-exported SET_FX configuration', () => {
  it('stores every seed value with the full DDIC primary key and preserves codes, blanks, dates and times', () => {
    const db = fresh()
    try {
      const expected = seed()
      strictEqual(seedSetFx(db), 54)
      const columns = db.prepare<[], { name: string; type: string; pk: number }>('PRAGMA table_info(zsgtsftr_set_fx)').all()
      deepStrictEqual(columns.filter((c) => c.pk).map((c) => c.name), ['client', 'zmod_id', 'zd_map', 'zbs'])
      strictEqual(columns.length, 25)
      strictEqual(columns.every((c) => c.type === 'TEXT'), true)
      const stored = db.prepare<[], DdicRow>('SELECT * FROM zsgtsftr_set_fx').all()
      const byKey = new Map(stored.map((r) => [JSON.stringify([r['client'], r['zmod_id'], r['zd_map'], r['zbs']]), r]))
      for (const row of expected) {
        const key = JSON.stringify([row['CLIENT'], row['ZMOD_ID'], row['ZD_MAP'], row['ZBS']])
        const actual = byKey.get(key)!
        deepStrictEqual(actual, Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase(), v])))
      }
      strictEqual(stored.length, expected.length)
      deepStrictEqual(db.prepare("SELECT zacc, zrbukrs, zcreated_date, zcreated_time FROM zsgtsftr_set_fx WHERE client='100' AND zmod_id='M032' AND zd_map='D1' AND zbs='S'").get(), {
        zacc: '01', zrbukrs: '', zcreated_date: '20241206', zcreated_time: '024050',
      })
      deepStrictEqual(db.prepare("SELECT zchanged_date, zchanged_time FROM zsgtsftr_set_fx WHERE client='100' AND zmod_id='M044' AND zd_map='D2' AND zbs='S'").get(), {
        zchanged_date: '20250807', zchanged_time: '113834',
      })
      deepStrictEqual(runMigrations(db), [])
    } finally {
      db.close()
    }
  })

  it('can be reseeded without duplicates, restores exported values and leaves unrelated rows and clients intact', () => {
    const db = fresh()
    try {
      seedSetFx(db)
      const repo = ddicRepository(db, { table: 'zsgtsftr_set_fx', client: SET_FX_CLIENT, columns: SET_FX_COLUMNS })
      repo.upsert({ ZMOD_ID: 'LOCAL', ZD_MAP: 'D1', ZBS: 'B' }, { ZPAY_ID: 'LOCAL' })
      repo.upsert({ ZMOD_ID: 'M032', ZD_MAP: 'D1', ZBS: 'S' }, { ZPAY_ID: 'CHANGED' })
      db.exec("INSERT INTO zsgtsftr_set_fx (client,zmod_id,zd_map,zbs,zpay_id) VALUES ('200','M032','D1','S','OTHER')")
      strictEqual(seedSetFx(db), 54)
      strictEqual(seedSetFx(db), 54)
      strictEqual(db.prepare('SELECT COUNT(*) FROM zsgtsftr_set_fx').pluck().get(), 56)
      strictEqual(repo.get({ ZMOD_ID: 'M032', ZD_MAP: 'D1', ZBS: 'S' })?.['ZPAY_ID'], '')
      strictEqual(repo.get({ ZMOD_ID: 'LOCAL', ZD_MAP: 'D1', ZBS: 'B' })?.['ZPAY_ID'], 'LOCAL')
      strictEqual(db.prepare("SELECT zpay_id FROM zsgtsftr_set_fx WHERE client='200'").pluck().get(), 'OTHER')
    } finally {
      db.close()
    }
  })

  it('rolls the entire import back for invalid lengths, clients, columns, sides or duplicate keys', () => {
    const db = fresh()
    try {
      seedSetFx(db)
      const before = db.prepare('SELECT * FROM zsgtsftr_set_fx ORDER BY client,zmod_id,zd_map,zbs').all()
      const rows = seed()
      for (const invalid of [
        { ...rows[1]!, ZSET_DESC: 'x'.repeat(121) },
        { ...rows[1]!, CLIENT: '200' },
        { ...rows[1]!, EXTRA: 'unknown' },
        { ...rows[1]!, ZBS: 'X' },
        { ...rows[0]! },
      ]) {
        throws(() => seedSetFx(db, [{ ...rows[0]!, ZPAY_ID: 'CHANGED' }, invalid]))
        deepStrictEqual(db.prepare('SELECT * FROM zsgtsftr_set_fx ORDER BY client,zmod_id,zd_map,zbs').all(), before)
      }
    } finally {
      db.close()
    }
  })
})

import { deepStrictEqual, ok, strictEqual, throws } from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it } from 'node:test'
import { openDatabase } from './db.ts'
import { MIGRATIONS_DIR, runMigrations } from './migrate.ts'
import { createDdicRepository } from './repositories/ddic-table.ts'
import { DAYLOCK_BLOTTER, DAYLOCK_CLIENT, DAYLOCK_COLUMNS, DAYLOCK_CO_AREA } from './repositories/daylock-columns.ts'

const fresh = () => {
  const db = openDatabase(':memory:')
  runMigrations(db)
  return createDdicRepository(db, { table: 'zsgtsftr_daylock', client: DAYLOCK_CLIENT, columns: DAYLOCK_COLUMNS })
}

/** The key the Lock Blotter route builds: the day, group and trader, with the program's constants. */
const day = (date: string, group = 'G01', trader = 'T001') => ({
  ZB_TYPE: DAYLOCK_BLOTTER,
  ZCO_AREA: DAYLOCK_CO_AREA,
  ZGRP: group,
  ZMONTH: date.slice(4, 6),
  ZPDATE: date,
  ZTYPE: trader,
  ZYEAR: date.slice(0, 4),
})

const metadata = JSON.parse(readFileSync(resolve(MIGRATIONS_DIR, '../metadata/zsgtsftr_daylock.json'), 'utf8')) as {
  primaryKey: string[]
  fields: { name: string; length: number; isKey: boolean; ddicNotNullIndicator: string }[]
}

describe('ZSGTSFTR_DAYLOCK DDIC schema', () => {
  it('matches the supplied field order, text types, nullability and primary-key order', () => {
    const db = openDatabase(':memory:')
    try {
      runMigrations(db)
      const columns = db.prepare<[], { name: string; type: string; notnull: number; pk: number }>('PRAGMA table_info(zsgtsftr_daylock)').all()
      deepStrictEqual(columns.map((c) => ({ name: c.name.toUpperCase(), type: c.type, notnull: c.notnull })),
        metadata.fields.map((f) => ({ name: f.name, type: 'TEXT', notnull: f.ddicNotNullIndicator === 'X' ? 1 : 0 })))
      deepStrictEqual(columns.filter((c) => c.pk).sort((a, b) => a.pk - b.pk).map((c) => c.name.toUpperCase()), metadata.primaryKey)
      deepStrictEqual(DAYLOCK_COLUMNS.map((c) => ({ name: c.name, max: c.max, key: !!c.key })),
        metadata.fields.filter((f) => f.name !== 'CLIENT').map((f) => ({ name: f.name, max: f.length, key: f.isKey })))
    } finally { db.close() }
  })

  it('enforces field lengths in SQLite and accepts NULL in non-key fields', () => {
    const db = openDatabase(':memory:')
    try {
      runMigrations(db)
      const repo = createDdicRepository(db, { table: 'zsgtsftr_daylock', client: DAYLOCK_CLIENT, columns: DAYLOCK_COLUMNS })
      repo.upsert(day('20261015'), { ZCREATED_TIME: '000001' })
      for (const field of metadata.fields) {
        const column = field.name.toLowerCase()
        // Column names come exclusively from the checked-in DDIC metadata.
        throws(() => db.prepare(`UPDATE zsgtsftr_daylock SET ${column} = ?`).run('1'.repeat(field.length + 1)), /CHECK constraint failed/)
        if (field.isKey) throws(() => db.exec(`UPDATE zsgtsftr_daylock SET ${column} = NULL`), /NOT NULL constraint failed/)
      }
      db.exec('UPDATE zsgtsftr_daylock SET zlocked = NULL, zchanged_time = NULL')
      deepStrictEqual(db.prepare('SELECT zlocked, zchanged_time, zcreated_time FROM zsgtsftr_daylock').get(),
        { zlocked: null, zchanged_time: null, zcreated_time: '000001' })
    } finally { db.close() }
  })

  it('upgrades an existing table without changing rows from any client', () => {
    const db = openDatabase(':memory:')
    try {
      db.exec(readFileSync(resolve(MIGRATIONS_DIR, '008_zsgtsftr_daylock.sql'), 'utf8'))
      const repo = createDdicRepository(db, { table: 'zsgtsftr_daylock', client: DAYLOCK_CLIENT, columns: DAYLOCK_COLUMNS })
      repo.upsert(day('20261015'), { ZLOCKED: 'X', ZCREATED_BY: 'FIRST', ZCREATED_TIME: '000001', ZCHANGED_BY: 'SECOND' })
      db.exec("INSERT INTO zsgtsftr_daylock SELECT '200', zb_type, zco_area, zgrp, zmonth, zpdate, ztype, zyear, zlocked, zcreated_by, zcreated_date, zcreated_time, zchanged_by, zchanged_date, zchanged_time FROM zsgtsftr_daylock")
      const before = db.prepare('SELECT * FROM zsgtsftr_daylock ORDER BY client').all()
      db.transaction(() => db.exec(readFileSync(resolve(MIGRATIONS_DIR, '010_zsgtsftr_daylock_ddic.sql'), 'utf8')))()
      deepStrictEqual(db.prepare('SELECT * FROM zsgtsftr_daylock ORDER BY client').all(), before)
      const upgraded = createDdicRepository(db, { table: 'zsgtsftr_daylock', client: DAYLOCK_CLIENT, columns: DAYLOCK_COLUMNS })
      strictEqual(upgraded.upsert(day('20261015'), { ZCHANGED_BY: 'THIRD' })['ZCREATED_BY'], 'FIRST')
      strictEqual(upgraded.list().length, 1)
    } finally { db.close() }
  })

  it('rolls the upgrade back if a legacy value exceeds its DDIC length', () => {
    const db = openDatabase(':memory:')
    try {
      db.exec(readFileSync(resolve(MIGRATIONS_DIR, '008_zsgtsftr_daylock.sql'), 'utf8'))
      createDdicRepository(db, { table: 'zsgtsftr_daylock', client: DAYLOCK_CLIENT, columns: DAYLOCK_COLUMNS }).upsert(day('20261015'), { ZLOCKED: 'X' })
      db.exec("UPDATE zsgtsftr_daylock SET zlocked = 'TOO LONG'")
      throws(() => db.transaction(() => db.exec(readFileSync(resolve(MIGRATIONS_DIR, '010_zsgtsftr_daylock_ddic.sql'), 'utf8')))(), /CHECK constraint failed/)
      strictEqual(db.prepare('SELECT zlocked FROM zsgtsftr_daylock').pluck().get(), 'TOO LONG')
      strictEqual(db.prepare("SELECT count(*) FROM sqlite_master WHERE name = 'zsgtsftr_daylock_ddic'").pluck().get(), 0)
    } finally { db.close() }
  })
})

describe('ZSGTSFTR_DAYLOCK repository', () => {
  it('a locked day is read back by date + group + trader under SAP field names', () => {
    const repo = fresh()
    const row = repo.upsert(day('20261015'), { ZLOCKED: 'X', ZCREATED_BY: 'SIDDHI' })
    deepStrictEqual([row['ZPDATE'], row['ZGRP'], row['ZTYPE'], row['ZB_TYPE'], row['ZCO_AREA'], row['ZLOCKED']], ['20261015', 'G01', 'T001', 'DE6', 'OL10', 'X'])
    deepStrictEqual([row['ZYEAR'], row['ZMONTH']], ['2026', '10'])
    strictEqual(row['CLIENT'], undefined)
    strictEqual(repo.get(day('20261015'))?.['ZLOCKED'], 'X')
  })

  it('a day, group or trader that was not locked has no row', () => {
    const repo = fresh()
    repo.upsert(day('20261015'), { ZLOCKED: 'X' })
    strictEqual(repo.get(day('20261016')), undefined)
    strictEqual(repo.get(day('20261015', 'G02')), undefined)
    strictEqual(repo.get(day('20261015', 'G01', 'T002')), undefined)
  })

  it('locking the same day again updates the row instead of adding one, and keeps who first locked it', () => {
    const repo = fresh()
    repo.upsert(day('20261015'), { ZLOCKED: 'X', ZCREATED_BY: 'FIRST' })
    const again = repo.upsert(day('20261015'), { ZLOCKED: 'X', ZCHANGED_BY: 'SECOND' })
    strictEqual(repo.list().length, 1)
    deepStrictEqual([again['ZCREATED_BY'], again['ZCHANGED_BY']], ['FIRST', 'SECOND'])
  })

  it('lists a trader\'s locked days, and an unlock removes just that day', () => {
    const repo = fresh()
    repo.upsert(day('20261014'), { ZLOCKED: 'X' })
    repo.upsert(day('20261015'), { ZLOCKED: 'X' })
    repo.upsert(day('20261015', 'G01', 'T002'), { ZLOCKED: 'X' })
    deepStrictEqual(repo.list({ column: 'ZTYPE', value: 'T001' }).map((r) => r['ZPDATE']), ['20261014', '20261015'])
    ok(repo.remove(day('20261014')))
    ok(!repo.remove(day('20261014')), 'already gone')
    deepStrictEqual(repo.list({ column: 'ZTYPE', value: 'T001' }).map((r) => r['ZPDATE']), ['20261015'])
  })
})

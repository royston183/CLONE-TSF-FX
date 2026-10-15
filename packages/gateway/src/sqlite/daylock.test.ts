import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { openDatabase } from './db.ts'
import { runMigrations } from './migrate.ts'
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

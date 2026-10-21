import { deepStrictEqual, strictEqual, throws } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { openDatabase } from './db.ts'
import { runMigrations } from './migrate.ts'
import { ddicRepository, DdicInputError } from './repositories/ddic-table.ts'
import { CURPAIR_CLIENT, CURPAIR_COLUMNS, FIELDS_CLIENT, FIELDS_COLUMNS, LIMIT_CLIENT, LIM_MAN_COLUMNS } from './repositories/limit-columns.ts'

const fresh = () => {
  const db = openDatabase(':memory:')
  runMigrations(db)
  return db
}
const info = (db: ReturnType<typeof fresh>, table: string) => db.prepare<[], { name: string; type: string; pk: number }>(`PRAGMA table_info(${table})`).all()

describe('ZSGTRMTR_CURPAIR', () => {
  it('has the DDIC columns and key (MANDT, F_CURR, T_CURR)', () => {
    const db = fresh()
    try {
      const cols = info(db, 'zsgtrmtr_curpair')
      deepStrictEqual(cols.map((c) => c.name), ['mandt', 'f_curr', 't_curr', 'bukrs', 'pair', 'created_by', 'created_date', 'created_time', 'upuser', 'dupdat', 'tuptim', 'div_ratio'])
      deepStrictEqual(cols.filter((c) => c.pk).map((c) => c.name), ['mandt', 'f_curr', 't_curr'])
      deepStrictEqual(['mandt', ...CURPAIR_COLUMNS.map((c) => c.name.toLowerCase())], cols.map((c) => c.name))
    } finally {
      db.close()
    }
  })

  it('reads and writes through the repository with its MANDT client column', () => {
    const db = fresh()
    try {
      const repo = ddicRepository(db, { table: 'zsgtrmtr_curpair', client: CURPAIR_CLIENT, clientColumn: 'mandt', columns: CURPAIR_COLUMNS })
      repo.upsert({ F_CURR: 'USD', T_CURR: 'INR' }, { PAIR: 'USD-INR', BUKRS: 'IN11', DIV_RATIO: 1 })
      db.prepare("INSERT INTO zsgtrmtr_curpair (mandt, f_curr, t_curr, pair) VALUES ('200', 'USD', 'THB', 'USD-THB')").run()
      const rows = repo.list()
      strictEqual(rows.length, 1)
      strictEqual(rows[0]?.['PAIR'], 'USD-INR')
      strictEqual(rows[0]?.['DIV_RATIO'], 1)
      strictEqual(repo.remove({ F_CURR: 'USD', T_CURR: 'INR' }), true)
    } finally {
      db.close()
    }
  })
})

describe('ZSGTSFTR_LIM_MAN', () => {
  it('has one column per listed field and the assumed key', () => {
    const db = fresh()
    try {
      const cols = info(db, 'zsgtsftr_lim_man')
      deepStrictEqual(['client', ...LIM_MAN_COLUMNS.map((c) => c.name.toLowerCase())].sort(), cols.map((c) => c.name).sort())
      deepStrictEqual(cols.filter((c) => c.pk).map((c) => c.name).sort(), ['client', 'zcurr_pair', 'zlimit_matdt', 'zlimit_startdt', 'zyear'])
    } finally {
      db.close()
    }
  })

  it('stores a limit, updates it in place and filters by year', () => {
    const db = fresh()
    try {
      const repo = ddicRepository(db, { table: 'zsgtsftr_lim_man', client: LIMIT_CLIENT, columns: LIM_MAN_COLUMNS })
      const key = { ZYEAR: '2026', ZCURR_PAIR: 'USD-INR', ZLIMIT_STARTDT: '20260101', ZLIMIT_MATDT: '20260228' }
      repo.upsert(key, { ZCURR: 'USD', ZUNAPROV_AMT: 5_000_000, ZLIM_SET: 'X' })
      repo.upsert(key, { ZUNAPROV_AMT: 7_500_000, ZLIM_ADDLIM: 'X', ZLIM_APP: '' })
      repo.upsert({ ...key, ZYEAR: '2025', ZLIMIT_STARTDT: '20250101', ZLIMIT_MATDT: '20251231' }, { ZCURR: 'USD' })
      const row = repo.get(key)!
      strictEqual(row['ZUNAPROV_AMT'], 7_500_000)
      strictEqual(row['ZLIM_SET'], 'X')
      strictEqual(row['ZLIM_ADDLIM'], 'X')
      strictEqual(row['ZINI_AAMT'], 0)
      strictEqual(repo.list().length, 2)
      deepStrictEqual(repo.list({ column: 'ZYEAR', value: '2026' }).map((r) => r['ZLIMIT_STARTDT']), ['20260101'])
    } finally {
      db.close()
    }
  })

  it('rejects unknown fields, overlong text and non-numeric amounts', () => {
    const db = fresh()
    try {
      const repo = ddicRepository(db, { table: 'zsgtsftr_lim_man', client: LIMIT_CLIENT, columns: LIM_MAN_COLUMNS })
      const key = { ZYEAR: '2026', ZCURR_PAIR: 'USD-INR', ZLIMIT_STARTDT: '20260101', ZLIMIT_MATDT: '20260228' }
      throws(() => repo.upsert(key, { ZNOPE: 'x' }), DdicInputError)
      throws(() => repo.upsert(key, { ZLIM_SET: 'XX' }), DdicInputError)
      throws(() => repo.upsert(key, { ZUNAPROV_AMT: 'lots' }), DdicInputError)
    } finally {
      db.close()
    }
  })
})

describe('ZSGTRMTR_FIELDS', () => {
  it('has the DDIC columns and key (CLIENT, ZFIELD) and round-trips a row', () => {
    const db = fresh()
    try {
      const cols = info(db, 'zsgtrmtr_fields')
      deepStrictEqual(['client', ...FIELDS_COLUMNS.map((c) => c.name.toLowerCase())], cols.map((c) => c.name))
      deepStrictEqual(cols.filter((c) => c.pk).map((c) => c.name), ['client', 'zfield'])
      const repo = ddicRepository(db, { table: 'zsgtrmtr_fields', client: FIELDS_CLIENT, columns: FIELDS_COLUMNS })
      repo.upsert({ ZFIELD: 'ZDEAL_ID' }, { ZNAME: 'Deal ID' })
      strictEqual(repo.get({ ZFIELD: 'ZDEAL_ID' })?.['ZNAME'], 'Deal ID')
    } finally {
      db.close()
    }
  })
})

import { deepStrictEqual, ok, strictEqual, throws } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { openDatabase } from './db.ts'
import { runMigrations } from './migrate.ts'
import { createTrdPosRepository, TrdPosInputError } from './repositories/trd-pos.ts'

const fresh = () => {
  const db = openDatabase(':memory:')
  runMigrations(db)
  return createTrdPosRepository(db)
}

describe('ZSGTSFTR_TRD_POS repository', () => {
  it('creates a row by Deal ID + sequence and reads it back under SAP field names', () => {
    const repo = fresh()
    const row = repo.upsert('7000000034', '01', { ZBUKRS: 'SG03', ZAMT: 1250.5, ZCURR: 'USD', ZSET_CHECK: 'X' })
    strictEqual(row['ZDEAL_ID'], '7000000034')
    strictEqual(row['ZSEQ'], '01')
    strictEqual(row['ZAMT'], 1250.5)
    strictEqual(row['ZSET_CHECK'], 'X')
    strictEqual(row['ZMSG'], '')
    strictEqual(row['CLIENT'], undefined)
  })

  it('updates only the fields sent and leaves the rest as they were', () => {
    const repo = fresh()
    repo.upsert('D1', '01', { ZBUKRS: 'SG03', ZAMT: 10, ZSET_CHECK: '' })
    const row = repo.upsert('D1', '01', { ZSET_CHECK: 'X' })
    deepStrictEqual([row['ZBUKRS'], row['ZAMT'], row['ZSET_CHECK']], ['SG03', 10, 'X'])
    strictEqual(repo.list('D1').length, 1)
  })

  it('lists by Deal ID in sequence order, and removes a row', () => {
    const repo = fresh()
    repo.upsert('D1', '02', {})
    repo.upsert('D1', '01', {})
    repo.upsert('D2', '01', {})
    deepStrictEqual(repo.list('D1').map((r) => r['ZSEQ']), ['01', '02'])
    strictEqual(repo.list().length, 3)
    ok(repo.remove('D1', '01'))
    strictEqual(repo.remove('D1', '01'), false)
    strictEqual(repo.get('D1', '01'), undefined)
  })

  it('rejects unknown columns, key columns, over-long text and non-numeric amounts', () => {
    const repo = fresh()
    throws(() => repo.upsert('D1', '01', { NOPE: 'x' }), TrdPosInputError)
    throws(() => repo.upsert('D1', '01', { ZDEAL_ID: 'other' }), TrdPosInputError)
    throws(() => repo.upsert('D1', '01', { ZSET_CHECK: 'XX' }), TrdPosInputError)
    throws(() => repo.upsert('D1', '01', { ZAMT: 'abc' }), TrdPosInputError)
    throws(() => repo.upsert('D1', '01', { ZBUKRS: "1'; DROP TABLE zsgtsftr_trd_pos;--" }), TrdPosInputError)
    strictEqual(repo.list().length, 0)
  })
})

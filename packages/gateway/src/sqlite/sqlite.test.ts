import { deepStrictEqual, notStrictEqual, ok, strictEqual, throws } from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { openDatabase } from './db.ts'
import { runMigrations } from './migrate.ts'
import { createDealMetadataRepository } from './repositories/deal-metadata.ts'
import { runSeeds } from './seed.ts'

const fresh = () => {
  const db = openDatabase(':memory:')
  runMigrations(db)
  return db
}

describe('migrations', () => {
  it('applies the shipped migrations once and records them', () => {
    const db = openDatabase(':memory:')
    const first = runMigrations(db)
    ok(first.includes('001_deal_metadata.sql'))
    deepStrictEqual(runMigrations(db), [])
    strictEqual(db.prepare('SELECT COUNT(*) FROM _migrations').pluck().get(), first.length)
  })

  it('rolls a failing migration back completely and retries it next run', () => {
    const dir = mkdtempSync(join(tmpdir(), 'slc-mig-'))
    writeFileSync(join(dir, '001_ok.sql'), 'CREATE TABLE a (x INTEGER);')
    writeFileSync(join(dir, '002_bad.sql'), 'CREATE TABLE b (x INTEGER); INSERT INTO missing VALUES (1);')
    const db = openDatabase(':memory:')

    throws(() => runMigrations(db, dir))
    // 001 stays applied; 002 left neither its table nor a record behind.
    deepStrictEqual(db.prepare('SELECT name FROM _migrations').pluck().all(), ['001_ok.sql'])
    strictEqual(db.prepare("SELECT COUNT(*) FROM sqlite_master WHERE name = 'b'").pluck().get(), 0)

    writeFileSync(join(dir, '002_bad.sql'), 'CREATE TABLE b (x INTEGER);')
    deepStrictEqual(runMigrations(db, dir), ['002_bad.sql'])
  })

  it('ignores files that are not numbered migrations', () => {
    const dir = mkdtempSync(join(tmpdir(), 'slc-mig-'))
    writeFileSync(join(dir, 'README.md'), 'notes')
    writeFileSync(join(dir, 'draft.sql'), 'DROP TABLE everything;')
    deepStrictEqual(runMigrations(openDatabase(':memory:'), dir), [])
  })
})

describe('seed', () => {
  it('is idempotent and brings changed rows up to date', () => {
    const db = fresh()
    runSeeds(db)
    runSeeds(db)
    const count = () => db.prepare('SELECT COUNT(*) FROM lookup_value').pluck().get()
    strictEqual(count(), 2)

    runSeeds(db, [{ category: 'strategy', code: 'HEDGE_01', label: 'Renamed', sortOrder: 5 }])
    strictEqual(count(), 2)
    strictEqual(db.prepare("SELECT label FROM lookup_value WHERE code = 'HEDGE_01'").pluck().get(), 'Renamed')
  })
})

describe('deal metadata repository', () => {
  const key = { companyCode: '9990', transactionId: '100245' }

  it('creates, reads back and lists a row keyed by the SAP business key', () => {
    const repo = createDealMetadataRepository(fresh())
    const row = repo.createDealMetadata({ ...key, strategy: 'HEDGE_01', remark: 'first' })
    strictEqual(row.companyCode, '9990')
    strictEqual(row.strategy, 'HEDGE_01')
    strictEqual(row.productType, null)
    deepStrictEqual(repo.getDealMetadata('9990', '100245'), row)
    strictEqual(repo.listDealMetadata().length, 1)
    strictEqual(repo.getDealMetadata('9990', 'nope'), undefined)
  })

  it('refuses a second row for the same company code and transaction', () => {
    const repo = createDealMetadataRepository(fresh())
    repo.createDealMetadata(key)
    throws(() => repo.createDealMetadata(key), (e: { code?: string }) => e.code === 'SQLITE_CONSTRAINT_UNIQUE')
  })

  it('updates only the supplied fields, can clear one, and moves updated_at', async () => {
    const repo = createDealMetadataRepository(fresh())
    const created = repo.createDealMetadata({ ...key, strategy: 'HEDGE_01', remark: 'keep me' })
    await new Promise((r) => setTimeout(r, 5)) // updated_at has millisecond resolution

    const patched = repo.updateDealMetadata('9990', '100245', { strategy: 'TRADING_01', internalReference: 'ABC' })!
    strictEqual(patched.strategy, 'TRADING_01')
    strictEqual(patched.internalReference, 'ABC')
    strictEqual(patched.remark, 'keep me') // absent => untouched
    strictEqual(patched.createdAt, created.createdAt)
    notStrictEqual(patched.updatedAt, created.updatedAt)

    strictEqual(repo.updateDealMetadata('9990', '100245', { remark: null })!.remark, null) // null => cleared
    strictEqual(repo.updateDealMetadata('9990', 'nope', { remark: 'x' }), undefined)
  })

  it('upserts: inserts when new, updates supplied fields when it exists', () => {
    const repo = createDealMetadataRepository(fresh())
    repo.upsertDealMetadata({ ...key, strategy: 'A', remark: 'r' })
    const again = repo.upsertDealMetadata({ ...key, strategy: 'B' })
    strictEqual(again.strategy, 'B')
    strictEqual(again.remark, 'r')
    strictEqual(repo.listDealMetadata().length, 1)
  })

  it('deletes, reporting whether anything was removed', () => {
    const repo = createDealMetadataRepository(fresh())
    repo.createDealMetadata(key)
    strictEqual(repo.deleteDealMetadata('9990', '100245'), true)
    strictEqual(repo.deleteDealMetadata('9990', '100245'), false)
  })

  it('treats hostile input as data, never as SQL', () => {
    const repo = createDealMetadataRepository(fresh())
    const nasty = "x'; DROP TABLE deal_metadata; --"
    repo.createDealMetadata({ companyCode: nasty, transactionId: '1', remark: nasty })
    strictEqual(repo.getDealMetadata(nasty, '1')?.remark, nasty)
    strictEqual(repo.listDealMetadata().length, 1)
  })
})

describe('seedTrdAcc', () => {
  it('loads the exported posting types, once and again, by ZFI_TYPE', async () => {
    const { seedTrdAcc } = await import('./seed.ts')
    const { ddicRepository } = await import('./repositories/ddic-table.ts')
    const { TRD_ACC_CLIENT, TRD_ACC_COLUMNS } = await import('./repositories/trd-acc-columns.ts')
    const db = fresh()
    const n = seedTrdAcc(db)
    ok(n >= 6)
    strictEqual(seedTrdAcc(db), n)
    const repo = ddicRepository(db, { table: 'zsgtsftr_trd_acc', client: TRD_ACC_CLIENT, columns: TRD_ACC_COLUMNS })
    strictEqual(repo.list().length, n)
    const one = repo.get({ ZFI_TYPE: '01' })!
    deepStrictEqual([one['ZDOC_TYPE'], one['ZDEBIT'], one['ZCREDIT'], one['ZDR_TEXT']], ['TR', '40', '15', 'Sales Invoice Settlement'])
  })
})

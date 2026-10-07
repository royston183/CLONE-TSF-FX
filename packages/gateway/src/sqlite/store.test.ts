import { deepStrictEqual, strictEqual, throws } from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { parseFilter, parseListQuery, SqliteStore, StoreInputError } from './store.ts'

const query = (search = '') => parseListQuery(new URLSearchParams(search))

describe('SqliteStore', () => {
  it('creates, reads, merges, replaces and deletes a record', () => {
    const store = new SqliteStore(':memory:')
    const created = store.create('deals', { id: 'D1', amount: 100, ccy: 'USD' }, 'alice')
    strictEqual(created.id, 'D1')
    strictEqual(created._meta.createdBy, 'alice')

    const merged = store.update('deals', 'D1', { amount: 250 }, 'bob', true)
    deepStrictEqual({ amount: merged?.amount, ccy: merged?.ccy }, { amount: 250, ccy: 'USD' })
    strictEqual(merged?._meta.updatedBy, 'bob')
    strictEqual(merged?._meta.createdBy, 'alice')

    const replaced = store.update('deals', 'D1', { amount: 1 }, 'bob', false)
    strictEqual(replaced?.ccy, undefined)

    strictEqual(store.remove('deals', 'D1'), true)
    strictEqual(store.get('deals', 'D1'), undefined)
    store.close()
  })

  it('generates an id when the body has none, and never stores id or _meta as data', () => {
    const store = new SqliteStore(':memory:')
    const record = store.create('notes', { text: 'x', _meta: { createdBy: 'forged' } as never }, 'alice')
    strictEqual(typeof record.id, 'string')
    strictEqual(record._meta.createdBy, 'alice')
    store.close()
  })

  it('keeps collections apart', () => {
    const store = new SqliteStore(':memory:')
    store.create('a', { id: '1' }, 'u')
    store.create('b', { id: '1' }, 'u')
    strictEqual(store.list('a', query()).length, 1)
    deepStrictEqual(store.collections(), [{ name: 'a', count: 1 }, { name: 'b', count: 1 }])
    store.close()
  })

  it('filters on strings, numbers, booleans and null, and orders and pages', () => {
    const store = new SqliteStore(':memory:')
    store.create('deals', { id: '1', status: 'OPEN', amount: 30, urgent: true }, 'u')
    store.create('deals', { id: '2', status: 'OPEN', amount: 10, urgent: false }, 'u')
    store.create('deals', { id: '3', status: "O'NEIL", amount: 20, urgent: null }, 'u')

    const ids = (search: string) => store.list('deals', query(search)).map((r) => r.id)
    deepStrictEqual(ids("$filter=status eq 'OPEN'&$orderby=amount"), ['2', '1'])
    deepStrictEqual(ids('$filter=amount eq 20'), ['3'])
    deepStrictEqual(ids('$filter=urgent eq true'), ['1'])
    deepStrictEqual(ids('$filter=urgent eq null'), ['3'])
    deepStrictEqual(ids("$filter=status eq 'O''NEIL'"), ['3'])
    deepStrictEqual(ids("$filter=status eq 'OPEN' and amount eq 10"), ['2'])
    deepStrictEqual(ids('$orderby=amount desc&$top=2&$skip=1'), ['3', '2'])
    deepStrictEqual(ids("$filter=id eq '2'"), ['2'])
    store.close()
  })

  it('treats a filter value as data, never as SQL', () => {
    const store = new SqliteStore(':memory:')
    store.create('deals', { id: '1', status: 'OPEN' }, 'u')
    strictEqual(store.list('deals', query("$filter=status eq 'x'' OR 1=1 --'")).length, 0)
    store.close()
  })

  it('refuses a duplicate id', () => {
    const store = new SqliteStore(':memory:')
    store.create('deals', { id: '1' }, 'u')
    throws(() => store.create('deals', { id: '1' }, 'u'), /already exists/)
    store.close()
  })

  it('persists across reopening the file, and does not rerun migrations', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'slc-sqlite-')), 'nested', 'test.db')
    const first = new SqliteStore(file)
    first.create('deals', { id: '1', amount: 5 }, 'u')
    first.close()
    const second = new SqliteStore(file)
    strictEqual(second.get('deals', '1')?.amount, 5)
    second.close()
  })

  it('rejects bad collection names', () => {
    const store = new SqliteStore(':memory:')
    throws(() => store.list('../etc', query()), StoreInputError)
    store.close()
  })
})

describe('parseListQuery', () => {
  it('refuses what it does not support rather than ignoring it', () => {
    throws(() => query('$expand=x'), /not supported/)
    throws(() => parseFilter('amount gt 5'), /Cannot read \$filter/)
    throws(() => parseFilter("a eq 'x' or b eq 'y'"), /Cannot read \$filter/)
    throws(() => parseFilter("a eq 'x' and"), /dangling/)
    throws(() => query('$top=-1'), /\$top/)
    throws(() => query('$orderby=amount sideways'), /\$orderby/)
  })
})

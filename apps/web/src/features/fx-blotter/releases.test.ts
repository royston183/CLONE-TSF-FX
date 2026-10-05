import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fromFxTransaction, type FxTransaction } from './api.ts'
import { BUSINESS_PARTNERS } from './data.ts'
import { installFixtures } from './fixtures.ts'
import { buildMasterContracts, initialBlotter, mergeLiveRows } from './logic.ts'
import { applyReleases, loadReleases, releaseKey, saveReleases, updateReleases, type ReleaseStore, type SavedReleases } from './releases.ts'
import type { BlotterRow } from './types.ts'

// The running screen loads these lists from the middleware; the rules are tested against the values the lists used to hold.
installFixtures()

const sap = (over: Partial<FxTransaction> = {}): FxTransaction => ({
  CompanyCode: 'SG03', FinancialTransaction: '3000000000015', ProductType: '12B', TransactionType: '619', Partner: '400000002',
  ContractDate: '2026-10-01', ValueDate: '2026-11-02', BuyCurrency: 'USD', SellCurrency: 'INR', LeadCurrency: 'USD', FollowCurrency: 'INR',
  BuyAmount: 40000, SellAmount: 3328000, ForwardRate: 83.2, ActiveStatus: '0', ...over,
})
const incoming = (over: Partial<FxTransaction> = {}) => {
  const out = fromFxTransaction(sap(over), { group: 'G02', trader: 'NID' }, BUSINESS_PARTNERS)
  ok(out)
  return out.row
}

const fakeStore = (initial?: string): ReleaseStore & { raw: () => string | null } => {
  let value = initial ?? null
  return { getItem: () => value, setItem: (_k, v) => void (value = v), raw: () => value }
}

const RELEASE = { dealId: 'TSF-9080', dealType: 'Deal 1 (Auto Deal)', mcRef: '2000000028', fxModel: 'M033' }

describe('remembering releases', () => {
  it('keys a deal by company and number', () => {
    strictEqual(releaseKey('SG03', '3000000000015'), 'SG03-3000000000015')
  })

  it('round-trips through storage', () => {
    const store = fakeStore()
    saveReleases({ [releaseKey('SG03', '1')]: RELEASE }, store)
    deepStrictEqual(loadReleases(store), { 'SG03-1': RELEASE })
  })

  it('reads nothing from empty, corrupt or wrongly shaped storage', () => {
    deepStrictEqual(loadReleases(fakeStore()), {})
    deepStrictEqual(loadReleases(fakeStore('{not json')), {})
    deepStrictEqual(loadReleases(fakeStore('[1,2]')), {})
    deepStrictEqual(loadReleases(fakeStore('"text"')), {})
    deepStrictEqual(loadReleases(null), {})
  })

  it('does not fail when storage refuses', () => {
    const refusing: ReleaseStore = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('quota') } }
    deepStrictEqual(loadReleases(refusing), {})
    saveReleases({ 'SG03-1': RELEASE }, refusing)
    saveReleases({ 'SG03-1': RELEASE }, null)
  })
})

describe('applying them to deals read from SAP', () => {
  const saved: SavedReleases = { [releaseKey('SG03', '3000000000015')]: RELEASE }

  it('puts a released deal back as Released, with its Deal ID and Master Contract', () => {
    const [r] = applyReleases([incoming()], saved)
    strictEqual(r?.status, 'RELEASED')
    deepStrictEqual([r?.dealId, r?.mcRef, r?.fxModel, r?.dealType], ['TSF-9080', '2000000028', 'M033', 'Deal 1 (Auto Deal)'])
  })

  it('leaves a deal that was never released as Created', () => {
    strictEqual(applyReleases([incoming({ FinancialTransaction: '3000000000099' })], saved)[0]?.status, 'CREATED')
  })

  it('does not undo a reversal SAP reports', () => {
    strictEqual(applyReleases([incoming({ ActiveStatus: '3' })], saved)[0]?.status, 'REVERSED')
  })

  it('does not match the same number in another company code', () => {
    strictEqual(applyReleases([incoming({ CompanyCode: 'AE13' })], saved)[0]?.status, 'CREATED')
  })

  it('survives the grid being rebuilt: a reload shows the released deal as Released', () => {
    const start = initialBlotter(new Date(2026, 9, 1), buildMasterContracts(new Date(2026, 9, 1), []), [...BUSINESS_PARTNERS])
    const b = mergeLiveRows(start, applyReleases([incoming()], saved), BUSINESS_PARTNERS)
    const row = b.rows.find((r) => r.transactionNumber === '3000000000015')
    strictEqual(row?.status, 'RELEASED')
    strictEqual(row?.mcRef, '2000000028')
  })
})

describe('updating what is remembered', () => {
  const row = (over: Partial<BlotterRow>): BlotterRow => ({ ...(incoming() as Omit<BlotterRow, 'id' | 'seq'>), id: 'R1', seq: 1, ...over })

  it('remembers a SAP deal once it is Released', () => {
    const next = updateReleases({}, [row({ status: 'RELEASED', ...RELEASE })])
    deepStrictEqual(next, { 'SG03-3000000000015': RELEASE })
  })

  it('forgets a SAP deal on the grid that is no longer Released', () => {
    const next = updateReleases({ 'SG03-3000000000015': RELEASE }, [row({ status: 'REVERSED' })])
    deepStrictEqual(next, {})
  })

  it('keeps releases of deals that are not on the grid, such as another day\'s', () => {
    const other = { 'SG03-1': RELEASE }
    deepStrictEqual(updateReleases(other, [row({ status: 'CREATED', transactionNumber: '3000000000099' })]), other)
  })

  it('never remembers a demo row or a draft', () => {
    const demo = row({ live: false, status: 'RELEASED', transactionNumber: '8100001' })
    const draft = row({ status: 'DRAFT', transactionNumber: '' })
    deepStrictEqual(updateReleases({}, [demo, draft]), {})
  })
})

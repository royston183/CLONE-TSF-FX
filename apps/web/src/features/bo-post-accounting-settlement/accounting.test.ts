import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { markAccountingComplete, type AccountingDeps } from './accounting.ts'

const settled = (type: string, extra: Record<string, string> = {}) => ({ ZT_TYPE: type, ZSET_CHECK: 'X', ...extra })

function deps(status: string, positions: Record<string, unknown>[]) {
  const writes: string[] = []
  const d: AccountingDeps = {
    readDeal: async (id) => ({ ZDEAL_ID: id, ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_STAT: status }),
    readPositions: async () => positions,
    writeStatus: async (_row, s) => {
      writes.push(s)
    },
  }
  return { d, writes }
}

describe('Accounting Completed', () => {
  it('moves 21 to 22 once every stored leg is settled and posted', async () => {
    const { d, writes } = deps('21', [
      settled('T2-S', { ZPOST_CHECK: 'X', ZBELNR: '6800000101' }),
      settled('T3-P'),
      settled('FX', { ZD_MAP: 'D1', ZRP: '3000000000031', ZBELNR: '6800237281' }),
    ])
    const result = await markAccountingComplete('7000000034', d)
    ok(result.ok)
    deepStrictEqual(writes, ['22'])
  })

  it('refuses while a leg flagged for FI posting, or an FX leg, has no FI document', async () => {
    const { d, writes } = deps('21', [settled('T2-S', { ZPOST_CHECK: 'X' }), settled('FX', { ZD_MAP: 'D2', ZRP: '2000000000038' })])
    const result = await markAccountingComplete('7000000034', d)
    ok(!result.ok && result.error.includes('Not posted yet: T2-S, FX D2 2000000000038'))
    deepStrictEqual(writes, [])
  })

  it('needs Execution Complete (21) first', async () => {
    const { d, writes } = deps('20', [settled('T2-S')])
    const result = await markAccountingComplete('7000000034', d)
    ok(!result.ok && result.error.includes('Execution Complete'))
    deepStrictEqual(writes, [])
  })

  it('names the legs that are not settled', async () => {
    const { d, writes } = deps('21', [settled('T2-S'), { ZT_TYPE: 'T3-P', ZSET_CHECK: '' }, { ZT_TYPE: 'FX', ZD_MAP: 'D2', ZRP: '2000000000038' }])
    const result = await markAccountingComplete('7000000034', d)
    strictEqual(result.ok ? '' : result.error, 'These legs are not settled yet: T3-P, FX D2 2000000000038.')
    deepStrictEqual(writes, [])
  })

  it('refuses with no stored legs, and when already at 22', async () => {
    strictEqual((await markAccountingComplete('1', deps('21', []).d)).ok, false)
    strictEqual((await markAccountingComplete('1', deps('22', [settled('T1-S')]).d)).ok, false)
  })
})

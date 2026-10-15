import { deepStrictEqual, rejects } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { updateFitting } from './workflow.ts'

describe('updateFitting', () => {
  it('rounds only the refused field to the scale the middleware names, then writes again', async () => {
    const writes: Array<Record<string, string>> = []
    const update = async (_r: string, _k: Record<string, string>, c: Record<string, string>) => {
      writes.push({ ...c })
      if (c['ZINV_PRICE'] === '169453.1250') throw new Error("Invalid value for field 'ZINV_PRICE': '169453.1250' exceeds the 2 decimal place(s) allowed; refusing to round")
    }
    await updateFitting(update, 'billOfLading', { ZBL_NO: '1' }, { ZINV_PRICE: '169453.1250', ZUSD_PRICE: '169453.1250' })
    deepStrictEqual(writes.at(-1), { ZINV_PRICE: '169453.13', ZUSD_PRICE: '169453.1250' })
  })

  it('rethrows any other failure untouched', async () => {
    await rejects(updateFitting(async () => { throw new Error('boom') }, 'billOfLading', {}, { ZINV_PRICE: '1.0000' }), /boom/)
  })
})

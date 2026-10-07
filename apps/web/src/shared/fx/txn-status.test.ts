import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  FX_TXN_STATUS,
  FX_TXN_STATUS_LABEL,
  blotterStageOf,
  fxTxnStatusLabel,
  statusAfterRelease,
  statusAfterReverse,
} from './txn-status.ts'

describe('FX_TXN_STATUS', () => {
  it('names the SAP codes, and labels every one of them', () => {
    strictEqual(FX_TXN_STATUS.FO_CREATE, '01')
    strictEqual(FX_TXN_STATUS.FO_DELETE, '02')
    strictEqual(FX_TXN_STATUS.FO_TO_MO_UNMATCHED, '03')
    strictEqual(FX_TXN_STATUS.MO_MATCH_RELEASE, '07')
    deepStrictEqual(Object.values(FX_TXN_STATUS).sort(), Object.keys(FX_TXN_STATUS_LABEL).sort())
    strictEqual(fxTxnStatusLabel('03'), 'FO->MO: Unmatched')
    strictEqual(fxTxnStatusLabel('07'), 'MO: Match & Release for Settlement')
    strictEqual(fxTxnStatusLabel('99'), '99')
  })
})

describe('blotterStageOf', () => {
  it('shows 01 as Created and 03 as Released to MO', () => {
    strictEqual(blotterStageOf('01'), 'CREATED')
    strictEqual(blotterStageOf('03'), 'RELEASED')
  })

  it('treats 07 as MO Match & Release, a released state — not as the FO release itself', () => {
    strictEqual(blotterStageOf('07'), 'RELEASED')
    const [mo, fo]: string[] = [FX_TXN_STATUS.MO_MATCH_RELEASE, FX_TXN_STATUS.FO_TO_MO_UNMATCHED]
    strictEqual(mo === fo, false)
  })

  it('leaves a transaction sent back for correction with the FO desk', () => {
    for (const code of ['04', '06', '08']) strictEqual(blotterStageOf(code), 'CREATED')
  })

  it('shows the two reversals as Reversed and the later MO / BO statuses as Released', () => {
    for (const code of ['02', '05']) strictEqual(blotterStageOf(code), 'REVERSED')
    for (const code of ['10', '11', '12', '13', '40', '49', '50', '59', '61']) strictEqual(blotterStageOf(code), 'RELEASED')
  })

  it('has no opinion on a blank, 00 or unknown status', () => {
    for (const code of ['', '00', '99', undefined, null]) strictEqual(blotterStageOf(code), undefined)
  })
})

describe('statusAfterRelease', () => {
  it('writes 03 for a transaction still with FO', () => {
    for (const code of ['01', '04', '06', '08', '', '00', undefined]) strictEqual(statusAfterRelease(code), '03')
  })

  it('never writes 07, and never moves a transaction already past FO backwards', () => {
    strictEqual(statusAfterRelease('07'), '07')
    strictEqual(statusAfterRelease('03'), '03')
    strictEqual(statusAfterRelease('10'), '10')
    strictEqual(statusAfterRelease('50'), '50')
  })
})

describe('statusAfterReverse', () => {
  it('is 02 FO Delete before release and 05 FO Error Correction - Reverse after it', () => {
    strictEqual(statusAfterReverse('CREATED'), '02')
    strictEqual(statusAfterReverse('RELEASED'), '05')
  })
})

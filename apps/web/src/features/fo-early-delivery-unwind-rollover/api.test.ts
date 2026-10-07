import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { DEAL_TXN_TYPES, NO_GROUP_REASON, assignRollTypes, bankPartnerOptions, isDealLeg, legFromFx, loadBankPartners, loadDealLegs, txnTypeOptions } from './api.ts'
import type { FxTransaction } from '../mo-fx-deal-confirmation/api.ts'
import type { TrmFxApp } from '../../shared/fx/app-str.ts'
import type { Leg } from './types.ts'

const FX: FxTransaction = {
  CompanyCode: 'SG03', FinancialTransaction: '1000000123', ProductType: '12B', TransactionType: '619', Partner: '0220136244',
  ContractDate: '2026-08-01', ValueDate: '2027-02-01', BuyCurrency: 'USD', SellCurrency: 'INR', LeadCurrency: 'USD',
  FollowCurrency: 'INR', BuyAmount: 1000000, SellAmount: 89650000, ForwardRate: 89.65, ActiveStatus: '0', ActivityCategory: '20',
}
const APP: TrmFxApp = {
  CompanyCode: 'SG03', FinancialTransaction: '1000000123', ZtsfDealID: '7000000024', ZtsfDealType: 'D1', TxnStatus: '03',
  ZtsfPreMature: true, ZtsfUnwind: false,
}

describe('legFromFx', () => {
  it('maps FxTransaction + TrmFxApp field for field, sell side negative, ZUONR defaulting to RFHA', () => {
    const names = { partners: new Map([['0220136244', 'MUFG BANK LTD']]), txnTypes: new Map([['12B/619', 'FWD']]) }
    deepStrictEqual(legFromFx({ fx: FX, app: APP }, names, new Map([['SG03', 'Olam Intl']])), {
      rfha: '1000000123', bukrs: 'SG03', butxt: 'Olam Intl', sfhaart: '619', xtext: 'FWD', dblfz: '2026-08-01',
      delfz: '2027-02-01', cpair: 'USD/INR', bs1: 'Buy', curr1: 'USD', amt1: 1000000, bs2: 'Sell', curr2: 'INR',
      amt2: -89650000, otot_rate: 89.65, kontrh: '0220136244', bpName: 'MUFG BANK LTD', txnStatus: '03',
      txnDesc: 'FO->MO: Unmatched', dealType: 'D1', zgrp: '', zuonr: '1000000123', zroll: '', ztsf_pre_mature: true,
      ztsf_unwind: false,
    })
  })

  it('puts the lead currency first when the deal sells it, and falls back to the partner number for the name', () => {
    const l = legFromFx({ fx: { ...FX, LeadCurrency: 'INR', FollowCurrency: 'USD' }, app: { ...APP, TxnStatus: null } })
    deepStrictEqual([l.bs1, l.curr1, l.amt1, l.bs2, l.curr2, l.amt2, l.bpName, l.txnDesc], ['Sell', 'INR', -89650000, 'Buy', 'USD', 1000000, '0220136244', ''])
  })
})

describe('deal_details selection', () => {
  it('keeps the five transaction types and drops reversed deals (saktiv 3)', () => {
    deepStrictEqual([...DEAL_TXN_TYPES], ['605', '619', '631', '607', '608'])
    strictEqual(isDealLeg({ fx: FX, app: APP }), true)
    strictEqual(isDealLeg({ fx: { ...FX, TransactionType: '645' }, app: APP }), false)
    strictEqual(isDealLeg({ fx: { ...FX, ActiveStatus: '3' }, app: APP }), false)
  })
})

describe('loadDealLegs (stubbed fetch)', () => {
  const realFetch = globalThis.fetch
  let urls: string[] = []
  beforeEach(() => {
    urls = []
    globalThis.fetch = (async (input: unknown) => {
      const url = String(input instanceof Request ? input.url : input)
      urls.push(url)
      const value = url.includes('trmfxapp') ? [APP, { ...APP, FinancialTransaction: '1000000124' }] : url.includes('/fx/') ? [FX, { ...FX, FinancialTransaction: '1000000124', ActiveStatus: '3' }] : []
      return new Response(JSON.stringify(url.includes('businesspartner') || url.includes('trmmaster') ? { value: [], d: { results: [] } } : { value }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
  })
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('filters TrmFxApp by Deal ID, joins FxTransaction and drops the reversed leg', async () => {
    const r = await loadDealLegs('7000000024')
    strictEqual(r.state, 'ok')
    if (r.state !== 'ok') return
    deepStrictEqual(r.value.map((l) => l.rfha), ['1000000123'])
    ok(decodeURIComponent((urls.find((u) => u.includes('trmfxapp')) ?? '').replace(/[+]/g, ' ')).includes("ZtsfDealID eq '7000000024'"))
  })
})

describe('Bank BP help', () => {
  it('waits, naming the missing trader group, because no service serves ZGRP', async () => {
    const r = await loadBankPartners('')
    deepStrictEqual(r, { state: 'waiting', reason: NO_GROUP_REASON })
  })
})

describe('assignRollTypes (deal_details, scope 4000029736)', () => {
  const at = (rfha: string, dealType: string, txnStatus: string, buyUsd: boolean): Leg =>
    legFromFx({
      fx: { ...FX, FinancialTransaction: rfha, BuyCurrency: buyUsd ? 'USD' : 'INR', SellCurrency: buyUsd ? 'INR' : 'USD' },
      app: { ...APP, FinancialTransaction: rfha, ZtsfDealType: dealType, TxnStatus: txnStatus },
    })
  const roll = (legs: Leg[]) => Object.fromEntries(assignRollTypes(legs).map((l) => [l.rfha, l.zroll]))

  it('numbers rolled originals (61) and cancellations per side against the first D1 leg', () => {
    deepStrictEqual(
      roll([
        at('100', 'D1', '03', true), // the reference leg: Buy-USD / Sell-INR
        at('101', 'D2', '03', false),
        at('205', '00', '61', true), // R on D1: shares Buy-USD
        at('203', '00', '61', true), // sorted before 205
        at('210', '01', '61', false), // R on D2
        at('300', '00', '03', false), // C on D1: no Sell-INR side
        at('301', '00', '49', true), // C on D2: Sell-INR side
        at('302', '00', '03', false), // second C on D1
        at('303', '00', '03', true), // second C on D2, but there is no R2-D2 to pair it with
      ]),
      { 100: '', 101: '', 205: 'R2-D1', 203: 'R1-D1', 210: 'R1-D2', 300: 'C1-D1', 301: 'C1-D2', 302: 'C2-D1', 303: '' },
    )
  })

  it('leaves every leg untagged when the deal has no D1 leg', () => {
    deepStrictEqual(roll([at('1', 'D2', '03', true), at('2', '00', '61', true)]), { 1: '', 2: '' })
  })
})

describe('value helps', () => {
  it('Txn Type: TVARVC LOW split as low+0(3) / low+4, sorted by key', () => {
    deepStrictEqual(txnTypeOptions([{ LOW: '619 FWD' }, { LOW: '605 SPOT' }, { LOW: '607' }, { LOW: '' }]), [
      { value: '605', primary: '605', secondary: 'SPOT' },
      { value: '607', primary: '607', secondary: undefined },
      { value: '619', primary: '619', secondary: 'FWD' },
    ])
  })

  it("Bank BP: only banks in BP_GRP for the leg's trader group that also exist in BPEXT", () => {
    const groups = [
      { BP: '0660012171', ZGRP: 'G02' },
      { BP: '0220136244', ZGRP: 'G02' },
      { BP: '0660000680', ZGRP: 'G11' },
      { BP: '0999999999', ZGRP: 'G02' }, // not in BPEXT: the inner join drops it
    ]
    const banks = [
      { BP: '0660012171', SHORT_NAME: 'ANZ_SG' },
      { BP: '0660000680', SHORT_NAME: 'KBANK_TH' },
      { BP: '0220136244', SHORT_NAME: 'MUFG_IN' },
    ]
    deepStrictEqual(bankPartnerOptions(groups, banks, 'G02'), [
      { value: '0220136244', primary: '0220136244', secondary: 'MUFG_IN' },
      { value: '0660012171', primary: '0660012171', secondary: 'ANZ_SG' },
    ])
    strictEqual(bankPartnerOptions(groups, banks, 'G99').length, 0)
  })
})

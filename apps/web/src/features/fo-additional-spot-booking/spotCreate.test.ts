import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { AppStrFields, AppStrRecord } from '../fx-blotter/appStr.ts'
import type { FxRow } from '../../shared/fx/mw.ts'
import type { FxTransaction } from '../mo-fx-deal-confirmation/api.ts'
import {
  SET_SPT_SIGN_COLUMN,
  SpotError,
  buildSpotAppStr,
  buildSpotCreatePayload,
  calculateSpotAmounts,
  configuredTxnType,
  createAdditionalSpot,
  defaultTradeDate,
  differenceSign,
  dssLeg,
  isEligible,
  otherCurrency,
  persistSpotMetadata,
  pickSpotSetup,
  prepareSpot,
  resolveCompanyCode,
  spotDirection,
  type CreateOutcome,
  type SpotCreatePayload,
  type SpotPorts,
} from './spotCreate.ts'
import type { SpotRow } from './types.ts'

const row: SpotRow = {
  id: 'M032|1100000981|D1|DSS1', modelId: 'M032', dealId: '1100000981', dealType: 'D1', dssType: 'DSS1',
  companyCode: 'IN11', companyName: '', originalTxn: '6205000000288', tradeType: 'T1', finalAmt: 4998, fxDealAmt: 1000,
  currency: 'USD', otherCurrency: 'INR', diffAmt: -3998, spotTxn: '', tradeDate: '', valueDate: '', partner: '', partnerName: '',
  group: '', side: 'Buy', tsfEntity: 'OSIPL', createdBy: '', createdDate: '', defaultTxnType: '',
}

const SETUP: FxRow[] = [
  { ZMOD_ID: 'M032', [SET_SPT_SIGN_COLUMN]: '-', ZD1_BUKRS: 'OSIPL', ZD1_BCURR: 'USD', ZD2_BUKRS: 'DMCC', ZD2_BCURR: 'INR' },
  { ZMOD_ID: 'M032', [SET_SPT_SIGN_COLUMN]: '+', ZD1_BUKRS: 'DMCC', ZD1_BCURR: 'INR', ZD2_BUKRS: 'OSIPL', ZD2_BCURR: 'USD' },
]
const COMP: FxRow[] = [
  { ZCOM_ID: 'OSIPL', ZBUKRS: 'IN11' },
  { ZCOM_ID: 'DMCC', ZBUKRS: 'AE13' },
]
const PARAMS: FxRow[] = [
  { PROGNAM: 'ZSGTSFR_SPOT_CREATE', BUKRS: 'IN11', PARAM3: '604' },
  { PROGNAM: 'ZSGTSFR_SPOT_CREATE', BUKRS: 'AE13', PARAM3: '600' },
  { PROGNAM: 'OTHER', BUKRS: 'IN11', PARAM3: '999' },
]
const ORIGINAL: FxTransaction = {
  CompanyCode: 'IN11', FinancialTransaction: '6205000000288', TransactionType: '619', Partner: '1', ValueDate: '2026-11-20',
  BuyCurrency: 'USD', SellCurrency: 'INR',
}
const ORIGINAL_APP = {
  CompanyCode: 'IN11', FinancialTransaction: '6205000000288', ZtsfDealType: 'D1', ZtsfDealID: '1100000981', ZtsfDealDesc: 'Deal 981',
  ZtsfMcRefNo: '2000000005', ZtsfDealSq: '01', TxnStatus: '07',
}
const TODAY = new Date(2026, 9, 7)

type Calls = { createFx: SpotCreatePayload[]; createAppStr: AppStrFields[]; updateAppStr: AppStrFields[]; updateSpotRow: Record<string, string>[] }

/** An in-memory backend: the IN_SPOT row, APP_STR rows and whatever the failure switches say. */
function fakePorts(over: { spotTxn?: string; zdAmt?: string; failAppStr?: boolean; failInSpot?: boolean; fxOutcome?: CreateOutcome; apps?: AppStrRecord[] } = {}) {
  const calls: Calls = { createFx: [], createAppStr: [], updateAppStr: [], updateSpotRow: [] }
  const state = { spotTxn: over.spotTxn ?? '', apps: [...(over.apps ?? [])], failAppStr: over.failAppStr ?? false, failInSpot: over.failInSpot ?? false }
  const ports: SpotPorts = {
    readSpotRow: async () => ({ ZMOD_ID: 'M032', ZSPOT_TXN: state.spotTxn, ZD_AMT: over.zdAmt ?? '-3998.00' }),
    loadOriginal: async (key) => ({ fx: key.FinancialTransaction === ORIGINAL.FinancialTransaction ? ORIGINAL : null, app: ORIGINAL_APP }),
    findDealTransactions: async () => [],
    loadSetupRows: async () => SETUP,
    loadCompanies: async () => COMP,
    loadParams: async () => PARAMS,
    createFx: async (p) => {
      calls.createFx.push(p)
      return over.fxOutcome ?? { ok: true, companyCode: 'IN11', transaction: '6005000000999' }
    },
    getAppStr: async (key) => state.apps.find((a) => a.FinancialTransaction === key.FinancialTransaction) ?? null,
    createAppStr: async (key, fields) => {
      if (state.failAppStr) throw new Error('APP_STR down')
      calls.createAppStr.push(fields)
      state.apps.push({ ...fields, CompanyCode: key.CompanyCode, FinancialTransaction: key.FinancialTransaction } as AppStrRecord)
    },
    updateAppStr: async (_key, fields) => {
      if (state.failAppStr) throw new Error('APP_STR down')
      calls.updateAppStr.push(fields)
    },
    updateSpotRow: async (_key, changes) => {
      if (state.failInSpot) throw new Error('IN_SPOT down')
      calls.updateSpotRow.push(changes)
      state.spotTxn = changes['ZSPOT_TXN'] ?? ''
    },
    now: () => TODAY,
  }
  return { ports, calls, state }
}

const INPUT = { partner: '0400000002', tradeDate: new Date(2026, 10, 18), rate: 83 }

describe('eligibility', () => {
  it('needs a non-zero difference and no spot yet', () => {
    strictEqual(isEligible({ diffAmt: -3998, spotTxn: '' }), true)
    strictEqual(isEligible({ diffAmt: 0, spotTxn: '' }), false)
    strictEqual(isEligible({ diffAmt: 10, spotTxn: '6005000000281' }), false)
  })
})

describe('configuration derivation', () => {
  it('signs the difference and reads the DSS leg', () => {
    strictEqual(differenceSign(-1), '-')
    strictEqual(differenceSign(0), '+')
    strictEqual(differenceSign(5), '+')
    strictEqual(dssLeg('DSS1'), 'D1')
    strictEqual(dssLeg('DSS2'), 'D2')
    strictEqual(dssLeg('DSS'), null)
  })

  it('picks the model (first four characters) + sign row and the leg columns', () => {
    deepStrictEqual(pickSpotSetup(SETUP, 'M032-TSF', -5, 'DSS1'), { entity: 'OSIPL', baseCurrency: 'USD' })
    deepStrictEqual(pickSpotSetup(SETUP, 'M032', -5, 'DSS2'), { entity: 'DMCC', baseCurrency: 'INR' })
    deepStrictEqual(pickSpotSetup(SETUP, 'M032', 5, 'DSS1'), { entity: 'DMCC', baseCurrency: 'INR' })
    strictEqual(pickSpotSetup(SETUP, 'M999', 5, 'DSS1'), null)
    strictEqual(pickSpotSetup(SETUP, 'M032', 5, 'DSSX'), null)
  })

  it('resolves the configured entity to a company code through COMP', () => {
    strictEqual(resolveCompanyCode('OSIPL', COMP), 'IN11')
    strictEqual(resolveCompanyCode('AE13', COMP), 'AE13')
    strictEqual(resolveCompanyCode('NOPE', COMP), '')
  })

  it('buys the difference currency only when it is the leg base currency', () => {
    strictEqual(spotDirection('USD', 'USD'), 'Buy')
    strictEqual(spotDirection('USD', 'INR'), 'Sell')
  })

  it('takes the other currency from the original deal', () => {
    strictEqual(otherCurrency({ BuyCurrency: 'USD', SellCurrency: 'INR' }, 'USD'), 'INR')
    strictEqual(otherCurrency({ BuyCurrency: 'USD', SellCurrency: 'INR' }, 'INR'), 'USD')
  })

  it('uses the configured PARAM3 for the program and company code', () => {
    strictEqual(configuredTxnType(PARAMS, 'IN11'), '604')
    strictEqual(configuredTxnType(PARAMS, 'AE13'), '600')
    strictEqual(configuredTxnType(PARAMS, 'XX99'), '')
  })
})

describe('calculateSpotAmounts', () => {
  it('Buy side, Buy currency USD: sell = buy * rate', () => {
    deepStrictEqual(calculateSpotAmounts({ diffAmt: -1000, diffCurrency: 'USD', direction: 'Buy', otherCurrency: 'INR', rate: 83 }), {
      buyCurrency: 'USD', sellCurrency: 'INR', buyAmount: 1000, sellAmount: 83000,
    })
  })
  it('Buy side, Buy currency not USD: sell = buy / rate', () => {
    deepStrictEqual(calculateSpotAmounts({ diffAmt: 1000, diffCurrency: 'EUR', direction: 'Buy', otherCurrency: 'USD', rate: 2 }), {
      buyCurrency: 'EUR', sellCurrency: 'USD', buyAmount: 1000, sellAmount: 500,
    })
  })
  it('Sell side, Sell currency USD: buy = sell * rate', () => {
    deepStrictEqual(calculateSpotAmounts({ diffAmt: 1000, diffCurrency: 'USD', direction: 'Sell', otherCurrency: 'INR', rate: 83 }), {
      buyCurrency: 'INR', sellCurrency: 'USD', buyAmount: 83000, sellAmount: 1000,
    })
  })
  it('Sell side, Sell currency not USD: buy = sell / rate', () => {
    deepStrictEqual(calculateSpotAmounts({ diffAmt: -166000, diffCurrency: 'INR', direction: 'Sell', otherCurrency: 'USD', rate: 83 }), {
      buyCurrency: 'USD', sellCurrency: 'INR', buyAmount: 2000, sellAmount: 166000,
    })
  })
  it('refuses a zero, negative or unreadable rate instead of dividing by it', () => {
    for (const rate of [0, -1, NaN, Infinity]) {
      strictEqual(calculateSpotAmounts({ diffAmt: 1, diffCurrency: 'EUR', direction: 'Buy', otherCurrency: 'USD', rate }), null)
    }
  })
})

describe('payload and APP_STR mapping', () => {
  it('defaults the Trade Date to the original Value Date minus two days', () => {
    deepStrictEqual(defaultTradeDate(new Date(2026, 10, 20)), new Date(2026, 10, 18))
    deepStrictEqual(defaultTradeDate(new Date(2026, 2, 1)), new Date(2026, 1, 27))
  })

  it('books 12A with the configured type, the entered rate as spot and forward, and no swap rate', () => {
    const amounts = calculateSpotAmounts({ diffAmt: -3998, diffCurrency: 'USD', direction: 'Buy', otherCurrency: 'INR', rate: 83 })!
    const p = buildSpotCreatePayload({
      companyCode: 'IN11', txnType: '604', partner: '0400000002', tradeDate: new Date(2026, 10, 18), valueDate: new Date(2026, 10, 20),
      rate: 83, amounts, diffCurrency: 'USD',
    })
    strictEqual(p.ProductType, '12A')
    strictEqual(p.TransactionType, '604')
    strictEqual(p.ContractDate, '2026-11-18')
    strictEqual(p.ValueDate, '2026-11-20')
    strictEqual(p.SpotRate, 83)
    strictEqual(p.ForwardRate, 83)
    strictEqual(p.SwapRate, 0)
    strictEqual(p.BuyCurrency, 'USD')
    strictEqual(p.SellCurrency, 'INR')
    strictEqual(p.BuyAmount, 3998)
    strictEqual(p.SellAmount, 331834)
    strictEqual(p.LeadCurrency, 'USD')
    strictEqual(p.FollowCurrency, 'INR')
  })

  it('writes APP_STR with status 03, today, the DSS type and the copied Deal linkage', () => {
    const fields = buildSpotAppStr(row, { dealId: '1100000981', dealDesc: 'Deal 981', mcRefNo: '2000000005', dealSeq: '01' }, TODAY)
    deepStrictEqual(fields, {
      ZtsfDealType: 'DSS1', ZtsfDealID: '1100000981', ZtsfDealDesc: 'Deal 981', ZtsfMcRefNo: '2000000005', ZtsfDealSq: '01',
      TxnStatus: '03', BlotterDate: '2026-10-07',
    })
  })
})

describe('prepareSpot', () => {
  it('derives company, configured type, direction, other currency and value date', async () => {
    const ctx = await prepareSpot(fakePorts().ports, row)
    strictEqual(ctx.companyCode, 'IN11')
    strictEqual(ctx.txnType, '604')
    strictEqual(ctx.direction, 'Buy')
    strictEqual(ctx.otherCurrency, 'INR')
    deepStrictEqual(ctx.defaultTradeDate, new Date(2026, 10, 18))
    strictEqual(ctx.linkage.dealDesc, 'Deal 981')
  })

  it('does not guess when a missing RFHA has several candidate transactions', async () => {
    const { ports } = fakePorts()
    ports.findDealTransactions = async () => [
      { CompanyCode: 'IN11', FinancialTransaction: '1' },
      { CompanyCode: 'IN11', FinancialTransaction: '2' },
    ]
    await assert_rejects(prepareSpot(ports, { ...row, originalTxn: '' }), /candidate transactions/)
  })

  it('recovers the original when exactly one transaction sits on the Deal ID + type', async () => {
    const { ports } = fakePorts()
    ports.findDealTransactions = async () => [{ CompanyCode: 'IN11', FinancialTransaction: ORIGINAL.FinancialTransaction }]
    strictEqual((await prepareSpot(ports, { ...row, originalTxn: '', companyCode: '' })).original.FinancialTransaction, ORIGINAL.FinancialTransaction)
  })
})

async function assert_rejects(p: Promise<unknown>, pattern: RegExp): Promise<void> {
  try {
    await p
  } catch (e) {
    strictEqual(e instanceof SpotError && pattern.test(e.message), true, String(e))
    return
  }
  throw new Error('expected a SpotError')
}

describe('createAdditionalSpot', () => {
  it('books the deal, then APP_STR for the new key, then IN_SPOT', async () => {
    const { ports, calls, state } = fakePorts()
    const out = await createAdditionalSpot(ports, row, INPUT)
    strictEqual(out.stage, 'booked')
    strictEqual(calls.createFx.length, 1)
    strictEqual(calls.createFx[0]!.ProductType, '12A')
    strictEqual(calls.createFx[0]!.TransactionType, '604')
    strictEqual(calls.createAppStr.length, 1)
    strictEqual(calls.createAppStr[0]!.TxnStatus, '03')
    strictEqual(calls.createAppStr[0]!.ZtsfDealType, 'DSS1')
    strictEqual(calls.createAppStr[0]!.BlotterDate, '2026-10-07')
    deepStrictEqual(calls.updateSpotRow, [{ ZSPOT_TXN: '6005000000999', ZSPOT_CREATE: 'X' }])
    strictEqual(state.apps.length, 1)
    // The original's APP_STR row is only ever read: nothing is updated, and Deal ID is not a port at all.
    strictEqual(calls.updateAppStr.length, 0)
    if (out.stage === 'booked') deepStrictEqual(out.persist, { appStr: 'done', inSpot: 'done' })
  })

  it('books nothing when the row already has a Spot', async () => {
    const { ports, calls } = fakePorts({ spotTxn: '6005000000281' })
    const out = await createAdditionalSpot(ports, row, INPUT)
    strictEqual(out.stage, 'refused')
    strictEqual(calls.createFx.length, 0)
  })

  it('books nothing for a zero difference or an invalid rate', async () => {
    const zero = fakePorts({ zdAmt: '0.00' })
    strictEqual((await createAdditionalSpot(zero.ports, row, INPUT)).stage, 'refused')
    strictEqual(zero.calls.createFx.length, 0)
    const bad = fakePorts()
    strictEqual((await createAdditionalSpot(bad.ports, row, { ...INPUT, rate: 0 })).stage, 'refused')
    strictEqual(bad.calls.createFx.length, 0)
  })

  it('writes nothing further when SAP refuses the deal', async () => {
    const { ports, calls } = fakePorts({ fxOutcome: { ok: false, messages: ['no valuation class'] } })
    const out = await createAdditionalSpot(ports, row, INPUT)
    deepStrictEqual(out, { stage: 'refused', messages: ['no valuation class'] })
    strictEqual(calls.createAppStr.length, 0)
    strictEqual(calls.updateSpotRow.length, 0)
  })

  it('APP_STR failure: IN_SPOT is still written, and a retry repairs only APP_STR (no second deal)', async () => {
    const { ports, calls, state } = fakePorts({ failAppStr: true })
    const out = await createAdditionalSpot(ports, row, INPUT)
    if (out.stage !== 'booked') throw new Error('expected booked')
    strictEqual(out.persist.appStr, 'APP_STR down')
    strictEqual(out.persist.inSpot, 'done')
    strictEqual(state.spotTxn, '6005000000999')

    state.failAppStr = false
    const retry = await persistSpotMetadata(ports, row, out.created)
    deepStrictEqual(retry, { appStr: 'done', inSpot: 'done' })
    strictEqual(calls.createFx.length, 1)
    strictEqual(calls.createAppStr.length, 1)
    // IN_SPOT already held the number, so the retry did not write it again.
    strictEqual(calls.updateSpotRow.length, 1)
  })

  it('IN_SPOT failure: a retry repairs only IN_SPOT and PATCHes (not duplicates) the existing APP_STR row', async () => {
    const { ports, calls, state } = fakePorts({ failInSpot: true })
    const out = await createAdditionalSpot(ports, row, INPUT)
    if (out.stage !== 'booked') throw new Error('expected booked')
    strictEqual(out.persist.appStr, 'done')
    strictEqual(out.persist.inSpot, 'IN_SPOT down')

    state.failInSpot = false
    const retry = await persistSpotMetadata(ports, row, out.created)
    deepStrictEqual(retry, { appStr: 'done', inSpot: 'done' })
    strictEqual(calls.createFx.length, 1)
    strictEqual(calls.createAppStr.length, 1)
    strictEqual(calls.updateAppStr.length, 1)
    strictEqual(state.spotTxn, '6005000000999')
  })

  it('never overwrites a different Spot number already on IN_SPOT', async () => {
    const { ports, calls } = fakePorts()
    const state = await persistSpotMetadata(
      { ...ports, readSpotRow: async () => ({ ZSPOT_TXN: '6005000000281' }) },
      row,
      { companyCode: 'IN11', transaction: '6005000000999', linkage: { dealId: 'x', dealDesc: '', mcRefNo: '', dealSeq: '' } },
    )
    strictEqual(/already holds Spot 6005000000281/.test(state.inSpot), true)
    strictEqual(calls.updateSpotRow.length, 0)
  })
})

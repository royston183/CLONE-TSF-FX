import { deepStrictEqual, ok, rejects, strictEqual } from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import type { FxRow } from '../../shared/fx/mw.ts'
import { fromFxTransaction, type FxTransaction } from './api.ts'
import { BUSINESS_PARTNERS } from './data.ts'
import {
  attachLegToDealId,
  createPairDealId,
  dealIdColumns,
  freeLegSlot,
  isInSap,
  listsTransaction,
  applyDealIds,
  assignmentsFromDealIds,
  dealIdListing,
  dealTypeOfSlot,
  loadDealRecords,
  pairProblem,
  toDealRecord,
  traderCodeOf,
} from './dealIds.ts'
import { installFixtures } from './fixtures.ts'
import { buildMasterContracts, confirmAutoDeal, initAutoLegs, initialBlotter, assignMc, mergeLiveRows } from './logic.ts'
import type { BlotterRow, MasterContract } from './types.ts'

// The running screen loads these lists from the middleware; the rules are tested against the values the lists used to hold.
installFixtures()

const sap = (over: Partial<FxTransaction> = {}): FxTransaction => ({
  CompanyCode: 'SG03', FinancialTransaction: '3000000000015', ProductType: '12B', TransactionType: '619', Partner: '400000002',
  ContractDate: '2026-10-01', ValueDate: '2026-11-02', BuyCurrency: 'USD', SellCurrency: 'INR', LeadCurrency: 'USD', FollowCurrency: 'INR',
  BuyAmount: 40000, SellAmount: 3328000, ForwardRate: 83.2, ActiveStatus: '0', ...over,
})
let seq = 0
const rowOf = (over: Partial<FxTransaction> = {}): BlotterRow => {
  const out = fromFxTransaction(sap(over), { group: 'G02', trader: 'NID' }, BUSINESS_PARTNERS)
  ok(out)
  seq += 1
  return { ...out.row, id: `R${seq}`, seq }
}

const MC: MasterContract = {
  mcNumber: '2000000028', origin: 'OSIPL', fxModel: 'M033', modelDesc: 'INR-INR-INR Forward', entities: ['OGA', 'OSIPL', 'DMCC'],
  currPair: 'USD/INR', commodityCode: 'C102', commodityDesc: 'WHEAT', mcDate: new Date(2026, 9, 1), shipStart: new Date(2026, 9, 1),
  shipEnd: new Date(2027, 2, 31), amtUSD: 100000, utilizedUSD: 0, group: '', portShipment: '', portDestination: '',
  currencyId: 'C001', currencyDesc: 'INR-INR-INR',
}

const d1 = (): BlotterRow => rowOf({ FinancialTransaction: '3000000000015', ContractDate: '2026-10-01', ValueDate: '2026-11-02' })
const d2 = (): BlotterRow => rowOf({ FinancialTransaction: '2000000000001', ProductType: '12D', TransactionType: '631', ContractDate: '2026-10-01', ValueDate: '2026-11-03', BuyAmount: 3328000, SellAmount: 40000, BuyCurrency: 'INR', SellCurrency: 'USD' })

describe('which rows can be given a real Deal ID', () => {
  it('only deals that exist in SAP', () => {
    ok(isInSap(d1()))
    ok(!isInSap({ ...d1(), live: false }))
    ok(!isInSap({ ...d1(), transactionNumber: '' }))
  })

  it('names the reason a pair cannot be given one, before anything is written', () => {
    ok(pairProblem(undefined, [d1(), d2()]).includes('Master Contract'))
    ok(pairProblem(MC, [d1()]).includes('exactly two'))
    ok(pairProblem(MC, [d1(), { ...d2(), live: false, transactionNumber: '8100001' }]).includes('not a SAP transaction'))
    ok(pairProblem(MC, [d1(), d1()]).includes('different'))
    strictEqual(pairProblem(MC, [d1(), d2()]), '')
  })
})

describe('the Deal ID row, as the original writes it', () => {
  const traders: FxRow[] = [{ ZTCODE: 'C', ZTRADER: 'Nidhi S' }, { ZTCODE: 'C14', ZTRADER: 'Ashon V' }]

  it('finds the trader\'s SAP code by the name the blotter shows, ignoring case', () => {
    strictEqual(traderCodeOf(traders, 'Nidhi S'), 'C')
    strictEqual(traderCodeOf(traders, ' ashon v '), 'C14')
    strictEqual(traderCodeOf(traders, 'Somebody Else'), '')
    strictEqual(traderCodeOf(traders, ''), '')
  })

  it('fills the description, type, both transactions, dates, status and currency ids', () => {
    const c = dealIdColumns({ mc: MC, legs: [d1(), d2()], traderName: 'Nidhi S', traderCode: 'C', year: 2026 })
    strictEqual(c['ZDEAL_DESC'], 'Nidhi S_OSIPL_2026/OGA-OSIPL-DMCC')
    strictEqual(c['ZDEAL_TYPE'], 'FX')
    strictEqual(c['ZSUB_TYPE'], 'FX1')
    strictEqual(c['ZTSF_MODEL'], 'M033')
    strictEqual(c['ZMC_REF'], '2000000028')
    strictEqual(c['ZBUKRS1'], 'SG03')
    strictEqual(c['ZRFHA1'], '3000000000015')
    strictEqual(c['ZBUKRS2'], 'SG03')
    strictEqual(c['ZRFHA2'], '2000000000001')
    strictEqual(c['ZS_DATE'], '2026-10-01')
    strictEqual(c['ZE_DATE'], '2026-11-03')
    strictEqual(c['ZTRD_CODE'], 'C')
    strictEqual(c['ZDEAL_STAT'], '01')
    strictEqual(c['ZMC_CURR_ID'], 'C001')
    strictEqual(c['ZMC_CURR_DESC'], 'INR-INR-INR')
    strictEqual(c['ZDEAL_CURR_ID'], 'C001')
    strictEqual(c['ZDEAL_AMT'], '40000.00')
    ok(!('ZDEAL_ID' in c), 'the number comes from the range')
  })

  it('starts the deal at the earliest trade date and ends it at the latest value date', () => {
    const early = rowOf({ FinancialTransaction: '1', ContractDate: '2026-09-28', ValueDate: '2026-10-30' })
    const late = rowOf({ FinancialTransaction: '2', ContractDate: '2026-10-01', ValueDate: '2026-11-05' })
    const c = dealIdColumns({ mc: MC, legs: [late, early], traderName: 'x', traderCode: '', year: 2026 })
    strictEqual(c['ZS_DATE'], '2026-09-28')
    strictEqual(c['ZE_DATE'], '2026-11-05')
  })
})

describe('talking to the middleware', () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
  })
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  type Call = { method: string; url: string; body: any }
  const install = (calls: Call[], opts: { patchFails?: boolean; dealRow?: FxRow | null } = {}) => {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = decodeURIComponent(String(input).replaceAll('+', ' '))
      const method = init?.method ?? 'GET'
      calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : null })
      if (url.startsWith('/auth/me')) return json(200, { user: { username: 'demo' } })
      if (url.includes('/meta/resources/tsfDealId')) return json(200, { numberRange: { initialised: true } })
      if (url.includes('/data/trmTrader')) return json(200, { ok: true, rows: [{ ZTCODE: 'C', ZTRADER: 'Nidhi S' }] })
      if (method === 'GET' && url.includes('/data/tsfDealId')) {
        return json(200, { ok: true, rows: opts.dealRow === null ? [] : [opts.dealRow ?? { ZDEAL_ID: '7000000007', ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZSS: '', ZDEAL_STAT: '01', ZMC_REF: '2000000028', ZTSF_MODEL: 'M033', ZCREATED_DATE: '2026-10-01', ZBUKRS1: 'SG03', ZRFHA1: '3000000000015', ZBUKRS2: 'SG03', ZRFHA2: '2000000000001' }] })
      }
      if (method === 'POST' && url.includes('/data/tsfDealId')) return json(201, { ok: true, key: { ZDEAL_ID: '7000000007' }, assignedNumber: '7000000007' })
      if (method === 'PATCH' && url.includes('/data/masterContract')) return opts.patchFails ? json(409, { error: { message: 'locked by another user' } }) : json(200, { ok: true })
      if (method === 'PATCH' && url.includes('/data/tsfDealId')) return json(200, { ok: true })
      return json(404, { error: { message: 'unexpected ' + method + ' ' + url } })
    }) as typeof fetch
  }

  it('draws the number, writes the Deal ID row, then moves the contract to 04, in that order', async () => {
    const calls: Call[] = []
    install(calls, { dealRow: null })
    const out = await createPairDealId({ mc: MC, legs: [d1(), d2()], traderName: 'Nidhi S', year: 2026 })
    strictEqual(out.dealId, '7000000007')
    const writes = calls.filter((c) => c.method === 'POST' || c.method === 'PATCH')
    deepStrictEqual(writes.map((c) => `${c.method} ${/data\/(\w+)/.exec(c.url)?.[1]}`), ['POST tsfDealId', 'PATCH masterContract'])
    const row = writes[0]!.body.data as Record<string, unknown>
    strictEqual(row['ZRFHA1'], '3000000000015')
    strictEqual(row['ZRFHA2'], '2000000000001')
    strictEqual(row['ZMC_REF'], '2000000028')
    strictEqual(row['ZTRD_CODE'], 'C')
    ok(!('ZDEAL_ID' in row))
    strictEqual(writes[1]!.body.changes.ZMC_STAT, '04')
    deepStrictEqual(writes[1]!.body.key, { ZMC_REF_NO: '2000000028' })
  })

  it('refuses a transaction that is already on a Deal ID, and writes nothing', async () => {
    const calls: Call[] = []
    install(calls)
    await rejects(
      () => createPairDealId({ mc: MC, legs: [d1(), d2()], traderName: 'x', year: 2026 }),
      /Transaction 3000000000015 is already on Deal ID 7000000007; it cannot be given another/,
    )
    ok(!calls.some((c) => c.method === 'POST' || c.method === 'PATCH'))
  })

  it('refuses to add a leg to one Deal ID when another already has it', async () => {
    const calls: Call[] = []
    install(calls)
    await rejects(() => attachLegToDealId('7000000007', rowOf({ FinancialTransaction: '3000000000015' })), /already lists/)
    const onOther: FxRow = { ZDEAL_ID: '7000000007', ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_STAT: '01', ZBUKRS1: 'SG03', ZRFHA1: '1000000000001' }
    const other: FxRow = { ZDEAL_ID: '7000000099', ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_STAT: '01', ZBUKRS1: 'SG03', ZRFHA1: '3000000000015' }
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const u = decodeURIComponent(String(input))
      if (u.includes('/auth/me')) return json(200, { user: { username: 'demo' } })
      return json(200, { ok: true, rows: [onOther, other] })
    }) as typeof fetch
    await rejects(() => attachLegToDealId('7000000007', rowOf({ FinancialTransaction: '3000000000015' })), /already on Deal ID 7000000099; it cannot be added to 7000000007/)
  })

  it('writes nothing when a leg is not a SAP transaction', async () => {
    const calls: Call[] = []
    install(calls)
    await rejects(() => createPairDealId({ mc: MC, legs: [d1(), { ...d2(), live: false }], traderName: 'x', year: 2026 }), /not a SAP transaction/)
    strictEqual(calls.length, 0)
  })

  it('says which Deal ID exists when the contract cannot be moved: it is not rolled back', async () => {
    const calls: Call[] = []
    install(calls, { patchFails: true, dealRow: null })
    await rejects(
      () => createPairDealId({ mc: MC, legs: [d1(), d2()], traderName: 'x', year: 2026 }),
      (e: unknown) => e instanceof Error && e.message.includes('Deal ID 7000000007 was created') && e.message.includes('2000000028'),
    )
  })

  it('lists the Deal IDs in SAP as the assign dialog needs them', async () => {
    install([])
    const [rec] = await loadDealRecords()
    strictEqual(rec?.dealId, '7000000007')
    strictEqual(rec?.mcNumber, '2000000028')
    strictEqual(rec?.model, 'M033')
    strictEqual(rec?.type, 'PAIR')
  })

  it('adds a single leg to the first free slot of an existing Deal ID, as the original does', async () => {
    const calls: Call[] = []
    install(calls)
    const leg = rowOf({ FinancialTransaction: '1000000000007' })
    const out = await attachLegToDealId('7000000007', leg)
    strictEqual(out.slot, 3)
    const patch = calls.find((c) => c.method === 'PATCH')!
    deepStrictEqual(patch.body.key, { ZDEAL_ID: '7000000007', ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1' })
    strictEqual(patch.body.changes.ZBUKRS3, 'SG03')
    strictEqual(patch.body.changes.ZRFHA3, '1000000000007')
    ok(!('ZDEAL_ID' in patch.body.changes), 'a key column is never changed')
  })

  it('uses slot 4 once slot 3 is taken, and refuses a repeat or a full Deal ID', async () => {
    const taken3: FxRow = { ZDEAL_ID: '7000000007', ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZBUKRS3: 'SG03', ZRFHA3: '1000000000001' }
    install([], { dealRow: taken3 })
    strictEqual((await attachLegToDealId('7000000007', rowOf({ FinancialTransaction: '1000000000007' }))).slot, 4)
    await rejects(() => attachLegToDealId('7000000007', rowOf({ FinancialTransaction: '1000000000001' })), /already lists/)
    const full: FxRow = { ZDEAL_ID: '7000000007', ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ...Object.fromEntries([3, 4, 5, 6, 7, 8].flatMap((i) => [[`ZBUKRS${i}`, 'SG03'], [`ZRFHA${i}`, `90000000000${i}`]])) }
    install([], { dealRow: full })
    await rejects(() => attachLegToDealId('7000000007', rowOf({ FinancialTransaction: '1000000000009' })), /no free transaction slot/)
  })

  it('refuses a Deal ID SAP does not have, and a row that is not a SAP transaction', async () => {
    install([], { dealRow: null })
    await rejects(() => attachLegToDealId('7000000099', rowOf()), /not found in SAP/)
    install([])
    await rejects(() => attachLegToDealId('7000000007', { ...rowOf(), live: false }), /not a SAP transaction/)
  })
})

describe('putting the Deal ID back on a transaction', () => {
  const dealRows: FxRow[] = [
    { ZDEAL_ID: '7000000014', ZDEAL_STAT: '01', ZMC_REF: '2000000030', ZTSF_MODEL: 'M033', ZBUKRS1: 'SG03', ZRFHA1: '3000000000022', ZBUKRS2: 'SG03', ZRFHA2: '2000000000006' },
    { ZDEAL_ID: '7000000003', ZDEAL_STAT: '30', ZMC_REF: '2000000001', ZTSF_MODEL: 'M032', ZBUKRS1: 'SG03', ZRFHA1: '3000000000099' },
  ]

  it('says which Deal ID a transaction is on, and ignores a cancelled one', () => {
    strictEqual(dealIdListing(dealRows, 'SG03', '2000000000006'), '7000000014')
    strictEqual(dealIdListing(dealRows, 'AE13', '2000000000006'), undefined)
    strictEqual(dealIdListing(dealRows, 'SG03', '3000000000099'), undefined)
  })

  it('reads the Deal ID, Master Contract, model and leg of each transaction on one', () => {
    const a = assignmentsFromDealIds(dealRows)
    deepStrictEqual(a.get('SG03-3000000000022'), { dealId: '7000000014', mcRef: '2000000030', model: 'M033', slot: 1 })
    deepStrictEqual(a.get('SG03-2000000000006'), { dealId: '7000000014', mcRef: '2000000030', model: 'M033', slot: 2 })
    ok(!a.has('SG03-3000000000099'))
  })

  it('shows a transaction on two Deal IDs on the first one, whatever order the rows come in', () => {
    const second: FxRow = { ZDEAL_ID: '7000000015', ZDEAL_STAT: '01', ZMC_REF: '2000000030', ZTSF_MODEL: 'M033', ZBUKRS1: 'SG03', ZRFHA1: '3000000000022' }
    for (const rows of [[...dealRows, second], [second, ...dealRows]]) {
      strictEqual(assignmentsFromDealIds(rows).get('SG03-3000000000022')?.dealId, '7000000014')
      strictEqual(dealIdListing(rows, 'SG03', '3000000000022'), '7000000014')
    }
  })

  it('names the legs by slot', () => {
    deepStrictEqual([1, 2, 3, 4].map(dealTypeOfSlot), ['Deal 1', 'Deal 2', 'Settlement', 'Settlement'])
  })

  it('puts the Deal ID and Master Contract back on a deal read from SAP, so it is not offered another', () => {
    const a = assignmentsFromDealIds(dealRows)
    const [r1, r2, r3] = applyDealIds([rowOf({ FinancialTransaction: '3000000000022' }), rowOf({ FinancialTransaction: '2000000000006' }), rowOf({ FinancialTransaction: '3000000000050' })], a)
    deepStrictEqual([r1?.dealId, r1?.mcRef, r1?.dealType, r1?.fxModel], ['7000000014', '2000000030', 'Deal 1', 'M033'])
    deepStrictEqual([r2?.dealId, r2?.dealType], ['7000000014', 'Deal 2'])
    deepStrictEqual([r3?.dealId, r3?.mcRef], ['', ''])
    ok(r1 && r2 && r3 && [r1, r2].every((r) => !!(r.dealId && r.mcRef)), 'both count as already assigned')
  })

  it('lets SAP\'s Deal ID win over what was remembered on the screen', () => {
    const a = assignmentsFromDealIds(dealRows)
    const remembered = { ...rowOf({ FinancialTransaction: '3000000000022' }), status: 'RELEASED' as const, dealId: 'TSF-9080', mcRef: 'MC-OLD' }
    const [r] = applyDealIds([remembered], a)
    deepStrictEqual([r?.status, r?.dealId, r?.mcRef], ['RELEASED', '7000000014', '2000000030'])
  })

  it('fills in a loaded row that had no Deal ID when SAP now has one', () => {
    const a = assignmentsFromDealIds(dealRows)
    const start = initialBlotter(new Date(2026, 9, 1), [MC], [...BUSINESS_PARTNERS])
    const loaded = mergeLiveRows(start, [rowOf({ FinancialTransaction: '3000000000022' })], BUSINESS_PARTNERS)
    strictEqual(loaded.rows.find((r) => r.transactionNumber === '3000000000022')?.dealId, '')
    const again = mergeLiveRows(loaded, applyDealIds([rowOf({ FinancialTransaction: '3000000000022' })], a), BUSINESS_PARTNERS)
    const row = again.rows.find((r) => r.transactionNumber === '3000000000022')
    deepStrictEqual([row?.dealId, row?.mcRef], ['7000000014', '2000000030'])
    strictEqual(again.rows.filter((r) => r.transactionNumber === '3000000000022').length, 1)
  })
})

describe('Deal ID rows and slots', () => {
  it('reads a cancelled Deal ID as reversed and a short straddle as SS', () => {
    strictEqual(toDealRecord({ ZDEAL_ID: '1', ZDEAL_STAT: '30' })?.type, 'REVERSED')
    strictEqual(toDealRecord({ ZDEAL_ID: '1', ZSS: 'X', ZDEAL_STAT: '01' })?.type, 'SS')
    strictEqual(toDealRecord({ ZDEAL_ID: '1', ZDEAL_STAT: '01' })?.type, 'PAIR')
    strictEqual(toDealRecord({ ZDEAL_ID: '' }), null)
  })

  it('finds the first free slot from 3 and whether a transaction is already listed', () => {
    strictEqual(freeLegSlot({}), 3)
    strictEqual(freeLegSlot({ ZRFHA3: 'x' }), 4)
    strictEqual(freeLegSlot(Object.fromEntries([3, 4, 5, 6, 7, 8].map((i) => [`ZRFHA${i}`, 'x']))), null)
    ok(listsTransaction({ ZBUKRS2: 'SG03', ZRFHA2: '9' }, 'SG03', '9'))
    ok(!listsTransaction({ ZBUKRS2: 'SG03', ZRFHA2: '9' }, 'AE13', '9'))
  })
})

describe('the Deal ID the screen is given is the one it shows', () => {
  const now = new Date(2026, 9, 1)

  it('uses the Deal ID SAP issued for a released pair, without counting up its own', () => {
    const a = d1()
    const b = d2()
    const start = initialBlotter(now, [MC], [...BUSINESS_PARTNERS])
    const withRows = { ...start, rows: [a, b, ...start.rows] }
    const out = assignMc(withRows, a.id, b.id, MC.mcNumber, '7000000007')
    ok(out)
    strictEqual(out.dealId, '7000000007')
    deepStrictEqual(out.blotter.rows.filter((r) => r.dealId === '7000000007').map((r) => r.id).sort(), [a.id, b.id].sort())
    strictEqual(out.blotter.counters.dealId, withRows.counters.dealId)
    strictEqual(out.blotter.deals.at(-1)?.dealId, '7000000007')
  })

  it('uses the Deal ID SAP issued for an Auto Deal', () => {
    const b = initialBlotter(now, buildMasterContracts(now, []).concat(MC), [...BUSINESS_PARTNERS])
    const out = confirmAutoDeal(b, MC.mcNumber, initAutoLegs({ ...MC, fxModel: 'M021' }, now), '7000000007')
    ok(out)
    strictEqual(out.dealId, '7000000007')
    strictEqual(out.blotter.counters.dealId, b.counters.dealId)
    ok(out.blotter.rows.slice(0, 2).every((r) => r.dealId === '7000000007'))
  })

  it('still counts up its own id when none is given (the demo path)', () => {
    const b = initialBlotter(now, buildMasterContracts(now, []).concat(MC), [...BUSINESS_PARTNERS])
    const out = confirmAutoDeal(b, MC.mcNumber, initAutoLegs({ ...MC, fxModel: 'M021' }, now))
    ok(out)
    ok(out.dealId.startsWith('TSF-'))
  })
})

import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { FxRow as MwRow } from '../../shared/fx/mw.ts'
import { DEAL_INVOICE_STATUS, pcForStatus, toggledStatus } from './invoice-status.ts'
import { SAMPLE_DEAL, fxRow, invRow } from './fixtures.ts'
import { computeInvoiceConfirmation } from './logic.ts'
import { emptyAdj } from './invoice.ts'
import { mergeDealTransactions, txnKey, type AppStrEntity, type FxTxnEntity } from './transactions.ts'
import {
  RESOURCE,
  amendDealStatus,
  confirmInvoiceGeneration,
  deassignBls,
  pcMismatches,
  preInvoiceGroups,
  reconcileInvoicePc,
  reverseInvoiceConfirmation,
  tradeFlowStatus,
  type Ports,
} from './workflow.ts'
import type { Deal, InvRow } from './types.ts'

/* ------------------------------------------------------------------ an in-memory middleware */

type Call = { op: 'list' | 'create' | 'update' | 'remove' | 'allocate'; resource: string; key?: Record<string, string>; data?: Record<string, unknown> }

function fakePorts<T extends Record<string, MwRow[]>>(tables: T, opts: { registered?: string[]; numberRange?: boolean; failOn?: (c: Call) => boolean } = {}) {
  const calls: Call[] = []
  const registered = new Set(opts.registered ?? Object.keys(tables))
  let next = 1000
  const match = (r: MwRow, f: Record<string, string>) => Object.entries(f).every(([k, v]) => (r[k] ?? '') === v)
  const guard = (c: Call) => {
    calls.push(c)
    if (opts.failOn?.(c)) throw new Error(`boom on ${c.op} ${c.resource}`)
  }
  const ports: Ports = {
    list: async (resource, filter = {}) => {
      calls.push({ op: 'list', resource })
      return (tables[resource] ?? []).filter((r) => match(r, filter)).map((r) => ({ ...r }))
    },
    create: async (resource, data) => {
      guard({ op: 'create', resource, data })
      const row = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === null ? null : String(v)])) as MwRow
      // Like the middleware: an insert never fills a field range, so ZINV_NO stays as sent.
      ;((tables as Record<string, MwRow[]>)[resource] ??= []).push(row)
      return {}
    },
    allocate: async (resource, key, field) => {
      guard({ op: 'allocate', resource, key })
      const target = (tables[resource] ?? []).find((x) => match(x, key))
      if (!target) throw new Error('ROW_NOT_FOUND')
      if (target[field]) return target[field] ?? undefined
      if (!opts.numberRange) return undefined
      target[field] = String(next++)
      return target[field] ?? undefined
    },
    update: async (resource, key, changes) => {
      guard({ op: 'update', resource, key, data: changes })
      for (const r of (tables[resource] ?? []).filter((x) => match(x, key))) for (const [k, v] of Object.entries(changes)) r[k] = v === null ? null : String(v)
    },
    remove: async (resource, key) => {
      guard({ op: 'remove', resource, key })
      ;(tables as Record<string, MwRow[]>)[resource] = (tables[resource] ?? []).filter((x) => !match(x, key))
    },
    columns: async (resource) => {
      if (!registered.has(resource)) throw new Error('not registered')
      return Object.keys((tables[resource] ?? [])[0] ?? {}).concat('ZREMARK', 'ZCHANGED_BY', 'ZCHANGED_DATE', 'ZCHANGED_TIME')
    },
    hasFieldRange: async (_resource, field) => !!opts.numberRange && field === 'ZINV_NO',
    now: async () => ({ user: 'TESTER', date: '2026-10-06', time: '10:00:00' }),
  }
  return { ports, calls, tables }
}

const writes = (calls: readonly Call[]) => calls.filter((c) => c.op !== 'list')
const touched = (calls: readonly Call[]) => new Set(calls.map((c) => c.resource))

const DEAL_ID = '7000000009'
const dealRow = (stat: string): MwRow => ({ ZDEAL_ID: DEAL_ID, ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_STAT: stat })

const row = (r: Partial<InvRow>): InvRow =>
  invRow({
    ttype: 'T1', invType: 'I01', seller: 'OGA', buyer: 'DMCC', bp: '0000000003', partnerBank: 'PB1', houseBank: 'HB1', accountId: 'AC1',
    invDate: '10-10-2026', qty: 100, usdPrice: 10, rate: 1, price: 10, amt: 1000, amtUsd: 1000, locked: false, curr: 'USD', dealType: 'D1',
    rec: { ...emptyAdj(), ZINV_REF: `${DEAL_ID}-T1`, ZINV_TYPE: 'I01', ZINV_PDATE: '2026-10-10', ZINV_COMM: 'CRUDE', ZGT_COMM: 'GT1', ZPRE_T_REF: '' },
    ...r,
  })

const deal = (status: string, inv: InvRow[] = [row({})]): Deal => ({ ...SAMPLE_DEAL, dealId: DEAL_ID, status, inv, fx: SAMPLE_DEAL.fx })

const bl = (r: Record<string, string>): MwRow => ({
  ZTF_NO: 'TF1', ZTF_SPLIT: '01', ZBL_NO: 'BL1', ZBL_SPLIT: '00', ZBL_REUSE: '', ZDEAL_ID: DEAL_ID, ZBL_LOT: 'L1', ZINV_DATE: '2026-10-10',
  ZINV_COMM: 'CRUDE', ZTRM_COM_ID: 'GT1', ZBL_STAT_ID: '02', ZINV_TYPE: '', ZQUANTITY: '100', ...r,
})

/* ------------------------------------------------------------------ transaction merge (APP_STR read-only) */

describe('gt_top = APP_STR + FxTransaction on BUKRS + RFHA', () => {
  const app = (bukrs: string, rfha: string, type: string, status = '03'): AppStrEntity => ({
    CompanyCode: bukrs, FinancialTransaction: rfha, ZtsfDealID: DEAL_ID, ZtsfDealType: type, ZtsfMcRefNo: '2000000028', TxnStatus: status,
  })
  const tx = (bukrs: string, rfha: string, extra: Partial<FxTxnEntity> = {}): FxTxnEntity => ({
    CompanyCode: bukrs, FinancialTransaction: rfha, Partner: '3', ContractDate: '2026-09-04', ValueDate: '2026-12-31',
    BuyCurrency: 'USD', SellCurrency: 'AED', LeadCurrency: 'USD', FollowCurrency: 'AED', BuyAmount: 1000, SellAmount: 3672.5, ForwardRate: 3.6725, ...extra,
  })

  it('takes the Deal Type / MC / TXN_STATUS from APP_STR and the amounts from the transaction', () => {
    const [r] = mergeDealTransactions([app('AE13', '22', 'D1', '03')], [tx('AE13', '22')], (b) => (b === 'AE13' ? 'OGA' : ''))
    deepStrictEqual([r!.dealType, r!.mc, r!.txn, r!.curr1, r!.amt1, r!.curr2, r!.amt2, r!.allIn, r!.entity], ['D1', '2000000028', '03', 'USD', 1000, 'AED', -3672.5, 3.6725, 'OGA'])
  })

  it('never joins on RFHA alone: the same number under another company code is another transaction', () => {
    const rows = mergeDealTransactions([app('AE13', '22', 'D1'), app('SG10', '22', 'D2')], [tx('AE13', '22', { BuyAmount: 1 }), tx('SG10', '22', { BuyAmount: 2 })])
    deepStrictEqual(rows.map((r) => [r.bukrs, r.dealType, r.amt1]), [['AE13', 'D1', 1], ['SG10', 'D2', 2]])
    ok(txnKey('AE13', '22') !== txnKey('SG10', '22'))
    deepStrictEqual(mergeDealTransactions([app('AE13', '22', 'D1')], [tx('SG10', '22')]), [])
  })

  it('drops a reversed transaction (SAKTIV = 3) and a link with no transaction', () => {
    deepStrictEqual(mergeDealTransactions([app('AE13', '22', 'D1'), app('AE13', '23', 'D2')], [tx('AE13', '22', { ActiveStatus: '3' })]), [])
  })
})

/* ------------------------------------------------------------------ full vs partial */

describe('Confirm Invoice Generation: 05 vs 07', () => {
  const withAmounts = (invoiceUsd: number, tolerance: number | null = 2): Deal => ({
    ...SAMPLE_DEAL,
    tolerance,
    fx: [fxRow({ dealType: 'D1', curr1: 'USD', amt1: 1000, curr2: 'AED', amt2: -3672.5 })],
    inv: [row({ amtUsd: invoiceUsd })],
  })

  it('invoice == deal -> 05', () => strictEqual(computeInvoiceConfirmation(withAmounts(1000)).status, '05'))
  it('below the deal, difference % <= T02 -> 05', () => strictEqual(computeInvoiceConfirmation(withAmounts(980)).status, '05'))
  it('below the deal, difference % > T02 -> 07', () => strictEqual(computeInvoiceConfirmation(withAmounts(970)).status, '07'))
  it('above the deal, within or beyond tolerance -> 05 (after the warning)', () => {
    strictEqual(computeInvoiceConfirmation(withAmounts(1010)).status, '05')
    strictEqual(computeInvoiceConfirmation(withAmounts(1500)).status, '05')
  })
  it('only OIL / OGA rows count towards the invoice amount', () => {
    const d = withAmounts(1000)
    d.inv = [row({ amtUsd: 600 }), row({ seller: 'DMCC', amtUsd: 9999 })]
    strictEqual(computeInvoiceConfirmation(d).status, '07')
  })
  it('ZPC: 05 -> C, 07 -> P; 05 <-> 07 only', () => {
    strictEqual(pcForStatus('05'), 'C')
    strictEqual(pcForStatus('07'), 'P')
    strictEqual(toggledStatus('05'), '07')
    strictEqual(toggledStatus('07'), '05')
    strictEqual(toggledStatus('04'), null)
  })
})

/* ------------------------------------------------------------------ finalisation */

const finalisationTables = () => ({
  billAdjustment: [] as MwRow[],
  ifInv: [{ ZINT_INV_NO: 'INT1', ZBUKRS: '1000', ZDEAL_ID: DEAL_ID, ZINV_TYPE: 'I01', ZLEG_ID: '1', ZBP: '' }] as MwRow[],
  tsfDealId: [dealRow('04')],
  billOfLading: [bl({}), bl({ ZBL_NO: 'BL2', ZINV_DATE: '2027-01-01' })],
  blReuse: [bl({ ZBL_NO: 'BL3', ZBL_REUSE: 'R1', ZREUSE_CONF: '' })],
  invRef: [{ ZDEAL_ID: DEAL_ID, ZINV_TRM_NO: '1', ZTTYPE: 'T1', ZTRD_CURR: 'USD', ZAMT: '1000', ZINV_AMT: '1000' }] as MwRow[],
})

describe('confirmInvoiceGeneration', () => {
  const run = (status: '05' | '07', tables = finalisationTables(), opts: Parameters<typeof fakePorts>[1] = { numberRange: true }) => {
    const f = fakePorts(tables, opts)
    return confirmInvoiceGeneration({ deal: deal('04'), dealRows: tables.tsfDealId, diffRule: undefined, status, sellers: ['OGA'] }, f.ports).then((result) => ({ result, ...f }))
  }

  it('writes BIL_ADJ, IF_INV, the Deal ID, the BLs and the difference — and nothing else', async () => {
    const { result, tables, calls } = await run('05')
    ok(result.ok, result.message)
    const adj = tables.billAdjustment[0]!
    strictEqual(adj['ZPC'], 'C')
    ok(adj['ZINV_NO'])
    strictEqual(adj['ZDEAL_ID'], DEAL_ID)
    strictEqual(adj['ZBP'], '0000000003')
    deepStrictEqual([tables.ifInv[0]!['ZPTNR_BKID'], tables.ifInv[0]!['ZHOUSEBKID'], tables.ifInv[0]!['ZHOUSEKTID'], tables.ifInv[0]!['ZBP']], ['PB1', 'HB1', 'AC1', '0000000003'])
    strictEqual(tables.tsfDealId[0]!['ZDEAL_STAT'], '05')
    // The BL (and the reused BL) of the invoice's date / commodity move to 05 with the invoice type; the other BL does not.
    deepStrictEqual(tables.billOfLading.map((b) => [b['ZBL_NO'], b['ZBL_STAT_ID'], b['ZINV_TYPE']]), [['BL1', '05', 'I01'], ['BL2', '02', '']])
    deepStrictEqual([tables.blReuse[0]!['ZBL_STAT_ID'], tables.blReuse[0]!['ZINV_TYPE']], ['05', 'I01'])
    strictEqual(tables.billAdjustment[0]!['ZDIFF_AMT'] !== undefined, true)
    deepStrictEqual([...touched(writes(calls))].sort(), ['billAdjustment', 'billOfLading', 'blReuse', 'ifInv', 'tsfDealId'])
  })

  it('IF_INV: updates every existing row of the deal / type / leg by its full key, and never inserts', async () => {
    const tables = finalisationTables()
    tables.ifInv.push({ ZINT_INV_NO: 'INT2', ZBUKRS: '2000', ZDEAL_ID: DEAL_ID, ZINV_TYPE: 'I01', ZLEG_ID: '1', ZBP: '' })
    const { result, calls } = await run('05', tables)
    ok(result.ok, result.message)
    deepStrictEqual(tables.ifInv.map((r) => r['ZHOUSEBKID']), ['HB1', 'HB1'])
    deepStrictEqual(calls.filter((c) => c.op === 'update' && c.resource === 'ifInv').map((c) => c.key!['ZINT_INV_NO']), ['INT1', 'INT2'])
    strictEqual(calls.some((c) => c.op === 'create' && c.resource === 'ifInv'), false)
  })

  it('IF_INV: no row for the deal is skipped, not an error, and the invoice carries on', async () => {
    const tables = finalisationTables()
    tables.ifInv.length = 0
    const { result, calls } = await run('05', tables)
    ok(result.ok, result.message)
    strictEqual(result.steps.find((s) => s.step === 'invoice interface (IF_INV)')!.status, 'skipped')
    strictEqual(tables.tsfDealId[0]!['ZDEAL_STAT'], '05')
    deepStrictEqual(writes(calls).filter((c) => c.resource === 'ifInv'), [])
  })

  it('a partial invoice (07) writes ZPC = P', async () => {
    const { result, tables } = await run('07')
    ok(result.ok)
    strictEqual(tables.billAdjustment[0]!['ZPC'], 'P')
    strictEqual(tables.tsfDealId[0]!['ZDEAL_STAT'], '07')
  })

  it('reports the e-mail as a missing backend action rather than sending anything', async () => {
    const { result } = await run('05')
    const mail = result.steps.find((s) => s.step === 'notification')!
    strictEqual(mail.status, 'skipped')
    ok(mail.detail.startsWith('WAITING FOR ACTION API'))
  })

  it('without a number range it writes nothing and invents no invoice number', async () => {
    const { result, calls, tables } = await run('05', finalisationTables(), { numberRange: false })
    strictEqual(result.ok, false)
    strictEqual(result.steps[0]!.status, 'failed')
    ok(result.message.includes('ZSGTSFNR08'))
    deepStrictEqual(writes(calls), [])
    deepStrictEqual(tables.billAdjustment, [])
  })

  it('draws ZINV_NO from the field range into the inserted row, after the insert', async () => {
    const { result, calls, tables } = await run('05')
    ok(result.ok, result.message)
    const ops = calls.filter((c) => c.resource === 'billAdjustment' && (c.op === 'create' || c.op === 'allocate')).map((c) => c.op)
    deepStrictEqual(ops, ['create', 'allocate'])
    const created = calls.find((c) => c.op === 'create' && c.resource === 'billAdjustment')!
    strictEqual(created.data!['ZINV_NO'], '')
    strictEqual(tables.billAdjustment[0]!['ZINV_NO'], '1000')
  })

  it('removes the inserted row again when the draw fails', async () => {
    const t = finalisationTables()
    const f = fakePorts(t, { numberRange: true, failOn: (c) => c.op === 'allocate' })
    const result = await confirmInvoiceGeneration({ deal: deal('04'), dealRows: t.tsfDealId, diffRule: undefined, status: '05', sellers: ['OGA'] }, f.ports)
    strictEqual(result.ok, false)
    deepStrictEqual(t.billAdjustment, [])
    strictEqual(t.tsfDealId[0]!['ZDEAL_STAT'], '04')
  })

  it('without the IF_INV resource it stops before the first write', async () => {
    const t = finalisationTables()
    const f = fakePorts(t, { numberRange: true, registered: ['billAdjustment', 'tsfDealId', 'billOfLading', 'blReuse', 'invRef'] })
    const result = await confirmInvoiceGeneration({ deal: deal('04'), dealRows: t.tsfDealId, diffRule: undefined, status: '05', sellers: ['OGA'] }, f.ports)
    strictEqual(result.ok, false)
    ok(result.message.includes('WAITING FOR API'))
    deepStrictEqual(writes(f.calls), [])
  })

  it('stops at the failing step, names it, and a rerun finishes without renumbering', async () => {
    const t = finalisationTables()
    let fail = true
    const f = fakePorts(t, { numberRange: true, failOn: (c) => fail && c.op === 'update' && c.resource === 'tsfDealId' })
    const input = { deal: deal('04'), dealRows: t.tsfDealId, diffRule: undefined, status: '05' as const, sellers: ['OGA'] }
    const first = await confirmInvoiceGeneration(input, f.ports)
    strictEqual(first.ok, false)
    deepStrictEqual(first.steps.filter((s) => s.status === 'done').map((s) => s.step), ['check', 'invoice rows (BIL_ADJ)', 'invoice interface (IF_INV)'])
    ok(first.message.includes('Deal ID status'))
    strictEqual(t.tsfDealId[0]!['ZDEAL_STAT'], '04')
    const number = t.billAdjustment[0]!['ZINV_NO']
    fail = false
    const second = await confirmInvoiceGeneration(input, f.ports)
    ok(second.ok, second.message)
    strictEqual(t.billAdjustment.length, 1)
    strictEqual(t.billAdjustment[0]!['ZINV_NO'], number)
    strictEqual(t.tsfDealId[0]!['ZDEAL_STAT'], '05')
  })

  it('never touches APP_STR, a Treasury transaction or a reverse', async () => {
    const { calls } = await run('05')
    for (const c of calls) ok(!/app|fx|trm|reverse/i.test(c.resource), c.resource)
  })
})

/* ------------------------------------------------------------------ Amend Deal Status */

describe('amendDealStatus', () => {
  const tables = (stat: string, pc: string) => ({
    tsfDealId: [dealRow(stat)],
    billAdjustment: [{ ZDEAL_ID: DEAL_ID, ZINV_REF: `${DEAL_ID}-T1`, ZINV_TYPE: 'I01', ZPRE_T_REF: '', ZPC: pc }] as MwRow[],
  })

  it('05 -> 07 and the invoice rows move to P', async () => {
    const t = tables('05', 'C')
    const r = await amendDealStatus(deal('05'), t.tsfDealId, fakePorts(t).ports)
    ok(r.ok)
    deepStrictEqual([t.tsfDealId[0]!['ZDEAL_STAT'], t.billAdjustment[0]!['ZPC']], ['07', 'P'])
  })

  it('07 -> 05 and the invoice rows move to C', async () => {
    const t = tables('07', 'P')
    const r = await amendDealStatus(deal('07'), t.tsfDealId, fakePorts(t).ports)
    ok(r.ok)
    deepStrictEqual([t.tsfDealId[0]!['ZDEAL_STAT'], t.billAdjustment[0]!['ZPC']], ['05', 'C'])
  })

  it('refuses any other status without a write', async () => {
    const t = tables('04', '')
    const f = fakePorts(t)
    const r = await amendDealStatus(deal('04'), t.tsfDealId, f.ports)
    strictEqual(r.ok, false)
    deepStrictEqual(writes(f.calls), [])
  })

  it('reports a half-done amendment and the reconcile path restores 05 <=> C / 07 <=> P', async () => {
    const t = tables('05', 'C')
    const broken = fakePorts(t, { failOn: (c) => c.resource === 'billAdjustment' && c.op === 'update' })
    const r = await amendDealStatus(deal('05'), t.tsfDealId, broken.ports)
    strictEqual(r.ok, false)
    ok(r.message.includes('Already written: check, Deal ID status'))
    strictEqual(t.tsfDealId[0]!['ZDEAL_STAT'], '07')
    strictEqual(pcMismatches('07', t.billAdjustment).length, 1)
    const fixed = await reconcileInvoicePc(deal('07'), fakePorts(t).ports)
    ok(fixed.ok)
    strictEqual(t.billAdjustment[0]!['ZPC'], 'P')
    strictEqual(pcMismatches('07', t.billAdjustment).length, 0)
  })
})

/* ------------------------------------------------------------------ Reverse Confirm Invoice Generation */

describe('reverseInvoiceConfirmation', () => {
  const tables = (stat: string) => ({
    billAdjustment: [{ ZDEAL_ID: DEAL_ID, ZINV_REF: `${DEAL_ID}-T1`, ZINV_TYPE: 'I01', ZPRE_T_REF: '' }] as MwRow[],
    tsfDealId: [dealRow(stat)],
    billOfLading: [bl({ ZBL_STAT_ID: '05', ZINV_TYPE: 'I01' })],
  })

  for (const stat of ['04', '05', '07']) {
    it(`from ${stat}: deletes BIL_ADJ, Deal ID -> 04, BL -> 02 with no invoice type`, async () => {
      const t = tables(stat)
      const f = fakePorts(t)
      const r = await reverseInvoiceConfirmation(deal(stat), t.tsfDealId, f.ports)
      ok(r.ok, r.message)
      deepStrictEqual(t.billAdjustment, [])
      strictEqual(t.tsfDealId[0]!['ZDEAL_STAT'], '04')
      deepStrictEqual([t.billOfLading[0]!['ZBL_STAT_ID'], t.billOfLading[0]!['ZINV_TYPE']], ['02', ''])
      for (const c of f.calls) ok(!/app|fx|trm|reverse/i.test(c.resource), `${c.resource} must not be touched`)
    })
  }

  it('refuses any other status (TEXT-005) without a write', async () => {
    const t = tables('03')
    const f = fakePorts(t)
    const r = await reverseInvoiceConfirmation(deal('03'), t.tsfDealId, f.ports)
    strictEqual(r.ok, false)
    deepStrictEqual(writes(f.calls), [])
  })
})

/* ------------------------------------------------------------------ BL de-assign */

describe('deassignBls', () => {
  const tables = () => ({
    billOfLading: [bl({}), bl({ ZBL_NO: 'BL2', ZBL_LOT: 'L2', ZQUANTITY: '50' })],
    blReuse: [] as MwRow[],
    blDeassign: [] as MwRow[],
    preInv: [{ ZDEAL_ID: DEAL_ID, ZTF_NO: 'TF1', ZTF_SPLIT: '01', ZBL_LOT: 'L1', ZPRE_T_REF: 'P1' }] as MwRow[],
    tsfDealId: [dealRow('03')],
    tradeFlow: [{ ZTF_NO: 'TF1', ZTF_SPLIT: '01', ZQUANTITY: '150', ZFLW_COD1: '04' }] as MwRow[],
  })
  const input = (t: ReturnType<typeof tables>, selected: MwRow[]) => ({ deal: deal('03'), dealRows: t.tsfDealId, allBls: t.billOfLading.map((b) => ({ ...b })), selected, remark: 'wrong deal' })

  it('clears the BL linkage, writes the history with the remark, and keeps the Deal ID while a BL remains', async () => {
    const t = tables()
    const selected = [t.billOfLading[0]!]
    const i = input(t, selected.map((b) => ({ ...b })))
    const r = await deassignBls(i, fakePorts(t).ports)
    ok(r.ok, r.message)
    const b = t.billOfLading[0]!
    deepStrictEqual([b['ZBL_STAT_ID'], b['ZDEAL_ID'], b['ZBL_LOT'], b['ZINV_COMM'], b['ZINV_TYPE'], b['ZINCO']], ['01', '', '', '', '', ''])
    strictEqual(t.blDeassign[0]!['ZREMARK'], 'wrong deal')
    strictEqual(t.tsfDealId[0]!['ZDEAL_STAT'], '03')
    // L1 had one BL and it is de-assigned: its PRE_INV row goes; Trade Flow: 50 of 150 still assigned -> 03.
    deepStrictEqual(t.preInv, [])
    strictEqual(t.tradeFlow[0]!['ZFLW_COD1'], '03')
  })

  it('moves the Deal ID back to 03 once no BL is left, and the Trade Flow to 01', async () => {
    const t = tables()
    t.tsfDealId[0]!['ZDEAL_STAT'] = '04'
    const i = { ...input(t, t.billOfLading.map((b) => ({ ...b }))), deal: deal('04') }
    const r = await deassignBls(i, fakePorts(t).ports)
    ok(r.ok, r.message)
    strictEqual(t.tsfDealId[0]!['ZDEAL_STAT'], '03')
    strictEqual(t.tradeFlow[0]!['ZFLW_COD1'], '01')
  })

  it('handles a reused BL in BL_RUSE with its reuse key', async () => {
    const t = tables()
    t.blReuse.push(bl({ ZBL_NO: 'BL9', ZBL_REUSE: 'R1' }))
    const f = fakePorts(t)
    const r = await deassignBls({ ...input(t, [{ ...t.blReuse[0]! }]) }, f.ports)
    ok(r.ok, r.message)
    strictEqual(t.blReuse[0]!['ZBL_STAT_ID'], '01')
    const u = f.calls.find((c) => c.op === 'update' && c.resource === RESOURCE.blReuse)!
    strictEqual(u.key!['ZBL_REUSE'], 'R1')
  })

  it('does not write anything when the history resource is not registered', async () => {
    const t = tables()
    const f = fakePorts(t, { registered: ['billOfLading', 'blReuse', 'preInv', 'tsfDealId', 'tradeFlow'] })
    const r = await deassignBls(input(t, [{ ...t.billOfLading[0]! }]), f.ports)
    strictEqual(r.ok, false)
    deepStrictEqual(writes(f.calls), [])
  })

  it('reports the BL e-mail as a missing backend action', async () => {
    const t = tables()
    const r = await deassignBls(input(t, [{ ...t.billOfLading[0]! }]), fakePorts(t).ports)
    strictEqual(r.steps.find((s) => s.step === 'notification')!.status, 'skipped')
  })
})

describe('Trade Flow status and PRE_INV grouping', () => {
  it('no allocation -> 01, partial -> 03, full -> 04', () => {
    strictEqual(tradeFlowStatus(100, []), '01')
    strictEqual(tradeFlowStatus(100, [40, 20]), '03')
    strictEqual(tradeFlowStatus(100, [40, 60]), '04')
  })

  it('PRE_INV goes only when every BL of the Deal ID / lot / Trade Flow / split is de-assigned', () => {
    const all = [bl({}), bl({ ZBL_NO: 'BL2' }), bl({ ZBL_NO: 'BL3', ZBL_LOT: 'L2' })]
    deepStrictEqual(preInvoiceGroups(all, [all[0]!]), [])
    deepStrictEqual(preInvoiceGroups(all, [all[0]!, all[1]!]).map((g) => g.ZBL_LOT), ['L1'])
    deepStrictEqual(preInvoiceGroups(all, [all[2]!]).map((g) => g.ZBL_LOT), ['L2'])
  })
})

describe('status model', () => {
  it('keeps the invoice statuses apart from the transaction statuses', () => {
    deepStrictEqual(Object.values(DEAL_INVOICE_STATUS), ['03', '04', '05', '07'])
  })
})

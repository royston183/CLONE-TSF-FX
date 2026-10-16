import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { AppStrFields } from '../fx-blotter/appStr.ts'
import { withSetFx } from './api.ts'
import { seedDeal } from './fixtures.ts'
import { fxPostDefaults } from './logic.ts'
import {
  TRADE_LEGS,
  completeExecution,
  completeFxLeg,
  completeInvoiceLeg,
  dssPartner,
  executionRefusal,
  initiateSettlement,
  invoicePosition,
  notInitiated,
  sapDate,
  sequenceRefusal,
  tsfFields,
  tsfFieldsSwapped,
  updateFxLeg,
  updateInvoiceLeg,
  type PositionWrite,
  type SettlementDeps,
} from './settlement.ts'
import type { Deal, FxDeal, FxPostForm, InvPostForm, TradeInvoice } from './types.ts'

/** Records every write: TRD_POS rows merged by key as the gateway upserts, TrmFxApp changes per transaction. */
function fakeDeps(fail?: 'position' | 'status') {
  const rows = new Map<string, Record<string, string | number>>()
  const fx = new Map<string, AppStrFields>()
  const statuses: string[] = []
  const deps: SettlementDeps = {
    putPosition: async (dealId: string, { seq, fields }: PositionWrite) => {
      if (fail === 'position') throw new Error('localdb down')
      rows.set(`${dealId}/${seq}`, { ...rows.get(`${dealId}/${seq}`), ...fields })
    },
    setDealStatus: async (_deal: Deal, status: string) => {
      if (fail === 'status') throw new Error('middleware down')
      statuses.push(status)
    },
    updateFx: async (bukrs, rfha, fields) => {
      fx.set(`${bukrs}/${rfha}`, { ...fx.get(`${bukrs}/${rfha}`), ...fields })
    },
  }
  return { deps, rows, fx, statuses }
}

const at = (dealStatus: string, noInvoiceFlag = false): Deal => ({ ...seedDeal(), dealId: '7000000032', dealStatus, dealType: 'FX', subType: 'FX1', noInvoiceFlag })

/** Model M033 as SET_TYP has it: T3-P = 1 .. T1-S = 6, D-map DS1 for T2/T3, D1 for T1 (T1-S with DSS1). */
const leg = (seq: number, type: string, dMap: string, extra: Partial<TradeInvoice> = {}): TradeInvoice => ({
  leg: type,
  trfDesc: `${type} desc`,
  docType: 'SA',
  xblnr: '',
  drPost: '',
  crPost: '',
  dueDate: '09-11-2026',
  postDate: '',
  invAmt: 100,
  curr: 'INR',
  payAmt: 100,
  recPay: type.endsWith('P') ? 'Payment' : 'Receipt',
  trfType: '04',
  fiDoc: '',
  setCo: false,
  seq: String(seq),
  dMap,
  dssDeal: type === 'T1-S' ? 'DSS1' : '',
  postRequired: type !== 'T3-P',
  setCheck: true,
  buy: 'OGA',
  sell: 'DMCC',
  ...extra,
})
const M033 = (): TradeInvoice[] => [
  leg(1, 'T3-P', 'DS1'),
  leg(2, 'T3-S', 'DS1'),
  leg(3, 'T2-P', 'DS1'),
  leg(4, 'T2-S', 'DS1'),
  leg(5, 'T1-P', 'D1'),
  leg(6, 'T1-S', 'D1'),
]
const settledUpTo = (n: number) => M033().map((r) => ({ ...r, setCo: Number(r.seq) <= n }))

/** FX legs D1 (buy USD) and D2 with SET_FX M033: D1 is sequence 6 with DSS deal DSS1; D2 has no sequence. */
const fxRow = (dealType: string, rfha: string, extra: Partial<FxDeal> = {}): FxDeal => ({
  seq: '',
  dealType,
  dealTypeChip: 'chip-t',
  rfha,
  bukrs: 'SG03',
  bp: '400000002',
  txnDate: '07-10-2026',
  valDate: '09-11-2026',
  entity: '',
  bs1: 'Buy',
  curr1: 'USD',
  amt1: 100,
  bs2: 'Sell',
  curr2: 'INR',
  amt2: 8320,
  spot: '83.2000',
  rate: '83.2000',
  mcRefNo: '',
  status: '',
  statusChip: 'chip-open',
  doc1: '',
  doc2: '',
  settled: false,
  ...extra,
})
const SET_FX = [
  { ZD_MAP: 'D1', ZBS: 'B', ZSEQ: '6', ZDSS_DEAL: 'DSS1', ZCURR: 'USD', ZACC: '02', ZTRF_TYPE: '06', ZRBUKRS: '', ZPAY_ID: '', ZBANK_ID: '', ZLET_CODE: 'L046', ZLET_NAME: 'SSI' },
  { ZD_MAP: 'D1', ZBS: 'S', ZSEQ: '6', ZDSS_DEAL: 'DSS1', ZCURR: 'INR', ZACC: '04', ZTRF_TYPE: '04', ZRBUKRS: '', ZPAY_ID: '', ZBANK_ID: '', ZLET_CODE: '', ZLET_NAME: '' },
  { ZD_MAP: 'D2', ZBS: 'B', ZSEQ: '', ZDSS_DEAL: '', ZCURR: '', ZACC: '', ZTRF_TYPE: '', ZRBUKRS: '', ZPAY_ID: '', ZBANK_ID: '', ZLET_CODE: '', ZLET_NAME: '' },
]
const fxLegs = (extra: Partial<FxDeal> = {}) => withSetFx([fxRow('D1', '3000000000030', extra), fxRow('D2', '2000000000036')], SET_FX)

const invForm: InvPostForm = {
  bukrs: '', seq: '', recPay: '', tradeType: '', setDesc: '', payAmt: '', linkedFx: '', settled: false, trfType: '', postingType: '', fiPosting: false, partnerId: '',
  date: '09-11-2026',
  sender: 'OGA',
  senderHouseBank: 'dbs03',
  senderAccountId: 'DBS00',
  receiver: 'DMCC',
  receiverHouseBank: 'JPM01',
  receiverAccountId: 'JPM02',
  amt: '100.00 INR',
  fiDoc: '',
  docMsg: '',
}
const fxForm = (d: FxDeal): FxPostForm => ({ ...fxPostDefaults(d), bBankId: 'SCB1', bPaymentId: 'P1', bRecCoCode: 'SG03', sBankId: 'HDF1', sPaymentId: 'P2', sPayCoCode: 'IN11', subNo: false, remit: false })

describe('sapDate', () => {
  it('turns DD-MM-YYYY into DATS and rejects anything else', () => {
    strictEqual(sapDate('09-11-2026'), '20261109')
    strictEqual(sapDate('2026-11-09'), '')
  })
})

describe('Initiate Settlement (save_data)', () => {
  it('writes the whole TRD_POS row of every trade leg, keyed by SET_TYP sequence, then status 20', async () => {
    const { deps, rows, statuses } = fakeDeps()
    ok((await initiateSettlement(at('07'), M033(), deps)).ok)
    strictEqual(rows.size, TRADE_LEGS)
    deepStrictEqual(statuses, ['20'])
    const t1s = rows.get('7000000032/6')
    strictEqual(t1s?.['ZT_TYPE'], 'T1-S')
    // SET_TYP configuration copied as it is; the completion flag and the FI document start blank.
    deepStrictEqual([t1s?.['ZSET_CHECK'], t1s?.['ZPOST_CHECK'], t1s?.['ZEXE_CO'], t1s?.['ZBELNR']], ['X', 'X', '', ''])
    strictEqual(rows.get('7000000032/1')?.['ZPOST_CHECK'], '')
    strictEqual(t1s?.['ZP_DATE'], '20261109')
  })

  it('writes no FX row: FX legs are not in ZSGTSFTR_TRD_POS', () => {
    for (const r of M033()) ok(invoicePosition(r, 0).fields['ZT_TYPE'] !== 'FX')
  })

  it('only runs from 05 to 19, and does not move the status when the legs could not be written', async () => {
    const a = fakeDeps()
    for (const s of ['04', '20', '21']) strictEqual((await initiateSettlement(at(s), M033(), a.deps)).ok, false)
    const b = fakeDeps('position')
    strictEqual((await initiateSettlement(at('07'), M033(), b.deps)).ok, false)
    deepStrictEqual([...a.statuses, ...b.statuses], [])
  })
})

describe('trade leg Update (UPD_DATA -> save_bank_data)', () => {
  it('writes the house banks on both legs of the trade type, at 20+ or 05', async () => {
    const { deps, rows } = fakeDeps()
    const inv = M033()
    ok((await updateInvoiceLeg(at('20'), inv[4]!, inv, invForm, deps)).ok)
    for (const seq of ['5', '6']) {
      const r = rows.get(`7000000032/${seq}`)
      deepStrictEqual([r?.['ZHBKID'], r?.['ZHKTID'], r?.['ZREC_HBKID'], r?.['ZREC_HKTID']], ['DBS03', 'DBS00', 'JPM01', 'JPM02'])
    }
    strictEqual(rows.size, 2)
    ok((await updateInvoiceLeg(at('05'), inv[0]!, inv, invForm, deps)).ok)
    strictEqual((await updateInvoiceLeg(at('07'), inv[0]!, inv, invForm, deps)).ok, false)
  })
})

describe('trade leg Settlement Complete (SET_EXE -> set_complete / set_update)', () => {
  it('marks the leg complete with no FI document, and gives a row Initiate never wrote the leg\'s own configuration', async () => {
    const { deps, rows } = fakeDeps()
    const inv = M033()
    ok((await completeInvoiceLeg(at('20'), inv[0]!, inv, fxLegs(), invForm, deps)).ok)
    const r = rows.get('7000000032/1')
    strictEqual(r?.['ZEXE_CO'], 'X')
    // No FI document, message or posting date: those belong to the posting step.
    deepStrictEqual([r?.['ZBELNR'], r?.['ZMSG'], r?.['ZP_DATE']], [undefined, undefined, undefined])
    // But not a bare row: the description, type and amounts BO: Post Accounting Entries reads are there.
    deepStrictEqual([r?.['ZT_TYPE'], r?.['ZSET_DESC'], r?.['ZAMT'], r?.['ZTRF_TYPE']], [inv[0]!.leg, inv[0]!.trfDesc, inv[0]!.invAmt, inv[0]!.trfType])
  })

  it('needs status 20+', async () => {
    const { deps } = fakeDeps()
    const inv = M033()
    deepStrictEqual(await completeInvoiceLeg(at('07'), inv[0]!, inv, fxLegs(), invForm, deps), { ok: false, error: notInitiated(at('07')) })
  })

  it('needs the previous sequence settled (E052)', async () => {
    const { deps, rows } = fakeDeps()
    const inv = settledUpTo(1)
    const r = await completeInvoiceLeg(at('20'), inv[2]!, inv, fxLegs(), invForm, deps)
    ok(!r.ok && r.error.includes('Sequence 2 is not settled yet'))
    strictEqual(rows.size, 0)
    ok((await completeInvoiceLeg(at('20'), inv[1]!, inv, fxLegs(), invForm, deps)).ok)
  })

  it('needs the FX leg of the previous sequence settled (E068)', () => {
    // A trade leg at sequence 7 would follow D1 (sequence 6).
    const inv = [...settledUpTo(6), leg(7, 'T4-S', 'D1')]
    ok(sequenceRefusal('7', inv, fxLegs(), 'trade').includes('E068'))
    strictEqual(sequenceRefusal('7', inv, fxLegs({ settled: true }), 'trade'), '')
  })
})

describe('FX leg Settlement Complete (set_complete_txn -> update_bank_vtbfha)', () => {
  it('takes its sequence and DSS deal from SET_FX', () => {
    const [d1, d2] = fxLegs()
    deepStrictEqual([d1?.seq, d1?.dssDeal, d2?.seq], ['6', 'DSS1', ''])
  })

  it('needs the trade leg of the previous sequence settled, then writes ZTSF_EXE_CO with the bank fields', async () => {
    const { deps, fx } = fakeDeps()
    const legs = fxLegs()
    const d1 = legs[0]!
    const refused = await completeFxLeg(d1, legs, settledUpTo(4), fxForm(d1), deps)
    ok(!refused.ok && refused.error.includes('Sequence 5'))
    strictEqual(fx.size, 0)
    ok((await completeFxLeg(d1, legs, settledUpTo(5), fxForm(d1), deps)).ok)
    const written = fx.get('SG03/3000000000030')
    deepStrictEqual([written?.ZtsfExeCo, written?.ZtsfBpayID, written?.ZtsfRbukrs, written?.ZtsfPbukrs], [true, 'SCB1', 'SG03', 'IN11'])
    deepStrictEqual([written?.ZtsfBcurr, written?.ZtsfScurr, written?.ZtsfTrftype, written?.ZtsfBnktype2], ['USD', 'INR', '06', '04'])
  })

  it('settles an independent mapped FX leg after the sequenced legs are complete', async () => {
    const { deps, fx } = fakeDeps()
    const legs = fxLegs()
    const pending = await completeFxLeg(legs[1]!, legs, settledUpTo(6), fxForm(legs[1]!), deps)
    ok(!pending.ok && pending.error.includes('sequenced FX legs first'))
    strictEqual(fx.size, 0)
    legs[0]!.settled = true
    const invoicePending = await completeFxLeg(legs[1]!, legs, settledUpTo(5), fxForm(legs[1]!), deps)
    ok(!invoicePending.ok && invoicePending.error.includes('trade invoice legs first'))
    strictEqual(fx.size, 0)
    const result = await completeFxLeg(legs[1]!, legs, settledUpTo(6), fxForm(legs[1]!), deps)
    strictEqual(result.ok, true)
    strictEqual(fx.get(`${legs[1]!.bukrs}/${legs[1]!.rfha}`)?.ZtsfExeCo, true)
  })

  it('refuses an unmapped FX leg and invalid sequences without inventing a previous sequence', async () => {
    const { deps, fx } = fakeDeps()
    const leg = fxRow('D2', 'B')
    const result = await completeFxLeg(leg, [leg], settledUpTo(6), fxForm(leg), deps)
    ok(!result.ok && result.error.includes('no settlement mapping'))
    strictEqual(fx.size, 0)
    ok(sequenceRefusal('', settledUpTo(6), [], 'trade').includes('no settlement sequence'))
    for (const seq of ['-1', 'bad', '1.5']) {
      ok(sequenceRefusal(seq, settledUpTo(6), [], 'fx').includes('Invalid settlement sequence'))
    }
  })

  it('writes the DSS deal too: as it is when side and currency agree, swapped when one differs', async () => {
    const d1 = fxRow('D1', 'A', { dssDeal: 'DSS1' })
    deepStrictEqual(dssPartner(d1, [d1, fxRow('DSS1', 'B')])?.swapped, false)
    deepStrictEqual(dssPartner(d1, [d1, fxRow('DSS1', 'B', { bs1: 'Sell', curr1: 'INR' })])?.swapped, false)
    deepStrictEqual(dssPartner(d1, [d1, fxRow('DSS1', 'B', { bs1: 'Sell' })])?.swapped, true)
    deepStrictEqual(dssPartner(d1, [d1, fxRow('DSS1', 'B', { curr1: 'INR' })])?.swapped, true)
    const legs = withSetFx([fxRow('D1', 'A'), fxRow('DSS1', 'B', { bs1: 'Sell' })], SET_FX)
    const form = fxForm(legs[0]!)
    const straight = tsfFields(legs[0]!, form)
    const swapped = tsfFieldsSwapped(legs[0]!, form)
    deepStrictEqual([swapped.ZtsfBpayID, swapped.ZtsfSpayID, swapped.ZtsfBcurr], [straight.ZtsfSpayID, straight.ZtsfBpayID, straight.ZtsfScurr])
    const { deps, fx } = fakeDeps()
    ok((await completeFxLeg(legs[0]!, legs, settledUpTo(5), form, deps)).ok)
    strictEqual(fx.get('SG03/B')?.ZtsfExeCo, true)
    strictEqual(fx.get('SG03/B')?.ZtsfBpayID, 'HDF1')
  })

  it('Update writes the bank fields without the completion flag', async () => {
    const { deps, fx } = fakeDeps()
    const legs = fxLegs()
    ok((await updateFxLeg(legs[0]!, legs, fxForm(legs[0]!), deps)).ok)
    strictEqual(fx.get('SG03/3000000000030')?.ZtsfExeCo, undefined)
  })
})

describe('Execution Complete (EXE_C)', () => {
  it('needs exactly six settled trade legs (I064)', () => {
    ok(executionRefusal(fxLegs({ settled: true }), settledUpTo(5), false).includes('I064'))
  })

  it('needs the FX legs the trade legs map to (I065), not the unmapped ones', () => {
    ok(executionRefusal(fxLegs(), settledUpTo(6), false).includes('D1 3000000000030'))
    // D2 is no trade leg's D-map or DSS deal on M033: it does not hold Execution Complete back.
    strictEqual(executionRefusal(fxLegs({ settled: true }), settledUpTo(6), false), '')
  })

  it('no-invoice model: every FX leg the model maps', () => {
    ok(executionRefusal(fxLegs(), [], true).includes('I065'))
  })

  it('moves 20 to 21', async () => {
    const { deps, statuses } = fakeDeps()
    ok((await completeExecution(at('20'), fxLegs({ settled: true }), settledUpTo(6), deps)).ok)
    deepStrictEqual(statuses, ['21'])
    strictEqual((await completeExecution(at('20'), fxLegs(), settledUpTo(6), deps)).ok, false)
  })
})

describe('why a leg action is refused before 20', () => {
  it('sends a deal still in invoicing to finish invoicing first', () => {
    const msg = notInitiated({ dealId: '7000000035', dealStatus: '03' })
    ok(msg.startsWith('Deal ID 7000000035 is at status 03, so settlement cannot start yet.'))
    ok(msg.includes('ZSGTSFR033'))
  })

  it('asks for Initiate Settlement from 05 to 19', () => {
    ok(notInitiated({ dealId: '1', dealStatus: '07' }).includes('Click Initiate Settlement first'))
  })
})

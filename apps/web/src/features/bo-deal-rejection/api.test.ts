import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { appFilter, companyOptions, dealFromFxApp, dealFromRow, loadWorklist, statusSelection } from './api.ts'
import { FX_FIELD_DEFS } from './data.ts'

describe('selection screen', () => {
  it('Company Code: T001 "<code> - <name>", leading zeros kept, by code', () => {
    deepStrictEqual(
      companyOptions([
        { CompanyCode: 'SG03', CompanyCodeName: 'OLAM GlobalAgri Pte. Ltd' },
        { CompanyCode: '0001', CompanyCodeName: 'SAP SE' },
        { CompanyCode: '', CompanyCodeName: 'blank' },
      ]).map((o) => o.label),
      ['0001 - SAP SE', 'SG03 - OLAM GlobalAgri Pte. Ltd'],
    )
  })
})

describe('GET_DATA status selection (ZGTCATR_PARAM)', () => {
  // As served on 2026-10-05: ZSGTSF_RDEAL_TRD_INV / SG03 / MAPID A, PARAM1 'M040', PARAM3 '9918307'.
  const live = { PROGNAM: 'ZSGTSF_RDEAL_TRD_INV', BUKRS: 'SG03', WERKS: '', MAPID: 'A', SNO: '001', PARAM1: 'M040', PARAM3: '9918307' }

  it('derives status1 = 40+18+1, status2 = "07", status3 = 9+7-3, actvt = 1+1', () => {
    deepStrictEqual(statusSelection([live], ['SG03']), { fx: ['59', '07', '13'], actvt: 2, found: true })
  })
  it('only rows of the selected company codes and MAPID A count', () => {
    deepStrictEqual(statusSelection([live], ['IN11']), { fx: ['', '', ''], actvt: 0, found: false })
    deepStrictEqual(statusSelection([{ ...live, MAPID: 'B' }], ['SG03'])?.found, false)
  })
  it('non-numeric offsets would dump in SAP', () => {
    strictEqual(statusSelection([{ ...live, PARAM3: '99X8307' }], ['SG03']), null)
  })
})

describe('FX worklist from ZSGTSFTR_APP_STR + FxTransaction', () => {
  const sel = { fx: ['59', '07', '13'], actvt: 2, found: true }
  const fx = {
    CompanyCode: 'SG03', FinancialTransaction: '3000000000005', ProductType: '12B', TransactionType: '619', Partner: '400000002',
    ContractDate: '2026-09-30', ValueDate: '2026-10-30', BuyCurrency: 'USD', SellCurrency: 'INR', LeadCurrency: 'USD', FollowCurrency: 'INR',
    BuyAmount: 1000, SellAmount: 83000, ForwardRate: 83, ActiveStatus: '0', ActivityCategory: '20',
  }
  const app = { CompanyCode: 'SG03', FinancialTransaction: '3000000000005', TxnStatus: '07', BlotterDate: '2026-10-05', ZtsfDealID: '7000000014', ZtsfMcRefNo: 'MC1', ZtsfExeCo: true, NdfFoRem: 'fo note' }

  it('builds the TrmFxApp filter: TxnStatus IN, BlotterDate <= p_date, CompanyCode when picked', () => {
    strictEqual(
      appFilter(['SG03'], false, '2026-10-05', sel),
      "(TxnStatus eq '59' or TxnStatus eq '07' or TxnStatus eq '13') and (BlotterDate le 2026-10-05) and (CompanyCode eq 'SG03')",
    )
    ok(!appFilter(['SG03', 'IN11'], true, '2026-10-05', sel).includes('CompanyCode'))
  })
  it('maps FxTransaction + TrmFxApp onto the view fields (activity = RFHAZUL, sell leg negative), blank where no service has it', () => {
    const d = dealFromFxApp({ fx, app })
    deepStrictEqual(
      [d.rfha, d.bukrs, d.txn_status, d.ext_stat_desc, d.blotter_date, d.dblfz, d.rfhazul, d.curr1, d.amt1, d.curr2, d.amt2, d.t_rate, d.ztsf_deal_id, d.ztsf_mc_ref_no, d.ztsf_exe_co, d.ndf_fo_rem],
      ['3000000000005', 'SG03', '07', 'MO: Match & Release for Settlement', '05-10-2026', '30-09-2026', '00020', 'USD', 1000, 'INR', -83000, 83, '7000000014', 'MC1', 'X', 'fo note'],
    )
    deepStrictEqual([d.prctr, d.fo_remark, d.zpl, d.cruser], ['', '', 0, ''])
  })

  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
  })
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  const param = { PROGNAM: 'ZSGTSF_RDEAL_TRD_INV', BUKRS: 'SG03', WERKS: '', MAPID: 'A', SNO: '001', PARAM1: 'M040', PARAM3: '9918307' }

  it('lists the joined rows the selection reaches and drops those below the activity floor', async () => {
    const urls: string[] = []
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const u = decodeURIComponent(String(input).replaceAll('+', ' '))
      if (u.includes('/api/trmfxapp/')) {
        urls.push(u)
        return json({ value: [app, { ...app, FinancialTransaction: '3000000000006' }] })
      }
      if (u.includes('/api/fx/')) return json({ value: [fx, { ...fx, FinancialTransaction: '3000000000006', ActivityCategory: '1' }] })
      if (u.includes('/api/trmmaster/') || u.includes('/api/businesspartner/')) return json({ value: [], d: { results: [] } })
      return json({ ok: true, rows: [param] })
    }) as typeof fetch
    const r = await loadWorklist('FX', ['SG03'], false, '05-10-2026')
    strictEqual(r.state, 'ok')
    if (r.state === 'ok') deepStrictEqual(r.value.deals.map((d) => d.rfha), ['3000000000005'])
    ok(urls[0]?.includes('BlotterDate le 2026-10-05'))
  })
  it('Options stay WAITING FOR API (no ZSGTSFV_OP source)', async () => {
    const r = await loadWorklist('OP', ['SG03'], false, '05-10-2026')
    strictEqual(r.state, 'waiting')
  })
})

describe('view row mapping', () => {
  it('maps a view row by the field catalogue (dates dd-mm-yyyy, amounts/rates numeric, RFHA zeros kept)', () => {
    const d = dealFromRow(
      { BUKRS: 'SG03', RFHA: '3000000000005', RFHAZUL: '00002', DBLFZ: '2026-09-30', AMT2: '-83000.00', T_RATE: '83.000000000', TCRTIM: '23:21:23', REFNR: null },
      FX_FIELD_DEFS,
    )
    deepStrictEqual([d.rfha, d.rfhazul, d.dblfz, d.amt2, d.t_rate, d.tcrtim, d.refnr, d.blotter_date], ['3000000000005', '00002', '30-09-2026', -83000, 83, '23:21:23', '', ''])
  })
})

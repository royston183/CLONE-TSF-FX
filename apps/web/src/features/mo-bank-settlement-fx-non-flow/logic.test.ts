import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ACTION_WAITING, VIEW_REQUIRED_COLUMNS, companyOptions, missingColumns, unservedColumns, worklistWaitingReason } from './api.ts'
import { HOUSE_BANKS, TRANSFER_TYPES, seedDeals } from './fixtures.ts'
import { fmtDate, fmtNum, fmtRate, parseDMY } from './format.ts'
import {
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  accountOptions,
  bankCandidates,
  bankUpdateCheck,
  bankUpdateToast,
  ccyPairs,
  computeKpis,
  dealCountLabel,
  filterDeals,
  nextSort,
  pageOf,
  pagerWindow,
  postGuard,
  pruneSelection,
  selectedLabel,
  sortDeals,
  toggleBukrs,
  toggleSelected,
  transferTypeOf,
} from './logic.ts'
import type { Deal } from './types.ts'

const find = (list: Deal[], id: string) => {
  const d = list.find((x) => x.dealId === id)
  if (!d) throw new Error(`no deal ${id}`)
  return d
}
const ids = (list: Deal[]) => list.map((d) => d.dealId)

describe('format', () => {
  it('formats numbers, rates and dates', () => {
    strictEqual(fmtNum(5000000), '5,000,000.00')
    strictEqual(fmtNum(null), '—')
    strictEqual(fmtRate(83), '83.0000')
    strictEqual(fmtRate(15542.5), '15,542.5000')
    strictEqual(fmtRate(1.075), '1.0750')
    strictEqual(fmtDate('2026-10-15'), '15-10-2026')
    strictEqual(fmtDate(null), '—')
    strictEqual(fmtDate('garbage'), '—')
    strictEqual(fmtDate(new Date(2026, 0, 5)), '05-01-2026')
  })
  it('parses dd-mm-yyyy only', () => {
    strictEqual(parseDMY('01-09-2026')?.getMonth(), 8)
    strictEqual(parseDMY('2026-09-01'), null)
    strictEqual(parseDMY(''), null)
  })
})

describe('filters', () => {
  const deals = seedDeals()
  it('default filters keep the deals inside 01-09-2026..31-12-2026', () => {
    strictEqual(filterDeals(deals, DEFAULT_FILTERS).length, 10)
  })
  it('value date range is inclusive and drops outside deals', () => {
    const f = { ...DEFAULT_FILTERS, dateFrom: '01-10-2026', dateTo: '31-10-2026' }
    deepStrictEqual(
      ids(filterDeals(deals, f)).sort(),
      ['TSF-20261001', 'TSF-20261002', 'TSF-20261005', 'TSF-20261009'],
    )
    const edge = { ...DEFAULT_FILTERS, dateFrom: '15-10-2026', dateTo: '15-10-2026' }
    deepStrictEqual(ids(filterDeals(deals, edge)), ['TSF-20261001'])
  })
  it('company code chips', () => {
    deepStrictEqual(toggleBukrs(['ALL'], 'OIL1'), ['OIL1'])
    deepStrictEqual(toggleBukrs(['OIL1'], 'DMCC'), ['OIL1', 'DMCC'])
    deepStrictEqual(toggleBukrs(['OIL1'], 'OIL1'), ['ALL'])
    deepStrictEqual(toggleBukrs(['OIL1', 'DMCC'], 'ALL'), ['ALL'])
    const f = { ...DEFAULT_FILTERS, bukrs: ['OAIP'] }
    deepStrictEqual(ids(filterDeals(deals, f)).sort(), ['TSF-20261003', 'TSF-20261006', 'TSF-20261009'])
  })
  it('bank, status and ccy pair filters', () => {
    strictEqual(filterDeals(deals, { ...DEFAULT_FILTERS, bank: 'NOT_ASSIGNED' }).length, 4)
    strictEqual(filterDeals(deals, { ...DEFAULT_FILTERS, status: 'Settled' }).length, 2)
    strictEqual(filterDeals(deals, { ...DEFAULT_FILTERS, status: 'Matured' }).length, 1)
    strictEqual(filterDeals(deals, { ...DEFAULT_FILTERS, ccy: 'GBP/USD' }).length, 1)
  })
  it('search matches deal id, txn no, counterparty, trader and MC ref, case-insensitively', () => {
    strictEqual(filterDeals(deals, { ...DEFAULT_FILTERS, search: 'tsf-20261004' }).length, 1)
    strictEqual(filterDeals(deals, { ...DEFAULT_FILTERS, search: '5001234507' }).length, 1)
    strictEqual(filterDeals(deals, { ...DEFAULT_FILTERS, search: 'a. mehta' }).length, 3)
    strictEqual(filterDeals(deals, { ...DEFAULT_FILTERS, search: '2000002708' }).length, 1)
    strictEqual(filterDeals(deals, { ...DEFAULT_FILTERS, search: 'zzz' }).length, 0)
  })
  it('lists distinct sorted currency pairs and a count label', () => {
    deepStrictEqual(ccyPairs(deals), ['EUR/USD', 'GBP/USD', 'USD/IDR', 'USD/INR', 'USD/MYR'])
    strictEqual(dealCountLabel(1), '1 deal')
    strictEqual(dealCountLabel(0), '0 deals')
    strictEqual(dealCountLabel(10), '10 deals')
  })
})

describe('kpis', () => {
  it('counts the full dataset', () => {
    deepStrictEqual(computeKpis(seedDeals()), { total: 10, awaiting: 4, ready: 4, settled: 2 })
  })
})

describe('sort', () => {
  const deals = seedDeals()
  it('defaults to value date ascending and flips on the same key', () => {
    strictEqual(ids(sortDeals(deals, DEFAULT_SORT))[0], 'TSF-20261008')
    const desc = nextSort(DEFAULT_SORT, 'valueDate')
    strictEqual(desc.dir, -1)
    strictEqual(ids(sortDeals(deals, desc))[0], 'TSF-20261007')
    deepStrictEqual(nextSort(desc, 'dealId'), { key: 'dealId', dir: 1 })
  })
  it('does not mutate its input', () => {
    const before = ids(deals)
    sortDeals(deals, { key: 'valueDate', dir: -1 })
    deepStrictEqual(ids(deals), before)
  })
})

describe('paging', () => {
  const deals = seedDeals()
  it('slices pages and clamps the requested page', () => {
    const p1 = pageOf(deals, 1, 8)
    strictEqual(p1.rows.length, 8)
    strictEqual(p1.totalPages, 2)
    strictEqual(`${p1.start}-${p1.end}`, '1-8')
    const p9 = pageOf(deals, 9, 8)
    strictEqual(p9.page, 2)
    strictEqual(`${p9.start}-${p9.end}`, '9-10')
    const empty = pageOf([], 1, 15)
    strictEqual(empty.totalPages, 1)
    strictEqual(`${empty.start}-${empty.end}`, '0-0')
  })
  it('pager window shows everything up to 7 pages, then first/last and current +-2', () => {
    deepStrictEqual(pagerWindow(1, 3), [1, 2, 3])
    deepStrictEqual(pagerWindow(1, 7), [1, 2, 3, 4, 5, 6, 7])
    deepStrictEqual(pagerWindow(1, 10), [1, 2, 3, 10])
    deepStrictEqual(pagerWindow(5, 10), [1, 3, 4, 5, 6, 7, 10])
  })
})

describe('selection', () => {
  it('is single-row and toggles', () => {
    strictEqual(toggleSelected(null, 'A'), 'A')
    strictEqual(toggleSelected('A', 'B'), 'B')
    strictEqual(toggleSelected('A', 'A'), null)
    strictEqual(selectedLabel(null), '0 selected')
    strictEqual(selectedLabel('A'), '1 selected · drag the row to an action')
  })
  it('is dropped when its row leaves the filtered result', () => {
    const deals = seedDeals()
    strictEqual(pruneSelection('TSF-20261001', deals), 'TSF-20261001')
    strictEqual(pruneSelection('TSF-20261001', deals.slice(1)), null)
    strictEqual(pruneSelection(null, deals), null)
  })
})

describe('house bank / account options', () => {
  it('offers banks with an account in the leg currency, else all of the company banks', () => {
    deepStrictEqual(bankCandidates(HOUSE_BANKS, 'OIL1', 'GBP').map((b) => b.id), ['SCBSG'])
    deepStrictEqual(bankCandidates(HOUSE_BANKS, 'OIL1', 'USD').map((b) => b.id), ['CITISG', 'SCBSG'])
    deepStrictEqual(bankCandidates(HOUSE_BANKS, 'OIL1', 'JPY').map((b) => b.id), ['CITISG', 'SCBSG'])
    deepStrictEqual(bankCandidates(HOUSE_BANKS, 'XXXX', 'USD'), [])
  })
  it('lists every account of the chosen bank', () => {
    deepStrictEqual(accountOptions(HOUSE_BANKS, 'DMCC', 'MASHQ').map((a) => a.id), ['USD11', 'AED01'])
    deepStrictEqual(accountOptions(HOUSE_BANKS, 'DMCC', ''), [])
  })
  it('maps transfer types', () => {
    strictEqual(transferTypeOf(TRANSFER_TYPES, 'INR'), 'T2-NEFT')
    strictEqual(transferTypeOf(TRANSFER_TYPES, 'JPY'), '—')
  })
})

describe('bank update (WAITING FOR ACTION API)', () => {
  const deals = seedDeals()
  const W = ACTION_WAITING.bank
  it('a complete leg is not assigned: it logs the waiting reason and the toast says so', () => {
    const d = find(deals, 'TSF-20261001')
    const logs = bankUpdateCheck(d, { hb1: 'CITISG', acc1: 'USD01', hb2: 'SCBSG', acc2: 'USD02' }, W)
    deepStrictEqual(logs.map((l) => `${l.leg}:${l.ok}:${l.msg === W}`), ['Incoming:false:true', 'Outgoing:false:true'])
    deepStrictEqual(bankUpdateToast(logs, W), { message: W, kind: 'info' })
    strictEqual(d.hb1, null)
    strictEqual(d.bankStatus, 'NOT_ASSIGNED')
  })
  it('still requires bank and account on an open leg', () => {
    const logs = bankUpdateCheck(find(deals, 'TSF-20261001'), { hb1: 'CITISG', acc1: '', hb2: '', acc2: '' }, W)
    deepStrictEqual(logs.map((l) => l.msg), ['House bank and account ID are required', 'House bank and account ID are required'])
    strictEqual(bankUpdateToast(logs, W).kind, 'error')
  })
  it('leaves an already assigned leg alone and logs nothing when both are set', () => {
    deepStrictEqual(bankUpdateCheck(find(deals, 'TSF-20261002'), { hb1: 'ENBD', acc1: 'USD12', hb2: 'ENBD', acc2: 'USD12' }, W), [])
  })
})

describe('test run and post', () => {
  const deals = seedDeals()
  it('post is blocked until bank details are assigned and when already settled', () => {
    const open = postGuard(find(deals, 'TSF-20261001'))
    strictEqual(open.ok, false)
    if (!open.ok) strictEqual(open.kind, 'error')
    const settled = postGuard(find(deals, 'TSF-20261003'))
    strictEqual(settled.ok, false)
    if (!settled.ok) {
      strictEqual(settled.message, 'TSF-20261003 is already settled.')
      strictEqual(settled.kind, '')
    }
    strictEqual(postGuard(find(deals, 'TSF-20261002')).ok, true)
  })
  it('test run and post name the reports from the note and post nothing', () => {
    strictEqual(ACTION_WAITING.test, 'WAITING FOR ACTION API — TBB1 Test Run (RFTBBB00 / TBB1 in test mode) has no API yet. Nothing was posted to SAP.')
    strictEqual(ACTION_WAITING.post.startsWith('WAITING FOR ACTION API — TBB1 Post (RFTBBB00 / TBB1'), true)
    strictEqual(ACTION_WAITING.bank.includes('BAPI_FTR_PAYDET_CREATE'), true)
  })
})

describe('api', () => {
  it('Company Code: T001 "<code> - <name>", leading zeros kept, one per code, sorted', () => {
    deepStrictEqual(
      companyOptions([
        { CompanyCode: 'SG03', CompanyCodeName: 'OLAM GlobalAgri Pte. Ltd' },
        { CompanyCode: '0001', CompanyCodeName: 'SAP SE' },
        { CompanyCode: '0001', CompanyCodeName: 'dup' },
        { CompanyCode: '', CompanyCodeName: 'blank' },
      ]),
      [
        { value: '0001', label: '0001 - SAP SE', title: 'SAP SE' },
        { value: 'SG03', label: 'SG03 - OLAM GlobalAgri Pte. Ltd', title: 'OLAM GlobalAgri Pte. Ltd' },
      ],
    )
  })
  it('worklist always waits (source not exported) and names the view columns tsfvFx lacks (as served 2026-10-06)', () => {
    // prettier-ignore
    const served = ['MANDT','BUKRS','RFHA','SAKTIV','SGSART','BUTXT','LTX','SFHAART','XTEXT','BP_NAME','RFHAZUL','KONTRH','RBUSA','BA_NAME','RPORTB','XPORTB','ZUONR','ZUOND','ASSIGN_DESC','REFER','INT_REF_DESC','OBJNR','REFNR','DBLFZ','DELFZ','SFGTYP','SANLF','ZWAERS','ZCOM_ID','RDEALER','GSPPART','NORDEXT','NDF_DATE','NDF_REF','BS','BS_O','BS_1','BS_2','CURR1','CURR2','AMT1','AMT2','CURR_ST1','ZAMT_ST1','CURR_ST2','ZAMT_ST2','OSPOT','OSWAP','OTOT_RATE','T_RATE','DCRDAT','CRUSER','TCRTIM','DUPDAT','UPUSER','TUPTIM']
    const missing = missingColumns(served, VIEW_REQUIRED_COLUMNS)
    deepStrictEqual(missing.slice(0, 4), ['PRCTR', 'PC_NAME', 'BLOTTER_DATE', 'TXN_STATUS'])
    const reason = worklistWaitingReason(served)
    strictEqual(reason.startsWith('WAITING FOR API — ZSGTSF_RNFX_DEALFLOW source not exported (only dependency notes)'), true)
    // TrmFxApp serves the VTBFHA append columns, so only what no service has is named.
    strictEqual(reason.includes('ZTSF_DEAL_ID'), false)
    strictEqual(reason.includes('TXN_STATUS'), false)
    strictEqual(reason.includes('PRCTR'), true)
    deepStrictEqual(unservedColumns(served, VIEW_REQUIRED_COLUMNS).slice(0, 4), ['PRCTR', 'PC_NAME', 'TRD_NAME', 'ZGRP'])
    strictEqual(worklistWaitingReason(VIEW_REQUIRED_COLUMNS).includes('does not serve'), false)
    strictEqual(worklistWaitingReason(null).includes('could not be read'), true)
  })
})

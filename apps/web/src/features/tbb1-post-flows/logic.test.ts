import { deepStrictEqual, match, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { flowFrom, flowTypeIndex, logLineFrom, mastersFrom, postingRunBody } from './api.ts'
import {
  defaultForm,
  dmyToIso,
  filterSortLog,
  isoToDmy,
  logFilterOptions,
  logKpis,
  nextSort,
  packageAvailable,
  pageOf,
  parseDMY,
  previewLines,
  selectDueFlows,
  validateForm,
} from './logic.ts'
import type { Flow, Form, Masters } from './types.ts'

/** The few matchers these tests use, over node:assert. */
function expect(actual: unknown) {
  return {
    toBe: (v: unknown) => strictEqual(actual, v),
    toEqual: (v: unknown) => deepStrictEqual(actual, v),
    toHaveLength: (n: number) => strictEqual((actual as unknown[]).length, n),
    toBeNull: () => strictEqual(actual, null),
    toBeTruthy: () => ok(actual),
    toMatch: (re: RegExp) => match(String(actual), re),
    toContain: (v: string) => ok(String(actual).includes(v)),
    toMatchObject: (v: Record<string, unknown>) => {
      for (const [k, x] of Object.entries(v)) deepStrictEqual((actual as Record<string, unknown>)[k], x, k)
    },
  }
}

const TODAY = new Date(2026, 9, 7)
const form = (over: Partial<Form> = {}): Form => ({ ...defaultForm(TODAY), ...over })
const flow = (over: Partial<Flow> = {}): Flow => ({
  bukrs: 'SG03',
  rfha: '0000000000020',
  rfhazu: '',
  flowType: '1100',
  contract: '4',
  flowClass: 'PAY',
  amount: 1000,
  currency: 'USD',
  sign: '+',
  dueDate: '2026-10-05',
  postingDate: '2026-10-05',
  postingStatus: '1',
  headerKnown: true,
  productType: '60A',
  transactionType: '101',
  partner: '400000002',
  portfolio: '',
  ...over,
})
const MASTERS: Masters = {
  companies: [{ v: 'SG03', t: 'SG03 · Olam' }],
  productTypes: [{ v: '60A', t: '60A · Forex', contract: '4' }],
  transactionTypes: [{ v: '101', t: '101 · Purchase', product: '60A' }],
  flowTypes: [{ v: '1100', t: '1100 · Payment', contract: '4', flowClass: 'PAY' }],
}

describe('dates', () => {
  it('parses DD-MM-YYYY and rejects impossible dates', () => {
    expect(parseDMY('07-10-2026')?.getDate()).toBe(7)
    expect(parseDMY('31-02-2026')).toBeNull()
    expect(dmyToIso('7.10.2026')).toBe('2026-10-07')
    expect(isoToDmy('2026-10-07')).toBe('07-10-2026')
  })
})

describe('selection screen', () => {
  it('defaults like RFTBBB00: all applications, due today, test run, operational only', () => {
    const f = defaultForm(TODAY)
    expect(Object.values(f.apps).every(Boolean)).toBe(true)
    expect(f.dzterm).toBe('07-10-2026')
    expect(f.test).toBe(true)
    expect(f.mode).toBe('opval')
    expect(f.psize).toBe('07')
  })
  it('offers packages only for a live run over all valuation areas', () => {
    expect(packageAvailable(form())).toBe(false)
    expect(packageAvailable(form({ test: false, mode: 'allval' }))).toBe(true)
  })
  it('validates the fields', () => {
    expect(validateForm(form())).toEqual({})
    const e = validateForm(form({ apps: { tx: false, tm: false, ti: false, ts: false, tf: false }, dzterm: '', monat: '17', rfhaFrom: '9', rfhaTo: '3', bldat: 'x' }))
    expect(Object.keys(e).sort()).toEqual(['apps', 'bldat', 'dzterm', 'monat', 'rfhaTo'])
    expect(validateForm(form({ mtA: true, mtNr: '0' })).mtNr).toBeTruthy()
  })
})

describe('selectDueFlows', () => {
  it('keeps released flows due up to the due date', () => {
    const flows = [flow(), flow({ postingStatus: '2' }), flow({ postingStatus: '0' }), flow({ dueDate: '2026-10-08' })]
    expect(selectDueFlows(flows, form()).flows).toHaveLength(1)
  })
  it('applies company, transaction range, currency, flow type, class and direction', () => {
    const f = flow()
    expect(selectDueFlows([f], form({ bukrs: ['SG01'] })).flows).toHaveLength(0)
    expect(selectDueFlows([f], form({ rfhaFrom: '21' })).flows).toHaveLength(0)
    expect(selectDueFlows([f], form({ rfhaFrom: '20', rfhaTo: '20' })).flows).toHaveLength(1)
    expect(selectDueFlows([f], form({ wzbetr: ['EUR'] })).flows).toHaveLength(0)
    expect(selectDueFlows([f], form({ fhazba: ['1200'] })).flows).toHaveLength(0)
    expect(selectDueFlows([f], form({ bkklas: ['PAY'] })).flows).toHaveLength(1)
    expect(selectDueFlows([f], form({ sign: '-' })).flows).toHaveLength(0)
  })
  it('filters by application through the flow type contract type, noting unknown ones', () => {
    const apps = { tx: false, tm: true, ti: true, ts: true, tf: true }
    const r = selectDueFlows([flow(), flow({ contract: '' }), flow({ contract: '5' })], form({ apps }))
    expect(r.flows.map((x) => x.contract)).toEqual(['5'])
    expect(r.notes.join(' ')).toMatch(/1 flow\(s\) left out: their flow type/)
  })
  it('checks header filters only where the header is known', () => {
    const r = selectDueFlows([flow(), flow({ headerKnown: false })], form({ sgsart: ['60A'] }))
    expect(r.flows).toHaveLength(1)
    expect(r.notes[0]).toMatch(/1 flow\(s\) left out/)
  })
  it('notes the release filter it cannot apply', () => {
    expect(selectDueFlows([flow()], form({ releas: true })).notes.join(' ')).toMatch(/Released Transactions Only/)
  })
})

describe('log', () => {
  const lines = [
    ...previewLines([flow(), flow({ bukrs: 'SG01', rfha: '7' })]),
    logLineFrom({ MessageType: 'E', CompanyCode: 'SG03', FinancialTransaction: '9', Message: 'Account missing', MessageClass: 'TPM_TRL', MessageNumber: '001' }, 3),
    logLineFrom({ MessageType: 'W', CompanyCode: 'SG03', FinancialTransaction: '9', FlowType: '1100', Message: 'Late' }, 4),
  ]
  it('previews a due flow as an information line', () => {
    expect(lines[0]).toMatchObject({ type: 'I', dzterm: '05-10-2026', hasFlow: true })
    expect(lines[0]!.text).toContain('1,000.00 USD')
  })
  it('counts KPIs and filter options', () => {
    expect(logKpis(lines)).toEqual({ deals: 3, flows: 3, warn: 1, err: 1 })
    expect(logFilterOptions(lines)).toEqual({ types: ['E', 'W', 'I'], companies: ['SG01', 'SG03'] })
  })
  it('searches by label and sorts with blanks last', () => {
    const base = { search: '', typeFilter: '', companyFilter: '', sort: { field: '' as const, dir: 'asc' as const } }
    expect(filterSortLog(MASTERS, lines, { ...base, search: 'forex' })).toHaveLength(2)
    expect(filterSortLog(MASTERS, lines, { ...base, typeFilter: 'E' })).toHaveLength(1)
    const sorted = filterSortLog(MASTERS, lines, { ...base, sort: { field: 'sfhazba', dir: 'desc' } })
    expect(sorted[sorted.length - 1]!.sfhazba).toBe('')
    expect(nextSort({ field: 'bukrs', dir: 'asc' }, 'bukrs')).toEqual({ field: 'bukrs', dir: 'desc' })
  })
  it('pages and clamps', () => {
    expect(pageOf([1, 2, 3], 9, 2)).toEqual({ rows: [3], page: 2, pageCount: 2 })
  })
})

describe('api mappings', () => {
  it('builds value helps and drops repeated flow types', () => {
    const m = mastersFrom(
      [{ CompanyCode: 'SG03', CompanyCodeName: 'Olam ' }],
      [{ ProductType: '60A', ProductTypeName: 'Forex', ContractType: '4' }],
      [{ ProductType: '60A', TransactionType: '101', TransactionTypeName: 'Purchase' }],
      [
        { ContractType: '4', FlowType: '1100', FlowTypeName: 'Payment', FlowClass: 'PAY' },
        { ContractType: '5', FlowType: '1100', FlowTypeName: 'Payment', FlowClass: 'PAY' },
      ],
    )
    expect(m.companies).toEqual([{ v: 'SG03', t: 'SG03 · Olam' }])
    expect(m.flowTypes).toHaveLength(1)
  })
  it('gives an ambiguous flow type no application', () => {
    const idx = flowTypeIndex([
      { ContractType: '4', FlowType: '1100', FlowClass: 'PAY' },
      { ContractType: '5', FlowType: '1100', FlowClass: 'PAY' },
      { ContractType: '4', FlowType: '1200', FlowClass: 'INT' },
    ])
    expect(idx.get('1100')!.contract).toBe('')
    expect(idx.get('1200')!.contract).toBe('4')
  })
  it('maps a VTBFHAPO row with its FX header', () => {
    const f = flowFrom(
      { BUKRS: 'SG03', RFHA: '0000000000020', SFHAZBA: '1200', BZBETR: '-12.5', WZBETR: 'USD', SSIGN: '-', DZTERM: '2026-10-05', DBUCHUNG: null, SBEWEBE: '1' },
      flowTypeIndex([{ ContractType: '4', FlowType: '1200', FlowClass: 'INT' }]),
      new Map([['SG03|20', { CompanyCode: 'SG03', FinancialTransaction: '20', ProductType: '60A', Partner: '400000002' }]]),
    )
    expect(f).toMatchObject({ contract: '4', flowClass: 'INT', amount: -12.5, sign: '-', headerKnown: true, productType: '60A', partner: '400000002', postingDate: '' })
  })
  it('sends the selection as the PostingRun body', () => {
    const b = postingRunBody(form({ bukrs: ['SG03', 'SG01'], dbuchu: '' }))
    expect(b).toMatchObject({ ForeignExchange: true, CompanyCodes: 'SG03,SG01', DueDateTo: '2026-10-07', PostingDateTo: null, TestRun: true, PostingScope: 'opval' })
  })
})

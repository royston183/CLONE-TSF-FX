import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BL_PAGE_SIZE,
  blAmount,
  blFromTradeFlow,
  blGradeCommodity,
  blPage,
  blTotals,
  dealAssignedTotals,
  isUnsavedBl,
  nextBlSplitId,
  planBlSave,
  withPendingDeals,
} from './bl.ts'

describe('blAmount', () => {
  it('uses the stored CPMT amount when there is one', () => {
    strictEqual(blAmount({ Zquantity: 10, Zcprice: 5, ZcpmAmt: 99 }), 99)
  })

  it('falls back to quantity x CPMT, the legacy formula, when none is stored', () => {
    strictEqual(blAmount({ Zquantity: 1250, Zcprice: 7425.5, ZcpmAmt: 0 }), 9281875)
    strictEqual(blAmount({ Zquantity: 800, Zcprice: 7440 }), 5952000)
  })

  it('is zero for a BL with no quantity or price', () => {
    strictEqual(blAmount({}), 0)
  })
})

describe('blTotals', () => {
  it('sums every BL, not just a page', () => {
    const rows = Array.from({ length: BL_PAGE_SIZE + 2 }, () => ({ Zquantity: 100, Zcprice: 2 }))
    deepStrictEqual(blTotals(rows), { quantity: 700, cpmt: 14, amount: 1400 })
  })
})

describe('dealAssignedTotals', () => {
  it('sums the assigned amount per Deal ID across every BL that carries one', () => {
    const rows = [
      { ZdealId: '12000027', Zquantity: 100, Zcprice: 2 },
      { ZdealId: '12000027', ZcpmAmt: 500 },
      { ZdealId: '12000028', ZcpmAmt: 100 },
    ]
    deepStrictEqual(dealAssignedTotals(rows), new Map([['12000027', 700], ['12000028', 100]]))
  })

  it('ignores a BL with no Deal ID assigned yet', () => {
    deepStrictEqual(dealAssignedTotals([{ ZdealId: '', ZcpmAmt: 500 }, {}]), new Map())
  })

  it('is empty for no rows', () => {
    deepStrictEqual(dealAssignedTotals([]), new Map())
  })
})

describe('blPage', () => {
  it('has one page even with no rows', () => {
    deepStrictEqual(blPage(0, 0), { page: 0, pageCount: 1 })
  })

  it('pages five rows at a time and clamps the requested page into range', () => {
    deepStrictEqual(blPage(11, 9), { page: 2, pageCount: 3 })
    deepStrictEqual(blPage(11, -1), { page: 0, pageCount: 3 })
  })
})

describe('blGradeCommodity', () => {
  it('prefers the grade, then the commodity the BL was created with', () => {
    strictEqual(blGradeCommodity({ Zgrade: 'Grade A', Zcmmd: 'Cocoa' }), 'Grade A')
    strictEqual(blGradeCommodity({ Zgrade: ' ', Zcmmd: 'Cocoa' }), 'Cocoa')
  })
})

describe('nextBlSplitId', () => {
  it('is 02 for a BL with no split yet', () => {
    strictEqual(nextBlSplitId([{ ZblNo: '100', ZblSplit: '01' }], '100'), '02')
  })

  it('continues the count after an earlier split', () => {
    const rows = [
      { ZblNo: '100', ZblSplit: '01' },
      { ZblNo: '100', ZblSplit: '02' },
    ]
    strictEqual(nextBlSplitId(rows, '100'), '03')
  })

  it('counts each BL ID independently', () => {
    const rows = [
      { ZblNo: '100', ZblSplit: '01' },
      { ZblNo: '100', ZblSplit: '02' },
      { ZblNo: '200', ZblSplit: '01' },
    ]
    strictEqual(nextBlSplitId(rows, '200'), '02')
  })
})

describe('planBlSave', () => {
  const existing = {
    Mandt: '100',
    ZtfNo: '3000000094',
    ZtfSplit: '01',
    ZblNo: '4000000074',
    ZblSplit: '01',
    ZblReuse: '',
    ZblVsslName: 'MV E2E',
    Zquantity: 600,
    Zcprice: 7168.25,
    ZcreatedBy: 'DEMO',
    ZblStatId: '01',
  }

  it('writes nothing when the grid is as it was read', () => {
    deepStrictEqual(planBlSave([existing], [{ ...existing }]), { updates: [], inserts: [] })
  })

  it('sends only the editable cells that changed on an existing BL', () => {
    const plan = planBlSave([existing], [{ ...existing, Zquantity: 400, ZblVsslName: 'MV E2E' }])
    deepStrictEqual(plan.updates, [
      {
        key: { ZtfNo: '3000000094', ZtfSplit: '01', ZblNo: '4000000074', ZblSplit: '01', ZblReuse: '' },
        changes: { Zquantity: 400 },
      },
    ])
  })

  it('inserts a split under its source BL ID and updates the quantity the source kept', () => {
    const plan = planBlSave(
      [existing],
      [{ ...existing, Zquantity: 400 }, { ...existing, ZblSplit: '02', Zquantity: 200, localId: 'split-1' }],
    )
    strictEqual(plan.updates[0]?.changes['Zquantity'], 400)
    strictEqual(plan.inserts.length, 1)
    strictEqual(plan.inserts[0]?.allocate, false)
    strictEqual(plan.inserts[0]?.row['ZblNo'], '4000000074')
    strictEqual(plan.inserts[0]?.row['ZblSplit'], '02')
    strictEqual(plan.inserts[0]?.localId, 'split-1')
  })

  it('leaves a created BL without an ID, for the SNRO range to issue, and never sends the client or audit stamps', () => {
    const plan = planBlSave([existing], [existing, { ...existing, ZblNo: '', Zquantity: 300, localId: 'new-1' }])
    const insert = plan.inserts[0]!
    strictEqual(insert.allocate, true)
    strictEqual(insert.row['ZblNo'], '')
    strictEqual('Mandt' in insert.row, false)
    strictEqual('ZcreatedBy' in insert.row, false)
    strictEqual('localId' in insert.row, false)
    strictEqual(insert.row['ZtfNo'], '3000000094')
    // Carried as a sibling of `row`, not inside its payload — the success popup after a Deal ID
    // assignment matches an issued BL number back to this row by it (see saveBlChanges).
    strictEqual(insert.localId, 'new-1')
  })
})

describe('withPendingDeals', () => {
  const created = { ZblNo: '', Zquantity: 300, ZdealId: '', ZblStatId: '01', localId: 'new-1' }
  const stored = { ZblNo: '4000000074', ZblSplit: '01', Zquantity: 400, ZdealId: '', ZblStatId: '01' }

  it('puts the Deal ID and the assigned status on a Create BL row, for its insert', () => {
    const [row] = withPendingDeals([created], new Map([['new-1', '12000027']]), '02')
    strictEqual(row?.ZdealId, '12000027')
    strictEqual(row?.ZblStatId, '02')
  })

  it('carries the popup\'s entered Invoice Details into that insert, and no blank one', () => {
    const details = { ZsoDate: '2026-10-01', ZinvDate: '2026-10-05', ZinvComm: 'RICE', Zinco: 'CIF', ZexcNotes: '', ZtrmComId: '' }
    const [row] = withPendingDeals([created], new Map([['new-1', '12000027']]), '02', details) as Array<Record<string, unknown>>
    strictEqual(row?.['ZsoDate'], '2026-10-01')
    strictEqual(row?.['ZinvDate'], '2026-10-05')
    strictEqual(row?.['ZinvComm'], 'RICE')
    strictEqual(row?.['Zinco'], 'CIF')
    strictEqual('ZexcNotes' in (row ?? {}), false)
    strictEqual('ZtrmComId' in (row ?? {}), false)
  })

  it('leaves a stored row alone — its assignment is an update by key', () => {
    const id = '4000000074-01-'
    deepStrictEqual(withPendingDeals([stored], new Map([[id, '12000027']]), '02'), [stored])
  })

  it('keeps a Create BL row with no Deal ID, so its insert still draws a BL ID', () => {
    const plan = planBlSave([], withPendingDeals([created], new Map(), '02'))
    strictEqual(plan.inserts.length, 1)
    strictEqual(plan.inserts[0]?.allocate, true)
    strictEqual(plan.inserts[0]?.row['ZblNo'], '')
  })

  it('sends the assigned Deal ID in the insert payload', () => {
    const plan = planBlSave([], withPendingDeals([created], new Map([['new-1', '12000027']]), '02'))
    strictEqual(plan.inserts[0]?.row['ZdealId'], '12000027')
    strictEqual(plan.inserts[0]?.row['ZblStatId'], '02')
  })
})

describe('isUnsavedBl', () => {
  it('is true for Create BL and BL Split rows only', () => {
    strictEqual(isUnsavedBl('new-3'), true)
    strictEqual(isUnsavedBl('split-1'), true)
    strictEqual(isUnsavedBl('4000000074-01-'), false)
  })
})

describe('blFromTradeFlow', () => {
  it('builds a new BL from the trade flow the way the upload does', () => {
    const row = blFromTradeFlow(
      {
        Mandt: '100',
        ZtfNo: '3000000110',
        ZtfSplit: '01',
        ZblVsslName: 'MV SAVANNAH CREST V.2717',
        Zcprice: '268.35',
        Zcmmd: 'ARGENTINA GRAIN SORGHUM',
        Zsldate: '2027-05-23',
        ZcreatedBy: 'DEMO',
        ZetaDsPort: null,
      },
      { ZtfNo: '3000000110', ZtfSplit: '01' },
    )
    strictEqual(row.ZblVsslName, 'MV SAVANNAH CREST V.2717')
    strictEqual(row.Zcprice, '268.35')
    strictEqual(row.ZblNo, '')
    strictEqual(row.ZblSplit, '01')
    strictEqual(row.ZblStatId, '01')
    strictEqual(row.ZblDate, '2027-05-23')
    strictEqual('Mandt' in row, false)
    strictEqual('ZcreatedBy' in row, false)
    strictEqual('ZetaDsPort' in row, false)
  })
})

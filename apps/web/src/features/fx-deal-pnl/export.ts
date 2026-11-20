import type { DealPnl, DealSummary, PlannedCalc, SettlementCalc } from './types.ts'

/** Excel exports. The workbook library is loaded only when someone exports. */

type Cell = string | number | null
type Sheet = { name: string; rows: Cell[][] }

async function save(file: string, sheets: Sheet[]): Promise<void> {
  const xlsx = await import('xlsx')
  const book = xlsx.utils.book_new()
  for (const sheet of sheets) xlsx.utils.book_append_sheet(book, xlsx.utils.aoa_to_sheet(sheet.rows), sheet.name.slice(0, 31))
  xlsx.writeFile(book, file)
}

export function exportPortfolio(rows: DealSummary[]): Promise<void> {
  return save('fx-deal-pnl-portfolio.xlsx', [{
    name: 'Deal P&L (USD)',
    rows: [
      ['Deal ID', 'FX model', 'Description', 'Type', 'Entities', 'Pair', 'Trade date', 'Maturity date', 'Status', 'Planned P&L (USD)', 'Settlement P&L (USD)', 'Actual P&L (USD)', 'Net P&L (USD)', 'Net basis'],
      ...rows.map((r): Cell[] => [r.id, r.model, r.description, r.type, r.entities.join(', '), r.pair, r.tradeDate, r.maturityDate, r.status, r.plannedUsd, r.settlementUsd, r.actualUsd, r.netUsd, r.basis]),
    ],
  }])
}

export function exportDeal(pnl: DealPnl, planned?: PlannedCalc, settlement?: SettlementCalc): Promise<void> {
  const sheets: Sheet[] = [{
    name: 'Entity P&L',
    rows: [
      ['Entity', 'Company', 'Currency', 'Rate per USD', 'Planned P&L', 'Planned P&L (USD)', 'Settlement P&L', 'Actual P&L (USD)', 'Net P&L (USD)'],
      ...pnl.entities.map((e): Cell[] => [e.entity, e.company, e.ccy, e.rate, e.planned, e.plannedUsd, e.settlement, e.actualUsd, e.netUsd]),
      ['Consolidated net P&L (USD)', null, null, null, null, null, null, null, pnl.consolidatedNetUsd],
    ],
  }]
  if (planned) {
    sheets.push({
      name: 'Planned P&L',
      rows: [
        ['Leg', 'Transaction', 'Type', 'Entity', 'Direction', 'USD', planned.localCcy, 'Rate', 'Trade date', 'Maturity date'],
        ...planned.legs.map((l): Cell[] => [l.ref, l.label, l.type, l.entity, l.direction, l.usd, l.local, l.rate, l.tradeDate, l.maturityDate]),
        [],
        [`Received (${planned.localCcy})`, planned.receivedLocal],
        [`Paid (${planned.localCcy})`, planned.paidLocal],
        [`Arbitrage (${planned.localCcy})`, planned.arbitrageLocal],
        ['Reporting rate', planned.reportingRate],
        ['Arbitrage (USD)', planned.arbitrageUsd],
      ],
    })
  }
  if (settlement) {
    sheets.push({
      name: 'Maturity',
      rows: [
        ['Leg', 'Transaction', 'Entity', 'USD', settlement.localCcy, 'Fixing rate', 'Realised G/L (USD)', 'Date'],
        ...settlement.maturity.map((m): Cell[] => [m.legRef, m.label, m.entity, m.usd, m.local, m.fixingRate, m.realised, m.date]),
        ['Total realised G/L (USD)', null, null, null, null, null, settlement.realisedTotal],
      ],
    }, {
      name: 'Settlement (20)',
      rows: [
        ['Entity', 'Company', 'Currency', 'Pay', 'Receive', 'Net', 'Net (USD)'],
        ...settlement.flows.map((f): Cell[] => [f.entity, f.company, f.ccy, f.pay, f.receive, f.net, f.netUsd]),
      ],
    })
  }
  return save(`fx-deal-pnl-${pnl.dealId}.xlsx`, sheets)
}


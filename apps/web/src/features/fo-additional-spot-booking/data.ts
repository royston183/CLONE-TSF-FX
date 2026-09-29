/**
 * Seed data, verbatim from the legacy page's makeData() and its option lists. The page never
 * called an API — no fetch, no XMLHttpRequest — so this is the only source of rows; SAP OData
 * wiring (the FX deal / DSS deal tables ZSGTSFR094 reads, and the spot-booking write) is a
 * follow-up once those entities are defined, same as sblc-allocate-bank and fx-blotter.
 */
import { addDays, formatDate } from './format.ts'
import type { CodeLabel, SpotRow } from './types.ts'

export const COMPANY_OPTIONS: CodeLabel[] = [
  { key: 'AE13', text: 'Olam International DMCC' },
  { key: 'AE11', text: 'Olam Treasury Services DMCC' },
  { key: 'SG03', text: 'Olam International Limited' },
  { key: 'IN11', text: 'Olam Agri India Pvt Ltd' },
  { key: 'ES12', text: 'SEDA OUTSPAN IBERIA S.L.U' },
]

export const PARTNER_OPTIONS: CodeLabel[] = [
  { key: '0000000003', text: 'BARCLAYS BANK PLC' },
  { key: '0660000680', text: 'STANDARD CHARTERED BANK SINGAPORE' },
  { key: '0660000645', text: 'DBS BANK LTD' },
  { key: '0660000807', text: 'HSBC SINGAPORE' },
  { key: '0660000810', text: 'STANDARD CHARTERED BANK SINGAPORE' },
]

export const TXN_TYPE_OPTIONS: CodeLabel[] = [
  { key: '300', text: 'FX Spot Settlement' },
  { key: '301', text: 'FX Spot - External' },
  { key: '302', text: 'FX Spot - Intercompany' },
]

export const findCompanyName = (code: string): string => COMPANY_OPTIONS.find((c) => c.key === code)?.text ?? code

/** The next spot transaction number a Create hands out, same starting point as the legacy page. */
export const FIRST_SPOT_NUMBER = 61002001

const CURRENCIES = ['USD', 'EUR', 'GBP', 'USD', 'USD']
const OTHER_CURRENCIES = ['INR', 'USD', 'USD', 'AED', 'SGD']
const DEAL_TYPES = ['FX01', 'FX02', 'FX03']
const DSS_TYPES = ['DSS1', 'DSS2']
const TRADE_TYPES = ['FWD', 'NDF', 'SWAP', 'HEDGE']
const GROUPS = ['G01', 'G02', 'G03']
const TSF_ENTITIES = ['OGA', 'DMCC', 'PAN', 'OSIPL', 'SEDA']
const CREATORS = ['FSL071', 'FSL089', 'FSL044']

/** 29 rows spanning New Spot and Spot Created, one with a zero difference amount (row 12). */
export function makeData(): SpotRow[] {
  const rows: SpotRow[] = []
  for (let i = 0; i < 29; i++) {
    const created = i % 5 === 1 || i % 7 === 0
    const company = COMPANY_OPTIONS[i % COMPANY_OPTIONS.length]!
    const partner = PARTNER_OPTIONS[i % PARTNER_OPTIONS.length]!
    const amount = 850000 + i * 175000
    let diff = (i % 2 === 0 ? 1 : -1) * (65000 + i * 9750)
    if (i === 11) diff = 0
    const value = new Date(2026 + Math.floor(i / 13), (8 + i) % 12, 7 + (i % 18))
    const trade = addDays(value, -2)

    rows.push({
      id: `row-${i + 1}`,
      modelId: `M${String((i % 8) + 1).padStart(2, '0')}-TSF`,
      dealId: String(700120 - i),
      dealType: DEAL_TYPES[i % DEAL_TYPES.length]!,
      dssType: DSS_TYPES[i % DSS_TYPES.length]!,
      companyCode: company.key,
      companyName: company.text,
      originalTxn: String(5003100 + i),
      tradeType: TRADE_TYPES[i % TRADE_TYPES.length]!,
      finalAmt: amount + diff,
      fxDealAmt: amount,
      currency: CURRENCIES[i % CURRENCIES.length]!,
      otherCurrency: OTHER_CURRENCIES[i % OTHER_CURRENCIES.length]!,
      diffAmt: diff,
      spotTxn: created ? String(6100100 + i) : '',
      tradeDate: formatDate(trade),
      valueDate: formatDate(value),
      partner: partner.key,
      partnerName: partner.text,
      group: GROUPS[i % GROUPS.length]!,
      side: i % 3 === 0 ? 'Sell' : 'Buy',
      tsfEntity: TSF_ENTITIES[i % TSF_ENTITIES.length]!,
      createdBy: created ? CREATORS[i % CREATORS.length]! : '',
      createdDate: created ? formatDate(addDays(trade, 1)) : '',
      defaultTxnType: '300',
    })
  }
  return rows
}

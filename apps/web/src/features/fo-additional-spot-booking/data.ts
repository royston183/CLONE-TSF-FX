/**
 * Seed data, verbatim from the legacy page's makeData() and its option lists. The page never
 * called an API — no fetch, no XMLHttpRequest — so this is still the only source of rows; the
 * FX deal / DSS deal tables ZSGTSFR094 reads have no OData entity yet. The spot-booking write
 * itself goes to SAP (api.ts).
 */
import { addDays, formatDate } from './format.ts'
import type { CodeLabel, SpotRow } from './types.ts'

/** The legacy page's company list — still the source of the seed rows' company code and name. */
const LEGACY_COMPANIES: CodeLabel[] = [
  { key: 'AE13', text: 'Olam International DMCC' },
  { key: 'AE11', text: 'Olam Treasury Services DMCC' },
  { key: 'SG03', text: 'Olam International Limited' },
  { key: 'IN11', text: 'Olam Agri India Pvt Ltd' },
  { key: 'ES12', text: 'SEDA OUTSPAN IBERIA S.L.U' },
]

const LEGACY_PARTNERS: CodeLabel[] = [
  { key: '0000000003', text: 'BARCLAYS BANK PLC' },
  { key: '0660000680', text: 'STANDARD CHARTERED BANK SINGAPORE' },
  { key: '0660000645', text: 'DBS BANK LTD' },
  { key: '0660000807', text: 'HSBC SINGAPORE' },
  { key: '0660000810', text: 'STANDARD CHARTERED BANK SINGAPORE' },
]

/** FTR 12A 600 "Spot": the type a new row opens with. The Create Spot list itself is read from SAP (valueHelps.ts). */
export const DEFAULT_TXN_TYPE = '600'

/** A company code's name: from SAP's list when it is loaded, else the seed rows' own names. */
export const findCompanyName = (code: string, sap: readonly CodeLabel[] = []): string =>
  [...sap, ...LEGACY_COMPANIES].find((c) => c.key === code)?.text ?? code

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
    const company = LEGACY_COMPANIES[i % LEGACY_COMPANIES.length]!
    const partner = LEGACY_PARTNERS[i % LEGACY_PARTNERS.length]!
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
      defaultTxnType: DEFAULT_TXN_TYPE,
    })
  }
  return rows
}

/*
 * TEST FIXTURES ONLY (imported by logic.test.ts, never by the screen). The former UI-only demo
 * deals and masters of ZSGTSFR104, kept so the pure rules stay covered. The screen reads SAP:
 * see api.ts.
 */
import type { Deal, HouseBanks } from './types.ts'

export const COMPANIES: Record<string, string> = {
  OIL1: 'Olam International Ltd',
  DMCC: 'Olam DMCC',
  OAIP: 'Olam Agro India Pvt Ltd',
}

/** The Company Code chips, in display order (the All chip is added by the page). */
export const COMPANY_CODES = ['OIL1', 'DMCC', 'OAIP'] as const

export const HOUSE_BANKS: HouseBanks = {
  OIL1: [
    {
      id: 'CITISG',
      name: 'Citibank Singapore',
      accounts: [
        { id: 'USD01', curr: 'USD', label: 'USD01 - USD Current A/c' },
        { id: 'EUR01', curr: 'EUR', label: 'EUR01 - EUR Current A/c' },
      ],
    },
    {
      id: 'SCBSG',
      name: 'Standard Chartered SG',
      accounts: [
        { id: 'USD02', curr: 'USD', label: 'USD02 - USD Collection A/c' },
        { id: 'GBP01', curr: 'GBP', label: 'GBP01 - GBP Current A/c' },
      ],
    },
  ],
  DMCC: [
    {
      id: 'MASHQ',
      name: 'Mashreq Bank DMCC',
      accounts: [
        { id: 'USD11', curr: 'USD', label: 'USD11 - USD Settlement A/c' },
        { id: 'AED01', curr: 'AED', label: 'AED01 - AED Current A/c' },
      ],
    },
    {
      id: 'ENBD',
      name: 'Emirates NBD',
      accounts: [
        { id: 'USD12', curr: 'USD', label: 'USD12 - USD Current A/c' },
        { id: 'IDR01', curr: 'IDR', label: 'IDR01 - IDR Nostro A/c' },
      ],
    },
  ],
  OAIP: [
    {
      id: 'HDFC',
      name: 'HDFC Bank India',
      accounts: [
        { id: 'INR21', curr: 'INR', label: 'INR21 - INR Current A/c' },
        { id: 'USD21', curr: 'USD', label: 'USD21 - USD EEFC A/c' },
      ],
    },
    {
      id: 'ICICI',
      name: 'ICICI Bank',
      accounts: [
        { id: 'INR22', curr: 'INR', label: 'INR22 - INR Current A/c' },
        { id: 'MYR01', curr: 'MYR', label: 'MYR01 - MYR Current A/c' },
      ],
    },
  ],
}

export const TRANSFER_TYPES: Record<string, string> = {
  USD: 'T1-SWIFT',
  EUR: 'T1-SWIFT',
  INR: 'T2-NEFT',
  AED: 'T3-WTRF',
  IDR: 'T1-SWIFT',
  MYR: 'T1-SWIFT',
  GBP: 'T1-SWIFT',
}

type DealDefaults = Pick<
  Deal,
  | 'bankStatus'
  | 'hb1'
  | 'acc1'
  | 'hb2'
  | 'acc2'
  | 'fiDoc'
  | 'doc1'
  | 'doc2'
  | 'status'
  | 'foRemark'
  | 'moRemark'
  | 'internalRef'
  | 'assignment'
  | 'ndfDate'
  | 'ndfRef'
  | 'ndfRate'
>
type DealSeed = Omit<Deal, keyof DealDefaults> & Partial<DealDefaults>

function mkDeal(o: DealSeed): Deal {
  const defaults: DealDefaults = {
    bankStatus: 'NOT_ASSIGNED',
    hb1: null,
    acc1: null,
    hb2: null,
    acc2: null,
    fiDoc: null,
    doc1: null,
    doc2: null,
    status: 'Unmatured',
    foRemark: '',
    moRemark: '',
    internalRef: '',
    assignment: '',
    ndfDate: null,
    ndfRef: null,
    ndfRate: null,
  }
  return { ...defaults, ...o }
}

export function seedDeals(): Deal[] {
  return [
    mkDeal({
      dealId: 'TSF-20261001', dealDesc: 'INR Long Forward - Soybean Oil', mcRef: '2000002729', rfha: '5001234501',
      bukrs: 'OIL1', counterparty: 'Olam DMCC', trader: 'R. Shetty', valueDate: '2026-10-15', blotterDate: '2026-09-18',
      ccyPair: 'USD/INR', bs1: 'BUY', amt1: 5000000, curr1: 'USD', bs2: 'SELL', amt2: 415000000, curr2: 'INR',
      settleCurr: 'USD', settleAmt: 5000000, overallRate: 83.0, profitCtr: 'PC-TSF-01', businessArea: 'TSF',
      internalRef: 'MC-7001/T1', assignment: 'Trade Invoice T1',
    }),
    mkDeal({
      dealId: 'TSF-20261002', dealDesc: 'INR Long Forward - Soybean Oil', mcRef: '2000002730', rfha: '5001234502',
      bukrs: 'DMCC', counterparty: 'Olam Agro India Pvt Ltd', trader: 'A. Mehta', valueDate: '2026-10-20', blotterDate: '2026-09-19',
      ccyPair: 'USD/INR', bs1: 'SELL', amt1: 5000000, curr1: 'USD', bs2: 'BUY', amt2: 415200000, curr2: 'INR',
      settleCurr: 'USD', settleAmt: 5000000, overallRate: 83.04, profitCtr: 'PC-TSF-02', businessArea: 'TSF',
      bankStatus: 'ASSIGNED', hb1: 'MASHQ', acc1: 'USD11', hb2: 'MASHQ', acc2: 'USD11',
      internalRef: 'MC-7001/T2', assignment: 'Trade Invoice T2',
    }),
    mkDeal({
      dealId: 'TSF-20261003', dealDesc: 'INR Long Forward - Soybean Oil', mcRef: '2000002731', rfha: '5001234503',
      bukrs: 'OAIP', counterparty: 'Olam DMCC', trader: 'S. Rao', valueDate: '2026-09-25', blotterDate: '2026-08-30',
      ccyPair: 'USD/INR', bs1: 'BUY', amt1: 5000000, curr1: 'USD', bs2: 'SELL', amt2: 415100000, curr2: 'INR',
      settleCurr: 'USD', settleAmt: 5000000, overallRate: 83.02, profitCtr: 'PC-TSF-03', businessArea: 'TSF',
      bankStatus: 'ASSIGNED', hb1: 'HDFC', acc1: 'USD21', hb2: 'HDFC', acc2: 'USD21',
      status: 'Settled', fiDoc: '1900000456', doc1: '1900000456', doc2: '1900000457',
      internalRef: 'MC-7001/T3', assignment: 'Trade Invoice T3',
    }),
    mkDeal({
      dealId: 'TSF-20261004', dealDesc: 'EUR Short Forward - Rubber', mcRef: '2000002732', rfha: '5001234504',
      bukrs: 'OIL1', counterparty: 'Olam Agro India Pvt Ltd', trader: 'R. Shetty', valueDate: '2026-11-05', blotterDate: '2026-09-21',
      ccyPair: 'EUR/USD', bs1: 'SELL', amt1: 2000000, curr1: 'EUR', bs2: 'BUY', amt2: 2150000, curr2: 'USD',
      settleCurr: 'EUR', settleAmt: 2000000, overallRate: 1.075, profitCtr: 'PC-TSF-04', businessArea: 'TSF',
    }),
    mkDeal({
      dealId: 'TSF-20261005', dealDesc: 'IDR NDF - Palm Oil', mcRef: '2000002733', rfha: '5001234505',
      bukrs: 'DMCC', counterparty: 'Olam International Ltd', trader: 'A. Mehta', valueDate: '2026-10-10', blotterDate: '2026-09-15',
      ccyPair: 'USD/IDR', bs1: 'BUY', amt1: 3000000, curr1: 'USD', bs2: 'SELL', amt2: 46650000000, curr2: 'IDR',
      settleCurr: 'USD', settleAmt: 3000000, overallRate: 15550.0, profitCtr: 'PC-TSF-05', businessArea: 'TSF',
      bankStatus: 'ASSIGNED', hb1: 'ENBD', acc1: 'USD12', hb2: 'ENBD', acc2: 'USD12',
      ndfDate: '2026-10-08', ndfRef: 'NDF-REUT-IDR-001', ndfRate: 15542.5,
    }),
    mkDeal({
      dealId: 'TSF-20261006', dealDesc: 'INR Staggered Call & Put Option', mcRef: '2000002719', rfha: '5001234506',
      bukrs: 'OAIP', counterparty: 'Olam DMCC', trader: 'S. Rao', valueDate: '2026-09-30', blotterDate: '2026-09-02',
      ccyPair: 'USD/INR', bs1: 'BUY', amt1: 1800000, curr1: 'USD', bs2: 'SELL', amt2: 149400000, curr2: 'INR',
      settleCurr: 'USD', settleAmt: 1800000, overallRate: 83.0, profitCtr: 'PC-TSF-06', businessArea: 'TSF',
      bankStatus: 'ASSIGNED', hb1: 'ICICI', acc1: 'INR22', hb2: 'ICICI', acc2: 'INR22', status: 'Matured',
    }),
    mkDeal({
      dealId: 'TSF-20261007', dealDesc: 'MYR Long Forward - Rice', mcRef: '2000002734', rfha: '5001234507',
      bukrs: 'OIL1', counterparty: 'Olam Agro India Pvt Ltd', trader: 'R. Shetty', valueDate: '2026-12-01', blotterDate: '2026-09-22',
      ccyPair: 'USD/MYR', bs1: 'BUY', amt1: 1200000, curr1: 'USD', bs2: 'SELL', amt2: 5280000, curr2: 'MYR',
      settleCurr: 'USD', settleAmt: 1200000, overallRate: 4.4, profitCtr: 'PC-TSF-07', businessArea: 'TSF',
    }),
    mkDeal({
      dealId: 'TSF-20261008', dealDesc: 'USD-INR Forward - Cotton', mcRef: '2000002708', rfha: '5001234508',
      bukrs: 'DMCC', counterparty: 'Olam International Ltd', trader: 'A. Mehta', valueDate: '2026-09-22', blotterDate: '2026-08-28',
      ccyPair: 'USD/INR', bs1: 'SELL', amt1: 4200000, curr1: 'USD', bs2: 'BUY', amt2: 348600000, curr2: 'INR',
      settleCurr: 'USD', settleAmt: 4200000, overallRate: 83.0, profitCtr: 'PC-TSF-08', businessArea: 'TSF',
      bankStatus: 'ASSIGNED', hb1: 'MASHQ', acc1: 'USD11', hb2: 'MASHQ', acc2: 'USD11',
      status: 'Settled', fiDoc: '1900000398', doc1: '1900000398', doc2: '1900000399',
    }),
    mkDeal({
      dealId: 'TSF-20261009', dealDesc: 'INR Long Forward - Maize', mcRef: '2000002716', rfha: '5001234509',
      bukrs: 'OAIP', counterparty: 'Olam DMCC', trader: 'S. Rao', valueDate: '2026-10-28', blotterDate: '2026-09-24',
      ccyPair: 'USD/INR', bs1: 'BUY', amt1: 2600000, curr1: 'USD', bs2: 'SELL', amt2: 215800000, curr2: 'INR',
      settleCurr: 'USD', settleAmt: 2600000, overallRate: 83.0, profitCtr: 'PC-TSF-09', businessArea: 'TSF',
      bankStatus: 'ASSIGNED', hb1: 'HDFC', acc1: 'USD21', hb2: 'HDFC', acc2: 'USD21',
    }),
    mkDeal({
      dealId: 'TSF-20261010', dealDesc: 'GBP Short Forward - Wheat', mcRef: '2000002712', rfha: '5001234510',
      bukrs: 'OIL1', counterparty: 'Olam DMCC', trader: 'R. Shetty', valueDate: '2026-11-15', blotterDate: '2026-09-25',
      ccyPair: 'GBP/USD', bs1: 'SELL', amt1: 900000, curr1: 'GBP', bs2: 'BUY', amt2: 1134000, curr2: 'USD',
      settleCurr: 'GBP', settleAmt: 900000, overallRate: 1.26, profitCtr: 'PC-TSF-10', businessArea: 'TSF',
    }),
  ]
}

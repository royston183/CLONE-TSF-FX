/**
 * Dummy data, verbatim from the legacy page's DUMMY DATA block. The original never called an
 * API: every list here stands in for the ZSGTSF deal tables, the invoice plan and the F4 help
 * behind ZSGTSFP017. The screen mutates deals (status changes, rates, deal pairs), so the
 * database is an initial-state factory rather than a shared constant.
 */
import { round2 } from './format.ts'
import type { BadgeMeta, DealDb, DealStatus, DmsDoc, Leg, LegInput, ReplacementTxn, TxnStatus } from './types.ts'

export const STATUS_META: Record<DealStatus, BadgeMeta> = {
  '01': { text: 'Pending Confirmation', badge: 'badge-amber' },
  '02': { text: 'MO Confirmed', badge: 'badge-green' },
  '03': { text: 'Confirmed (Amended)', badge: 'badge-blue' },
  '30': { text: 'Deassigned', badge: 'badge-gray' },
  '50': { text: 'SS Deallocated', badge: 'badge-gray' },
}

export const TXN_STATUS_META: Record<TxnStatus, BadgeMeta> = {
  '03': { text: 'Awaiting Settlement', badge: 'badge-amber' },
  '07': { text: 'Settlement Ready', badge: 'badge-green' },
}

/** The original's leg(): stamps the total P&L onto a leg. */
export function leg(o: LegInput): Leg {
  return { ...o, totPl: round2(o.fxPl + o.setPl) }
}

export function makeDealDb(): DealDb {
  return {
    '5000010234': {
      dealId: '5000010234', dealRef: 'OSIPL-RICE-FWD-0234',
      startDate: '01-09-2026', endDate: '31-01-2027',
      mcRefNo: '2000002728', mcDesc: 'OSIPL_RICE_M032_0.1M', mcDate: '22-08-2026',
      shipStart: '22-08-2026', shipEnd: '06-10-2026',
      fxModel: 'M032', fxModelDesc: 'INR Long Forward',
      entityString: 'OGA-DMCC-OSIPL', fxInvModel: 'INV01',
      traderCode: 'OTL', traderDesc: 'Olam (Thailand) Ltd — Trading Desk',
      currString: 'USD-USD-INR',
      status: '01', noInvoiceModel: false, isSS: false, reversalAuthorized: false,
      legs: [
        leg({ rfha: '5000456781', dealType: 'D1', bpName: 'Standard Chartered Bank Singapore', instrument: 'Forward',
          tradeDate: '22-08-2026', valueDate: '22-08-2027',
          bs1: 'S', curr1: 'USD', amt1: 100000.0, bs2: 'B', curr2: 'INR', amt2: 9000000000.0,
          allInRate: 90.0, strike: 0, mcRef: '2000002728', txnStatus: '03',
          fxPl: 0, setPl: 0, premAmt: 0, premCurr: 'USD', pInr: 0 }),
      ],
      invoices: [
        { ttype: '01', dtype: 'D1', buy: 'INR', sell: 'USD', currency: 'USD', exRate: 90.0, invAmt: 100000.0, invAmtUsd: 100000.0, trmRef: '5000456781-INV1', mcRef: '2000002728' },
      ],
    },

    '5000010235': {
      dealId: '5000010235', dealRef: 'OGA-DMCC-CORN-0235',
      startDate: '19-09-2026', endDate: '14-10-2026',
      mcRefNo: '2000002722', mcDesc: 'OSIPL_Multi-Commodity_M036_0.022889M', mcDate: '21-09-2026',
      shipStart: '19-09-2026', shipEnd: '14-10-2026',
      fxModel: 'M036', fxModelDesc: 'USD-INR-Put & Call Option',
      entityString: 'OGA-DMCC-OSIPL', fxInvModel: 'INV02',
      traderCode: 'OGA', traderDesc: 'Olam Global Agri — FX Desk',
      currString: 'USD-INR',
      status: '02', noInvoiceModel: false, isSS: false, reversalAuthorized: true,
      legs: [
        leg({ rfha: '5000456790', dealType: 'D1', bpName: 'HSBC Singapore', instrument: 'Call Option',
          tradeDate: '21-09-2026', valueDate: '06-10-2026',
          bs1: 'B', curr1: 'USD', amt1: 22889.0, bs2: 'S', curr2: 'INR', amt2: 2059001.0,
          allInRate: 0, strike: 89.95, mcRef: '2000002722', txnStatus: '07',
          fxPl: 412.5, setPl: 118.2, premAmt: 640.0, premCurr: 'USD', pInr: 57610.0 }),
        leg({ rfha: '5000456791', dealType: 'D2', bpName: 'HSBC Singapore', instrument: 'Put Option',
          tradeDate: '21-09-2026', valueDate: '06-10-2026',
          bs1: 'S', curr1: 'USD', amt1: 22889.0, bs2: 'B', curr2: 'INR', amt2: 2061410.0,
          allInRate: 0, strike: 90.05, mcRef: '2000002722', txnStatus: '07',
          fxPl: -186.4, setPl: 44.1, premAmt: -410.0, premCurr: 'USD', pInr: -36950.0 }),
      ],
      invoices: [
        { ttype: '01', dtype: 'D1', buy: 'USD', sell: 'INR', currency: 'INR', exRate: 89.95, invAmt: 2059001.0, invAmtUsd: 22889.0, trmRef: '5000456790-INV1', mcRef: '2000002722' },
        { ttype: '02', dtype: 'D2', buy: 'INR', sell: 'USD', currency: 'INR', exRate: 90.05, invAmt: 2061410.0, invAmtUsd: 22889.0, trmRef: '5000456791-INV1', mcRef: '2000002722' },
      ],
    },

    '5000010236': {
      dealId: '5000010236', dealRef: 'OGA-DMCC-WHEAT-0236',
      startDate: '19-09-2026', endDate: '14-10-2026',
      mcRefNo: '2000002714', mcDesc: 'OSIPL_Multi-Commodity_M041_0.02502M', mcDate: '19-09-2026',
      shipStart: '19-09-2026', shipEnd: '14-10-2026',
      fxModel: 'M041', fxModelDesc: 'INR – INR Staggered Call & Put Option',
      entityString: 'OGA-DMCC-OSIPL', fxInvModel: 'INV02',
      traderCode: 'OGA', traderDesc: 'Olam Global Agri — FX Desk',
      currString: 'INR-INR-INR',
      status: '03', noInvoiceModel: false, isSS: false, reversalAuthorized: true,
      legs: [
        leg({ rfha: '5000456812', dealType: 'D1', bpName: 'Deutsche Bank', instrument: 'Call Option',
          tradeDate: '19-09-2026', valueDate: '14-10-2026',
          bs1: 'B', curr1: 'INR', amt1: 2521000.0, bs2: 'S', curr2: 'INR', amt2: 2500000.0,
          allInRate: 0, strike: 90.9, mcRef: '2000002714', txnStatus: '07',
          fxPl: 210.1, setPl: -40.0, premAmt: 320.0, premCurr: 'USD', pInr: 29040.0 }),
      ],
      invoices: [
        { ttype: '01', dtype: 'D1', buy: 'INR', sell: 'INR', currency: 'INR', exRate: 90.9, invAmt: 2521000.0, invAmtUsd: 27735.42, trmRef: '5000456812-INV1', mcRef: '2000002714' },
      ],
    },

    '5000010237': {
      dealId: '5000010237', dealRef: 'OSIPL-SOYOIL-SS-0237',
      startDate: '01-09-2026', endDate: '18-09-2027',
      mcRefNo: '2000002691', mcDesc: 'OSIPL_Multi-Commodity_M035_0.5M', mcDate: '15-09-2026',
      shipStart: '01-01-2020', shipEnd: '18-09-2027',
      fxModel: 'M035', fxModelDesc: 'INR-INR-Put & Call Option (Short Straddle)',
      entityString: 'OGA-DMCC-OSIPL', fxInvModel: 'INV03',
      traderCode: 'OVL', traderDesc: 'Olam Vietnam Limited — Derivatives',
      currString: 'INR-INR-USD',
      status: '01', noInvoiceModel: false, isSS: true, reversalAuthorized: false,
      legs: [
        leg({ rfha: '5000456830', dealType: 'D1', bpName: 'Barclays Bank PLC', instrument: 'Call Option (Short)',
          tradeDate: '15-09-2026', valueDate: '18-09-2027',
          bs1: 'S', curr1: 'INR', amt1: 500000000.0, bs2: 'B', curr2: 'USD', amt2: 5231680.0,
          allInRate: 0, strike: 95.5587, mcRef: '2000002691', txnStatus: '03',
          fxPl: 0, setPl: 0, premAmt: 15250.0, premCurr: 'USD', pInr: 1373750.0 }),
        leg({ rfha: '5000456831', dealType: 'D2', bpName: 'Barclays Bank PLC', instrument: 'Put Option (Short)',
          tradeDate: '15-09-2026', valueDate: '18-09-2027',
          bs1: 'B', curr1: 'INR', amt1: 500000000.0, bs2: 'S', curr2: 'USD', amt2: 5210500.0,
          allInRate: 0, strike: 95.97, mcRef: '2000002691', txnStatus: '03',
          fxPl: 0, setPl: 0, premAmt: -6400.0, premCurr: 'USD', pInr: -576640.0 }),
      ],
      invoices: [
        { ttype: '01', dtype: 'D1', buy: 'USD', sell: 'INR', currency: 'USD', exRate: 95.5587, invAmt: 500000000.0, invAmtUsd: 5231680.0, trmRef: '5000456830-INV1', mcRef: '2000002691' },
        { ttype: '02', dtype: 'D2', buy: 'INR', sell: 'USD', currency: 'USD', exRate: 95.97, invAmt: 500000000.0, invAmtUsd: 5210500.0, trmRef: '5000456831-INV1', mcRef: '2000002691' },
      ],
    },

    '5000010238': {
      dealId: '5000010238', dealRef: 'OSIPL-COTTON-DASG-0238',
      startDate: '24-08-2026', endDate: '18-09-2026',
      mcRefNo: '2000002688', mcDesc: 'OSIPL_Multi-Commodity_M034_0.02246M', mcDate: '24-08-2026',
      shipStart: '24-08-2026', shipEnd: '18-09-2026',
      fxModel: 'M034', fxModelDesc: 'INR – INR Staggered Call & Put Option',
      entityString: 'OGA-DMCC-OSIPL', fxInvModel: 'INV02',
      traderCode: 'OGA', traderDesc: 'Olam Global Agri — FX Desk',
      currString: 'INR-INR',
      status: '30', noInvoiceModel: false, isSS: false, reversalAuthorized: false,
      legs: [
        leg({ rfha: '5000456799', dealType: 'D1', bpName: 'Citi', instrument: 'Forward',
          tradeDate: '24-08-2026', valueDate: '18-09-2026',
          bs1: 'S', curr1: 'INR', amt1: 2245900.0, bs2: 'B', curr2: 'USD', amt2: 22459.0,
          allInRate: 6.0, strike: 0, mcRef: '2000002688', txnStatus: '07',
          fxPl: 0, setPl: 0, premAmt: 0, premCurr: 'USD', pInr: 0 }),
      ],
      invoices: [],
    },

    '5000010239': {
      dealId: '5000010239', dealRef: 'OTL-MAIZE-NOINV-0239',
      startDate: '22.09.2026', endDate: '20-10-2026',
      mcRefNo: '2000002709', mcDesc: 'OSIPL_Multi-Commodity_M034_0.028838M', mcDate: '19-09-2026',
      shipStart: '19-09-2026', shipEnd: '14-10-2026',
      fxModel: 'M034', fxModelDesc: 'INR – INR Staggered Call & Put Option (No-Invoice)',
      entityString: 'OGA-DMCC-OSIPL', fxInvModel: 'INV04',
      traderCode: 'OTL', traderDesc: 'Olam (Thailand) Ltd — Trading Desk',
      currString: 'INR-INR',
      status: '01', noInvoiceModel: true, isSS: false, reversalAuthorized: false,
      legs: [
        leg({ rfha: '5000456805', dealType: 'D1', bpName: 'JPMorgan', instrument: 'Forward',
          tradeDate: '19-09-2026', valueDate: '14-10-2026',
          bs1: 'S', curr1: 'INR', amt1: 2883800.0, bs2: 'B', curr2: 'USD', amt2: 28838.0,
          allInRate: 10.0, strike: 0, mcRef: '2000002709', txnStatus: '03',
          fxPl: 0, setPl: 0, premAmt: 0, premCurr: 'USD', pInr: 0 }),
      ],
      invoices: [],
    },
  }
}

/** Replacement transaction candidates for the F4 help on Edit Deal Pair. */
export const REPLACEMENT_TXN_POOL: readonly ReplacementTxn[] = [
  { rfha: '5000459011', label: '5000459011 — Standard Chartered Bank Singapore' },
  { rfha: '5000459044', label: '5000459044 — HSBC Singapore' },
  { rfha: '5000459072', label: '5000459072 — Citi' },
  { rfha: '5000459108', label: '5000459108 — Deutsche Bank' },
]

/** The attachment every deal's DMS list starts with the first time it is opened. */
export function seedDocs(date: string): DmsDoc[] {
  return [{ name: 'Confirmation_Advice.pdf', cat: 'MO Confirmation', by: 'r.dsouza', date }]
}

/**
 * Dummy data, verbatim from the legacy page's "DUMMY DATA" block. The original never called
 * an API; these stand in for the deal table, the Master Contract F4 help and the Premium
 * Adjustment (Screen 9003) lookup. The only change: the model descriptions stored the HTML
 * entity "&amp;" (the page rendered them through innerHTML); React renders text, so they
 * hold a plain "&".
 */
import type { DealStore, MasterContract, Premium, StatusMeta, TopRow } from './types.ts'

export const STATUS_MAP: Record<string, StatusMeta> = {
  '01': { label: '01 – Open', css: 'pill-blue' },
  '02': { label: '02 – Confirmed', css: 'pill-green' },
  '04': { label: '04 – Matured', css: 'pill-gray' },
  '30': { label: '30 – Cancelled', css: 'pill-red' },
}

/** Master contracts available for the "Change" MC picker (F4 help). */
export const MASTER_CONTRACTS: readonly MasterContract[] = [
  { ref: '2000002728', desc: 'OSIPL_RICE_M032_0.1M', origin: 'OSIPL', date: '22-08-2026', amt: 100000.0, curr: 'USD', entstr: 'OGA-DMCC-OSIPL' },
  { ref: '2000002727', desc: 'OSIPL_Multi-Commodity', origin: 'OSIPL', date: '21-09-2026', amt: 500000.0, curr: 'USD', entstr: 'OGA-DMCC-OSIPL' },
  { ref: '2000002716', desc: 'OSIPL_Multi-Commodity', origin: 'OSIPL', date: '19-09-2026', amt: 44758.0, curr: 'USD', entstr: 'OGA-DMCC-OSIPL' },
  { ref: '2000002699', desc: 'OSIPL_Multi-Commodity', origin: 'OSIPL', date: '19-09-2026', amt: 48323.0, curr: 'USD', entstr: 'OGA-DMCC-OSIPL' },
]

function buildTopRow(o: Omit<TopRow, 'color' | 'premCurr'>): TopRow {
  return { color: '', premCurr: 'USD', ...o }
}

/** A fresh copy of the deal table, so each mount starts from the page's original data. */
export function seedDeals(): DealStore {
  return {
    '3000045210': {
      dealId: '3000045210', dealRef: 'DL-25-OSIPL-0210', status: '01',
      sDate: '01-09-2026', eDate: '31-03-2027',
      trdCode: 'T01', trdDesc: 'Rohan Mehta',
      mcRef: '2000002728', mcDesc: 'OSIPL_RICE_M032_0.1M', mcDate: '22-08-2026',
      shipStart: '01-09-2026', shipEnd: '31-12-2026',
      modId: 'M032', modDesc: 'INR Long Forward',
      entStr: 'OGA-DMCC-OSIPL', currStr: 'USD-USD-INR',
      top: [
        buildTopRow({ bukrs: 'IN11', dealType: 'D1', bpName: 'Olam Agri India Pvt Ltd', kontrh: '0001045210', rfha: '5000123401', sfhaart: 'FX Forward', dblfz: '01-09-2026', delfz: '22-08-2026', xtext: 'RICE Import Hedge Leg 1', entity: 'OSIPL', bs1: 'Sell', curr1: 'USD', amt1: 100000.0, bs2: 'Buy', curr2: 'INR', amt2: 9000000.0, ospot: 90.2, oswap: -0.2, otot_rate: 90.0, strike: '', mcRefNo: '2000002728', txnStatus: '02' }),
        buildTopRow({ bukrs: 'IN11', dealType: 'D2', bpName: 'Olam Agri India Pvt Ltd', kontrh: '0001045210', rfha: '5000123402', sfhaart: 'FX Forward', dblfz: '01-09-2026', delfz: '22-08-2026', xtext: 'RICE Import Hedge Leg 2', entity: 'DMCC', bs1: 'Buy', curr1: 'USD', amt1: 100000.0, bs2: 'Sell', curr2: 'INR', amt2: 9000000.0, ospot: 90.2, oswap: -0.2, otot_rate: 90.0, strike: '', mcRefNo: '2000002728', txnStatus: '02' }),
      ],
      inv: [
        { zttype: 'T1', sell: 'OGA', buy: 'DMCC', curr: 'USD', trmNo: '3000045210-T1', amt: 100000.0, exRate: 90.0, invAmt: 9000000.0 },
        { zttype: 'T2', sell: 'DMCC', buy: 'OSIPL', curr: 'INR', trmNo: '3000045210-T2', amt: 9000000.0, exRate: 1.0, invAmt: 9000000.0 },
      ],
    },
    '3000045211': {
      dealId: '3000045211', dealRef: 'DL-25-OTL-0211', status: '02',
      sDate: '15-09-2026', eDate: '15-01-2027',
      trdCode: 'T02', trdDesc: 'Alicia Fernandes',
      mcRef: '2000002727', mcDesc: 'OSIPL_Multi-Commodity', mcDate: '21-09-2026',
      shipStart: '15-09-2026', shipEnd: '30-11-2026',
      modId: 'M034', modDesc: 'INR – INR Staggered Call & Put Option',
      entStr: 'OGA-DMCC-OTL', currStr: 'INR-INR-USD',
      top: [
        buildTopRow({ bukrs: 'TH10', dealType: 'D1', bpName: 'Olam (Thailand) Ltd', kontrh: '0001045211', rfha: '5000123411', sfhaart: 'FX Option', dblfz: '15-09-2026', delfz: '21-09-2026', xtext: 'CORN Export Hedge Leg 1', entity: 'OTL', bs1: 'Sell', curr1: 'USD', amt1: 33055.0, bs2: 'Buy', curr2: 'INR', amt2: 2975000.0, ospot: 90.0, oswap: 0.0, otot_rate: '', strike: 90.0, mcRefNo: '2000002727', txnStatus: '03' }),
      ],
      inv: [
        { zttype: 'T1', sell: 'OGA', buy: 'DMCC', curr: 'USD', trmNo: '3000045211-T1', amt: 33055.0, exRate: 90.0, invAmt: 2974950.0 },
      ],
    },
    '3000045212': {
      dealId: '3000045212', dealRef: 'DL-25-OVL-0212', status: '04',
      sDate: '01-06-2026', eDate: '01-09-2026',
      trdCode: 'T01', trdDesc: 'Rohan Mehta',
      mcRef: '2000002699', mcDesc: 'OSIPL_Multi-Commodity', mcDate: '19-09-2026',
      shipStart: '01-06-2026', shipEnd: '31-08-2026',
      modId: 'M041', modDesc: 'INR – INR Staggered Call & Put Option',
      entStr: 'OGA-DMCC-OVL', currStr: 'INR-INR-INR',
      top: [
        buildTopRow({ bukrs: 'VN10', dealType: 'D1', bpName: 'Olam Vietnam Limited', kontrh: '0001045212', rfha: '5000123421', sfhaart: 'FX Forward', dblfz: '01-06-2026', delfz: '19-09-2026', xtext: 'WHEAT Hedge – Matured', entity: 'OVL', bs1: 'Sell', curr1: 'USD', amt1: 48323.0, bs2: 'Buy', curr2: 'INR', amt2: 4348070.0, ospot: 90.0, oswap: 0.0, otot_rate: 90.0, strike: '', mcRefNo: '2000002699', txnStatus: '03' }),
      ],
      inv: [
        { zttype: 'T1', sell: 'OGA', buy: 'DMCC', curr: 'USD', trmNo: '3000045212-T1', amt: 48323.0, exRate: 90.0, invAmt: 4349070.0 },
      ],
    },
    '3000045213': {
      dealId: '3000045213', dealRef: 'DL-25-OSIPL-0213', status: '30',
      sDate: '10-07-2026', eDate: '10-10-2026',
      trdCode: 'T03', trdDesc: 'Kenji Watanabe',
      mcRef: '2000002716', mcDesc: 'OSIPL_Multi-Commodity', mcDate: '19-09-2026',
      shipStart: '10-07-2026', shipEnd: '30-09-2026',
      modId: 'M032', modDesc: 'INR Long Forward',
      entStr: 'OGA-DMCC-OSIPL', currStr: 'USD-USD-INR',
      top: [
        buildTopRow({ bukrs: 'IN11', dealType: 'D1', bpName: 'Olam Agri India Pvt Ltd', kontrh: '0001045213', rfha: '5000123431', sfhaart: 'FX Forward', dblfz: '10-07-2026', delfz: '19-09-2026', xtext: 'MAIZE Hedge – Deassigned', entity: 'OSIPL', bs1: 'Sell', curr1: 'USD', amt1: 44758.0, bs2: 'Buy', curr2: 'INR', amt2: 4028220.0, ospot: 90.0, oswap: 0.0, otot_rate: 90.0, strike: '', mcRefNo: '', txnStatus: '03' }),
      ],
      inv: [],
    },
    '3000045214': {
      dealId: '3000045214', dealRef: 'DL-25-DMCC-0214', status: '01',
      sDate: '05-09-2026', eDate: '05-03-2027',
      trdCode: 'T02', trdDesc: 'Alicia Fernandes',
      mcRef: '2000002727', mcDesc: 'OSIPL_Multi-Commodity', mcDate: '21-09-2026',
      shipStart: '05-09-2026', shipEnd: '20-12-2026',
      modId: 'M034', modDesc: 'INR – INR Staggered Call & Put Option',
      entStr: 'OGA-DMCC-OTL', currStr: 'INR-INR-USD',
      top: [
        buildTopRow({ bukrs: 'AE13', dealType: 'D1', bpName: 'Olam International DMCC', kontrh: '0001045214', rfha: '5000123441', sfhaart: 'FX Swap', dblfz: '05-09-2026', delfz: '21-09-2026', xtext: 'CORN Hedge Leg 1', entity: 'DMCC', bs1: 'Sell', curr1: 'USD', amt1: 20280.0, bs2: 'Buy', curr2: 'INR', amt2: 1825200.0, ospot: 90.0, oswap: 0.0, otot_rate: 90.0, strike: '', mcRefNo: '2000002727', txnStatus: '02' }),
        buildTopRow({ bukrs: 'AE13', dealType: 'D2', bpName: 'Olam International DMCC', kontrh: '0001045214', rfha: '5000123442', sfhaart: 'FX Swap', dblfz: '05-09-2026', delfz: '21-09-2026', xtext: 'CORN Hedge Leg 2', entity: 'OTL', bs1: 'Buy', curr1: 'USD', amt1: 20280.0, bs2: 'Sell', curr2: 'INR', amt2: 1825200.0, ospot: 90.0, oswap: 0.0, otot_rate: 90.0, strike: '', mcRefNo: '2000002727', txnStatus: '02' }),
      ],
      inv: [
        { zttype: 'T1', sell: 'OGA', buy: 'DMCC', curr: 'USD', trmNo: '3000045214-T1', amt: 20280.0, exRate: 90.0, invAmt: 1825200.0 },
        { zttype: 'T2', sell: 'DMCC', buy: 'OTL', curr: 'INR', trmNo: '3000045214-T2', amt: 1825200.0, exRate: 1.0, invAmt: 1825200.0 },
      ],
    },
  }
}

/** Premium adjustment mock lookup (Screen 9003 data source). */
export const PREMIUMS: Readonly<Record<string, Premium>> = {
  '3000045210': { dAmt: 100000.0, dCurr: 'USD', lNet: 120000.0, lCurr: 'INR', rbi: 82.15, rbiDate: '01-09-2026', fNet: 98500.0, fCurr: 'USD', pNet: 1.22, sRate: 90.0, iRate: 90.5 },
  '3000045211': { dAmt: 33055.0, dCurr: 'USD', lNet: 41000.0, lCurr: 'INR', rbi: 82.45, rbiDate: '15-09-2026', fNet: 32500.0, fCurr: 'USD', pNet: 1.23, sRate: 90.0, iRate: 90.2 },
  '3000045212': { dAmt: 48323.0, dCurr: 'USD', lNet: 53000.0, lCurr: 'INR', rbi: 82.9, rbiDate: '01-06-2026', fNet: 47500.0, fCurr: 'USD', pNet: 1.19, sRate: 90.0, iRate: 89.8 },
  '3000045213': { dAmt: 44758.0, dCurr: 'USD', lNet: 0.0, lCurr: 'INR', rbi: 0.0, rbiDate: '', fNet: 0.0, fCurr: 'USD', pNet: 0.0, sRate: 90.0, iRate: 90.0 },
  '3000045214': { dAmt: 20280.0, dCurr: 'USD', lNet: 24500.0, lCurr: 'INR', rbi: 82.3, rbiDate: '05-09-2026', fNet: 19800.0, fCurr: 'USD', pNet: 1.208, sRate: 90.0, iRate: 90.3 },
}

/** P&L rows use the confirmed on-screen labels from the program's text pool. */
export const PL_ROW_LABELS: readonly string[] = ['NDF Fixing-Profit Adj', 'Option Premium Income', 'Option Premium Expense', 'P&L Orign(%)']

/** Deterministic mock factor per P&L row, applied to each invoice leg's amount. */
export const PL_ROW_FACTORS: readonly number[] = [0.012, 0.006, -0.004, 0.008]

export const CANCELLED_STATUS = '30'
export const OPEN_STATUS = '01'
/** Marker the page's service sets on a leg once its deal pair has been updated. */
export const MATCHED_COLOR = 'C500'

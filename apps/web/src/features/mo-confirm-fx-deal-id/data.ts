/**
 * The legacy page's dummy data ("mock backend — replace with REST calls later"), quarantined.
 *
 * The screen mutates deals (confirm, reverse, edit pair, cancel) and documents (mock upload),
 * so those are factories that hand out a fresh copy for each mount; the rest is read-only.
 */
import type { Deal, DmsDb, Invoice, Premium, Replacement, StatusMeta } from './types.ts'

export const STATUS_META: Readonly<Record<string, StatusMeta>> = {
  '01': { desc: 'Created', cls: 'status-01' },
  '02': { desc: 'Pending MO Confirmation', cls: 'status-02' },
  '03': { desc: 'MO Confirmed', cls: 'status-03' },
  '07': { desc: 'Ready / Settled', cls: 'status-07' },
  '30': { desc: 'No Invoice Plan', cls: 'status-30' },
}

/** DEALS_DB, in the page's key order (which drives the quick picks and the datalist). */
export function makeDealsDb(): Deal[] {
  return [
    {
      dealId: 'FXD2026001', dealDesc: 'OSIPL Long Forward - Sep Book',
      trader: 'OGA', traderName: 'Olam Grains Agri Trading Desk',
      startDate: '05-09-2026', endDate: '05-03-2027',
      fxModel: 'M032', modelDesc: 'INR Long Forward',
      entityString: 'OGA-DMCC-OSIPL', currString: 'USD-USD-INR',
      mcRef: '2000002728', mcDesc: 'OSIPL_RICE_M032_0.1M', mcDate: '22-08-2026',
      shipStart: '01-09-2026', shipEnd: '31-10-2026',
      bukrs: 'IN11', status: '01', noInv: false, ssDeal: false,
      legs: [
        { rfha: '5000128411', dealType: 'FWD', bpName: 'Standard Chartered Bank', bpCode: '100234',
          dealDate: '05-09-2026', valueDate: '05-03-2027', desc: 'USD/INR outright forward',
          bs1: 'Buy', curr1: 'USD', amt1: 1000000.0, bs2: 'Sell', curr2: 'INR', amt2: 90000000.0,
          rateVal: 90.0, rateLabel: 'All-in Rate', txnStatus: '07', fxPl: 350.0 },
      ],
    },
    {
      dealId: 'FXD2026002', dealDesc: 'OSIPL Staggered Call & Put - Q4',
      trader: 'OTL', traderName: 'Olam Treasury Ltd Desk',
      startDate: '01-09-2026', endDate: '14-10-2026',
      fxModel: 'M034', modelDesc: 'INR - INR Staggered Call & Put Option',
      entityString: 'OGA-DMCC-OSIPL', currString: 'INR-INR-USD',
      mcRef: '2000002725', mcDesc: 'OSIPL_Multi-Commodity_M034_0.022889M', mcDate: '21-09-2026',
      shipStart: '01-10-2026', shipEnd: '31-12-2026',
      bukrs: 'IN11', status: '02', noInv: false, ssDeal: false,
      legs: [
        { rfha: '5000128522', dealType: 'OPT', bpName: 'HSBC Bank plc', bpCode: '100511',
          dealDate: '21-09-2026', valueDate: '14-10-2026', desc: 'Call option leg',
          bs1: 'Buy', curr1: 'USD', amt1: 22889.0, bs2: 'Sell', curr2: 'INR', amt2: 2058010.0,
          rateVal: 89.92, rateLabel: 'Strike', txnStatus: '02', fxPl: 4120.0 },
        { rfha: '5000128523', dealType: 'OPT', bpName: 'HSBC Bank plc', bpCode: '100511',
          dealDate: '21-09-2026', valueDate: '14-10-2026', desc: 'Put option leg',
          bs1: 'Sell', curr1: 'USD', amt1: 22889.0, bs2: 'Buy', curr2: 'INR', amt2: 2052400.0,
          rateVal: 89.68, rateLabel: 'Strike', txnStatus: '02', fxPl: -1680.0 },
      ],
    },
    {
      dealId: 'FXD2026003', dealDesc: 'OTL Short Forward - Cover',
      trader: 'OGA', traderName: 'Olam Grains Agri Trading Desk',
      startDate: '19-09-2026', endDate: '14-10-2026',
      fxModel: 'M037', modelDesc: 'INR Short Forward',
      entityString: 'OGA-DMCC-OSIPL', currString: 'INR-USD-USD',
      mcRef: '2000002710', mcDesc: 'OSIPL_Multi-Commodity_M041 Ward', mcDate: '19-09-2026',
      shipStart: '01-10-2026', shipEnd: '20-10-2026',
      bukrs: 'TH10', status: '03', noInv: false, ssDeal: false,
      legs: [
        { rfha: '5000128390', dealType: 'FWD', bpName: 'Deutsche Bank AG', bpCode: '100078',
          dealDate: '19-09-2026', valueDate: '14-10-2026', desc: 'USD/INR short forward cover',
          bs1: 'Sell', curr1: 'USD', amt1: 500000.0, bs2: 'Buy', curr2: 'INR', amt2: 44758000.0,
          rateVal: 89.516, rateLabel: 'All-in Rate', txnStatus: '03', fxPl: 1240.5 },
      ],
    },
    {
      dealId: 'FXD2026004', dealDesc: 'OVL Long Forward - Settled',
      trader: 'OTL', traderName: 'Olam Treasury Ltd Desk',
      startDate: '18-08-2026', endDate: '18-09-2026',
      fxModel: 'M032', modelDesc: 'INR Long Forward',
      entityString: 'OGA-DMCC-OSIPL', currString: 'USD-USD-INR',
      mcRef: '2000002699', mcDesc: 'OSIPL_Multi-Commodity_M034 Stagg', mcDate: '24-08-2026',
      shipStart: '01-09-2026', shipEnd: '18-09-2026',
      bukrs: 'VN10', status: '07', noInv: false, ssDeal: false,
      legs: [
        { rfha: '5000127960', dealType: 'FWD', bpName: 'Barclays Bank plc', bpCode: '100019',
          dealDate: '18-08-2026', valueDate: '18-09-2026', desc: 'USD/INR outright forward',
          bs1: 'Buy', curr1: 'USD', amt1: 250000.0, bs2: 'Sell', curr2: 'INR', amt2: 22459000.0,
          rateVal: 89.836, rateLabel: 'All-in Rate', txnStatus: '07', fxPl: 860.0 },
      ],
    },
    {
      dealId: 'FXD2026005', dealDesc: 'OSIPL Short Straddle - USD/INR',
      trader: 'OGA', traderName: 'Olam Grains Agri Trading Desk',
      startDate: '21-09-2026', endDate: '21-10-2026',
      fxModel: 'M036', modelDesc: 'USD-INR-Put & Call Option',
      entityString: 'OGA-DMCC-OSIPL', currString: 'USD-INR-INR',
      mcRef: '2000002722', mcDesc: 'OSIPL_Multi-Commodity_M036_33055', mcDate: '21-09-2026',
      shipStart: '01-10-2026', shipEnd: '31-10-2026',
      bukrs: 'IN11', status: '30', noInv: true, ssDeal: true,
      legs: [
        { rfha: '5000128601', dealType: 'OPT', bpName: 'Citibank N.A.', bpCode: '100302',
          dealDate: '21-09-2026', valueDate: '21-10-2026', desc: 'Short straddle - call leg',
          bs1: 'Sell', curr1: 'USD', amt1: 33055.0, bs2: 'Buy', curr2: 'INR', amt2: 2976855.0,
          rateVal: 90.07, rateLabel: 'Strike', txnStatus: '02', fxPl: 2210.0 },
        { rfha: '5000128602', dealType: 'OPT', bpName: 'Citibank N.A.', bpCode: '100302',
          dealDate: '21-09-2026', valueDate: '21-10-2026', desc: 'Short straddle - put leg',
          bs1: 'Sell', curr1: 'USD', amt1: 33055.0, bs2: 'Buy', curr2: 'INR', amt2: 2965730.0,
          rateVal: 89.735, rateLabel: 'Strike', txnStatus: '02', fxPl: -1340.0 },
      ],
    },
  ]
}

/** Invoice plans keyed by Deal ID (only shown when noInv = false). */
export const INVOICE_DB: Readonly<Record<string, readonly Invoice[]>> = {
  FXD2026001: [
    { tradeRef: 'TRD-771001', invType: 'Advance', exRate: 90.0, amt: 400000.0, curr: 'USD', due: '10-09-2026' },
    { tradeRef: 'TRD-771002', invType: 'Final', exRate: 90.15, amt: 600000.0, curr: 'USD', due: '05-03-2027' },
  ],
  FXD2026002: [
    { tradeRef: 'TRD-771010', invType: 'Advance', exRate: 89.92, amt: 12000.0, curr: 'USD', due: '25-09-2026' },
    { tradeRef: 'TRD-771011', invType: 'Final', exRate: 89.68, amt: 10889.0, curr: 'USD', due: '14-10-2026' },
  ],
  FXD2026003: [
    { tradeRef: 'TRD-771020', invType: 'Final', exRate: 89.516, amt: 500000.0, curr: 'USD', due: '14-10-2026' },
  ],
  FXD2026004: [
    { tradeRef: 'TRD-770890', invType: 'Final', exRate: 89.836, amt: 250000.0, curr: 'USD', due: '18-09-2026' },
  ],
}

/** Premium adjustment detail keyed by Deal ID. */
export const PREMIUM_DB: Readonly<Record<string, Premium>> = {
  FXD2026001: { dealValue: 1000000.0, dealCurr: 'USD', netPremium: 0.0, netPremiumCurr: 'USD',
    rbiRate: 90.05, rbiDate: '04-09-2026', netPremiumFwd: 0.0, netPremiumFwdCurr: 'INR',
    netPremiumPerUsd: 0.0, strikeRate: 0.0, invoiceRate: 90.0 },
  FXD2026002: { dealValue: 22889.0, dealCurr: 'USD', netPremium: 2440.0, netPremiumCurr: 'USD',
    rbiRate: 89.97, rbiDate: '20-09-2026', netPremiumFwd: 219532.8, netPremiumFwdCurr: 'INR',
    netPremiumPerUsd: 9.59, strikeRate: 89.92, invoiceRate: 89.97 },
  FXD2026003: { dealValue: 500000.0, dealCurr: 'USD', netPremium: 0.0, netPremiumCurr: 'USD',
    rbiRate: 89.5, rbiDate: '18-09-2026', netPremiumFwd: 0.0, netPremiumFwdCurr: 'INR',
    netPremiumPerUsd: 0.0, strikeRate: 0.0, invoiceRate: 89.516 },
  FXD2026004: { dealValue: 250000.0, dealCurr: 'USD', netPremium: 0.0, netPremiumCurr: 'USD',
    rbiRate: 89.8, rbiDate: '17-08-2026', netPremiumFwd: 0.0, netPremiumFwdCurr: 'INR',
    netPremiumPerUsd: 0.0, strikeRate: 0.0, invoiceRate: 89.836 },
  FXD2026005: { dealValue: 33055.0, dealCurr: 'USD', netPremium: 870.0, netPremiumCurr: 'USD',
    rbiRate: 90.01, rbiDate: '20-09-2026', netPremiumFwd: 78337.85, netPremiumFwdCurr: 'INR',
    netPremiumPerUsd: 2.37, strikeRate: 89.9025, invoiceRate: 90.01 },
}

/** Replacement transaction pool for "Edit Deal Pair". */
export const REPLACEMENT_POOL: readonly Replacement[] = [
  { rfha: '5000129001', label: '5000129001 — USD 1,000,000 Buy vs INR (SCB)' },
  { rfha: '5000129002', label: '5000129002 — USD 1,000,000 Buy vs INR (Citi)' },
  { rfha: '5000129003', label: '5000129003 — USD 1,000,000 Buy vs INR (HSBC)' },
]

/** DMS documents keyed by Deal ID; the mock upload appends to them. */
export function makeDmsDb(): DmsDb {
  return {
    FXD2026001: [{ name: 'Forward Confirmation.pdf', type: 'Confirmation' }],
    FXD2026002: [
      { name: 'Option Term Sheet.pdf', type: 'Term Sheet' },
      { name: 'MO Confirmation.pdf', type: 'Confirmation' },
    ],
    FXD2026003: [{ name: 'Deal Ticket.pdf', type: 'Ticket' }],
    FXD2026004: [{ name: 'Settlement Advice.pdf', type: 'Settlement' }],
    FXD2026005: [],
  }
}

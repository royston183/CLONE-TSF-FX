/**
 * Seed data, verbatim from the legacy page's "Master / reference data" and "Seed data" blocks,
 * drawn from the ZSGTSF_RFX_OPT_FO functional spec (EC2: TSF FO Error Correction - FX &
 * Options). Every list here stands in for an SAP value help or the FO queue behind ZSGTSFR052.
 * This build's Display Type is fixed to FX (Spot/Forward); Options-type transactions (a
 * separate popup with strike/premium fields) are out of scope and not modelled.
 */
import { addDays, parseSeedDate } from './format.ts'
import type {
  AccountCat,
  BusinessArea,
  CompanyCode,
  Partner,
  ProductType,
  StatusKey,
  StatusValue,
  Trader,
  TransactionType,
  Txn,
  TxnSeed,
} from './types.ts'

export const COMPANY_CODES: CompanyCode[] = [
  { code: 'SG03', name: 'Olam Global Agri Pte. Ltd', entity: 'OGA' },
  { code: 'AE13', name: 'Olam International DMCC', entity: 'DMCC' },
  { code: 'IN11', name: 'Olam Agri India Pvt Ltd', entity: 'OSIPL' },
]

export const BUSINESS_AREAS: BusinessArea[] = [
  { code: '0223', name: 'OLAM AGRI INDIA PRIVATE LIMITED', profitCenter: 'SG032003', profitCenterDesc: 'SG032003 - TSF-FX' },
  { code: '0254', name: 'OLAM (THAILAND) LIMITED', profitCenter: 'TH102003', profitCenterDesc: 'TH102003 - TSF-FX' },
  { code: '0615', name: 'OLAM INTERNATIONAL DMCC', profitCenter: 'AE1340', profitCenterDesc: 'AE1340 - TSF-FX' },
  { code: '0975', name: 'SINGAPORE', profitCenter: 'SG032003', profitCenterDesc: 'SG032003 - TSF-FX' },
  { code: '3812', name: 'Olam Outspan TSF', profitCenter: 'IN1114', profitCenterDesc: 'IN1114 - TSF-FX' },
]

export const PARTNERS: Partner[] = [
  { code: '0660012172', name: 'BARCLAYS BANK PLC' },
  { code: '0660012171', name: 'AUSTRALIA AND NEW ZEALAND BANKING GROUP' },
  { code: '0660012173', name: 'JPMORGAN CHASE BANK NA SINGAPORE' },
]

/** FX-only Product Types (Options-type 12C/12D strategies are excluded from this build). */
export const PRODUCT_TYPES: ProductType[] = [
  { code: '12A', desc: 'FX Spot: External' },
  { code: '12B', desc: 'FX Forwards: External' },
]
export const TRANSACTION_TYPES: TransactionType[] = [
  { code: '604', desc: 'Spot-Exercise Option TSF', prodType: '12A' },
  { code: '605', desc: 'Spot-TSF', prodType: '12A' },
  { code: '619', desc: 'Forward-TSF', prodType: '12B' },
]

export const ACCOUNT_CATS: AccountCat[] = [
  { code: '1000', desc: 'Trading' },
  { code: '2000', desc: 'Equity' },
  { code: '3000', desc: 'Overheads' },
  { code: '4000', desc: 'Loans' },
]
export const MODE_OF_TRADE = ['360T', 'BARX', 'EMAIL-PHONE', 'FXALL', 'JPMC', 'PLUTO']
export const TRADERS: Trader[] = [
  { code: 'C14', name: 'Ashon V' },
  { code: 'C18', name: 'Terry Tay' },
  { code: 'C27', name: 'Akshay M' },
  { code: 'C28', name: 'Nidhi S' },
]

export const coOf = (code: string) => COMPANY_CODES.find((c) => c.code === code)
export const baOf = (code: string) => BUSINESS_AREAS.find((b) => b.code === code)
export const partnerOf = (code: string) => PARTNERS.find((p) => p.code === code)
export const txnTypeOf = (code: string) => TRANSACTION_TYPES.find((t) => t.code === code)
export const prodTypeOf = (code: string) => PRODUCT_TYPES.find((p) => p.code === code)
export const traderOf = (code: string) => TRADERS.find((t) => t.code === code)
export const acctCatDesc = (code: string) => ACCOUNT_CATS.find((a) => a.code === code)?.desc

export const STATUS: Record<StatusKey, StatusValue> = {
  ERRCORR: '04-MO->FO: Correction Required',
  RESUB: '02-Released to MO',
  REVERSED: '15-Reversed',
  OPEN: 'Open (status not in SAP)',
}
export const STATUS_KEY: Record<StatusValue, StatusKey> = {
  '04-MO->FO: Correction Required': 'ERRCORR',
  '02-Released to MO': 'RESUB',
  '15-Reversed': 'REVERSED',
  'Open (status not in SAP)': 'OPEN',
}
export const STATUS_SHORT: Record<StatusValue, string> = {
  '04-MO->FO: Correction Required': 'Correction Required',
  '02-Released to MO': 'Released to MO',
  '15-Reversed': 'Reversed',
  'Open (status not in SAP)': 'Open - status not in SAP',
}

/** Who the page stamps as Changed By when Front Office corrects or reverses a transaction. */
export const FO_REVIEWER = 'FO_REVIEWER'
export const DEFAULT_DATE_FROM = '01-01-2026'
export const DEFAULT_DATE_TO = '31-12-2026'

/**
 * Deal IDs / transaction numbers / company codes / partners / rates are drawn from the captured
 * "EC2: TSF FO Error Correction" list screen and "FX Error Correction" popup (e.g. Deal
 * 1100002634 = txn 6005000001714 at SG03/OGA + txn 6005000000056 at AE13/DMCC, both vs
 * Barclays); the remaining rows extend the same pattern to show the full Correction Required /
 * Released to MO / Reversed lifecycle.
 */
export const TXN_SEED: TxnSeed[] = [
  // Deal 1100002634 - Spot pair, OGA <-> DMCC, vs Barclays
  { rfha: '6005000001714', dealId: '1100002634', mc: '2000002317', coCode: 'SG03', prodType: '12A', txnType: '604', partner: '0660012172',
    ccy1: 'USD', amt1: 1000.0, ccy2: 'INR', spot: 91.5, swap: 0, allIn: 91.5, tradeDate: '31.03.2026', valueDateOff: 2, blotterOff: 0,
    busArea: '0223', trader: 'C28', acctCat: '1000', mot: 'BARX', status: 'ERRCORR',
    moRemark: "Spot Rate looks stale versus today's market close - please re-verify and resubmit." },
  { rfha: '6005000000056', dealId: '1100002634', mc: '2000002317', coCode: 'AE13', prodType: '12A', txnType: '605', partner: '0660012172',
    ccy1: 'INR', amt1: 91600.0, ccy2: 'USD', spot: 91.5, swap: 0, allIn: 91.5, tradeDate: '31.03.2026', valueDateOff: 2, blotterOff: 0,
    busArea: '0223', trader: 'C28', acctCat: '1000', mot: 'BARX', status: 'ERRCORR',
    moRemark: 'Opposite Amount does not tie back to the Spot Rate on the paired leg - please recompute.' },

  // Deal 1100002617 - Forward pair, both legs OGA/SG03, vs ANZ
  { rfha: '6205000003601', dealId: '1100002617', mc: '2000002305', coCode: 'SG03', prodType: '12B', txnType: '619', partner: '0660012171',
    ccy1: 'USD', amt1: 1000000.0, ccy2: 'THB', spot: 34.0, swap: 0, allIn: 34.0, tradeDate: '05.03.2026', valueDateOff: 301, blotterOff: 0,
    busArea: '0254', trader: 'C28', acctCat: '1000', mot: '360T', status: 'ERRCORR',
    moRemark: "Business Area 0254 does not match this counterparty's booking desk - please confirm." },
  { rfha: '6205000003602', dealId: '1100002617', mc: '2000002305', coCode: 'SG03', prodType: '12B', txnType: '619', partner: '0660012171',
    ccy1: 'USD', amt1: 1000000.0, ccy2: 'THB', spot: 35.0, swap: 0, allIn: 35.0, tradeDate: '05.03.2026', valueDateOff: 301, blotterOff: 0,
    busArea: '0254', trader: 'C28', acctCat: '1000', mot: '360T', status: 'ERRCORR',
    moRemark: 'All-in Rate on the offsetting leg is wider than the approved spread - please re-quote.' },

  // Deal 1100002761 - single leg, OGA/SG03, vs JPMorgan
  { rfha: '6205000003772', dealId: '1100002761', mc: '2000002310', coCode: 'SG03', prodType: '12B', txnType: '619', partner: '0660012173',
    ccy1: 'USD', amt1: 2000.0, ccy2: 'THB', spot: 32.35, swap: 0, allIn: 32.35, tradeDate: '01.01.2026', valueDateOff: 25, blotterOff: 0,
    busArea: '0254', trader: 'C28', acctCat: '1000', mot: 'JPMC', status: 'ERRCORR',
    moRemark: 'Value Date falls on a bank holiday in Thailand - please shift to the next business day.' },

  // Deal 1100002318 - single leg, OSIPL/IN11, vs Barclays
  { rfha: '6205000000529', dealId: '1100002318', mc: '2000002298', coCode: 'IN11', prodType: '12B', txnType: '619', partner: '0660012172',
    ccy1: 'USD', amt1: 1000.0, ccy2: 'INR', spot: 33.0, swap: 0, allIn: 33.0, tradeDate: '13.01.2026', valueDateOff: 24, blotterOff: 0,
    busArea: '3812', trader: 'C27', acctCat: '1000', mot: 'EMAIL-PHONE', status: 'ERRCORR',
    moRemark: 'Master Contract linked does not belong to Origin Entity OSIPL - please correct the link.' },

  { rfha: '6005000001820', dealId: '1100002745', mc: '2000002340', coCode: 'SG03', prodType: '12A', txnType: '605', partner: '0660012172',
    ccy1: 'USD', amt1: 500.0, ccy2: 'INR', spot: 91.5, swap: 0, allIn: 91.5, tradeDate: '18.09.2026', valueDateOff: 2, blotterOff: 0,
    busArea: '0223', trader: 'C18', acctCat: '4000', mot: 'BARX', status: 'ERRCORR',
    moRemark: 'Account Category selected (Loans) is inconsistent with a Spot FX booking - please correct.' },

  { rfha: '6205000003890', dealId: '1100002752', mc: '2000002344', coCode: 'AE13', prodType: '12B', txnType: '619', partner: '0660012171',
    ccy1: 'USD', amt1: 750000.0, ccy2: 'AED', spot: 3.6733, swap: 0, allIn: 3.6733, tradeDate: '20.09.2026', valueDateOff: 60, blotterOff: 0,
    busArea: '0615', trader: 'C14', acctCat: '1000', mot: 'FXALL', status: 'ERRCORR',
    moRemark: 'Trade Date is after the Value Date on this leg - please correct the sequence.' },

  { rfha: '6005000001850', dealId: '1100002760', mc: '2000002350', coCode: 'SG03', prodType: '12A', txnType: '604', partner: '0660012173',
    ccy1: 'USD', amt1: 3200.0, ccy2: 'INR', spot: 88.9, swap: 0, allIn: 88.9, tradeDate: '22.09.2026', valueDateOff: 2, blotterOff: 0,
    busArea: '0223', trader: 'C28', acctCat: '1000', mot: 'PLUTO', status: 'ERRCORR',
    moRemark: 'Transaction Type 604 requires an Option reference - please confirm this is a Spot booking.' },

  { rfha: '6205000003910', dealId: '1100002765', mc: '2000002352', coCode: 'IN11', prodType: '12B', txnType: '619', partner: '0660012172',
    ccy1: 'USD', amt1: 15000.0, ccy2: 'INR', spot: 89.2, swap: 0, allIn: 89.2, tradeDate: '24.09.2026', valueDateOff: 75, blotterOff: 0,
    busArea: '3812', trader: 'C27', acctCat: '1000', mot: '360T', status: 'ERRCORR',
    moRemark: 'Profit Center does not match the Business Area configured for entity OSIPL - please re-derive.' },

  // Released to MO (corrected)
  { rfha: '6005000001680', dealId: '1100002290', mc: '2000002280', coCode: 'SG03', prodType: '12A', txnType: '605', partner: '0660012172',
    ccy1: 'USD', amt1: 2500.0, ccy2: 'INR', spot: 91.0, swap: 0, allIn: 91.0, tradeDate: '05.09.2026', valueDateOff: 2, blotterOff: 0,
    busArea: '0223', trader: 'C28', acctCat: '1000', mot: 'BARX', status: 'RESUB', changedOffset: 4,
    moRemark: 'Spot Rate mismatch versus market - please re-verify.' },
  { rfha: '6205000000480', dealId: '1100002295', mc: '2000002283', coCode: 'IN11', prodType: '12B', txnType: '619', partner: '0660012172',
    ccy1: 'USD', amt1: 4000.0, ccy2: 'INR', spot: 33.0, swap: 0, allIn: 33.0, tradeDate: '06.09.2026', valueDateOff: 25, blotterOff: 0,
    busArea: '3812', trader: 'C27', acctCat: '1000', mot: 'EMAIL-PHONE', status: 'RESUB', changedOffset: 5,
    moRemark: 'Master Contract link did not match Origin Entity - please correct.' },

  // Reversed
  { rfha: '6205000003550', dealId: '1100002270', mc: '2000002265', coCode: 'SG03', prodType: '12B', txnType: '619', partner: '0660012171',
    ccy1: 'USD', amt1: 600000.0, ccy2: 'THB', spot: 34.0, swap: 0, allIn: 34.0, tradeDate: '03.09.2026', valueDateOff: 120, blotterOff: 0,
    busArea: '0254', trader: 'C28', acctCat: '1000', mot: '360T', status: 'REVERSED', changedOffset: 6,
    moRemark: 'Shipment window this forward was hedging has been cancelled - please review.' },
  { rfha: '6005000001900', dealId: '1100002402', mc: '2000002390', coCode: 'SG03', prodType: '12A', txnType: '604', partner: '0660012173',
    ccy1: 'USD', amt1: 1200.0, ccy2: 'INR', spot: 91.5, swap: 0, allIn: 91.5, tradeDate: '08.09.2026', valueDateOff: 2, blotterOff: 0,
    busArea: '0223', trader: 'C18', acctCat: '1000', mot: 'PLUTO', status: 'REVERSED', changedOffset: 7,
    moRemark: 'GT Commodity underlying this hedge no longer matches the shipment - please review.' },
]

/** "Nidhi S" + OGA → "Nidhi S._OGA_2026/OGA-DMCC-OSIPL": the Deal ID Description SAP builds. */
export function dealDesc(traderCode: string, entity: string, tradeDate: Date, entityString: string): string {
  const [first = '', ...rest] = (traderOf(traderCode)?.name ?? '').split(' ')
  return `${first} ${rest.map((w) => `${w[0] ?? ''}.`).join('')}_${entity}_${tradeDate.getFullYear()}/${entityString}`
}

/** The entity string starts at the booking entity and runs through the other two. */
const entityString = (entity: string) =>
  `${entity}-${entity === 'OGA' ? 'DMCC-OSIPL' : entity === 'DMCC' ? 'OGA-OSIPL' : 'OGA-DMCC'}`

/** The page's buildTransactions: the seed rows with every derived column filled in. */
export function buildTransactions(): Txn[] {
  return TXN_SEED.map((s) => {
    const co = coOf(s.coCode)
    const ba = baOf(s.busArea)
    const entity = co?.entity ?? ''
    const tradeDate = parseSeedDate(s.tradeDate)
    return {
      rfha: s.rfha,
      dealId: s.dealId,
      dealIdDesc: dealDesc(s.trader, entity, tradeDate, entityString(entity)),
      mc: s.mc,
      coCode: s.coCode,
      companyName: co?.name ?? '',
      tsfEntity: entity,
      prodType: s.prodType,
      prodTypeDesc: prodTypeOf(s.prodType)?.desc ?? '',
      txnType: s.txnType,
      txnTypeDesc: txnTypeOf(s.txnType)?.desc ?? '',
      partnerCode: s.partner,
      partnerName: partnerOf(s.partner)?.name ?? '',
      buySell1: 'Buy',
      ccy1: s.ccy1,
      amt1: s.amt1,
      buySell2: 'Sell',
      ccy2: s.ccy2,
      amt2: s.amt1 * s.spot,
      spotRate: s.spot,
      swapRate: s.swap,
      allInRate: s.allIn,
      tradeDate,
      valueDate: addDays(tradeDate, s.valueDateOff),
      blotterDate: addDays(tradeDate, s.blotterOff),
      busArea: s.busArea,
      busAreaDesc: ba?.name ?? '',
      profitCenter: ba?.profitCenter ?? '',
      profitCenterDesc: ba?.profitCenterDesc ?? '',
      traderCode: s.trader,
      traderName: traderOf(s.trader)?.name ?? '',
      modeOfTrade: s.mot,
      acctCat: s.acctCat,
      status: STATUS[s.status],
      moRemark: s.moRemark,
      changedBy: s.status === 'ERRCORR' ? '' : FO_REVIEWER,
      changedOn: s.status === 'ERRCORR' ? null : addDays(tradeDate, s.changedOffset ?? 3),
      live: false,
      buysLead: true,
    }
  })
}

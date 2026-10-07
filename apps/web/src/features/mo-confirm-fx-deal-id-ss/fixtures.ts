/**
 * TEST FIXTURES ONLY — imported by the *.test.ts files, never by the screen.
 *
 * Middleware rows are the shapes the SLC middleware served on 2026-10-05 (trimmed to the
 * columns the ABAP reads). `fixtureDeal` is a hand-built Deal for the pure screen rules.
 */
import type { FxRow } from '../../shared/fx/mw.ts'
import type { Masters } from './api.ts'
import { leg } from './data.ts'
import type { Deal } from './types.ts'

export const DEAL_ROW: FxRow = {
  ZDEAL_ID: '7000000011', ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_DESC: 'OSIPL_FX', ZFX_INV_MODEL: '',
  ZS_DATE: '2026-09-30', ZE_DATE: '2026-10-30', ZMC_REF: '2000000008', ZTRD_CODE: 'T01', ZDEAL_REF: 'REF-11',
  ZTSF_MODEL: 'M035', ZDEAL_STAT: '01', ZDEAL_CURR_ID: 'C003', ZDEAL_CURR_DESC: 'INR-INR-USD',
}

export const MC_ROW: FxRow = {
  ZMC_REF_NO: '2000000008', ZMC_DESC: 'OSIPL_Multi-Commodity_M035', ZMC_DATE: '2026-09-15',
  ZSHIP_START: '2026-09-01', ZSHIP_END: '2027-09-18', ZORIGIN: 'OSIPL', ZENT_ID: 'E01',
  ZENT_DESC: 'OGA-OSIPL-DMCC', ZMOD_ID: 'M035', ZMOD_DESC: 'INR-INR-Put & Call Option',
}

export const RULES: FxRow[] = [
  { ZMOD_ID: 'M032', ZSUB_TYPE: 'FX1', ZSS: '', ZNO_INV: '', ZMOD_DESC: 'INR Long Forward', ZD1_INV_LINK: '02', ZD1_INV_LINK2: '', ZD2_INV_LINK: '03', ZD2_INV_LINK2: '' },
  { ZMOD_ID: 'M033', ZSUB_TYPE: 'FX1', ZSS: '', ZNO_INV: '', ZMOD_DESC: 'INR-INR-INR', ZD1_INV_LINK: '01', ZD1_INV_LINK2: '', ZD2_INV_LINK: '02', ZD2_INV_LINK2: '' },
  { ZMOD_ID: 'M035', ZLINK_MODEL: '01', ZSUB_TYPE: 'FX2', ZSS: '', ZNO_INV: '', ZMOD_DESC: 'Option', ZD1_INV_LINK: '03', ZD2_INV_LINK: '01' },
  { ZMOD_ID: 'M035', ZLINK_MODEL: '02', ZSUB_TYPE: 'FX2', ZSS: '', ZNO_INV: '', ZMOD_DESC: 'Option', ZD1_INV_LINK: '03', ZD2_INV_LINK: '01' },
  { ZMOD_ID: 'M041', ZSUB_TYPE: 'FX2', ZSS: 'X', ZNO_INV: '', ZMOD_DESC: 'Short Straddle', ZD1_INV_LINK: '01', ZD2_INV_LINK: '02' },
  { ZMOD_ID: 'M050', ZSUB_TYPE: 'FX1', ZSS: '', ZNO_INV: 'X', ZMOD_DESC: 'No invoice', ZD1_INV_LINK: '01' },
]

export const ENT_STR: FxRow[] = [{ ZENT_ID: 'E01', ZENT1: 'OGA', ZENT2: 'OSIPL', ZENT3: 'DMCC' }]
export const CUR_STR: FxRow[] = [{ ZCURR_ID: 'C001', ZCURR1: 'INR', ZCURR2: 'INR', ZCURR3: 'USD' }]

export const STATUS_ROWS: FxRow[] = [
  { ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX2', ZDEAL_STAT: '01', ZDEAL_SDESC: 'FO: Option Deals Created' },
  { ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_STAT: '30', ZDEAL_SDESC: 'Deal ID Cancelled' },
  { ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_STAT: '01', ZDEAL_SDESC: 'FO: FX Deals Created' },
  { ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_STAT: '', ZDEAL_SDESC: 'blank' },
]

/** ZSGTSFV_FX's columns as "tsfvFx" serves them. */
export const TSFV_FX_COLUMNS = [
  'MANDT', 'BUKRS', 'RFHA', 'SAKTIV', 'SGSART', 'BUTXT', 'LTX', 'SFHAART', 'XTEXT', 'BP_NAME', 'RFHAZUL', 'KONTRH',
  'RBUSA', 'BA_NAME', 'RPORTB', 'XPORTB', 'ZUONR', 'ZUOND', 'ASSIGN_DESC', 'REFER', 'INT_REF_DESC', 'OBJNR', 'REFNR',
  'DBLFZ', 'DELFZ', 'SFGTYP', 'SANLF', 'ZWAERS', 'ZCOM_ID', 'RDEALER', 'GSPPART', 'NORDEXT', 'NDF_DATE', 'NDF_REF', 'BS',
  'BS_O', 'BS_1', 'BS_2', 'CURR1', 'CURR2', 'AMT1', 'AMT2', 'CURR_ST1', 'ZAMT_ST1', 'CURR_ST2', 'ZAMT_ST2', 'OSPOT',
  'OSWAP', 'OTOT_RATE', 'T_RATE', 'DCRDAT', 'CRUSER', 'TCRTIM', 'DUPDAT', 'UPUSER', 'TUPTIM',
]

export function masters(over: Partial<Masters> = {}): Masters {
  return {
    mcs: [MC_ROW],
    rules: RULES,
    traders: [{ ZTCODE: 'T01', ZTRADER: 'Trader One' }],
    statuses: [
      { key: '01', text: '01 - FO: FX Deals Created' },
      { key: '30', text: '30 - Deal ID Cancelled' },
    ],
    entStr: ENT_STR,
    curStr: CUR_STR,
    orgPro: [],
    invRef: [],
    unwind: [],
    user: 'DEMO',
    fxColumns: TSFV_FX_COLUMNS,
    legs: new Map(),
    legsError: null,
    ...over,
  }
}

export function fixtureDeal(over: Partial<Deal> = {}): Deal {
  return {
    key: { ZDEAL_ID: '7000000011', ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1' },
    dealId: '7000000011',
    dealRef: 'OSIPL-SOYOIL-SS-0237',
    startDate: '01-09-2026',
    endDate: '18-09-2027',
    mcRefNo: '2000002691',
    mcDesc: 'OSIPL_Multi-Commodity_M035_0.5M',
    mcDate: '15-09-2026',
    shipStart: '01-01-2020',
    shipEnd: '18-09-2027',
    fxModel: 'M035',
    fxModelDesc: 'INR-INR-Put & Call Option (Short Straddle)',
    entityString: 'OGA-DMCC-OSIPL',
    fxInvModel: 'INV03',
    traderCode: 'OVL',
    traderDesc: 'Olam Vietnam Limited',
    currString: 'INR-INR-USD',
    status: '01',
    statusText: '01 - FO: FX Deals Created',
    noInvoiceModel: false,
    isSS: true,
    reversalAuthorized: false,
    legs: [
      leg({ bukrs: 'SG03', rfha: '5000456830', dealType: 'D1', bpName: 'Barclays', instrument: 'Call Option (Short)',
        tradeDate: '15-09-2026', valueDate: '18-09-2027', bs1: 'S', curr1: 'INR', amt1: 500000000, bs2: 'B', curr2: 'USD',
        amt2: 5231680, allInRate: 0, strike: 95.5587, mcRef: '2000002691', txnStatus: '03', fxPl: 0, setPl: 0,
        premAmt: 15250, premCurr: 'USD', pInr: 1373750 }),
      leg({ bukrs: 'SG03', rfha: '5000456831', dealType: 'D2', bpName: 'Barclays', instrument: 'Put Option (Short)',
        tradeDate: '15-09-2026', valueDate: '18-09-2027', bs1: 'B', curr1: 'INR', amt1: 500000000, bs2: 'S', curr2: 'USD',
        amt2: 5210500, allInRate: 0, strike: 95.97, mcRef: '2000002691', txnStatus: '07', fxPl: 0, setPl: 0,
        premAmt: -6400, premCurr: 'USD', pInr: -576640 }),
    ],
    legsWaiting: '',
    invoices: [
      { ttype: 'T1', dtype: 'D1', buy: 'OSIPL', sell: 'OGA', currency: 'INR', exRate: 95.5587, invAmt: 500000000,
        invAmtUsd: 5231680, trmRef: '7000000011-T1', mcRef: 'OSIPL-OGA-P / OGA-OSIPL-S' },
    ],
    invoicesWaiting: '',
    ...over,
  }
}

/**
 * TEST FIXTURES ONLY — imported by the *.test.ts files, never by the screen.
 *
 * Rows shaped as the SLC middleware serves them (columns verified against
 * /api/middleware/meta/resources/* on 2026-10-06). The Deal IDs, MCs, COMP and DEAL_ST rows
 * follow the live ones; statuses 05 / 07, the second CO area and the extra rows are added so
 * the filters and the mail rules have something to bite on.
 */
import type { FxRow } from '../../shared/fx/mw.ts'
import { entityHelp, indicatorRows, ruleRows, spotFlags, statusHelp, toDeal, toMasterContract } from './api.ts'
import type { ScreenData } from './types.ts'

const deal = (id: string, mc: string, stat: string, end: string, curr: string, extra: FxRow = {}): FxRow => ({
  CLIENT: '100',
  ZDEAL_ID: id,
  ZDEAL_TYPE: 'FX',
  ZSUB_TYPE: 'FX1',
  ZDEAL_DESC: 'OSIPL_FX_2026 / OGA-DMCC-OSIPL',
  ZS_DATE: '2026-09-30',
  ZE_DATE: end,
  ZMC_REF: mc,
  ZDEAL_STAT: stat,
  ZPL: '0.00',
  ZPL_CURR: '',
  ZPL_RATE: '0.0000000',
  ZCONFIRM: '',
  ZDEAL_CURR_ID: curr,
  ZCREATED_BY: 'DEMO',
  ZCREATED_DATE: '2026-10-01',
  ZCREATED_TIME: '13:15:50',
  ZCHANGED_BY: '',
  ZCHANGED_DATE: null,
  ZCHANGED_TIME: '00:00:00',
  ...extra,
})

export const DEAL_ROWS: FxRow[] = [
  deal('7000000006', '2000000005', '01', '2026-10-30', 'C002'),
  deal('7000000007', '2000000015', '05', '2026-10-05', 'C002', { ZCONFIRM: 'X', ZPL: '125.00', ZPL_CURR: 'USD', ZPL_RATE: '90.4000000' }),
  deal('7000000008', '2000000018', '07', '2026-10-05', 'C001', { ZCHANGED_BY: 'RMENON', ZCHANGED_DATE: '2026-10-02', ZCHANGED_TIME: '09:10:11' }),
  deal('7000000011', '2000000008', '05', '2026-11-02', 'C003', { ZSUB_TYPE: 'FX2', ZDEAL_DESC: 'Say "hi" option' }),
  deal('7000000020', '', '05', '2026-10-05', 'C001'),
  deal('7000000021', '2000000099', '05', '2026-10-05', 'C001'),
]

const mc = (ref: string, origin: string, model: string, desc: string, amt: string): FxRow => ({
  ZMC_REF_NO: ref,
  ZMC_DESC: `${origin}_FX_2026`,
  ZMC_DATE: '2026-09-29',
  ZORIGIN: origin,
  ZAMT: amt,
  ZCOMMODITY: 'CORN',
  ZCURR_ID: 'C002',
  ZMOD_ID: model,
  ZMOD_DESC: desc,
})

export const MC_ROWS: FxRow[] = [
  mc('2000000005', 'OSIPL', 'M032', 'INR Long Forward', '100000.00'),
  mc('2000000015', 'OTL', 'M037', 'INR Short Forward', '30087.00'),
  mc('2000000018', 'OSIPL', 'M033', 'INR-INR-INR Forward', '50000.00'),
  mc('2000000008', 'OSIPL', 'M034', 'INR – INR Staggered Call & Put Option', '500000.00'),
]

export const COMP_ROWS: FxRow[] = [
  { ZCOM_ID: 'OTL', ZBUTXT: 'Olam (Thailand) Ltd', ZREG_ID: 'R01' },
  { ZCOM_ID: 'OSIPL', ZBUTXT: 'Olam Agri India Pvt Ltd', ZREG_ID: 'R02' },
  { ZCOM_ID: 'DMCC', ZBUTXT: 'Olam International DMCC', ZREG_ID: 'R01' },
  { ZCOM_ID: 'OSL', ZBUTXT: 'Olam Shanghai Limited', ZREG_ID: '' },
]

export const STATUS_ROWS: FxRow[] = [
  { ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_STAT: '01', ZDEAL_SDESC: 'FO: FX Deals Created' },
  { ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_STAT: '05', ZDEAL_SDESC: 'Invoice Created in TRM' },
  { ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_STAT: '07', ZDEAL_SDESC: 'Partial Invoice Created iin TRM' },
  { ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_STAT: '30', ZDEAL_SDESC: 'Deal ID Cancelled' },
  { ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX2', ZDEAL_STAT: '05', ZDEAL_SDESC: 'Option text (not used)' },
]

export const RULE_ROWS: FxRow[] = [
  { ZCO_AREA: 'OL10', ZMOD_ID: 'M032', ZMOD_DESC: 'INR Long Forward', ZSUB_TYPE: 'FX1' },
  { ZCO_AREA: 'OL10', ZMOD_ID: 'M033', ZMOD_DESC: 'INR-INR-INR Forward', ZSUB_TYPE: 'FX1' },
  { ZCO_AREA: 'OL10', ZMOD_ID: 'M034', ZMOD_DESC: 'INR – INR Staggered Call & Put Option', ZSUB_TYPE: 'FX2' },
  { ZCO_AREA: 'OL10', ZMOD_ID: 'M034', ZMOD_DESC: 'INR – INR Staggered Call & Put Option', ZSUB_TYPE: 'FX2' },
  { ZCO_AREA: 'OL10', ZMOD_ID: 'M037', ZMOD_DESC: 'INR Short Forward', ZSUB_TYPE: 'FX1' },
  { ZCO_AREA: 'OL20', ZMOD_ID: 'M033', ZMOD_DESC: 'INR Forward at OL20', ZSUB_TYPE: 'FX1' },
]

export const SET_TYP_ROWS: FxRow[] = [
  { ZMOD_ID: 'M032', ZHEAD_FX: '', ZHEAD_OPT: '' },
  { ZMOD_ID: 'M033', ZHEAD_FX: 'X', ZHEAD_OPT: '' },
  { ZMOD_ID: 'M03402', ZHEAD_FX: '', ZHEAD_OPT: 'X' },
  { ZMOD_ID: 'M037', ZHEAD_FX: '', ZHEAD_OPT: '' },
]

export const SPOT_ROWS: FxRow[] = [
  { ZDEAL_ID: '7000000008', ZDEAL_TYPE: 'D1', ZDSS_TYPE: 'S' },
  { ZDEAL_ID: '7000000008', ZDEAL_TYPE: 'D2', ZDSS_TYPE: 'S' },
]

/** The screen's data as loadScreen builds it from the rows above; legs not served. */
export function fixtureData(): ScreenData {
  return {
    deals: DEAL_ROWS.map(toDeal),
    masterContracts: MC_ROWS.map(toMasterContract),
    entities: entityHelp(COMP_ROWS),
    statuses: statusHelp(STATUS_ROWS),
    rules: ruleRows(RULE_ROWS),
    indicators: indicatorRows(SET_TYP_ROWS),
    spotDealIds: spotFlags(SPOT_ROWS),
    fxLegs: null,
    optLegs: null,
  }
}

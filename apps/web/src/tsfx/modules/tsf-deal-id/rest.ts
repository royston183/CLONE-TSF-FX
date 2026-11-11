// ZSGTSFTR_DEALID on the SLC middleware: key CLIENT (implicit) + ZDEAL_ID + ZDEAL_TYPE + ZSUB_TYPE; ZDEAL_ID drawn from
// number range ZSGTSFNR01 (7000000001–7019999999) when a create leaves it blank.
import type { RestContract } from '../types';
import { SLOTS } from './definition';

export const rest: RestContract = {
  service: 'slc-middleware',
  tables: {
    dealIds: {
      resource: 'tsfDealId',
      assigned: 'dealId',
      numbers: ['pl', 'plRate', 'plLocal', 'dealAmount'],
      columns: {
        dealId: 'ZDEAL_ID', dealType: 'ZDEAL_TYPE', subType: 'ZSUB_TYPE', dealDesc: 'ZDEAL_DESC', fxInvModel: 'ZFX_INV_MODEL',
        startDate: 'ZS_DATE', endDate: 'ZE_DATE', mcRef: 'ZMC_REF', traderCode: 'ZTRD_CODE', regionId: 'ZREGION_ID', dealRef: 'ZDEAL_REF',
        model: 'ZTSF_MODEL', ...Object.fromEntries(SLOTS.flatMap(n => [[`bukrs${n}`, `ZBUKRS${n}`], [`rfha${n}`, `ZRFHA${n}`]])),
        status: 'ZDEAL_STAT', pl: 'ZPL', plCurr: 'ZPL_CURR', plRate: 'ZPL_RATE', plLocal: 'ZPL_LAMT', plLocalCurr: 'ZPL_LCURR',
        confirm: 'ZCONFIRM', dm: 'ZDM', mcCurrId: 'ZMC_CURR_ID', mcCurrDesc: 'ZMC_CURR_DESC', dealCurrId: 'ZDEAL_CURR_ID', dealCurrDesc: 'ZDEAL_CURR_DESC',
        revisedEndDate: 'ZREV_DEDATE', shortStraddle: 'ZSS', overUtil: 'ZOVER_UTL', dealAmount: 'ZDEAL_AMT',
        createdBy: 'ZCREATED_BY', createdDate: 'ZCREATED_DATE', changedBy: 'ZCHANGED_BY', changedDate: 'ZCHANGED_DATE'
      },
      stamps: { createdBy: 'ZCREATED_BY', createdDate: 'ZCREATED_DATE', createdTime: 'ZCREATED_TIME', changedBy: 'ZCHANGED_BY', changedDate: 'ZCHANGED_DATE', changedTime: 'ZCHANGED_TIME' }
    }
  }
};

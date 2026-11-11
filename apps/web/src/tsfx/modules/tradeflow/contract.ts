import type { ODataContract } from '../types';

// ZFS_SB_TRADEFLOW_O4_API (package ZFS_SLC_APP): TradeFlow over ZFS_T_SLC_TFLOW with its BillOfLading child
// (ZFS_T_SLC_TFBL); Price, Currency and Value come from ZFS_I_TradeFlowPrice. Built after UI approval.
export const contract: ODataContract = {
  service: 'ZFS_SB_TRADEFLOW_O4_API',
  naming: 'pascal',
  etag: true,
  numbers: ['quantity', 'price', 'value'],
  keyTypes: { tfDate: 'date', blRecordDate: 'date' },
  tables: {
    tradeflows: { entitySet: 'TradeFlow' },
    bl: { entitySet: 'BillOfLading' }
  },
  object: { items: { bl: { navigation: '_BillOfLading' } }, itemEtag: 'parent' }
};

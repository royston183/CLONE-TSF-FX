import type { ODataContract } from '../types';

// ZFS_SB_TRADEFLOW_O4_API (package ZFS_SLC_APP): Commodity over ZFS_T_SLC_CMDTY. Built after UI approval.
export const contract: ODataContract = {
  service: 'ZFS_SB_TRADEFLOW_O4_API',
  naming: 'pascal',
  etag: true,
  tables: { commodities: { entitySet: 'Commodity' } },
  lookups: { tsfCommodities: { entitySet: 'TsfCommodity', fields: { code: 'Commodity', text: 'Description' } } }
};

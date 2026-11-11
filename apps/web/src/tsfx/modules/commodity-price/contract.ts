import type { ODataContract } from '../types';

// ZFS_SB_TRADEFLOW_O4_API (package ZFS_SLC_APP): CommodityPrice over ZFS_T_SLC_CMPRC, the commodity master as its
// value list. Built after UI approval.
export const contract: ODataContract = {
  service: 'ZFS_SB_TRADEFLOW_O4_API',
  naming: 'pascal',
  etag: true,
  numbers: ['price'],
  keyTypes: { effectiveFrom: 'date' },
  tables: { prices: { entitySet: 'CommodityPrice' } },
  lookups: {
    commodities: { entitySet: 'Commodity', fields: { commodity: 'Commodity', description: 'Description', unit: 'Unit', currency: 'Currency' } }
  }
};

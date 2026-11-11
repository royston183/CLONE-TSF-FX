import type { ODataContract } from '../types';

// ZFS_SB_TRADEFLOW_O4_API (package ZFS_SLC_APP): an upload creates TradeFlow entities (SAP assigns TfNo, TfDate and
// the BillOfLading); the commodity master is the value list. Built after UI approval.
export const contract: ODataContract = {
  service: 'ZFS_SB_TRADEFLOW_O4_API',
  naming: 'pascal',
  etag: true,
  numbers: ['quantity'],
  tables: { tradeflows: { entitySet: 'TradeFlow' } },
  lookups: {
    commodities: { entitySet: 'Commodity', fields: { commodity: 'Commodity', description: 'Description', unit: 'Unit', currency: 'Currency' } }
  }
};

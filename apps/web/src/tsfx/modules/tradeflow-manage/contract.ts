import type { ODataContract } from '../types';

// ZFS_SB_TRADEFLOW_O4_API (NIIF): TradeFlow with all its BillOfLading children (composition [0..*]). New BLs are
// created through _BillOfLading without BlNo / BlRecordDate (SAP's early numbering assigns them); a deleted BL is a
// PATCH of DeletedFlag, never a DELETE.
export const contract: ODataContract = {
  service: 'ZFS_SB_TRADEFLOW_O4_API',
  naming: 'pascal',
  etag: true,
  numbers: ['quantity', 'price', 'value', 'assignedUsd'],
  keyTypes: { tfDate: 'date', blRecordDate: 'date' },
  tables: {
    tradeflows: { entitySet: 'TradeFlow' },
    bl: { entitySet: 'BillOfLading' }
  },
  object: { items: { bl: { navigation: '_BillOfLading' } }, itemEtag: 'parent' }
};

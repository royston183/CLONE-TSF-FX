import type { ODataContract } from '../types';

// ZFS_SB_TRADEFLOW_O4_API (NIIF): BillOfLading read whole; PATCH of DealId and AssignedUsd only (accept in
// Propose Tradeflows). The BL's ETag is its trade flow's (etag dependent).
export const contract: ODataContract = {
  service: 'ZFS_SB_TRADEFLOW_O4_API',
  naming: 'pascal',
  pageSize: 5000,
  etag: true,
  numbers: ['quantity', 'assignedUsd'],
  keyTypes: { blRecordDate: 'date', tfDate: 'date' },
  tables: { bls: { entitySet: 'BillOfLading' } }
};

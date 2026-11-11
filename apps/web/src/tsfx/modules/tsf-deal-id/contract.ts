import type { ODataContract } from '../types';

// The Deal IDs live on the SLC middleware (rest.ts); this contract only names the table for the module service.
export const contract: ODataContract = { service: 'TSF_DEAL_ID', naming: 'pascal', tables: { dealIds: { entitySet: 'TsfDealId' } }, object: { items: {} } };

// Sample Deal IDs for tests (the module itself reads the SLC middleware).
import type { ModuleSeed } from '../types';

export const tsfDealIdSeed = (): ModuleSeed => ({
  tables: {
    dealIds: [
      { dealId: '7000000007', dealType: 'FX', subType: 'FX1', dealDesc: 'Nidhi S_OSIPL_2026/OGA-OSIPL-DMCC', model: 'M033', status: '01', mcRef: '2000000028', startDate: '2026-11-01', endDate: '2026-12-15', bukrs1: 'SG03', rfha1: '2000000000001', bukrs2: 'SG03', rfha2: '2000000000002', pl: '0', plCurr: 'USD', shortStraddle: '' },
      { dealId: '7000000005', dealType: 'FX', subType: 'FX1', dealDesc: 'OSIPL_RICE_M032_2.0M', model: 'M032', status: '20', mcRef: '2000002728', startDate: '2026-09-22', endDate: '2026-10-15', bukrs1: 'IN11', rfha1: '1700004101', pl: '12450.50', plCurr: 'USD', shortStraddle: '' }
    ]
  }
});

// Sample data of the upload (UI approval): no stored trade flows yet, so TF.xlsx posts all ten rows; the commodity
// master is the sample one.
import type { ModuleSeed } from '../types';
import { COMMODITY_ROWS } from '../commodity/seed';

export const tradeflowUploadSeed = (): ModuleSeed => ({
  tables: { tradeflows: [] },
  lookups: { commodities: COMMODITY_ROWS.map(r => ({ ...r })) }
});

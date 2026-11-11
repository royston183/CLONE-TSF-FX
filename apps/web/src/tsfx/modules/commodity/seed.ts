// Sample commodities (UI approval): ALMOND matches the rows of the TF.xlsx upload file.
import type { Row } from '@tsfx/lib/grid/types';
import type { ModuleSeed } from '../types';

export const COMMODITY_ROWS: Row[] = [
  { commodity: 'ALMOND', description: 'Almonds', unit: 'LBS', currency: 'USD' },
  { commodity: 'COTTON', description: 'Cotton', unit: 'KG', currency: 'USD' },
  { commodity: 'CASHEW', description: 'Cashew kernels', unit: 'MTS', currency: 'USD' }
];

export const commoditySeed = (): ModuleSeed => ({
  tables: { commodities: COMMODITY_ROWS.map(r => ({ ...r, tsfCommodity: '' })) },
  lookups: { tsfCommodities: [{ code: 'C105', text: 'CORN' }, { code: 'C110', text: 'WHEAT' }, { code: 'C130', text: 'ALMOND' }] }
});

// Sample prices (UI approval). CASHEW has none, so the trade flows list shows its "No price" case.
import type { Row } from '@tsfx/lib/grid/types';
import type { ModuleSeed } from '../types';
import { COMMODITY_ROWS } from '../commodity/seed';

export const PRICE_ROWS: Row[] = [
  { commodity: 'ALMOND', effectiveFrom: '2026-10-01', price: '2.1000', currency: 'USD' },
  { commodity: 'ALMOND', effectiveFrom: '2026-11-01', price: '2.1500', currency: 'USD' },
  { commodity: 'COTTON', effectiveFrom: '2026-09-15', price: '1.8000', currency: 'USD' }
];

export const commodityPriceSeed = (): ModuleSeed => ({
  tables: { prices: PRICE_ROWS.map(r => ({ ...r })) },
  lookups: { commodities: COMMODITY_ROWS.map(r => ({ ...r })) }
});

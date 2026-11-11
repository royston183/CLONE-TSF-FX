// Update Price (Trade Flows): the price of a commodity from an effective-from date. A trade flow is priced at the
// latest price on or before its TF date (modules/tradeflow/pricing.ts; SAP: ZFS_I_TradeFlowPrice).
// SAP: ZFS_T_SLC_CMPRC through ZFS_SB_TRADEFLOW_O4_API (entity set CommodityPrice), once the UI is approved.
import { col, isoDay, str } from '@tsfx/lib/grid/grid';
import { formatDate } from '@tsfx/lib/fields/parse';
import type { Option, Row } from '@tsfx/lib/grid/types';
import type { ModuleDef } from '../types';

export interface PriceLookups {
  commodities: Row[];
  options: Option[];
  of: (commodity: string) => Row | undefined;
}

export function lookups(raw: Record<string, Row[]> | undefined): PriceLookups {
  const commodities = raw?.commodities ?? [];
  return {
    commodities,
    options: commodities.map(c => ({ value: str(c.commodity), label: `${str(c.commodity)} - ${str(c.description)}`, desc: str(c.description) })),
    of: commodity => commodities.find(c => str(c.commodity) === str(commodity))
  };
}

export const commodityPrice: ModuleDef<PriceLookups> = {
  id: 'commodity-price',
  title: 'Update Price',
  noun: 'prices',
  serviceKey: 'tradeflow',
  storageKey: 'tsf-commodity-price-tab',
  // The Update Price page (pages/update-price) reads and writes through this module; it has no screen of its own.
  internal: true,
  blankRows: 1,
  // Three fields (commodity, effective from, price): a pop-up form.
  opens: { create: 'popup', open: 'popup' },
  strict: true,
  tabs: [{
    id: 'prices', label: 'Price History', title: 'Price History', noun: ['price', 'prices'], editable: true,
    keys: ['commodity', 'effectiveFrom'], defaultSort: { col: 'effectiveFrom', dir: -1 },
    columns: [
      col('commodity', 'Commodity', { code: true, text: r => (r.commodityText ? `${r.commodity} - ${r.commodityText}` : str(r.commodity)) }),
      col('effectiveFrom', 'Effective From', { type: 'date', text: r => formatDate(str(r.effectiveFrom)) }),
      col('price', 'Price', { type: 'amount', align: 'right' }),
      col('currency', 'Currency'),
      col('unit', 'Per Unit')
    ],
    search: r => [r.commodity, r.commodityText],
    // The prices whose Effective From is the day picked (a calendar-day comparison, never through a time zone).
    filters: [{ id: 'effectiveFrom', kind: 'date', all: 'Effective Date', options: () => [], match: (r, v) => isoDay(r.effectiveFrom) === isoDay(v) }],
    grid: [
      { field: 'commodity', label: 'Commodity *', type: 'select', options: lk => lk.options, key: true, required: true },
      { field: 'effectiveFrom', label: 'Effective From *', type: 'date', key: true, required: true },
      { field: 'price', label: 'Price *', type: 'amount', scale: 4, precision: 15, currencyField: 'currency', required: true }
    ],
    check: (r, lk) => ({
      commodity: r.commodity && !lk.of(r.commodity) ? `Commodity '${r.commodity}' is not maintained.` : '',
      price: r.price && !(Number(r.price) > 0) ? 'Price must be greater than zero.' : ''
    })
  }],
  fields: { prices: ['commodity', 'effectiveFrom', 'price', 'currency'] },
  // The price's currency and unit are the commodity's: shown, never typed.
  enrich: (_table, row, lk) => {
    const c = lk.of(row.commodity);
    return { ...row, currency: str(c?.currency) || str(row.currency), unit: str(c?.unit), commodityText: str(c?.description) };
  },
  lookups
};

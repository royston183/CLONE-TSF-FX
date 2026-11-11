// Maintain Commodity (Master Data): the commodity master that prices and trade flows refer to.
// SAP: ZFS_T_SLC_CMDTY through ZFS_SB_TRADEFLOW_O4_API (entity set Commodity), once the UI is approved.
import { col, str } from '@tsfx/lib/grid/grid';
import type { Option, Row } from '@tsfx/lib/grid/types';
import type { ModuleDef } from '../types';

/** The TSF FX commodity list (SAP ZSGTSFTR_COMODIT through entity set TsfCommodity): what Deal IDs' master contracts use. */
export interface CommodityLookups { tsfCommodities: Option[] }

export function lookups(raw: Record<string, Row[]> | undefined): CommodityLookups {
  return { tsfCommodities: (raw?.tsfCommodities ?? []).map(r => ({ value: str(r.code), label: `${str(r.code)} - ${str(r.text)}`, desc: str(r.text) })) };
}

/** The quantity units of a commodity and of the trade-flow file (column "Kg / LBs / Mts"). */
export const UNITS: Option[] = [
  { value: 'LBS', label: 'LBS', desc: 'Pounds' },
  { value: 'KG', label: 'KG', desc: 'Kilograms' },
  { value: 'MTS', label: 'MTS', desc: 'Metric tons' }
];

export const commodity: ModuleDef<CommodityLookups> = {
  id: 'commodity',
  title: 'Maintain Commodity',
  noun: 'commodities',
  serviceKey: 'tradeflow',
  storageKey: 'tsf-commodity-tab',
  blankRows: 1,
  // Four fields, no tabs or items: a pop-up form.
  opens: { create: 'popup', open: 'popup' },
  strict: true,
  tabs: [{
    id: 'commodities', label: 'Commodities', title: 'Commodities', noun: ['commodity', 'commodities'], editable: true,
    keys: ['commodity'], defaultSort: { col: 'commodity', dir: 1 },
    columns: [
      col('commodity', 'Commodity', { code: true }), col('description', 'Description', { bold: true }),
      col('unit', 'Unit'), col('currency', 'Currency'),
      col('tsfCommodity', 'TSF FX Commodity', { code: true, text: r => (r.tsfCommodity ? `${r.tsfCommodity}${r.tsfCommodityText ? ` - ${r.tsfCommodityText}` : ''}` : '—') })
    ],
    search: r => [r.commodity, r.description],
    filters: [{ id: 'unit', all: 'All Units', options: () => UNITS, match: (r, v) => r.unit === v }],
    grid: [
      { field: 'commodity', label: 'Commodity *', type: 'code', max: 20, key: true, required: true, mono: true },
      { field: 'description', label: 'Description *', type: 'text', max: 60, required: true },
      { field: 'unit', label: 'Unit *', type: 'select', options: UNITS, required: true },
      { field: 'currency', label: 'Currency *', type: 'code', max: 5, required: true },
      // Optional: until it is set, Propose Tradeflows proposes none of this commodity's BLs.
      { field: 'tsfCommodity', label: 'TSF FX Commodity', type: 'select', options: lk => lk.tsfCommodities }
    ],
    check: r => ({
      unit: r.unit && !UNITS.some(u => u.value === r.unit) ? `Unit '${r.unit}' must be LBS, KG or MTS.` : '',
      currency: r.currency && !/^[A-Z]{3}$/.test(r.currency) ? 'Currency must be a 3-letter code, e.g. USD.' : ''
    })
  }],
  fields: { commodities: ['commodity', 'description', 'unit', 'currency', 'tsfCommodity'] },
  enrich: (_table, row, lk) => ({ ...row, tsfCommodityText: lk.tsfCommodities.find(o => o.value === row.tsfCommodity)?.desc ?? '' }),
  lookups
};

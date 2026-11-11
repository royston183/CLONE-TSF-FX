// Tradeflows Upload (Trade Flows): the TF.xlsx file, one trade flow per row. Each row is checked here and again by
// SAP; SAP then numbers it (TF No from ZSGTSFNR02, TF Date = upload date) and creates its BL (BL No from ZSGTSFNR05).
// A shipping BL Number may be uploaded once: twice in a file, or one already stored, is refused (keys: blNumber).
import { str } from '@tsfx/lib/grid/grid';
import type { FieldDef } from '@tsfx/lib/fields/types';
import type { UploadModuleDef } from '../types';
import { UNITS } from '../commodity/definition';
import { lookups, type PriceLookups } from '../commodity-price/definition';
import { TF_FIELDS } from '../tradeflow/definition';

export type UploadLookups = PriceLookups;

export const tradeflowUpload: UploadModuleDef<UploadLookups> = {
  kind: 'upload', id: 'tradeflow-upload', title: 'Tradeflows Upload', noun: ['trade flow', 'trade flows'],
  serviceKey: 'tradeflow', storageKey: 'tsf-tradeflow-upload',
  entity: 'tradeflows', keys: ['blNumber'],
  // The file's headings, in its order (TF_FIELDS has no lookup-dependent parts). The unit is read as typed text, not
  // as a select: a select's paste guesses by first letter ("Ltr" → LBS), so check() takes only LBS, KG or MTS.
  columns: (TF_FIELDS as unknown as FieldDef<UploadLookups>[]).map(d => (d.field === 'unit' ? { field: 'unit', label: d.label, type: 'code', max: 10, required: true } : d)),
  mode: 'create',
  strict: false,
  maxRows: 1000,
  check: (rows, lk) => rows.flatMap((r, i) => {
    const row = i + 1;
    if (r.unit && !UNITS.some(u => u.value === r.unit)) return [{ row, field: 'unit', message: `Unit '${r.unit}' must be LBS, KG or MTS.` }];
    if (!r.commodity) return [];
    const c = lk.of(r.commodity);
    if (!c) return [{ row, field: 'commodity', message: `Commodity '${r.commodity}' is not maintained. Add it in Maintain Commodity first.` }];
    const out: { row: number; field: string; message: string }[] = [];
    if (r.unit && str(c.unit) !== r.unit) out.push({ row, field: 'unit', message: `Unit ${r.unit} does not match ${r.commodity}'s unit ${str(c.unit)}.` });
    if (r.quantity && !(Number(r.quantity) > 0)) out.push({ row, field: 'quantity', message: 'Quantity must be greater than zero.' });
    return out;
  }),
  lookups
};

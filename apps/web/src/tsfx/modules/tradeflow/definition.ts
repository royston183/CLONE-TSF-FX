// Tradeflows List (Trade Flows): every uploaded trade flow with its price and value, and its Bill of Lading.
// One trade flow per uploaded row; SAP numbers it (TF No from ZSGTSFNR02, TF Date = upload date) and creates its BL
// (BL No from ZSGTSFNR05). Read-only here: Manage Tradeflows will change them (logic to come).
// SAP: ZFS_T_SLC_TFLOW / ZFS_T_SLC_TFBL through ZFS_SB_TRADEFLOW_O4_API, once the UI is approved.
import { col, str } from '@tsfx/lib/grid/grid';
import { formatAmount4, formatDate } from '@tsfx/lib/fields/parse';
import type { FieldDef } from '@tsfx/lib/fields/types';
import type { Column } from '@tsfx/lib/grid/types';
import type { ObjectModuleDef } from '../types';
import { UNITS } from '../commodity/definition';

export type TfLookups = Record<string, never>;

/** The fields of one trade-flow row, labelled exactly as the headings of the upload file (TF.xlsx). */
export const TF_FIELDS: FieldDef<TfLookups>[] = [
  { field: 'notifyParty', label: 'BL Notify Party', type: 'text', max: 80, required: true },
  { field: 'blNumber', label: 'BL Number', type: 'code', max: 35, required: true, mono: true },
  { field: 'blDate', label: 'BL Date', type: 'date', required: true },
  { field: 'etd', label: 'ETD', type: 'date', required: true },
  { field: 'eta', label: 'ETA', type: 'date', required: true },
  { field: 'contractRef', label: 'Contract Ref', type: 'code', max: 20, required: true },
  { field: 'contractDate', label: 'Contract Date', type: 'date' },
  { field: 'invoiceRef', label: 'Invoice Ref', type: 'code', max: 20, required: true },
  { field: 'invoiceDate', label: 'Invoice date', type: 'date', required: true },
  { field: 'commodity', label: 'Main Commodity', type: 'code', max: 20, required: true },
  { field: 'goods', label: 'Goods Details (Description)', type: 'text', max: 120, required: true },
  { field: 'quantity', label: 'Quantity', type: 'decimal', scale: 3, precision: 15, required: true },
  { field: 'unit', label: 'Kg / LBs / Mts', type: 'select', options: UNITS, required: true }
];
const byField = (f: string): FieldDef<TfLookups> => {
  const d = TF_FIELDS.find(x => x.field === f);
  if (!d) throw new Error(`Unknown trade-flow field ${f}`);
  return d;
};

/** SAP sends 0 (not null) when the commodity has no price on or before the TF date: both mean "No price". */
const priced = (r: { price?: string }) => Number(r.price) > 0;

const tfNo: FieldDef<TfLookups> = { field: 'tfNo', label: 'TF No', type: 'code', max: 10, key: true, mono: true };
const tfDate: FieldDef<TfLookups> = { field: 'tfDate', label: 'TF Date', type: 'date', key: true };
const blNo: FieldDef<TfLookups> = { field: 'blNo', label: 'BL No', type: 'code', max: 10, mono: true };
const price: FieldDef<TfLookups> = {
  field: 'price', label: 'Price', type: 'amount', scale: 4, currencyField: 'currency',
  shown: r => (priced(r) ? formatAmount4(r.price) : 'No price')
};
const value: FieldDef<TfLookups> = { field: 'value', label: 'Value', type: 'amount', currencyField: 'currency' };
const currency: FieldDef<TfLookups> = { field: 'currency', label: 'Currency', type: 'code', max: 5 };
/** Empty on upload; Manage Tradeflows fills it (logic to come). Stored on the trade flow and on its BL. */
const dealId: FieldDef<TfLookups> = { field: 'dealId', label: 'Deal ID', type: 'code', max: 20, mono: true };

const dateCol = (f: string, label: string): Column => col(f, label, { type: 'date', text: r => formatDate(str(r[f])) });
const fieldCol = (d: FieldDef<TfLookups>): Column => {
  if (d.type === 'date') return dateCol(d.field, d.label);
  if (d.type === 'decimal') return col(d.field, d.label, { type: 'decimal', align: 'right' });
  return col(d.field, d.label, { code: d.type === 'code' });
};
// What the trade flow is, its goods, Price and Value first (visible without scrolling); the shipment details after.
const LEAD = ['blNumber', 'commodity', 'goods', 'quantity', 'unit'];
const COLUMNS: Column[] = [
  col('tfNo', 'TF No', { code: true }), dateCol('tfDate', 'TF Date'),
  // One BL: its number; several (split in Manage Tradeflows): how many.
  col('blNo', 'BL No', { code: true, text: r => (Number(r.blCount) > 1 ? `${r.blCount} BLs` : str(r.blNo)) }),
  ...LEAD.map(byField).map(fieldCol),
  col('price', 'Price', {
    type: 'amount', align: 'right', text: r => (priced(r) ? `${formatAmount4(r.price)} ${str(r.currency)}` : 'No price'),
    statusTone: r => (priced(r) ? 'green' : 'amber')
  }),
  col('value', 'Value', { type: 'amount', align: 'right', text: r => (Number(r.value) > 0 ? `${formatAmount4(r.value)} ${str(r.currency)}` : '') }),
  col('dealId', 'Deal ID', { code: true }),
  ...TF_FIELDS.filter(d => !LEAD.includes(d.field)).map(fieldCol)
];

export const tradeflow: ObjectModuleDef<TfLookups> = {
  kind: 'object', id: 'tradeflow', title: 'Tradeflows List', noun: ['Trade Flow', 'Trade Flows'], serviceKey: 'tradeflow', storageKey: 'tsf-tradeflow',
  // A read-only view of one trade flow and its one BL: a pop-up.
  opens: { create: 'popup', open: 'popup' },
  keyBySap: true,
  canCreate: false, canEdit: false, canDelete: false,
  list: {
    entity: 'tradeflows', keys: ['tfNo', 'tfDate'],
    columns: COLUMNS,
    fields: [tfNo, tfDate, blNo, ...TF_FIELDS, price, value, currency, dealId, { field: 'blCount', label: 'BLs', type: 'integer' }],
    search: ['tfNo', 'blNumber', 'contractRef', 'invoiceRef', 'dealId'],
    filters: ['tfDate', 'commodity', 'tfNo'],
    sort: ['tfNo', 'tfDate', 'blDate', 'commodity', 'quantity', 'value'],
    defaultSort: { field: 'tfDate', dir: -1 }, pageSizes: [50, 100, 200], layouts: {}
  },
  header: [tfNo, tfDate, blNo, dealId, byField('commodity'), byField('quantity'), byField('unit'), price, value],
  subtitle: h => `${str(h.blNumber)} · ${str(h.notifyParty)}`,
  tabs: [
    { kind: 'fields', id: 'shipment', label: 'Trade Flow', groups: [
      { title: 'Shipment', columns: 2, fields: ['notifyParty', 'blNumber', 'blDate', 'etd', 'eta'].map(byField) },
      { title: 'Contract & invoice', columns: 2, fields: ['contractRef', 'contractDate', 'invoiceRef', 'invoiceDate'].map(byField) },
      { title: 'Goods & value', columns: 2, fields: [...['commodity', 'goods', 'quantity', 'unit'].map(byField), price, value, currency] }
    ] },
    { kind: 'items', id: 'bl', label: 'Bill of Lading', table: 'bl', keys: ['tfNo', 'tfDate', 'blNo'],
      grid: [blNo, { field: 'blRecordDate', label: 'BL Record Date', type: 'date' }, dealId, ...TF_FIELDS],
      columns: [
        col('blNo', 'BL No', { code: true }), dateCol('blRecordDate', 'BL Record Date'), col('dealId', 'Deal ID', { code: true }), col('blNumber', 'BL Number', { code: true }),
        dateCol('blDate', 'BL Date'), dateCol('etd', 'ETD'), dateCol('eta', 'ETA'), col('goods', 'Goods'),
        col('quantity', 'Quantity', { align: 'right' }), col('unit', 'Unit')
      ] }
  ],
  lookups: () => ({})
};

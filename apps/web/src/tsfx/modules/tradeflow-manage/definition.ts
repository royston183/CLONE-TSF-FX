// Manage Tradeflows: one trade flow with all its BLs (TradeFlow → _BillOfLading [0..*]). Only the BLs change here:
// split a BL, add BLs from the open quantity, or flag a BL as deleted (rows are never removed). SAP numbers each new BL
// (BL No from ZSGTSFNR05, BL record date = today). The page (pages/manage-tradeflows) drives it.
import type { FieldDef } from '@tsfx/lib/fields/types';
import type { ObjectModuleDef } from '../types';
import { TF_FIELDS, tradeflow, type TfLookups } from '../tradeflow/definition';
import { overTradeFlow } from './split';

const bl = (field: string, label: string, extra: Partial<FieldDef<TfLookups>> = {}): FieldDef<TfLookups> => ({ field, label, type: 'code', max: 12, ...extra });

/** The BL fields this screen reads and writes (also copied from the trade flow onto a new BL). */
export const BL_GRID: FieldDef<TfLookups>[] = [
  bl('blNo', 'BL No', { max: 10, mono: true }),
  { field: 'blRecordDate', label: 'BL Record Date', type: 'date' },
  bl('dealId', 'Deal ID', { max: 20, mono: true }),
  bl('deletedFlag', 'Deleted', { max: 1 }),
  bl('deletedBy', 'Deleted By'),
  { field: 'deletedAt', label: 'Deleted On', type: 'text', max: 30 },
  { field: 'assignedUsd', label: 'Assigned USD', type: 'amount', precision: 15 },
  ...TF_FIELDS
];
const HEADER = tradeflow.header;

export const tradeflowManage: ObjectModuleDef<TfLookups> = {
  ...tradeflow,
  id: 'tradeflow-manage', title: 'Manage Tradeflows', storageKey: 'tsf-tradeflow-manage',
  // Opened by the Manage Tradeflows page (pages/manage-tradeflows), not by a tile of its own.
  internal: true,
  // A trade flow with a BL table and split / add / delete actions: its own page.
  opens: { create: 'page', open: 'page' },
  canCreate: false, canEdit: true, canDelete: false,
  header: HEADER,
  // The trade flow itself never changes here, only its BLs.
  lockedFields: () => [...new Set([...HEADER.map(f => f.field), ...TF_FIELDS.map(f => f.field), 'price', 'value', 'currency', 'dealId'])],
  tabs: [
    tradeflow.tabs[0],
    { kind: 'items', id: 'bl', label: 'Bill of Lading', table: 'bl', keys: ['blNo', 'blRecordDate'], keyBySap: true, editable: true, grid: BL_GRID, columns: [] }
  ],
  check: (header, items) => {
    const over = overTradeFlow(header.quantity ?? '', items.bl ?? []);
    return { header: {}, items: {}, messages: over ? [over] : [] };
  }
};

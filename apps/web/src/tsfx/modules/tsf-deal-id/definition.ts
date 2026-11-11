// TSF Deal IDs (ZSGTSFTR_DEALID on the SLC middleware): shared by the FX screens (blotter, trader workbench, deal
// confirmation, settlement, overview). Internal: no tile opens it; pages read and write it through the data client.
import { col } from '@tsfx/lib/grid/grid';
import { formatAmount, formatDate } from '@tsfx/lib/fields/parse';
import type { FieldDef } from '@tsfx/lib/fields/types';
import type { ObjectModuleDef } from '../types';

export interface DealIdLookups { [k: string]: never }

const text = (field: string, label: string, max = 40): FieldDef<DealIdLookups> => ({ field, label, type: 'text', max });
const code = (field: string, label: string, max = 10): FieldDef<DealIdLookups> => ({ field, label, type: 'code', max });
const date = (field: string, label: string): FieldDef<DealIdLookups> => ({ field, label, type: 'date' });
const amount = (field: string, label: string, currencyField?: string): FieldDef<DealIdLookups> => ({ field, label, type: 'amount', precision: 17, ...(currencyField ? { currencyField } : {}) });

/** Transaction slots 1–8 of a Deal ID: company code and transaction number (ZBUKRSn / ZRFHAn). */
export const SLOTS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export const DEAL_ID_FIELDS: FieldDef<DealIdLookups>[] = [
  code('dealId', 'Deal ID'), code('dealType', 'Deal Type', 4), code('subType', 'Sub Type', 4), text('dealDesc', 'Deal Description', 60),
  code('fxInvModel', 'FX Inv Model', 4), date('startDate', 'Deal Start Date'), date('endDate', 'Deal End Date'), code('mcRef', 'MC Ref No'),
  code('traderCode', 'Trader Code', 6), code('regionId', 'Region', 6), text('dealRef', 'Deal Ref', 40), code('model', 'FX Model', 6),
  ...SLOTS.flatMap(n => [code(`bukrs${n}`, `Company ${n}`, 4), code(`rfha${n}`, `Transaction ${n}`, 13)]),
  code('status', 'Deal Status', 2), amount('pl', 'P&L', 'plCurr'), code('plCurr', 'P&L Curr', 5), { field: 'plRate', label: 'P&L Rate', type: 'decimal', scale: 4, precision: 13 },
  amount('plLocal', 'P&L (Local)', 'plLocalCurr'), code('plLocalCurr', 'Local Curr', 5), code('confirm', 'Confirm', 1), code('dm', 'DM', 1),
  code('mcCurrId', 'MC Curr ID', 6), text('mcCurrDesc', 'MC Curr', 40), code('dealCurrId', 'Deal Curr ID', 6), text('dealCurrDesc', 'Deal Curr', 40),
  date('revisedEndDate', 'Revised End Date'), code('shortStraddle', 'Short Straddle', 1), code('overUtil', 'Over Utilised', 1), amount('dealAmount', 'Deal Amount'),
  code('createdBy', 'Created By', 12), date('createdDate', 'Created On'), code('changedBy', 'Changed By', 12), date('changedDate', 'Changed On')
];
const field = (f: string) => DEAL_ID_FIELDS.find(d => d.field === f) as FieldDef<DealIdLookups>;

export const tsfDealId: ObjectModuleDef<DealIdLookups> = {
  kind: 'object', id: 'tsf-deal-id', title: 'TSF Deal IDs', noun: ['Deal ID', 'Deal IDs'], serviceKey: 'tsf-deal-id', storageKey: 'tsf-deal-id',
  internal: true,
  // A Deal ID opens in a pop-up from the screens that list it (no tabs, no items).
  opens: { create: 'popup', open: 'popup' },
  list: {
    entity: 'dealIds', keys: ['dealId', 'dealType', 'subType'],
    columns: [
      col('dealId', 'Deal ID', { code: true }), col('dealType', 'Type'), col('subType', 'Sub Type'), col('dealDesc', 'Description'),
      col('model', 'Model', { code: true }), col('status', 'Status'), col('mcRef', 'MC Ref', { code: true }),
      col('startDate', 'Start Date', { text: r => formatDate(r.startDate) }), col('endDate', 'End Date', { text: r => formatDate(r.endDate) }),
      col('pl', 'P&L', { text: r => formatAmount(r.pl) }), col('plCurr', 'P&L Curr')
    ],
    fields: DEAL_ID_FIELDS,
    search: ['dealId', 'dealDesc'],
    filters: ['dealId', 'dealType', 'subType', 'status', 'model', 'mcRef', 'traderCode', 'endDate', 'startDate', 'shortStraddle'],
    sort: ['dealId', 'endDate', 'startDate'], defaultSort: { field: 'dealId', dir: 1 }, pageSizes: [100, 500]
  },
  header: [field('dealId'), field('dealType'), field('subType'), field('dealDesc'), field('status'), field('model')],
  tabs: [{ kind: 'fields', id: 'details', label: 'Details', groups: [{ title: 'Deal ID', columns: 2, fields: DEAL_ID_FIELDS.filter(d => !['dealId', 'dealType', 'subType', 'dealDesc', 'status', 'model'].includes(d.field)) }] }],
  canDelete: false,
  lookups: () => ({})
};

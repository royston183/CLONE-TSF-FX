// Large SAP lists: SAP searches, filters, sorts and pages them (spec §3). Shared by browser and server.
import type { FieldDef, FieldType } from '@tsfx/lib/fields/types';
import type { Column, Row } from '@tsfx/lib/grid/types';
import type { LayoutOptions } from '@tsfx/lib/report/types';

export type FilterOp = 'eq' | 'in' | 'contains' | 'between';
export interface ListFilter { field: string; op: FilterOp; values: string[] }
export interface ListSort { field: string; dir: 1 | -1 }
/** What the browser asks for: POST /api/modules/:id/:table/query. */
export interface ListQuery { search?: string; filters?: ListFilter[]; sort?: ListSort; page: number; pageSize: number }
export interface ListPage { rows: Row[]; total: number; page: number; pageSize: number }

/** A table too large to load at once. */
export interface ListDef<L = unknown> {
  /** Table name in the contract (for a large table-maintenance tab: the tab id). */
  entity: string;
  keys: string[];
  columns: Column[];
  /** Typed fields the list may search, filter and sort on. */
  fields: FieldDef<L>[];
  /** Fields searched by the search box (contains, OR-ed). */
  search?: string[];
  /** Fields offered as typed filters. */
  filters?: string[];
  /** Sortable fields (the default sort field always is). */
  sort?: string[];
  defaultSort: ListSort;
  /** Default [50, 100, 200]; never above 500. */
  pageSizes?: number[];
  /** ALV layouts (spec §4.1): columns, sort and page size, saved shared or personal. */
  layouts?: LayoutOptions;
}
// Definitions differ only in their lookup type; the builder is generic over it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous lookup types
export type AnyList = ListDef<any>;

export const DEFAULT_PAGE_SIZES = [50, 100, 200];
export const MAX_PAGE_SIZE = 500;
export const LIST_LIMITS = { search: 100, filters: 10, values: 50 } as const;

/** Filter operators allowed per field type. */
export const OPS_BY_TYPE: Partial<Record<FieldType, FilterOp[]>> = {
  text: ['eq', 'in', 'contains'], code: ['eq', 'in', 'contains'],
  select: ['eq', 'in'], suggest: ['eq', 'in'], segmented: ['eq', 'in'],
  date: ['eq', 'between'], amount: ['eq', 'between'], decimal: ['eq', 'between'], integer: ['eq', 'between'],
  flag: ['eq'], toggle: ['eq']
};

export const pageSizesOf = (list: AnyList): number[] => (list.pageSizes ?? DEFAULT_PAGE_SIZES).filter(n => n > 0 && n <= MAX_PAGE_SIZE);
/** Every displayed data field is sortable; extra configured fields may also be offered. */
export const sortColumnsOf = (list: AnyList): string[] => [...new Set([list.defaultSort.field, ...(list.sort ?? []), ...(list.columns ?? []).map(column => column.field)])];

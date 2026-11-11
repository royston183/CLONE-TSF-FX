import type { FieldDef } from '@tsfx/lib/fields/types';
import type { ListDef } from '@tsfx/lib/list/types';
import type { TransactionRef } from '@tsfx/lib/trm/types';

/** One table row as the application sees it: field name → text value. `__etag` carries SAP's ETag. */
export type Row = Record<string, string>;
export type Mode = 'add' | 'edit';
export type SortDir = 1 | -1;
export interface SortState { col: string | null; dir: SortDir }
export interface Option { value: string; label: string; desc?: string }
export interface LookupItem { CODE: string; TEXT: string }

/** A display column of the main table. */
export interface Column {
  field: string;
  label: string;
  text: (row: Row) => string;
  sort?: (row: Row) => number | string;
  code?: boolean;
  bold?: boolean;
  /** Optional display schema for shared table sizing; normally inherited from the matching field definition. */
  type?: FieldDef['type'];
  width?: number;
  /** The side of its heading and cells; default from the column's field (amounts and numbers right), else left. */
  align?: 'left' | 'right';
  /** Explicit business status: keep its text and render a traffic-light tag. */
  statusTone?: (row: Row) => 'green' | 'amber' | 'red';
  /** A TRM transaction number (or, with kind 'class', a security class): shown as a link that opens its FTR_DISPLAY pop-up. */
  transaction?: TransactionRef;
}

/** A column of the add/edit grid: a field definition (see src/lib/fields). */
export type GridColumn<L> = FieldDef<L>;

export interface FilterDef<L> {
  id: string;
  /** The dropdown's "all" text; for a date filter, the picker's label (e.g. "Effective Date"). */
  all: string;
  options: (rows: Row[], lk: L) => Option[];
  /** `value`: the option chosen, or for a date filter the date picked as YYYY-MM-DD. */
  match: (row: Row, value: string) => boolean;
  /** `select` (default): a dropdown of options; `date`: a date picker with a Clear button. */
  kind?: 'select' | 'date';
}

/** The fields and rules one row is checked with: a tab, an object header, an items grid, an upload. */
export interface RowRules<L> {
  grid: GridColumn<L>[];
  check?: (row: Row, lk: L, mode: Mode) => Record<string, string>;
}

export interface TabDef<L> {
  id: string;
  label: string;
  title: string;
  noun: [singular: string, plural: string];
  editable: boolean;
  keys: string[];
  defaultSort: SortState;
  columns: Column[];
  search: (row: Row) => string[];
  filters: FilterDef<L>[];
  grid: GridColumn<L>[];
  /** Field → problem ('' when fine). A one-word problem such as 'required' only highlights the cell. */
  check: (row: Row, lk: L, mode: Mode) => Record<string, string>;
  /** Too large to load whole: shown as a server-paged list (`list.entity` is this tab's id). */
  large?: boolean;
  list?: ListDef<L>;
}

export interface UiState {
  search: string;
  filters: Record<string, string>;
  columnFilters: Record<string, string[]>;
  sort: SortState;
  selected: string[];
}

export interface GridRow { id: number; values: Record<string, string | boolean>; orig?: Row }

export interface Checked {
  id: number;
  row: Row;
  blank: boolean;
  bad: Record<string, string>;
  desc: Record<string, string>;
  valid: boolean;
  changed: boolean;
}

/** What GET /api/modules/:id returns. */
export interface View {
  mode: 'odata' | 'local';
  service: string | null;
  tables: Record<string, Row[]>;
  lookups: Record<string, Row[]>;
}

/** Created by, created on, created at, changed by, changed on, changed at. */
export type StampFields = readonly [string, string, string, string, string, string];

// Reports and ALV layouts (spec §3, §4): shared by the browser and the server. No React, no server-only code.
import type { Row } from '@tsfx/lib/grid/types';
import type { TransactionRef } from '@tsfx/lib/trm/types';

/** A display unit: amounts are divided by `divisor`; percents never are. */
export interface Unit { id: string; label: string; divisor: number }
export const DEFAULT_UNITS: Unit[] = [
  { id: 'ABSOLUTE', label: 'Absolute', divisor: 1 },
  { id: 'THOUSANDS', label: 'Thousands', divisor: 1000 },
  { id: 'LAKHS', label: 'Lakhs', divisor: 100000 },
  { id: 'CRORES', label: 'Crores', divisor: 10000000 }
];

export type RowStyle = 'heading' | 'level1' | 'normal' | 'subtotal' | 'total' | 'percent' | 'warn';
/** 'rate': an exchange or interest rate, right-aligned to `scale` decimals (default 4); never unit-scaled or summed. */
export type ColumnType = 'text' | 'code' | 'amount' | 'percent' | 'date' | 'integer' | 'rate';

export interface ReportColumn {
  id: string;
  label: string;
  /** Second header line (e.g. the bucket's code). */
  subHeader?: string;
  type: ColumnType;
  /** Optional intentional column width; otherwise the shared table sizes it from type and visible content. */
  width?: number;
  /** Amount: the field holding its currency (sums never add two currencies). */
  currencyField?: string;
  /** Amount: decimals of its values (default 2; 3 for KWD, BHD or OMR), so subtotals and totals include every line. */
  scale?: number;
  /** Code: the field holding its description, shown as "CP001 - Axis Finance". */
  textField?: string;
  /** Formatted reports: a non-zero amount in this column drills. */
  drillable?: boolean;
  /** Business status colours are defined by the module, never guessed from a label. */
  statusTone?: (row: Row) => 'green' | 'amber' | 'red';
  /** A TRM transaction number (or, with kind 'class', a security class): shown as a link that opens its FTR_DISPLAY pop-up. */
  transaction?: TransactionRef;
}

/** drill(row, null, …) is the id-cell drill (the row total); drill(row, columnId, …) an amount cell. */
export type DrillTarget =
  | { kind: 'breakdown' }
  /** `open`: the key of one record to open there (an object module's ?open=). */
  | { kind: 'screen'; module: string; filters: Record<string, string>; open?: string; label: string }
  /** A custom page of the catalogue (a node with `page: <id>`), its params as the query. */
  | { kind: 'page'; page: string; params?: Record<string, string>; label: string }
  | { kind: 'none' };
export type ScreenTarget = Extract<DrillTarget, { kind: 'screen' }>;
export type PageTarget = Extract<DrillTarget, { kind: 'page' }>;
/** A target that navigates: what a tile, bar, card, box, row or explore link can hold. */
export type LinkTarget = ScreenTarget | PageTarget;

/**
 * A rolling date window on one entity date field: rows from the key date to the key date plus the days. `keyDate` and
 * `days` name selection fields (a date and an integer); the window filters only when both are filled.
 */
export interface ReportWindow { field: string; keyDate: string; days: string }

/** A report SAP formats: SAP builds the rows, their styles and the hierarchy. */
export interface FormattedReport {
  variant: 'formatted';
  /** Contract table read with the selection as filters. */
  entity: string;
  /** Fixed columns after the id column; an optional second header line (subHeader). */
  columns: ReportColumn[];
  /** Row id shown in the first column, drillable. */
  idField: string;
  /** Header of the id column (default "ID"). */
  idLabel?: string;
  /** Maps SAP's style value of a row to a RowStyle (anything else counts as normal). */
  style: (row: Row) => RowStyle;
  parent: { by: 'prefix'; separator: string } | { by: 'field'; field: string };
  /** A flag field and its option label, e.g. "Hide interest split rows". */
  hideFlag?: { field: string; label: string };
  /** Other entity fields the rows carry (style, parent, flags): read with the columns. */
  fields?: string[];
  /** Integer field holding SAP's row order; default idField. */
  orderBy?: string;
  /** Default 20,000. */
  maxRows?: number;
  window?: ReportWindow;
}

/** SAP sends flat rows; the layout picks, sorts, groups and subtotals them in the app. */
export interface LineItemReport {
  variant: 'lineItems';
  entity: string;
  /** All available columns; the layout picks and arranges them. */
  columns: ReportColumn[];
  /** The "Standard layout". */
  standard: LayoutState;
  /** Default 20,000. */
  maxRows?: number;
  /** Object module id: clicking a line opens it (the rows carry that module's key fields). */
  open?: string;
  layouts?: LayoutOptions;
  fields?: string[];
  window?: ReportWindow;
}
export type ReportDef = FormattedReport | LineItemReport;

export interface LayoutState {
  columns: string[];
  sort: { col: string; desc: boolean }[];
  subtotals: string[];
  unit: string | null;
  subtotalsOnly: boolean;
  /** Large lists only. */
  pageSize?: number;
}
export interface LayoutOptions {
  /** Default 5. */
  maxSort?: number;
  /** Default 3. */
  maxSubtotals?: number;
  /** SAP users who may save and delete shared layouts; default: everyone. */
  sharedEditors?: string[];
}
export const LAYOUT_LIMITS = { maxSort: 5, maxSubtotals: 3, name: 40, description: 60 } as const;

export type LayoutScope = 'shared' | 'personal';
export interface LayoutMeta { name: string; description: string; scope: LayoutScope; isDefault: boolean }
export interface SavedLayout extends LayoutMeta { layout: LayoutState; changedBy: string; changedOn: string }

export const DEFAULT_MAX_ROWS = 20000;

export interface ReportMeta { selection: Row; selectionText: string; readAt: string; total: number }
/** POST /api/modules/:id/report. */
export interface ReportResult { rows: Row[]; columns: ReportColumn[]; meta: ReportMeta }
/** POST /api/modules/:id/report/breakdown: the row as the report has it and its children. */
export interface BreakdownResult { row: Row; rows: Row[] }

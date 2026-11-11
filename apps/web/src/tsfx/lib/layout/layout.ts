// src/lib/layout/layout.ts
// ALV layouts (spec §4), ported from ALM src/pages/trm-repayment/layout.js: a layout normalised against the columns that
// exist now, rows sorted (subtotal columns first), nested subtotal lines with exact sums per currency, and the strict
// check of a layout the browser saves. Pure: runs in the browser and on the server.
import type { AnyField } from '@tsfx/lib/fields';
import { compareValues } from '@tsfx/lib/grid/sort';
import type { Row } from '@tsfx/lib/grid/types';
import { totalsByCurrency, type Total } from '@tsfx/lib/items/totals';
import { pageSizesOf, sortColumnsOf, type AnyList } from '@tsfx/lib/list/types';
import { LAYOUT_LIMITS, type LayoutMeta, type LayoutOptions, type LayoutScope, type LayoutState, type ReportColumn, type SavedLayout } from '@tsfx/lib/report/types';
import { HttpError } from '@tsfx/lib/errors';

/** What a layout may contain on one screen. */
export interface LayoutTarget {
  /** Every column id, in standard order. */
  columns: string[];
  labels: Record<string, string>;
  /** Text and code columns ([] on a large list). */
  subtotalColumns: string[];
  sortColumns: string[];
  maxSort: number;
  maxSubtotals: number;
  /** Unit ids a layout may name ([] → unit is always null). */
  units: string[];
  /** Large lists: the allowed page sizes; null for reports. */
  pageSizes: number[] | null;
  standard: LayoutState;
}

export const SUBTOTAL_TYPES: ReadonlySet<string> = new Set(['text', 'code']);

export function reportLayoutTarget(columns: ReportColumn[], standard: LayoutState, opts: LayoutOptions = {}, units: string[] = []): LayoutTarget {
  return {
    columns: columns.map(c => c.id), labels: Object.fromEntries(columns.map(c => [c.id, c.label])),
    subtotalColumns: columns.filter(c => SUBTOTAL_TYPES.has(c.type)).map(c => c.id), sortColumns: columns.map(c => c.id),
    maxSort: opts.maxSort ?? LAYOUT_LIMITS.maxSort, maxSubtotals: opts.maxSubtotals ?? LAYOUT_LIMITS.maxSubtotals, units, pageSizes: null, standard
  };
}

/** A large list (spec §4.1): columns, one server sort and the page size; no subtotals (grouping needs all rows). */
export function listLayoutTarget(list: AnyList): LayoutTarget {
  const columns = list.columns.map(c => c.field);
  const sizes = pageSizesOf(list);
  return {
    columns, labels: Object.fromEntries(list.columns.map(c => [c.field, c.label])), subtotalColumns: [],
    sortColumns: sortColumnsOf(list), maxSort: 1, maxSubtotals: 0, units: [], pageSizes: sizes,
    standard: { columns, sort: [{ col: list.defaultSort.field, desc: list.defaultSort.dir === -1 }], subtotals: [], unit: null, subtotalsOnly: false, pageSize: sizes[0] }
  };
}

const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * A layout reduced to what exists now (a saved layout may name a column a newer module no longer has): unknown or
 * duplicate columns, sorts and subtotals are dropped, limits applied; no column left → the Standard layout's columns.
 */
export function normalizeLayout(input: unknown, t: LayoutTarget): LayoutState {
  const l = isObject(input) ? input : {};
  const known = new Set(t.columns), sortable = new Set(t.sortColumns), groupable = new Set(t.subtotalColumns);
  const columns = [...new Set(list(l.columns).filter((c): c is string => typeof c === 'string' && known.has(c)))];
  const seen = new Set<string>();
  const sort = list(l.sort).flatMap(s => {
    const x = isObject(s) ? s : {};
    const col = typeof x.col === 'string' ? x.col : '';
    if (!sortable.has(col) || seen.has(col)) return [];
    seen.add(col);
    return [{ col, desc: x.desc === true }];
  }).slice(0, t.maxSort);
  const subtotals = [...new Set(list(l.subtotals).filter((c): c is string => typeof c === 'string' && groupable.has(c)))].slice(0, t.maxSubtotals);
  const unit = typeof l.unit === 'string' && t.units.includes(l.unit) ? l.unit : null;
  const size = Number(l.pageSize);
  const pageSize = t.pageSizes ? (t.pageSizes.includes(size) ? size : t.standard.pageSize ?? t.pageSizes[0]) : undefined;
  return {
    columns: columns.length ? columns : t.standard.columns.filter(c => known.has(c)),
    sort, subtotals, unit, subtotalsOnly: subtotals.length > 0 && l.subtotalsOnly === true,
    ...(pageSize !== undefined ? { pageSize } : {})
  };
}

function bad(message: string): never {
  throw new HttpError(400, message);
}

export interface LayoutInput extends LayoutMeta { layout: LayoutState }

/** A layout as the server stores it, or a 400 naming the first problem (the server's check; nothing is dropped silently). */
export function checkLayoutInput(raw: unknown, t: LayoutTarget): LayoutInput {
  const input = isObject(raw) ? raw : {};
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > LAYOUT_LIMITS.name) bad(`Enter a layout name of at most ${LAYOUT_LIMITS.name} characters.`);
  // eslint-disable-next-line no-control-regex -- refusing control characters is the point
  if (/[\u0000-\u001f\u007f]/.test(name)) bad('The layout name contains a control character.');
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (description.length > LAYOUT_LIMITS.description) bad(`The description allows at most ${LAYOUT_LIMITS.description} characters.`);
  if (input.scope !== 'shared' && input.scope !== 'personal') bad('Choose shared or personal.');
  const scope = input.scope as LayoutScope;
  if (!isObject(input.layout)) bad('Send the layout.');
  const l = input.layout as Record<string, unknown>;
  const label = (id: string) => t.labels[id] ?? id;
  const known = new Set(t.columns);

  if (!Array.isArray(l.columns) || !l.columns.length) bad('Choose at least one column.');
  const columns = l.columns as unknown[];
  for (const c of columns) if (typeof c !== 'string' || !known.has(c)) bad(`Unknown column ${String(c)}.`);
  if (new Set(columns).size !== columns.length) bad('A column is listed twice.');

  if (l.sort !== undefined && !Array.isArray(l.sort)) bad('The sort must be a list.');
  const sortRaw = list(l.sort);
  if (sortRaw.length > t.maxSort) bad(`Sort by at most ${t.maxSort} ${t.maxSort === 1 ? 'column' : 'columns'}.`);
  const sortable = new Set(t.sortColumns);
  const sort = sortRaw.map(s => {
    const x = isObject(s) ? s : {};
    const col = typeof x.col === 'string' ? x.col : '';
    if (!sortable.has(col)) bad(known.has(col) ? `Sorting by ${label(col)} is not allowed.` : `Unknown column ${col || '(none)'}.`);
    if (typeof x.desc !== 'boolean') bad('Give the sort direction.');
    return { col, desc: x.desc as boolean };
  });
  if (new Set(sort.map(s => s.col)).size !== sort.length) bad('A column is sorted twice.');

  if (l.subtotals !== undefined && !Array.isArray(l.subtotals)) bad('Subtotals must be a list.');
  const subtotals = list(l.subtotals);
  if (subtotals.length && !t.maxSubtotals) bad('This list has no subtotals.');
  if (subtotals.length > t.maxSubtotals) bad(`Subtotal at most ${t.maxSubtotals} columns.`);
  const groupable = new Set(t.subtotalColumns);
  for (const c of subtotals) {
    if (typeof c !== 'string' || !known.has(c)) bad(`Unknown column ${String(c)}.`);
    if (!groupable.has(c as string)) bad(`Subtotals are allowed on text columns only (${label(c as string)}).`);
  }
  if (new Set(subtotals).size !== subtotals.length) bad('A column is subtotalled twice.');

  const unit = l.unit === undefined || l.unit === null ? null : l.unit;
  if (unit !== null && (typeof unit !== 'string' || !t.units.includes(unit))) bad(`Unknown unit ${String(unit)}.`);
  if (l.subtotalsOnly !== undefined && typeof l.subtotalsOnly !== 'boolean') bad('subtotalsOnly must be true or false.');
  const subtotalsOnly = l.subtotalsOnly === true;
  if (subtotalsOnly && !subtotals.length) bad('Subtotal lines only needs at least one subtotal.');

  let pageSize: number | undefined;
  if (t.pageSizes) {
    if (!t.pageSizes.includes(Number(l.pageSize))) bad(`Page size must be one of ${t.pageSizes.join(', ')}.`);
    pageSize = Number(l.pageSize);
  } else if (l.pageSize !== undefined) bad('This report has no page size.');

  return {
    name, description, scope, isDefault: input.isDefault === true,
    layout: { columns: columns as string[], sort, subtotals: subtotals as string[], unit: unit as string | null, subtotalsOnly, ...(pageSize !== undefined ? { pageSize } : {}) }
  };
}

const NUMERIC = new Set(['amount', 'percent', 'integer', 'rate']);
const valueOf = (col: ReportColumn | undefined, row: Row): string | number => {
  const v = row[col?.id ?? ''] ?? '';
  return col && NUMERIC.has(col.type) && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v;
};

/** Rows ordered by the subtotal columns first (groups must be contiguous), then by the sort; blanks last either way. */
export function sortLayoutRows(rows: Row[], layout: LayoutState, columns: ReportColumn[]): Row[] {
  const byId = new Map(columns.map(c => [c.id, c]));
  const keys = [
    ...layout.subtotals.map(col => ({ col, desc: layout.sort.find(s => s.col === col)?.desc ?? false })),
    ...layout.sort.filter(s => !layout.subtotals.includes(s.col))
  ];
  if (!keys.length) return rows;
  return rows.map((row, i) => ({ row, i })).sort((a, b) => {
    for (const k of keys) {
      const c = byId.get(k.col);
      const av = valueOf(c, a.row), bv = valueOf(c, b.row);
      if (av === '' || bv === '') { if ((av === '') !== (bv === '')) return av === '' ? 1 : -1; continue; }
      // Subtotal columns group by exact value, so values compareValues calls equal (abc/ABC) still need a strict order.
      const strict = layout.subtotals.includes(k.col) ? (av < bv ? -1 : av > bv ? 1 : 0) : 0;
      const d = (compareValues(av, bv) || strict) * (k.desc ? -1 : 1);
      if (d) return d;
    }
    return a.i - b.i;
  }).map(x => x.row);
}

/** The amount columns as field definitions (with their currency field and scale), for totalsByCurrency. */
export const amountFields = (columns: ReportColumn[]): AnyField[] =>
  columns.filter(c => c.type === 'amount').map(c => ({
    field: c.id, label: c.label, type: 'amount' as const, ...(c.currencyField ? { currencyField: c.currencyField } : {}), ...(c.scale !== undefined ? { scale: c.scale } : {})
  }));

export interface SubtotalLine {
  type: 'subtotal';
  level: number;
  col: string;
  label: string;
  value: string;
  /** The value's description (the column's textField), '' without one. */
  text: string;
  key: string;
  count: number;
  collapsed: boolean;
  /** One entry per currency, exact. */
  totals: Total[];
}
export type GridLine = { type: 'row'; row: Row } | SubtotalLine;

/**
 * Grid lines of sorted rows: detail rows, each group closed by its subtotal line (level 0 outermost). A collapsed group
 * (by key) keeps only its subtotal line; `detail: false` shows subtotal lines only.
 */
export function buildGrid(rows: Row[], { subtotals, columns, collapsed = new Set<string>(), detail = true }: { subtotals: string[]; columns: ReportColumn[]; collapsed?: ReadonlySet<string>; detail?: boolean }): GridLine[] {
  const amounts = amountFields(columns), ids = amounts.map(a => a.field);
  const byId = new Map(columns.map(c => [c.id, c]));
  const walk = (group: Row[], level: number, path: string): GridLine[] => {
    if (level === subtotals.length) return detail ? group.map(row => ({ type: 'row' as const, row })) : [];
    const colId = subtotals[level], col = byId.get(colId);
    const out: GridLine[] = [];
    for (let i = 0; i < group.length;) {
      const value = group[i][colId] ?? '';
      let j = i;
      while (j < group.length && (group[j][colId] ?? '') === value) j++;
      const part = group.slice(i, j), key = `${path}\u0001${colId}=${value}`, folded = collapsed.has(key);
      if (!folded) out.push(...walk(part, level + 1, key));
      out.push({ type: 'subtotal', level, col: colId, label: col?.label ?? colId, value, text: col?.textField ? part[0][col.textField] ?? '' : '', key, count: part.length, collapsed: folded, totals: totalsByCurrency(part, amounts, ids) });
      i = j;
    }
    return out;
  };
  return walk(rows, 0, '');
}

/**
 * "Counterparty: CP001 - Axis Finance": the group a subtotal line closes. A text equal to the code is not repeated (SAP
 * value helps often send the key as the text when there is no description).
 */
export const subtotalLabel = (l: { label: string; value: string; text: string }): string =>
  `${l.label}: ${l.value || '(blank)'}${l.text && l.text !== l.value ? ` - ${l.text}` : ''}`;

export interface AlvModel { visible: ReportColumn[]; grid: GridLine[]; totals: Total[] }
/** What an ALV grid shows for a layout: its columns, its lines and the grand total per currency (of all rows given). */
export function alvModel(columns: ReportColumn[], layout: LayoutState, rows: Row[], collapsed: ReadonlySet<string> = new Set<string>()): AlvModel {
  const byId = new Map(columns.map(c => [c.id, c]));
  const visible = layout.columns.map(id => byId.get(id)).filter((c): c is ReportColumn => Boolean(c));
  const grid = buildGrid(sortLayoutRows(rows, layout, columns), { subtotals: layout.subtotals, columns, collapsed, detail: !layout.subtotalsOnly });
  const amounts = amountFields(columns);
  return { visible, grid, totals: totalsByCurrency(rows, amounts, amounts.map(a => a.field)) };
}

/** The layout that opens (spec §4.3): the user's personal default, else the shared default, else none (Standard). */
export const defaultLayout = (layouts: SavedLayout[]): SavedLayout | null =>
  layouts.find(l => l.scope === 'personal' && l.isDefault) ?? layouts.find(l => l.scope === 'shared' && l.isDefault) ?? null;

export function toggleKey(set: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key); else next.add(key);
  return next;
}

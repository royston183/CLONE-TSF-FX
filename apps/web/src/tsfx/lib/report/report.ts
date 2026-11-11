// Reports (spec §3): the fields and list of the report entity, the selection as filters and its checks, the rows of a
// formatted report as shown, breakdown children and cell text. Shared by browser and server; pure.
import { cleanValues, formatField, problemText, typeOf, valueFields, type AnyField, type FieldDef } from '@tsfx/lib/fields';
import { formatDate } from '@tsfx/lib/fields/parse';
import { checkRow } from '@tsfx/lib/grid/grid';
import type { Row } from '@tsfx/lib/grid/types';
import type { AnyList, ListFilter } from '@tsfx/lib/list/types';
import type { ErrorDetail } from '@tsfx/lib/errors';
import type { AnyReportDef } from '@tsfx/modules/types';
import { DEFAULT_MAX_ROWS, type ColumnType, type FormattedReport, type ReportColumn, type RowStyle, type Unit } from './types';
import { formatInUnit, formatPercent, inUnit, isZero } from './units';

export const maxRowsOf = (def: AnyReportDef): number => def.report.maxRows ?? DEFAULT_MAX_ROWS;
export const tooManyRows = (max: number): string => `Too many rows (more than ${max.toLocaleString('en-US')}). Narrow the selection.`;

// Codes, percents and integers keep SAP's text; amounts and dates convert by type (OData codec, list-query builder).
const FIELD_TYPE: Record<ColumnType, AnyField['type']> = { text: 'text', code: 'text', amount: 'amount', percent: 'text', date: 'date', integer: 'text', rate: 'text' };

/** The selection fields that only feed the window (key date, days): they are not entity fields, so never filters. */
const windowInputs = (def: AnyReportDef): Set<string> => (def.report.window ? new Set([def.report.window.keyDate, def.report.window.days]) : new Set());

/** Every field of the report entity, typed: selection fields, the order and id fields, columns, then extra fields. */
export function reportFieldDefs(def: AnyReportDef): AnyField[] {
  const r = def.report;
  const out: AnyField[] = [];
  const seen = new Set<string>();
  const add = (d: AnyField) => { if (!seen.has(d.field)) { seen.add(d.field); out.push(d); } };
  const skip = windowInputs(def);
  valueFields(def.selection).filter(d => !skip.has(d.field)).forEach(add);
  if (r.window) add({ field: r.window.field, label: r.window.field, type: 'date' });
  if (r.variant === 'formatted') {
    if (r.orderBy) add({ field: r.orderBy, label: r.orderBy, type: 'integer' });
    add({ field: r.idField, label: r.idLabel ?? r.idField, type: 'text' });
  }
  for (const c of r.columns) {
    add({ field: c.id, label: c.label, type: FIELD_TYPE[c.type], ...(c.currencyField ? { currencyField: c.currencyField } : {}), ...(c.type === 'amount' && c.scale !== undefined ? { scale: c.scale } : {}) });
    if (c.currencyField) add({ field: c.currencyField, label: c.currencyField, type: 'text' });
    if (c.textField) add({ field: c.textField, label: c.textField, type: 'text' });
  }
  for (const f of r.fields ?? []) add({ field: f, label: f, type: 'text' });
  return out;
}

/** The field the rows are read in order of: SAP's order field (formatted) or the first column (line items). */
const orderField = (def: AnyReportDef): string =>
  def.report.variant === 'formatted' ? def.report.orderBy ?? def.report.idField : def.report.columns[0]?.id ?? '';

/** A list over the report entity, so a selection runs through the list-query builder (one page of maxRows + 1). */
export function reportList(def: AnyReportDef): AnyList {
  const order = orderField(def);
  const skip = windowInputs(def);
  return {
    entity: def.report.entity, keys: [order], columns: [], fields: reportFieldDefs(def),
    filters: [...valueFields(def.selection).map(d => d.field).filter(f => !skip.has(f)), ...(def.report.window ? [def.report.window.field] : [])],
    defaultSort: { field: order, dir: 1 }, pageSizes: [maxRowsOf(def) + 1]
  };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** The ISO date `days` after `iso` (UTC, so no daylight-saving drift); '' when either is not valid. */
function addDays(iso: string, days: string): string {
  if (!ISO_DATE.test(iso) || !/^\d{1,5}$/.test(days)) return '';
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + Number(days));
  return d.toISOString().slice(0, 10);
}

/**
 * The selection as filters, never throwing: one eq filter per filled field (an empty optional field does not filter);
 * a date range (two fields) is one between filter; a filled window is a between filter on its
 * field from the key date over the days.
 */
export function reportFilters(def: AnyReportDef, selection: Row): ListFilter[] {
  const skip = windowInputs(def);
  const out: ListFilter[] = [];
  for (const d of def.selection) {
    if (d.computed) continue;
    if (typeOf(d) === 'dateRange') {
      // Two fields (toField); a range without toField has no end field to read and does not filter.
      const from = selection[d.field] ?? '', to = d.toField ? selection[d.toField] ?? '' : '';
      if (d.toField && (from || to)) out.push({ field: d.field, op: 'between', values: [from, to] });
      continue;
    }
    for (const v of valueFields([d])) if (selection[v.field] && !skip.has(v.field)) out.push({ field: v.field, op: 'eq', values: [selection[v.field]] });
  }
  const w = def.report.window;
  const end = w ? addDays(selection[w.keyDate] ?? '', selection[w.days] ?? '') : '';
  if (w && end) out.push({ field: w.field, op: 'between', values: [selection[w.keyDate], end] });
  return out;
}

/** The selection as the server accepts it and its problems: field types first, then the module's check. */
export function checkReportSelection<L>(def: { selection: FieldDef<L>[]; check?: (selection: Row, lk: L) => { field?: string; message: string }[] }, raw: unknown, lk: L): { selection: Row; problems: ErrorDetail[] } {
  const selection = cleanValues(def.selection, raw);
  const problems: ErrorDetail[] = Object.entries(checkRow({ grid: def.selection }, selection, lk, 'edit'))
    .filter(([, p]) => p).map(([field, p]) => ({ field, message: problemText(def.selection, field, p) }));
  if (!problems.length) for (const p of def.check?.(selection, lk) ?? []) problems.push({ ...(p.field ? { field: p.field } : {}), message: p.message });
  return { selection, problems };
}

/** "1000 - Demo India Ltd · 01-2026": the selection as the report header, the export and the from bar show it. */
export const selectionText = (fields: AnyField[], selection: Row, lk: unknown): string =>
  fields.map(d => formatField(d, selection, lk)).filter(Boolean).join(' · ');

/** ALM's row classes of the quarterly reports. */
export const ROW_CLASS: Record<RowStyle, string> = {
  heading: 'qr-heading', level1: 'qr-level1', normal: '', subtotal: 'qr-subtotal', total: 'qr-cumulative', percent: 'qr-percent', warn: 'qr-mismatch'
};
const STYLES = new Set<string>(Object.keys(ROW_CLASS));
export function rowStyleOf(report: FormattedReport, row: Row): RowStyle {
  const s = report.style(row);
  return STYLES.has(s) ? s : 'normal';
}

const amountIds = (report: FormattedReport) => report.columns.filter(c => c.type === 'amount').map(c => c.id);
/** The column an id-cell drill shows: the last amount column (the total). */
export const amountColumnOf = (report: FormattedReport): ReportColumn | undefined => report.columns.filter(c => c.type === 'amount').at(-1);

/**
 * Rows as a formatted report shows them: a normal row whose amounts are all zero is hidden unless `showZero`; rows with
 * the hide flag set are hidden when `hideFlagged`; `search` matches the id and the text and code columns.
 */
export function visibleFormatted(report: FormattedReport, rows: Row[], { showZero, hideFlagged, search }: { showZero: boolean; hideFlagged: boolean; search: string }): Row[] {
  const amounts = amountIds(report);
  const texts = [report.idField, ...report.columns.filter(c => c.type === 'text' || c.type === 'code').map(c => c.id)];
  const q = search.trim().toLowerCase();
  return rows.filter(r => {
    // Without amount columns there is nothing to be zero: every row shows.
    if (!showZero && amounts.length > 0 && rowStyleOf(report, r) === 'normal' && amounts.every(a => isZero(r[a]))) return false;
    if (hideFlagged && report.hideFlag && r[report.hideFlag.field] === 'X') return false;
    return !q || texts.some(f => (r[f] ?? '').toLowerCase().includes(q));
  });
}

/** The direct children of a row by the declared parent rule (prefix: the id, the separator and one more segment). */
export function childrenOf(report: FormattedReport, rows: Row[], rowId: string): Row[] {
  const id = (r: Row) => r[report.idField] ?? '';
  if (report.parent.by === 'field') {
    const field = report.parent.field;
    return rows.filter(r => r[field] === rowId && id(r) !== rowId);
  }
  const sep = report.parent.separator;
  const prefix = `${rowId}${sep}`;
  return sep ? rows.filter(r => id(r).startsWith(prefix) && !id(r).slice(prefix.length).includes(sep)) : [];
}

const codeText = (column: ReportColumn, row: Row) => {
  const v = row[column.id] ?? '';
  const text = column.textField ? row[column.textField] ?? '' : '';
  return text ? `${v} - ${text}` : v;
};

/** A rate to its decimals (default 4); blank stays blank, text that is not a number stays as it is. */
const rateText = (v: string, scale = 4): string => (v === '' || Number.isNaN(Number(v)) ? v : Number(v).toFixed(scale));

/** A cell as the screen shows it: amounts in the unit (zero blank; a percent row unscaled), dates DD-MM-YYYY, codes with text. */
export function cellText(column: ReportColumn, row: Row, unit: Unit, percentRow = false): string {
  const v = row[column.id] ?? '';
  switch (column.type) {
    case 'amount': return percentRow ? formatPercent(v) : formatInUnit(v, unit, true);
    case 'percent': return formatPercent(v);
    case 'rate': return rateText(v, column.scale);
    case 'date': return formatDate(v);
    case 'code': return codeText(column, row);
    default: return v;
  }
}

const FORMULA = /^[=+\-@\t\r]/;
const plain: Record<ColumnType, boolean> = { text: true, code: true, amount: false, percent: false, date: false, integer: false, rate: false };
/**
 * A cell as the export writes it: amounts as plain numbers in the unit (blank when zero, unless `total`), percents
 * unscaled, dates DD-MM-YYYY, codes with their text. The formula guard is the CSV's (csvText): an xlsx text cell is an
 * inline string, never a formula, so it keeps the text as it is.
 */
export function exportCell(column: ReportColumn, row: Row, unit: Unit, percentRow = false, total = false): string {
  const v = row[column.id] ?? '';
  if (column.type === 'amount') {
    if (percentRow) return inUnit(v, 1);
    return !total && isZero(v) ? '' : inUnit(v || '0', unit.divisor);
  }
  if (column.type === 'percent') return inUnit(v, 1);
  if (column.type === 'rate') return rateText(v, column.scale);
  if (column.type === 'date') return formatDate(v);
  return column.type === 'code' ? codeText(column, row) : v;
}

/** A CSV cell of a text or code column: text a spreadsheet would read as a formula gets a leading apostrophe. */
export const csvText = (type: ColumnType, text: string): string => (plain[type] && FORMULA.test(text) ? `'${text}` : text);

/** Line items matching a search over their text and code columns (with descriptions); a blank search keeps all. */
export function searchRows(rows: Row[], columns: ReportColumn[], search: string): Row[] {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  const fields = columns.filter(c => c.type === 'text' || c.type === 'code').flatMap(c => (c.textField ? [c.id, c.textField] : [c.id]));
  return rows.filter(r => fields.some(f => (r[f] ?? '').toLowerCase().includes(q)));
}

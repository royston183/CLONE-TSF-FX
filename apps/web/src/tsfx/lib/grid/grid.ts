// Table and grid logic shared by the Workbench (browser) and the change planner (server).
// Ported from ALM src/pages/maintenance/grid.js.
import type { Checked, Column, GridColumn, GridRow, Mode, Option, Row, RowRules, StampFields, TabDef, UiState } from './types';
import { sortRows } from './sort';
import { behaviourOf, checkFields, expand, isFlag, optionsFor, typeOf, valueFields } from '@tsfx/lib/fields';

export const str = (v: unknown): string => (v == null ? '' : String(v).trim());
export const code = (v: unknown, n: number): string => str(v).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, n);
export const text = (v: unknown, n: number): string => str(v).replace(/\s+/g, ' ').slice(0, n);
export const flagText = (v: unknown): string => (v === 'X' ? 'Yes' : 'No');
/** Blank for empty or all-zero numbers, as the legacy SAP tables showed them. */
export const zeroBlank = (v: unknown): string => (/^0*$/.test(str(v)) ? '' : str(v));

/** SAP date (YYYYMMDD or YYYY-MM-DD…) as DD-MM-YYYY; 00000000 is blank. */
export function fmtDate(v: unknown): string {
  const s = str(v);
  if (/^\d{8}$/.test(s)) return s === '00000000' ? '' : `${s.slice(6, 8)}-${s.slice(4, 6)}-${s.slice(0, 4)}`;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : s;
}

/** SAP time HHMMSS as HH:MM:SS. */
export function fmtTime(v: unknown): string {
  const s = str(v);
  return /^\d{6}$/.test(s) ? `${s.slice(0, 2)}:${s.slice(2, 4)}:${s.slice(4, 6)}` : s;
}

/** "USER on DD-MM-YYYY at HH:MM:SS", just the user, or blank. */
export function fmtStamp(by: unknown, date: unknown, time: unknown): string {
  const user = str(by);
  if (!user || user === '-') return '';
  const d = fmtDate(date), t = fmtTime(time);
  return d ? `${user} on ${d}${t ? ` at ${t}` : ''}` : user;
}

function stampSort(date: unknown, time: unknown): number {
  const m = str(date).match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  return (m ? Number(m[1] + m[2] + m[3]) : 0) * 1e6 + (Number(str(time).replace(/\D/g, '')) || 0);
}

/** Created By / Changed By columns from the six stamp fields. */
export const stampCols = ([cb, cd, ct, hb, hd, ht]: StampFields): Column[] => [
  { field: '_created', label: 'Created By', text: r => fmtStamp(r[cb], r[cd], r[ct]), sort: r => stampSort(r[cd], r[ct]) },
  { field: '_changed', label: 'Changed By', text: r => fmtStamp(r[hb], r[hd], r[ht]), sort: r => stampSort(r[hd], r[ht]) }
];

export const col = (field: string, label: string, extra: Partial<Column> = {}): Column => ({ field, label, text: r => str(r[field]), ...extra });
export const flagCol = (field: string, label: string): Column => col(field, label, { text: r => flagText(r[field]) });

export const keyOf = (tab: { keys: string[] }, row: Row): string => tab.keys.map(k => str(row[k])).join('~');
export const freshUi = (tab: { defaultSort: UiState['sort'] }): UiState => ({ search: '', filters: {}, columnFilters: {}, sort: tab.defaultSort, selected: [] });

/** Options of a select column; they may depend on lookups loaded from SAP. */
export const optionsOf = <L>(c: GridColumn<L>, lk: L): Option[] => optionsFor(c, lk);

/** Start values of the edit grid for an existing row: every value field (a range's end date, a period's year too); flags as booleans. */
export function editValues<L>(tab: { grid: GridColumn<L>[] }, row: Row): GridRow['values'] {
  return Object.fromEntries(valueFields(tab.grid).map(c => [c.field, isFlag(c) ? row[c.field] === 'X' : row[c.field] ?? '']));
}

/** Value of one grid cell as the server will receive it (flags: true -> 'X'). */
export function cellValue<L>(c: GridColumn<L>, raw: string | boolean | undefined): string {
  return behaviourOf(c).clean(raw ?? '', c);
}

/**
 * A pasted spreadsheet value for one grid column. Selects accept the code, label or description, then
 * (as the legacy SAP screens did) the first option whose text starts with the same letter.
 */
export function pasteValue<L>(c: GridColumn<L>, v: string, lk: L): string | boolean {
  if (isFlag(c)) return /^(x|true|yes|y|1)$/i.test(str(v));
  return behaviourOf(c).paste(v, c, lk);
}

/** Paste order: each value field in column order; computed and display columns keep their place and are skipped. */
const pasteColumns = <L>(tab: { grid: GridColumn<L>[] }): GridColumn<L>[] => tab.grid.flatMap(c => (c.computed || typeOf(c) === 'display' ? [c] : expand(c)));

/** Spreadsheet cells from the clipboard, or null when it holds a single value (an ordinary paste). */
export function parseClipboard(clip: string): string[][] | null {
  const body = clip.replace(/\r?\n$/, '');
  if (!/[\t\n]/.test(body)) return null;
  // Blank lines are blank cells: dropping them would move every later value up one row.
  return body.split(/\r?\n/).map(line => line.split('\t'));
}

/**
 * Grid rows after pasting a spreadsheet block at (rowIndex, field). Columns follow the grid's visible order;
 * computed columns and (in edit mode) key columns keep their position but are skipped. Add mode appends rows.
 */
export function pasteInto<L>(tab: { grid: GridColumn<L>[] }, mode: Mode, rows: GridRow[], rowIndex: number, field: string, clip: string, lk: L, newRow: () => GridRow): GridRow[] | null {
  const lines = parseClipboard(clip);
  if (!lines) return null;
  const columns = pasteColumns(tab);
  const start = columns.findIndex(c => c.field === field);
  const writable = (c: GridColumn<L>) => !c.computed && typeOf(c) !== 'display' && !(mode === 'edit' && c.key);
  const next = [...rows];
  lines.forEach((cells, i) => {
    const at = rowIndex + i;
    if (at >= next.length) {
      if (mode !== 'add') return;
      next.push(newRow());
    }
    const values = { ...next[at].values };
    cells.forEach((v, j) => {
      const c = columns[start + j];
      if (!c || !writable(c)) return;
      values[c.field] = pasteValue(c, v, lk);
      // A whole period in one cell ('04-2026', '2026-04') fills the year too; a later cell may still overwrite it.
      const period = tab.grid.find(d => d.field === c.field && typeOf(d) === 'period' && d.yearField);
      const year = period && values[c.field] ? /(?:^|\D)(\d{4})(?:\D|$)/.exec(str(v))?.[1] : undefined;
      if (period && year) values[period.yearField!] = year;
    });
    next[at] = { ...next[at], values };
  });
  return next;
}

/** Field-type problems first, then the module's own rules: a non-empty module message replaces the type message of that field. */
export function checkRow<L>(rules: RowRules<L>, row: Row, lk: L, mode: Mode): Record<string, string> {
  const out = checkFields(rules.grid, row, lk);
  for (const [field, problem] of Object.entries(rules.check?.(row, lk, mode) ?? {})) if (problem) out[field] = problem;
  return out;
}

/** Normalizes grid rows and reports what the server would reject. */
export function validateGrid<L>(tab: TabDef<L>, gridRows: GridRow[], existingRows: Row[], mode: Mode, lk: L): Checked[] {
  const cols = valueFields(tab.grid);
  const existing = new Set(existingRows.map(r => keyOf(tab, r)));
  const seen = new Set<string>();
  return gridRows.map(g => {
    const row: Row = Object.fromEntries(cols.map(c => [c.field, cellValue(c, g.values[c.field])]));
    const blank = cols.every(c => isFlag(c) || !row[c.field]);
    const bad: Record<string, string> = {};
    if (!blank) {
      for (const [field, problem] of Object.entries(checkRow(tab, row, lk, mode))) if (problem) bad[field] = problem;
      const first = tab.keys[0];
      const missingKey = tab.keys.find(k => !row[k]);
      if (missingKey) bad[missingKey] = 'required';
      else {
        const key = keyOf(tab, row);
        if (seen.has(key)) bad[first] = 'duplicate';
        seen.add(key);
        if (mode === 'add' && existing.has(key)) bad[first] = 'exists';
        if (mode === 'edit' && !existing.has(key)) bad[first] = 'missing';
      }
    }
    const changed = mode !== 'edit' || cols.some(c => !c.key && row[c.field] !== cellValue(c, g.orig?.[c.field]));
    const desc = Object.fromEntries(tab.grid.filter(c => c.describe).map(c => [c.field, c.describe ? c.describe(row, lk) || '' : '']));
    return { id: g.id, row, blank, bad, desc, valid: !blank && !Object.keys(bad).length, changed };
  });
}

/**
 * A stored date as YYYY-MM-DD, whatever form it came in (2026-11-06, 2026-11-06T00:00:00Z, 20261106, 06-11-2026), or ''.
 * Only the calendar day is kept, never converted through a time zone, so a date filter matches the day SAP stored.
 */
export function isoDay(value: unknown): string {
  const t = str(value).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})[-./](\d{2})[-./](\d{4})$/.exec(t);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

/** Rows visible after the filter bar, the column filters and the sort. */
export function visibleRows<L>(tab: TabDef<L>, rows: Row[], ui: UiState): Row[] {
  const q = ui.search.trim().toLowerCase();
  const filtered = rows.filter(r =>
    tab.filters.every(f => !ui.filters[f.id] || f.match(r, ui.filters[f.id])) &&
    (!q || tab.search(r).join(' ').toLowerCase().includes(q)) &&
    tab.columns.every(c => !ui.columnFilters[c.field]?.length || ui.columnFilters[c.field].includes(c.text(r))));
  const c = tab.columns.find(x => x.field === ui.sort.col);
  return c ? sortRows(filtered, r => (c.sort ? c.sort(r) : c.text(r)), ui.sort) : filtered;
}

/** Distinct display values of one column under every other active filter (the Excel-style filter list). */
export function columnValues<L>(tab: TabDef<L>, rows: Row[], ui: UiState, column: Column): string[] {
  const scoped = visibleRows(tab, rows, { ...ui, columnFilters: { ...ui.columnFilters, [column.field]: [] } });
  return [...new Set(scoped.map(r => column.text(r)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

/**
 * The rows to send to the server: each validated row plus the ETag of the SAP row it was opened from, so SAP can
 * refuse the change (412 → "changed by someone else") instead of overwriting a newer save.
 */
export function rowsToSave(checked: Checked[], gridRows: GridRow[]): Row[] {
  const byId = new Map(gridRows.map(g => [g.id, g]));
  return checked.map(c => {
    const etag = byId.get(c.id)?.orig?.__etag;
    return etag ? { ...c.row, __etag: etag } : c.row;
  });
}

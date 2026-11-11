// src/lib/grid/edit-rows.ts
// Inline grids (object items, header + items): stored rows ↔ grid rows, blank rows, keys of stored rows, problems.
import { cleanValues, isFlag, valueFields, type AnyField } from '@tsfx/lib/fields';
import { cellValue } from './grid';
import type { GridRow, Row } from './types';

/** Grid rows for stored rows: every value field (flags as booleans); the stored row stays as `orig`. */
export function gridRowsOf(fields: AnyField[], rows: Row[], make: (values: GridRow['values'], orig?: Row) => GridRow): GridRow[] {
  return rows.map(r => make(Object.fromEntries(valueFields(fields).map(c => [c.field, isFlag(c) ? r[c.field] === 'X' : r[c.field] ?? ''])), r));
}

/** Cleaned rows of a grid without its new blank rows, and for each the grid index it came from. */
export function rowsOfGrid(fields: AnyField[], grid: GridRow[]): { rows: Row[]; index: number[] } {
  const cols = valueFields(fields);
  const keys = new Set(fields.filter(f => f.key).map(f => f.field));
  const rows: Row[] = [], index: number[] = [];
  grid.forEach((g, i) => {
    const row: Row = Object.fromEntries(cols.map(c => [c.field, cellValue(c, g.values[c.field])]));
    // A new row holding nothing but its (auto-filled) key is blank: neither checked nor saved.
    const blank = cols.every(c => isFlag(c) || keys.has(c.field) || !row[c.field]);
    if (blank && !g.orig) return;
    rows.push(row);
    index.push(i);
  });
  return { rows, index };
}

/** Rows opened from storage keep their key values: a paste never re-keys an existing row. */
export function keepKeys(fields: AnyField[], rows: GridRow[]): GridRow[] {
  const keys = fields.filter(f => f.key).map(f => f.field);
  return rows.map(r => (r.orig ? { ...r, values: { ...r.values, ...Object.fromEntries(keys.map(k => [k, r.orig?.[k] ?? ''])) } } : r));
}

/** Problems of cleaned rows (1-based row numbers) by grid index and field; a problem of the whole row sits under ''. */
export function problemsByGrid(list: { row?: number; field?: string; message: string }[], index: number[]): Record<number, Record<string, string>> {
  const out: Record<number, Record<string, string>> = {};
  for (const p of list) {
    const i = p.row ? index[p.row - 1] : undefined;
    if (i === undefined) continue;
    (out[i] ??= {})[p.field ?? ''] = p.message;
  }
  return out;
}

/** Whether a new object differs from its defaults: compared as cleaned values, so a field typed then cleared is no change. */
export function changedFromDefaults(fields: AnyField[], defaults: Row, header: Row, items: Record<string, Row[]>): boolean {
  return JSON.stringify(cleanValues(fields, defaults)) !== JSON.stringify(cleanValues(fields, header)) || Object.values(items).some(r => r.length > 0);
}

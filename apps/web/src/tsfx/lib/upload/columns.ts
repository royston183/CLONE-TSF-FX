// Spreadsheet columns → fields (spec §6.2): the first non-empty row holds the headings; a column is matched to a field
// by its label (without ' *') or its field name, ignoring case and spaces. Shared by browser and tests.
import { behaviourOf, isFlag, labelOf, valueFields, type AnyField } from '@tsfx/lib/fields';
import type { Row } from '@tsfx/lib/grid/types';

export interface MatchedRows { rows: Row[]; lines: number[]; ignored: string[] }
const norm = (s: string) => s.replace(/\s*\*\s*$/, '').replace(/\s+/g, '').toLowerCase();

export function matchColumns(defs: AnyField[], table: { line: number; cells: string[] }[]): MatchedRows {
  const head = table.findIndex(r => r.cells.some(c => c.trim()));
  if (head < 0) throw new Error('The file is empty.');
  const headings = table[head].cells.map(norm);
  const fields = valueFields(defs);
  const column = new Map<string, number>();
  for (const d of fields) {
    const i = headings.findIndex(h => h && (h === norm(labelOf(d)) || h === norm(d.field)));
    if (i >= 0) column.set(d.field, i);
  }
  const missing = fields.filter(d => (d.required || d.key) && !column.has(d.field));
  if (missing.length) {
    throw new Error(`The file has no ${missing.map(d => `"${labelOf(d)}"`).join(', ')} column${missing.length > 1 ? 's' : ''}. The first row of the first worksheet must hold the column headings, as in the template.`);
  }
  const used = new Set(column.values());
  const ignored = table[head].cells.filter((c, i) => c.trim() && !used.has(i));
  const rows: Row[] = [], lines: number[] = [];
  for (const r of table.slice(head + 1)) {
    const row: Row = Object.fromEntries(fields.map(d => { const i = column.get(d.field); return [d.field, i === undefined ? '' : (r.cells[i] ?? '').trim()]; }));
    if (!Object.values(row).some(Boolean)) continue;
    rows.push(row);
    lines.push(r.line);
  }
  return { rows, lines, ignored };
}

/** File text as field values, read the way a paste from Excel is ('April' → '04', '125,000.5' → '125000.50'); text a field cannot read is kept for the server's check. */
export function toFieldValues(defs: AnyField[], row: Row, lk: unknown): Row {
  return Object.fromEntries(valueFields(defs).map(d => {
    const raw = row[d.field] ?? '';
    if (isFlag(d)) return [d.field, behaviourOf(d).clean(raw, d)];
    return [d.field, behaviourOf(d).paste(raw, d, lk) || raw.trim()];
  }));
}

/** The template's headings: one per value field, in field order. */
export const templateHeadings = (defs: AnyField[]): string[] => valueFields(defs).map(d => labelOf(d));

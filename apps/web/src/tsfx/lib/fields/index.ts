// src/lib/fields/index.ts
// Field types shared by the browser (grid, forms) and the server (planner, OData). See the spec
// docs/superpowers/specs/2026-10-11-ui-kit-and-gallery-design.md §2.
import type { Row } from '@tsfx/lib/grid/types';
import { BEHAVIOURS, labelOf } from './behaviours';
import { formatDate } from './parse';
import type { AnyField, FieldBehaviour, FieldType } from './types';

export * from './types';
export { BEHAVIOURS, labelOf, matchOption, optionsFor } from './behaviours';

export function typeOf(d: AnyField): FieldType {
  return d.type ?? (d.flag ? 'flag' : d.options ? 'select' : d.lookup ? 'suggest' : 'text');
}
export const isFlag = (d: AnyField): boolean => ['flag', 'toggle'].includes(typeOf(d));
export const behaviourOf = (d: AnyField): FieldBehaviour => BEHAVIOURS[typeOf(d)];
/**
 * The side a table column's heading and cells sit on: the column's own `align`, else its field's (amounts and numbers
 * right), else left. A right column carries the class `kit-num` on its heading and its cells.
 */
export function alignOf(field: string, defs: AnyField[], own?: 'left' | 'right'): 'left' | 'right' {
  if (own) return own;
  const d = defs.find(x => x.field === field);
  return d && behaviourOf(d).align === 'right' ? 'right' : 'left';
}
/** The heading and cell class of a column on this side ('' on the left). */
export const alignClass = (side: 'left' | 'right'): string => (side === 'right' ? 'kit-num' : '');

export { MONTHS } from './months';
import { MONTHS } from './months';

/** The value fields of one definition: a date range is two dates, a period a month and a year. */
export function expand(d: AnyField): AnyField[] {
  const t = typeOf(d);
  if (t === 'dateRange' && d.toField) return [{ ...d, type: 'date' }, { field: d.toField, label: `${labelOf(d)} To`, type: 'date', required: d.required }];
  if (t === 'period' && d.yearField) {
    return [{ ...d, type: 'select', options: MONTHS }, { field: d.yearField, label: `${labelOf(d)} Year`, type: 'integer', max: 4, required: d.required }];
  }
  return [d];
}

/** Every field that holds a value (computed and display fields never do), composites expanded. */
export const valueFields = (defs: AnyField[]): AnyField[] => defs.filter(d => !d.computed && typeOf(d) !== 'display').flatMap(expand);

/** Field → problem ('' when fine; 'required' only highlights). Modules call this, then add their business rules. */
export function checkFields(defs: AnyField[], row: Row, lk: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of valueFields(defs)) {
    const v = row[d.field] ?? '';
    out[d.field] = !v ? (d.required ? 'required' : '') : behaviourOf(d).check(v, d, { row, lk });
  }
  for (const d of defs) {
    if (typeOf(d) !== 'dateRange' || !d.toField) continue;
    const from = row[d.field], to = row[d.toField];
    if (from && to && !out[d.field] && !out[d.toField] && from > to) out[d.toField] = `${labelOf(d)}: the end date must not be before the start date.`;
  }
  return out;
}

/** A field as tables and review dialogs show it. */
export function formatField(d: AnyField, row: Row, lk: unknown): string {
  if (d.computed) return d.computed(row, lk);
  const t = typeOf(d);
  if (t === 'dateRange' && d.toField) {
    return [row[d.field], row[d.toField]].map(v => formatDate(v ?? '')).filter(Boolean).join(' – ');
  }
  if (t === 'period' && d.yearField) {
    return [row[d.field], row[d.yearField]].filter(Boolean).join('-');
  }
  return behaviourOf(d).format(row[d.field] ?? '', d, { row, lk });
}

/** A row as the server accepts it: every value field cleaned by its type; other properties are dropped. */
export function cleanValues(defs: AnyField[], raw: unknown): Row {
  const input = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(valueFields(defs).map(d => [d.field, behaviourOf(d).clean(input[d.field] ?? '', d)]));
}

/** A one-word problem ('required', 'duplicate') as a sentence with the field's label; a sentence stays as it is. */
export function problemText(defs: AnyField[], field: string, problem: string): string {
  if (problem.includes(' ')) return problem;
  const d = valueFields(defs).find(x => x.field === field);
  return `${d ? labelOf(d) : field} is ${problem}`;
}

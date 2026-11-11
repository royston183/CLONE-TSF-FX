// src/lib/list/pagination.ts
import { typeOf, type AnyField } from '@tsfx/lib/fields';
import { parseAmountInput } from '@tsfx/lib/fields/parse';
import type { AnyList, FilterOp, ListFilter } from './types';

const group = (n: number) => n.toLocaleString('en-US');

/** ALM's pagination text: "1–100 of 48,213". */
export function rangeText(page: number, pageSize: number, total: number): string {
  if (!total) return '0 records';
  const from = (page - 1) * pageSize + 1, to = Math.min(page * pageSize, total);
  return `${group(from)}–${group(to)} of ${group(total)}`;
}

export const lastPage = (pageSize: number, total: number): number => Math.max(1, Math.ceil(total / pageSize));

/** The filter-bar operator of a field: text contains, dates and numbers from–to, everything else equals. */
export function filterOp(def: AnyField): FilterOp {
  const t = typeOf(def);
  if (t === 'text') return 'contains';
  return ['date', 'amount', 'decimal', 'integer'].includes(t) ? 'between' : 'eq';
}

/** Filter-bar values (field → [value] or [from, to]) as query filters. A flag's "No" is '-' in the bar. */
export function filtersOf(list: AnyList, values: Record<string, string[]>): ListFilter[] {
  return (list.filters ?? []).flatMap((field): ListFilter[] => {
    const def = list.fields.find(d => d.field === field);
    if (!def) return [];
    const raw = values[field] ?? [];
    const v = typeOf(def) === 'amount' ? raw.map(value => parseAmountInput(value, def.scale ?? 2) ?? value) : raw;
    const op = filterOp(def);
    if (op === 'between') return v[0] || v[1] ? [{ field, op, values: [v[0] ?? '', v[1] ?? ''] }] : [];
    if (!v[0]) return [];
    return [{ field, op, values: [v[0] === '-' ? '' : v[0]] }];
  });
}

/** The page to show when the total changed under the reader: the last page, never beyond it. */
export const clampPage = (page: number, total: number, pageSize: number): number => (total > 0 ? Math.min(Math.max(1, page), lastPage(pageSize, total)) : Math.max(1, page));

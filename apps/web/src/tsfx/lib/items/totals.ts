// src/lib/items/totals.ts
// Footer totals of an items grid: amount fields summed per currency, exactly (scaled BigInt, never floats).
import type { AnyField } from '@tsfx/lib/fields';
import { parseAmount } from '@tsfx/lib/fields/parse';
import type { Row } from '@tsfx/lib/grid/types';

export interface Total { currency: string; sums: Record<string, string> }

const toUnits = (v: string, scale: number): bigint => {
  const negative = v.startsWith('-');
  const [whole, fraction = ''] = v.replace('-', '').split('.');
  const n = BigInt(`${whole}${fraction.padEnd(scale, '0')}`);
  return negative ? -n : n;
};
const fromUnits = (n: bigint, scale: number): string => {
  const negative = n < BigInt(0);
  const digits = (negative ? -n : n).toString().padStart(scale + 1, '0');
  const body = scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits;
  return negative ? `-${body}` : body;
};

/** One total line per currency (a blank currency last, on its own line); amounts that do not parse are left out. */
export function totalsByCurrency(rows: Row[], fields: AnyField[], totals: string[]): Total[] {
  const defs = totals.map(f => fields.find(d => d.field === f)).filter((d): d is AnyField => Boolean(d));
  const byCurrency = new Map<string, Map<string, bigint>>();
  for (const row of rows) for (const d of defs) {
    const scale = d.scale ?? 2;
    const v = parseAmount(row[d.field] ?? '', scale);
    if (!v) continue;
    const currency = d.currencyField ? (row[d.currencyField] ?? '').trim().toUpperCase() : '';
    const sums = byCurrency.get(currency) ?? new Map<string, bigint>();
    sums.set(d.field, (sums.get(d.field) ?? BigInt(0)) + toUnits(v, scale));
    byCurrency.set(currency, sums);
  }
  return [...byCurrency.entries()]
    .sort(([a], [b]) => (a === b ? 0 : a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
    .map(([currency, sums]) => ({ currency, sums: Object.fromEntries(defs.map(d => [d.field, fromUnits(sums.get(d.field) ?? BigInt(0), d.scale ?? 2)])) }));
}

// src/lib/report/units.ts
// Display units and exact decimal arithmetic of reports (spec §3): amounts stay canonical strings; scaling for display
// is exact for powers of ten (BigInt), sums are exact, percents are never scaled. Pure.
import { formatAmount } from '@tsfx/lib/fields/parse';
import { DEFAULT_UNITS, type Unit } from './types';

const NUMBER = /^-?\d+(\.\d+)?$/;
const ZERO = BigInt(0), TWO = BigInt(2), TEN = BigInt(10), TWO_HUNDRED = BigInt(200);

export const unitsOf = (units?: Unit[]): Unit[] => (units?.length ? units : DEFAULT_UNITS);
export const unitById = (units: Unit[], id: string | null | undefined): Unit => units.find(u => u.id === id) ?? units[0];
/** The unit's name next to a scaled amount shown without a unit header ('Lakhs'); '' for a divisor of 1 (ALM: '₹ 2.46 cr'). */
export const unitName = (unit: Unit): string => (unit.divisor === 1 ? '' : unit.label);
/** The note of a chart of scaled amounts ('Amounts in Lakhs'); '' for a divisor of 1. */
export const unitNote = (unit: Unit): string => (unit.divisor === 1 ? '' : `Amounts in ${unit.label}`);

/** '', '0', '0.00', '-0.00' and anything that is not a number count as zero. */
export const isZero = (v: string | undefined): boolean => !v || !NUMBER.test(v) || !/[1-9]/.test(v);

/** 10 → 1, 100000 → 5; null when the divisor is not a power of ten. */
function powerOfTen(n: number): number | null {
  if (!Number.isInteger(n) || n < 1) return null;
  let k = 0;
  for (let v = n; v > 1; v /= 10) { if (v % 10) return null; k++; }
  return k;
}

/** A canonical amount divided by `divisor`, rounded half away from zero to 2 decimals ('' and non-numbers stay). */
export function inUnit(v: string, divisor: number): string {
  if (!NUMBER.test(v)) return v;
  const k = powerOfTen(divisor);
  if (k === null) return (Number(v) / divisor).toFixed(2);
  const negative = v.startsWith('-');
  const [whole, fraction = ''] = v.replace('-', '').split('.');
  const units = BigInt(`${whole}${fraction}`);
  const d = TEN ** BigInt(fraction.length + k);
  const q = (units * TWO_HUNDRED + d) / (TWO * d);
  const digits = q.toString().padStart(3, '0');
  const out = `${digits.slice(0, -2)}.${digits.slice(-2)}`;
  return negative && q !== ZERO ? `-${out}` : out;
}

/** An amount in a unit with thousands grouping; zero is blank when `zeroBlank` (detail cells, as SAP's no_zero). */
export function formatInUnit(v: string, unit: Unit, zeroBlank = false): string {
  if (zeroBlank && isZero(v)) return '';
  return formatAmount(inUnit(v, unit.divisor));
}

/** '-17.54' → '-17.54 %' (never scaled); '' stays ''. */
export const formatPercent = (v: string): string => (NUMBER.test(v) ? `${inUnit(v, 1)} %` : v);

/** Exact sum of decimal strings at the largest scale given (at least 2); non-numbers are skipped. */
export function sumAmounts(values: string[]): string {
  const ok = values.filter(v => NUMBER.test(v));
  const scale = Math.max(2, ...ok.map(v => (v.split('.')[1] ?? '').length));
  let total = ZERO;
  for (const v of ok) {
    const [w, f = ''] = v.replace('-', '').split('.');
    const n = BigInt(`${w}${f.padEnd(scale, '0')}`);
    total += v.startsWith('-') ? -n : n;
  }
  const negative = total < ZERO;
  const digits = (negative ? -total : total).toString().padStart(scale + 1, '0');
  return `${negative ? '-' : ''}${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}

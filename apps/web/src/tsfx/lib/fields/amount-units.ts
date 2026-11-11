import { parseAmount, shiftAmount } from './parse';
import type { Unit } from '@tsfx/lib/report/types';

/** The shared amount units are powers of ten; money never goes through floating point. */
const places = (unit: Unit): number => Math.round(Math.log10(unit.divisor));

/** Exact display conversion, retaining even a cent shown in crores. Invalid drafts stay visible. */
export function amountInUnit(value: string, unit: Unit, scale = 2): string {
  const canonical = parseAmount(value, scale);
  return canonical === null || canonical === '' ? value : shiftAmount(canonical, -places(unit), scale);
}

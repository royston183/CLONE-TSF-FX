// Manage Tradeflows: the arithmetic of splitting a trade flow into BLs. Quantities have 3 decimals and are handled as
// integer thousandths, so the BLs never add up to more than the trade flow (design 2026-11-05-manage-propose-tradeflows).
import { str } from '@tsfx/lib/grid/grid';
import type { Row } from '@tsfx/lib/grid/types';

const milli = (v: string): bigint | null => {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(str(v));
  if (!m) return null;
  const frac = (m[2] ?? '').padEnd(3, '0').slice(0, 3);
  return BigInt(m[1]) * 1000n + BigInt(frac);
};
const qty = (n: bigint): string => `${n / 1000n}.${String(n % 1000n).padStart(3, '0')}`;
const active = (b: Row) => str(b.deletedFlag) !== 'X';

/** `quantity` in `count` equal parts (3 decimals); the thousandths left over go one each to the first parts. */
export function equalSplit(quantity: string, count: number): string[] {
  const total = milli(quantity) ?? 0n;
  const n = BigInt(Math.max(1, Math.floor(count)));
  const base = total / n, extra = total % n;
  return Array.from({ length: Number(n) }, (_, i) => qty(base + (BigInt(i) < extra ? 1n : 0n)));
}

/** The trade flow's quantity not held by its active (not deleted) BLs. */
export function openQuantity(tfQuantity: string, bls: Row[]): string {
  const used = bls.filter(active).reduce((s, b) => s + (milli(b.quantity) ?? 0n), 0n);
  const open = (milli(tfQuantity) ?? 0n) - used;
  return qty(open > 0n ? open : 0n);
}

/**
 * Why a split cannot be saved ([] when it can). `source`: the BL being split (null when new BLs come from the open
 * quantity); `open`: the trade flow's open quantity; `quantities`: the new BLs. The limit is the source's quantity
 * (or the open quantity), so the trade flow is never exceeded.
 */
export function splitProblems(source: Row | null, open: string, quantities: string[]): string[] {
  if (source && str(source.dealId)) return [`BL ${str(source.blNo)} has Deal ID ${str(source.dealId)}: an assigned BL cannot be split.`];
  const parts = quantities.map(q => milli(q));
  if (!parts.length || parts.some(p => p === null || p <= 0n)) return ['Each BL needs a quantity greater than zero.'];
  const sum = parts.reduce<bigint>((s, p) => s + (p ?? 0n), 0n);
  const limit = source ? milli(source.quantity) ?? 0n : milli(open) ?? 0n;
  return sum > limit ? [`The BLs add up to ${qty(sum)}, more than the ${qty(limit)} available.`] : [];
}

/** The active BLs' total against the trade flow's quantity: a message when they add up to more. */
export function overTradeFlow(tfQuantity: string, bls: Row[]): string {
  const used = bls.filter(active).reduce((s, b) => s + (milli(b.quantity) ?? 0n), 0n);
  const limit = milli(tfQuantity) ?? 0n;
  return used > limit ? `The BLs add up to ${qty(used)}, more than the trade flow's ${qty(limit)}.` : '';
}

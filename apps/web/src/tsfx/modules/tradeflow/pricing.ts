// The price of a trade flow: the latest price of its commodity whose effective-from date is on or before the TF date.
// Value = price × quantity, rounded half up to 2 decimals. SAP computes the same in ZFS_I_TradeFlowPrice; this copy
// prices the sample data and documents the rule.
import { str } from '@tsfx/lib/grid/grid';
import type { Row } from '@tsfx/lib/grid/types';

/** The price ('' when the commodity has none on or before the TF date). Dates are ISO, so they compare as text. */
export function priceOn(prices: Row[], commodity: string, tfDate: string): string {
  let best: Row | undefined;
  for (const p of prices) {
    if (str(p.commodity) !== str(commodity) || !p.effectiveFrom || p.effectiveFrom > tfDate) continue;
    if (!best || p.effectiveFrom > best.effectiveFrom) best = p;
  }
  return best ? str(best.price) : '';
}

/** A decimal string as an integer of its digits and the number of decimals ('264554.93' → 26455493n, 2). */
function scaled(value: string): [bigint, number] | null {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(str(value));
  if (!m) return null;
  const decimals = m[2] ?? '';
  return [BigInt(m[1] + decimals), decimals.length];
}

/** Price × quantity to 2 decimals, exact (no floating point); '' without a price or quantity. */
export function valueOf(price: string, quantity: string): string {
  const p = scaled(price), q = scaled(quantity);
  if (!p || !q) return '';
  const digits = p[1] + q[1];
  const product = p[0] * q[0];
  let cents: bigint;
  if (digits <= 2) cents = product * 10n ** BigInt(2 - digits);
  else {
    const unit = 10n ** BigInt(digits - 2);
    cents = (product + unit / 2n) / unit;   // half up
  }
  const s = cents.toString().padStart(3, '0');
  return `${s.slice(0, -2)}.${s.slice(-2)}`;
}

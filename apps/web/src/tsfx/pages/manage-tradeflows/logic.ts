// Manage Tradeflows: what the page does to a trade flow's BLs before it saves them (pure, tested).
import { str } from '@tsfx/lib/grid/grid';
import type { Row } from '@tsfx/lib/grid/types';
import { splitProblems } from '@tsfx/modules/tradeflow-manage/split';
import { TF_FIELDS } from '@tsfx/modules/tradeflow/definition';
import { valueOf } from '@tsfx/modules/tradeflow/pricing';

const milli = (v: string): bigint => {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(str(v));
  return m ? BigInt(m[1]) * 1000n + BigInt((m[2] ?? '').padEnd(3, '0').slice(0, 3)) : 0n;
};
const qty = (n: bigint): string => `${n < 0n ? '-' : ''}${(n < 0n ? -n : n) / 1000n}.${String((n < 0n ? -n : n) % 1000n).padStart(3, '0')}`;

const QTY = new Intl.NumberFormat('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
/** A quantity as the screens show it: grouped, 3 decimals ('' stays ''). */
export const fmtQty = (v: string): string => (str(v) === '' || Number.isNaN(Number(v)) ? str(v) : QTY.format(Number(v)));

export const isDeleted = (b: Row) => str(b.deletedFlag) === 'X';

/** The status tag of a BL. */
export function blStatus(b: Row): { label: 'Deleted' | 'Assigned' | 'Active'; tone: 'red' | 'amber' | 'green' } {
  if (isDeleted(b)) return { label: 'Deleted', tone: 'red' };
  if (str(b.dealId)) return { label: 'Assigned', tone: 'amber' };
  return { label: 'Active', tone: 'green' };
}

/** The split dialog's figures: the total of the new BLs, the limit, what is left, each BL's value, and the problems. */
export function splitSummary(source: Row | null, open: string, quantities: string[], price: string) {
  const limit = source ? milli(source.quantity) : milli(open);
  const total = quantities.reduce((s, q) => s + milli(q), 0n);
  return {
    total: qty(total), limit: qty(limit), left: qty(limit - total),
    values: quantities.map(q => (str(price) && Number(price) > 0 ? valueOf(str(price), qty(milli(q))) : '')),
    problems: splitProblems(source, open, quantities)
  };
}

/** A new BL as SAP will create it: no BL No or record date yet, the trade flow's shipment fields, its own quantity. */
function newBl(tf: Row, quantity: string): Row {
  const shipment = Object.fromEntries(TF_FIELDS.map(f => [f.field, str(tf[f.field])]));
  return { ...shipment, tfNo: str(tf.tfNo), tfDate: str(tf.tfDate), blNo: '', blRecordDate: '', dealId: '', deletedFlag: '', deletedBy: '', deletedAt: '', assignedUsd: '', quantity: qty(milli(quantity)) };
}

/** The BLs after a split: `source` (when given) is flagged as deleted, and one new BL per quantity is added. */
export function applySplit(bls: Row[], source: Row | null, quantities: string[], tf: Row): Row[] {
  const kept = bls.map(b => (source && b.blNo === source.blNo && b.blRecordDate === source.blRecordDate ? { ...b, deletedFlag: 'X' } : b));
  return [...kept, ...quantities.map(q => newBl(tf, q))];
}

/** The BLs after deleting one: the row stays, flagged. */
export function applyDelete(bls: Row[], blNo: string): Row[] {
  return bls.map(b => (b.blNo === blNo ? { ...b, deletedFlag: 'X' } : b));
}

// Sample data of Manage Tradeflows (UI approval): the Tradeflows List sample, with real-style BL numbers and the BL
// fields this screen uses. TF00000002's BL is already split (two active BLs, the original flagged as deleted), and one
// BL of TF00000004 carries a Deal ID, so every BL state shows.
import type { Row } from '@tsfx/lib/grid/types';
import type { ModuleSeed } from '../types';
import { tradeflowSeed } from '../tradeflow/seed';

export function tradeflowManageSeed(): ModuleSeed {
  const { tables } = tradeflowSeed();
  const bl: Row[] = tables.bl.map((b): Row => ({ ...b, blNo: String(4000000000 + Number(b.blNo.slice(2))), deletedFlag: '', deletedBy: '', deletedAt: '', assignedUsd: '' }));
  const tradeflows: Row[] = tables.tradeflows.map((t): Row => ({ ...t, blNo: String(4000000000 + Number(t.blNo.slice(2))) }));
  const two = bl.findIndex(b => b.tfNo === 'TF00000002');
  if (two >= 0) {
    const src = bl[two];
    bl[two] = { ...src, deletedFlag: 'X', deletedBy: 'DEMO', deletedAt: '2026-11-05 10:12' };
    bl.push({ ...src, blNo: '4000000101', quantity: '132277.465' }, { ...src, blNo: '4000000102', quantity: '132277.465' });
    const tf = tradeflows.find(t => t.tfNo === 'TF00000002');
    if (tf) tf.blNo = '';
  }
  const four = bl.find(b => b.tfNo === 'TF00000004');
  if (four) { four.dealId = 'DL26000101'; four.assignedUsd = '94600.00'; }
  const tf4 = tradeflows.find(t => t.tfNo === 'TF00000004');
  if (tf4) tf4.dealId = 'DL26000101';
  return { tables: { tradeflows, bl } };
}

import { TransactionDetailsDialog } from '../../shared/fx/TransactionDetails.tsx';
import type { FxRow } from './types.ts';

/** "Transaction Details": the legacy #txnModal, opened from an FX row's Transaction No hotspot or double-click. */
export function TxnModal({ row, onClose }: { row: FxRow; onClose: () => void }) {
  return <TransactionDetailsDialog key={`${row.bukrs}/${row.rfha}`} bukrs={row.bukrs} rfha={row.rfha} onClose={onClose} />
}

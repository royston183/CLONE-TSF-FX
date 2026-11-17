import type { ReactNode } from 'react';
import { Check, Trash2, X } from 'lucide-react';
import { Modal } from './Modal';

/** "Are you sure?" for one action. Enter confirms unless a button or field has focus. */
export function ConfirmDialog({ title, message, warning, confirmLabel, danger = false, busy = false, onConfirm, onClose }: {
  title: string; message: ReactNode; warning?: ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Modal size="small" title={title} onClose={onClose} busy={busy} onEnter={onConfirm} initialFocus="dialog" footer={<>
      <button className="button secondary" disabled={busy} onClick={onClose}><X size={14} />Cancel</button>
      <button className={`button ${danger ? 'danger' : ''}`} disabled={busy} onClick={onConfirm}>{danger ? <Trash2 size={14} /> : <Check size={14} />}{busy ? 'Working…' : confirmLabel}</button>
    </>}>
      <p>{message}</p>
      {warning && <p className="td-warn">{warning}</p>}
    </Modal>
  );
}

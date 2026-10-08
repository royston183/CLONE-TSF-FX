import { rejectConfirmText } from './logic.ts'
import type { Modal } from './modal.tsx'
import { MasterContractConfirmation } from '../../shared/master-contract/Confirmation.tsx'
export function RejectConfirmModal({ modal, ids, onCancel, onReject }: {
 modal: Modal; ids: readonly string[]; onCancel: () => void; onReject: () => void | Promise<void>
}) {
 const { heading, subtext } = rejectConfirmText(ids)
 return <MasterContractConfirmation open={modal.state === 'open'} danger title="Confirm MC Rejection"
   message={<><strong id="confirmHeading">{heading}</strong><p id="confirmSubtext">{subtext}</p></>}
   ids={{ overlay: 'confirmOverlay', close: 'confirmCloseBtn', cancel: 'confirmCancelBtn', confirm: 'confirmRejectBtn' }}
   confirmLabel="Reject" onCancel={onCancel} onConfirm={onReject} />
}

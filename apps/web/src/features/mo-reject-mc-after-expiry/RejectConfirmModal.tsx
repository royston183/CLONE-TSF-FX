import { ResultDialog } from '../../shared/ui/ResultDialog.tsx'
import { rejectConfirmText } from './logic.ts'
import type { Modal } from './modal.tsx'
<<<<<<< HEAD
import { MasterContractConfirmation } from '../../shared/master-contract/Confirmation.tsx'
export function RejectConfirmModal({ modal, ids, onCancel, onReject }: {
 modal: Modal; ids: readonly string[]; onCancel: () => void; onReject: () => void | Promise<void>
}) {
 const { heading, subtext } = rejectConfirmText(ids)
 return <MasterContractConfirmation open={modal.state === 'open'} danger title="Confirm MC Rejection"
   message={<><strong id="confirmHeading">{heading}</strong><p id="confirmSubtext">{subtext}</p></>}
   ids={{ overlay: 'confirmOverlay', close: 'confirmCloseBtn', cancel: 'confirmCancelBtn', confirm: 'confirmRejectBtn' }}
   confirmLabel="Reject" onCancel={onCancel} onConfirm={onReject} />
=======

/** #confirmOverlay — the last stop before the selected contracts become Rejected. */
export function RejectConfirmModal({
  modal,
  ids,
  onCancel,
  onReject,
}: {
  modal: Modal
  ids: readonly string[]
  onCancel: () => void
  onReject: () => void
}) {
  if (modal.state !== 'open') return null
  const { heading, subtext } = rejectConfirmText(ids)
  return (
    <ResultDialog
      tone="warning"
      title={heading}
      message={subtext}
      actions={[
        { label: 'Cancel', kind: 'secondary', onClick: onCancel },
        { label: 'Reject', kind: 'danger', onClick: onReject },
      ]}
    />
  )
>>>>>>> origin/main
}

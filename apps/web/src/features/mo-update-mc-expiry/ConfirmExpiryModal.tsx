import { MANUAL_CONFIRM_HEADING } from './logic.ts'
import { ResultDialog } from '../../shared/ui/ResultDialog.tsx'
import type { Modal } from './modal.tsx'
import type { ExpiryConfirm } from './types.ts'

/**
 * Confirm Expiry Update, shared by manual selection and "MC View with Expiry Posting".
 * Nothing is expired until Expire is pressed.
 */
export function ConfirmExpiryModal({
  modal,
  confirm,
  onCancel,
  onExpire,
}: {
  modal: Modal
  confirm: ExpiryConfirm | null
  onCancel: () => void
  onExpire: () => void
}) {
  if (modal.state !== 'open') return null
  return (
    <ResultDialog
      tone="warning"
      title={confirm?.heading ?? MANUAL_CONFIRM_HEADING}
      message={
        confirm?.subtext ??
        'This will update the status of the selected Master Contract(s) to Expired. This action cannot be undone in this session.'
      }
      actions={[
        { label: 'Cancel', kind: 'secondary', onClick: onCancel },
        { label: 'Expire', kind: 'danger', onClick: onExpire },
      ]}
    />
  )
}

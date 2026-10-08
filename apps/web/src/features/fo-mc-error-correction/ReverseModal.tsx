import { ConfirmPopup } from '../../shared/popup/Popup.tsx'
import { reverseConfirmText } from './logic.ts'
import type { Modal } from './modal.tsx'
import type { ErrorRow } from './types.ts'

/**
 * "Reverse Master Contract?" — shared by the toolbar Reverse and the one in the correction modal.
 * The standard confirmation popup (danger); it renders over the correction modal when opened from it.
 */
export function ReverseModal({
  modal,
  row,
  onCancel,
  onConfirm,
}: {
  modal: Modal
  row: ErrorRow | undefined
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <ConfirmPopup
      open={modal.state === 'open'}
      tone="danger"
      title="Reverse Master Contract?"
      message={row ? reverseConfirmText(row) : 'This action cannot be undone.'}
      cancelLabel="Cancel"
      confirmLabel="Reverse"
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  )
}

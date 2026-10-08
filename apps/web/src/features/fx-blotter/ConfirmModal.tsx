import { ConfirmPopup } from '../../shared/popup/Popup.tsx'
import type { ModalStack } from './modal.tsx'

/**
 * The generic confirm dialog (Reverse / Create / Release), in the standard popup design. It stays
 * on the modal stack as 'action', so it stacks on top of whatever popup asked for it.
 */
export function ConfirmModal({
  modals,
  title,
  body,
  tone = 'primary',
  onConfirm,
}: {
  modals: ModalStack
  title: string
  body: string
  /** 'danger' for a destructive action (reverse). */
  tone?: 'danger' | 'primary'
  onConfirm: () => void
}) {
  const close = () => modals.close('action')
  return (
    <ConfirmPopup
      open={modals.isOpen('action')}
      title={title}
      message={body}
      tone={tone}
      cancelLabel="Cancel"
      confirmLabel="Yes, proceed"
      onCancel={close}
      onConfirm={() => {
        close()
        onConfirm()
      }}
    />
  )
}

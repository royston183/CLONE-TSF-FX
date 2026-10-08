import { ResultDialog } from '../../shared/ui/ResultDialog.tsx'

/** The generic Yes/No popup (mirrors ABAP POPUP_TO_CONFIRM) — Amend Deal Status and Reverse use it. */
export function ConfirmModal({ title, text, yesLabel, onYes, onClose }: { title: string; text: string; yesLabel: string; onYes: () => void; onClose: () => void }) {
  return (
    <ResultDialog
      tone="warning"
      title={title}
      message={<span style={{ whiteSpace: 'pre-line' }}>{text}</span>}
      actions={[
        { label: 'No', kind: 'secondary', onClick: onClose },
        {
          label: yesLabel,
          kind: 'primary',
          onClick: () => {
            onClose()
            onYes()
          },
        },
      ]}
    />
  )
}

import { ResultDialog, type ResultTone } from './ResultDialog.tsx'

export type ResultItem = {
  id: number
  tone: ResultTone
  title: string
  message?: string | undefined
  /** Optional SAP reference (deal / contract / document number) shown in the highlighted box. */
  reference?: { label: string; value: string } | undefined
  /** Runs once when this outcome is dismissed (OK, close or Escape), e.g. to close the popup behind it. */
  onDismiss?: (() => void) | undefined
}

/**
 * Replaces a screen's bottom-right toast stack. Outcomes queue up and are shown one at a time as the
 * standard ResultDialog; OK (or Escape) dismisses the first and reveals the next. Nothing auto-fades,
 * so an SAP success or error message cannot be missed.
 */
export function ResultQueue({
  items,
  onDismiss,
}: {
  items: readonly ResultItem[]
  onDismiss: (id: number) => void
}) {
  const first = items[0]
  if (!first) return null
  const close = () => {
    onDismiss(first.id)
    first.onDismiss?.()
  }
  return (
    <ResultDialog
      key={first.id}
      tone={first.tone}
      title={first.title}
      message={first.message}
      reference={first.reference}
      actions={[{ label: items.length > 1 ? `OK (${items.length - 1} more)` : 'OK', kind: 'primary', onClick: close }]}
      onClose={close}
    />
  )
}

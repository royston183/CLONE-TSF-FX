import type { ReactNode } from 'react'
import { ConfirmPopup } from '../../shared/popup/Popup.tsx'
import type { KpiId } from './logic.ts'
import type { ActionCtx, SpotVariant } from './types.ts'

/** Every popup the workbench opens. They stack: the newest sits on top and Escape closes it. */
export type PopupSpec =
  | { kind: 'deal'; dealId: string; selectedRfha: string | null }
  | { kind: 'txn'; rfha: string; dealId: string }
  | { kind: 'rate'; ctx: ActionCtx }
  | { kind: 'spot'; ctx: ActionCtx; variant: SpotVariant; sfhaart: string; rate: number }
  | { kind: 'ssSpot'; ctx: ActionCtx; sfhaart: string; rate: number }
  | { kind: 'fwdSsSpot'; ctx: ActionCtx }
  | { kind: 'ndf'; ctx: ActionCtx }
  | { kind: 'settlementSpot'; ctx: ActionCtx }
  | { kind: 'kpi'; id: KpiId }
  | {
      kind: 'confirm'
      title: string
      message: string
      yesLabel?: string
      noLabel?: string
      danger?: boolean
      onYes: () => void
      onNo?: () => void
    }

export type Popup = { key: number; closing: boolean; spec: PopupSpec }

/** What each popup component is handed to draw its frame. */
export type FrameProps = { depth: number; closing: boolean; onClose: () => void }

/**
 * The original's openModal(): an overlay stacked 10 z-index steps above the one below, with
 * the head row, an optional sub line, the scrolling body and the action buttons.
 */
export function ModalFrame({
  frame,
  title,
  sub,
  cls,
  actions,
  children,
}: {
  frame: FrameProps
  title: string
  sub?: string | undefined
  cls: string
  actions: ReactNode
  children: ReactNode
}) {
  return (
    <div className={`modal-overlay open${frame.closing ? ' closing' : ''}`} style={{ zIndex: 200 + frame.depth * 10 }}>
      <div className={`modal modal-left modal-scrollable ${cls}`} role="dialog" aria-modal="true">
        <div className="modal-head-row">
          <h2>{title}</h2>
          <button type="button" className="modal-close-btn" aria-label="Close" onClick={frame.onClose}>
            ×
          </button>
        </div>
        {sub ? <div className="modal-sub">{sub}</div> : null}
        <div className="modal-body-scroll">{children}</div>
        <div className="modal-actions">{actions}</div>
      </div>
    </div>
  )
}

/**
 * POPUP_TO_CONFIRM — Yes / No, drawn as the standard ConfirmPopup. It stays an entry of the
 * popup stack (opened and closed through it); its own Escape handler closes it like No.
 */
export function ConfirmModal({ frame, spec }: { frame: FrameProps; spec: Extract<PopupSpec, { kind: 'confirm' }> }) {
  return (
    <ConfirmPopup
      open={!frame.closing}
      title={spec.title || 'Confirm'}
      message={spec.message}
      tone={spec.danger ? 'danger' : 'primary'}
      cancelLabel={spec.noLabel || 'No'}
      confirmLabel={spec.yesLabel || 'Yes'}
      onCancel={() => {
        frame.onClose()
        spec.onNo?.()
      }}
      onConfirm={() => {
        frame.onClose()
        spec.onYes()
      }}
    />
  )
}

/** The original's fld(): a labelled field with a (hidden until set) error line. */
export function Fld({
  label,
  req,
  cls,
  error,
  children,
}: {
  label: ReactNode
  req?: boolean
  cls?: string
  error?: string | undefined
  children: ReactNode
}) {
  return (
    <div className={`field${cls ? ` ${cls}` : ''}${error ? ' has-error' : ''}`}>
      <label>
        {label}
        {req ? <span className="req">*</span> : null}
      </label>
      {children}
      <div className="error-msg">{error}</div>
    </div>
  )
}

/** The popups' inline message strip. */
export function InlineMsg({ msg }: { msg: { text: string; kind: 'error' | 'info' } | null }) {
  return <div className={`inline-msg ${msg?.kind ?? 'error'}${msg?.text ? ' show' : ''}`}>{msg?.text}</div>
}

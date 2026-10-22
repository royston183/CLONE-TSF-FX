import { Children, cloneElement, createContext, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { ConfirmPopup } from '../../shared/popup/Popup.tsx'
import type { KpiId } from './logic.ts'
import type { ActionCtx, SpotVariant } from './types.ts'
import { useDialogFocus, usePortalFocus } from './focus.ts'

/** Every popup the workbench opens. They stack: the newest sits on top and Escape closes it. */
export type PopupSpec =
  | { kind: 'deal'; dealId: string; selectedRfha: string | null }
  | { kind: 'txn'; rfha: string; bukrs: string; dealId: string }
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

export type Popup = { key: number; closing: boolean; spec: PopupSpec; opener?: HTMLElement | null }

/** What each popup component is handed to draw its frame. */
export type FrameProps = { depth: number; closing: boolean; onClose: () => void; busy?: boolean; setBusy?: (busy: boolean) => void; active?: boolean; opener?: HTMLElement | null }

export const FieldContext = createContext<{ id: string; labelId: string; required: boolean } | null>(null)

/** Lock the stack immediately, including Escape, before starting a SAP request. */
export function usePosting(frame: FrameProps): [boolean, (busy: boolean) => void] {
  const [busy, setState] = useState(false)
  const pendingFocus = useRef<HTMLElement | null>(null)
  const latest = useRef(frame)
  latest.current = frame
  const setBusy = useCallback((value: boolean) => {
    if (value) pendingFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    latest.current.setBusy?.(value)
    setState(value)
  }, [])
  useLayoutEffect(() => {
    const target = pendingFocus.current
    if (!busy && target?.isConnected && !target.matches(':disabled') && !target.closest('[inert]')) target.focus({ preventScroll: true })
  }, [busy])
  useEffect(() => () => latest.current.setBusy?.(false), [])
  return [busy, setBusy]
}

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
  busy = false,
}: {
  frame: FrameProps
  title: string
  sub?: string | undefined
  cls: string
  actions: ReactNode
  children: ReactNode
  busy?: boolean
}) {
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)
  useDialogFocus(ref, frame)
  return (
    <div className={`modal-overlay open${frame.closing ? ' closing' : ''}`} inert={frame.active === false || frame.closing} aria-hidden={frame.active === false || frame.closing ? true : undefined} style={{ zIndex: 200 + frame.depth * 10 }}>
      <div ref={ref} tabIndex={-1} className={`modal modal-left modal-scrollable ${cls}`} role="dialog" aria-modal={frame.active !== false && !frame.closing ? true : undefined} aria-labelledby={id} aria-busy={busy} onKeyDownCapture={(e) => { if (busy && e.key === 'Escape') { e.preventDefault(); e.stopPropagation() } }}>
        <div className="modal-head-row">
          <h2 id={id}>{title}</h2>
          <button type="button" className="modal-close-btn" aria-label="Close" disabled={busy} onClick={frame.onClose}>
            ×
          </button>
        </div>
        {sub ? <div className="modal-sub">{sub}</div> : null}
        <div className="modal-body-scroll"><fieldset className="posting-fields" disabled={busy}>{children}</fieldset></div>
        {busy ? <div className="posting-status" role="status">Posting to SAP… Please wait for the result.</div> : null}
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
  usePortalFocus(frame)
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

export function OutcomeFocus({ children, opener }: { children: ReactNode; opener: HTMLElement | null }) {
  usePortalFocus({ closing: false, opener })
  return <>{children}</>
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
  const id = useId(), labelId = `${id}-label`
  return (
    <div className={`field${cls ? ` ${cls}` : ''}${error ? ' has-error' : ''}`}>
      <label id={labelId} htmlFor={id}>
        {label}
        {req ? <span className="req">*</span> : null}
      </label>
      <FieldContext.Provider value={{ id, labelId, required: !!req }}>
        {Children.map(children, (child) => isValidElement(child) && typeof child.type === 'string' && ['input', 'select', 'textarea'].includes(child.type)
          ? cloneElement(child as ReactElement<Record<string, unknown>>, { id, 'aria-labelledby': labelId, 'aria-required': !!req }) : child)}
      </FieldContext.Provider>
      <div className="error-msg">{error}</div>
    </div>
  )
}

/** The popups' inline message strip. */
export function InlineMsg({ msg }: { msg: { text: string; kind: 'error' | 'info' } | null }) {
  return <div className={`inline-msg ${msg?.kind ?? 'error'}${msg?.text ? ' show' : ''}`}>{msg?.text}</div>
}

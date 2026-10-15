import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { Check, ModalId } from './types.ts'

export type ModalStack = {
  stack: ModalId[]
  /** Opening a popup closes the others unless `keepExisting` stacks it on top (the confirm dialog). */
  open: (id: ModalId, keepExisting?: boolean) => void
  close: (id: ModalId) => void
  /** Escape: the top-most popup only. */
  closeTop: () => void
  isOpen: (id: ModalId) => boolean
  zIndex: (id: ModalId) => number | undefined
}

/** The original's modalStack: each open popup sits 20 above the one it was opened over. */
export function useModalStack(): ModalStack {
  const [stack, setStack] = useState<ModalId[]>([])
  const open = useCallback(
    (id: ModalId, keepExisting = false) => setStack((s) => (keepExisting ? [...s.filter((x) => x !== id), id] : [id])),
    [],
  )
  const close = useCallback((id: ModalId) => setStack((s) => s.filter((x) => x !== id)), [])
  const closeTop = useCallback(() => setStack((s) => s.slice(0, -1)), [])
  return useMemo(
    () => ({
      stack,
      open,
      close,
      closeTop,
      isOpen: (id: ModalId) => stack.includes(id),
      zIndex: (id: ModalId) => {
        const i = stack.indexOf(id)
        return i === -1 ? undefined : 1000 + i * 20
      },
    }),
    [stack, open, close, closeTop],
  )
}

/**
 * The original's .modal-overlay. Like the legacy markup it is always mounted and only toggles
 * .open: the stylesheet fades it in and out, and the content keeps its last record meanwhile.
 */
export function Overlay({
  id,
  modals,
  closeOnBackdrop = true,
  children,
}: {
  id: ModalId
  modals: ModalStack
  /** False for a popup holding a form, so a stray click outside it cannot throw away what was typed. */
  closeOnBackdrop?: boolean
  children: ReactNode
}) {
  const open = modals.isOpen(id)
  const z = modals.zIndex(id)
  return (
    <div
      id={`${id}-overlay`}
      className={open ? 'modal-overlay open' : 'modal-overlay'}
      style={z === undefined ? undefined : { zIndex: z }}
      onClick={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) modals.close(id)
      }}
    >
      {children}
    </div>
  )
}

/** Title, subtitle and × — the header every popup on the page shares. */
export function ModalHeader({
  title,
  subtitle,
  onClose,
}: {
  title: ReactNode
  subtitle: ReactNode
  onClose: () => void
}) {
  return (
    <div className="modal-header">
      <div className="modal-header-text">
        <div className="modal-title">{title}</div>
        <div className="modal-subtitle">{subtitle}</div>
      </div>
      <button className="modal-close" type="button" onClick={onClose}>
        ×
      </button>
    </div>
  )
}

export function DetailGrid({ pairs }: { pairs: Array<[string, ReactNode]> }) {
  return (
    <div className="detail-grid">
      {pairs.map(([label, value]) => (
        <div className="detail-cell" key={label}>
          <div className="detail-lbl">{label}</div>
          <div className="detail-val">{value}</div>
        </div>
      ))}
    </div>
  )
}

/** A .validation-box: the pass text when `check` is ok, else the heading and a list of reasons. */
export function CheckBox({ check, okText, heading }: { check: Check; okText: ReactNode; heading?: string }) {
  return (
    <div className={`validation-box ${check.ok ? 'ok' : 'bad'}`}>
      {check.ok ? (
        okText
      ) : (
        <>
          {heading ? <strong>{heading}</strong> : null}
          <ul>
            {check.msgs.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

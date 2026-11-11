import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type Ref } from 'react';
import { tsfxPortalRoot } from '@tsfx/lib/portal-root';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { confirmsOnEnter } from '@tsfx/lib/client/keys';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const stack: object[] = [];
let originalBodyOverflow = '';
/** Open modals, innermost last: only the top one answers Esc, Ctrl+S and Tab. */
export const modalStack = {
  push: (id: object) => { stack.push(id); },
  remove: (id: object) => { const i = stack.indexOf(id); if (i >= 0) stack.splice(i, 1); },
  isTop: (id: object) => stack[stack.length - 1] === id,
  size: () => stack.length,
};

/**
 * Ctrl+S (Cmd+S) runs `run` while `canRun()` says so: a Modal answers while it is the topmost dialog, an inline record
 * (page or wizard frame) only while no dialog is open on top of it.
 */
export function useSaveShortcut(run: (() => void) | undefined, busy: boolean | undefined, canRun: () => boolean): void {
  useEffect(() => {
    if (!run) return;
    const keys = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && canRun()) { e.preventDefault(); if (!busy) run(); }
    };
    document.addEventListener('keydown', keys);
    return () => document.removeEventListener('keydown', keys);
  }, [run, busy, canRun]);
}

/** The heading of a record: what it is (eyebrow), its title and status, and a line under it. Shared by the pop-up and the inline frames. */
export function RecordHeading({ eyebrow, title, status, subtitle, eyebrowId, titleId, subtitleId, titleRef }: {
  eyebrow?: string; title: string; status?: ReactNode; subtitle?: string; eyebrowId?: string; titleId: string; subtitleId?: string; titleRef?: Ref<HTMLHeadingElement>;
}) {
  return (
    <div className="kit-modal-heading">
      {eyebrow && <span id={eyebrowId} className="kit-eyebrow">{eyebrow}</span>}
      <div className="kit-modal-title"><h2 id={titleId} ref={titleRef} tabIndex={titleRef ? -1 : undefined}>{title}</h2>{status}</div>
      {subtitle && <p id={subtitleId}>{subtitle}</p>}
    </div>
  );
}

/** A record's actions: `footerStart` on the left, `footer` on the right. */
export function FootActions({ className, footerStart, footer }: { className: string; footerStart?: ReactNode; footer: ReactNode }) {
  return <div className={className}>{footerStart && <div className="kit-foot-start">{footerStart}</div>}{footer}</div>;
}

/** Focus target on open: [data-autofocus], else the first focusable in the body, else the dialog box. */
export function pickInitialFocus(box: HTMLElement): HTMLElement {
  return box.querySelector<HTMLElement>('[data-autofocus]') ?? box.querySelector<HTMLElement>('.ds-modal-body ' + FOCUSABLE.split(', ').join(', .ds-modal-body ')) ?? box;
}

/**
 * ALM's dialog (.ds-overlay > .ds-modal). Esc and a backdrop click close it unless busy; focus moves in on open,
 * stays inside on Tab and returns to the opener on close; Ctrl+S runs `onPrimary` and Enter (unless a button, link or field has focus)
 * runs `onEnter`, both only while this is the topmost dialog. `initialFocus="dialog"` focuses the box itself, so Enter confirms.
 * Every action button sits in the footer, which stays in view while the body scrolls: `footer` on the right (Close,
 * Cancel, the primary action last), `footerStart` on the left (Delete, other actions on the record, Back).
 * `variant="record"` is one business record (ObjectDialog): a compact white header with an eyebrow (what it is, read
 * with the title as the dialog's name), the title (its key) and a status tag; the body has no padding of its own.
 */
export function Modal({ title, subtitle, eyebrow, status, variant, size, wide = false, onClose, children, footer, footerStart, busy = false, onPrimary, onEnter, initialFocus = 'auto' }: {
  title: string; subtitle?: string; eyebrow?: string; status?: ReactNode; variant?: 'record' | 'transaction'; size?: 'small' | 'normal' | 'wide'; wide?: boolean; onClose: () => void;
  children: ReactNode; footer: ReactNode; footerStart?: ReactNode; busy?: boolean; onPrimary?: () => void; onEnter?: () => void; initialFocus?: 'auto' | 'dialog';
}) {
  const box = useRef<HTMLDivElement>(null);
  const titleId = useId(), subtitleId = useId(), eyebrowId = useId();
  const sized = size ?? (wide ? 'wide' : 'normal');
  const [id] = useState<object>(() => ({}));
  // Captured during the first render, before this modal or any child moves focus.
  const [opener] = useState<HTMLElement | null>(() => (typeof document === 'undefined' ? null : document.activeElement as HTMLElement | null));
  useEffect(() => {
    if (modalStack.size() === 0) originalBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    modalStack.push(id);
    if (box.current) (initialFocus === 'dialog' ? box.current : pickInitialFocus(box.current)).focus();
    return () => { modalStack.remove(id); if (modalStack.size() === 0) document.body.style.overflow = originalBodyOverflow; if (opener?.isConnected) opener.focus(); };
  }, [id, opener, initialFocus]);
  const isTop = useCallback(() => modalStack.isTop(id), [id]);
  useSaveShortcut(onPrimary, busy, isTop);
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (!modalStack.isTop(id)) return;
      if (e.key === 'Escape' && !busy && !e.defaultPrevented) { e.preventDefault(); onClose(); }
      else if (onEnter && confirmsOnEnter(e)) { e.preventDefault(); if (!busy) onEnter(); }
      else if (e.key === 'Tab' && box.current) {
        const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (!items.length) return;
        const [head, tail] = [items[0], items[items.length - 1]];
        if (e.shiftKey && document.activeElement === head) { e.preventDefault(); tail.focus(); }
        else if (!e.shiftKey && document.activeElement === tail) { e.preventDefault(); head.focus(); }
      }
    };
    document.addEventListener('keydown', keys);
    return () => document.removeEventListener('keydown', keys);
  }, [id, onClose, busy, onEnter]);
  return createPortal(
    <div className={`ds-overlay${variant === 'transaction' ? ' transaction-overlay' : ''}`} onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div ref={box} tabIndex={-1} className={['ds-modal', sized === 'normal' ? '' : sized, variant ?? ''].filter(Boolean).join(' ')} role="dialog" aria-modal="true"
        aria-labelledby={eyebrow ? `${eyebrowId} ${titleId}` : titleId} aria-describedby={subtitle ? subtitleId : undefined} aria-busy={busy}>
        <div className="ds-modal-head">
          <RecordHeading eyebrow={eyebrow} title={title} status={status} subtitle={subtitle} eyebrowId={eyebrowId} titleId={titleId} subtitleId={subtitleId} />
          <button className="icon-button" aria-label={variant === 'transaction' ? 'Close dialog' : 'Close'} disabled={busy} onClick={onClose}><X size={17} /></button>
        </div>
        <div className="ds-modal-body">{children}</div>
        <FootActions className="ds-modal-foot" footerStart={footerStart} footer={footer} />
      </div>
    </div>,
    tsfxPortalRoot()
  );
}

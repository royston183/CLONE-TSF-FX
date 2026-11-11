import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { tsfxPortalRoot } from '@tsfx/lib/portal-root';
import { createPortal } from 'react-dom';

/** Small help bubble (ALM .ov-info-pop) under or above its button; closes on outside click, scroll, resize or Esc. */
export function Popover({ anchor, onClose, children, autoFocus = false, label }: { anchor: HTMLElement; onClose: () => void; children: ReactNode; autoFocus?: boolean; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => {
      const r = anchor.getBoundingClientRect();
      const below = r.bottom + 220 < innerHeight;
      setBox({ top: below ? r.bottom + 6 : Math.max(8, r.top - 226), left: Math.max(8, Math.min(r.left, innerWidth - 328)) });
    });
    return () => cancelAnimationFrame(frame);
  }, [anchor]);
  useLayoutEffect(() => {
    if (!autoFocus || !box) return;
    ref.current?.querySelector<HTMLElement>('select,input,button,[tabindex="0"]')?.focus();
    return () => { if (anchor.isConnected) anchor.focus(); };
  }, [anchor, autoFocus, box]);
  useEffect(() => {
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); anchor.focus(); }
      else if (autoFocus && e.key === 'Tab' && ref.current) {
        const items = [...ref.current.querySelectorAll<HTMLElement>('select,input,button,[tabindex="0"]')];
        const first = items[0], last = items[items.length - 1];
        if (first && ((e.shiftKey && document.activeElement === first) || (!e.shiftKey && document.activeElement === last))) {
          e.preventDefault(); e.stopPropagation(); (e.shiftKey ? last : first).focus();
        }
      }
    };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc, true);
    addEventListener('scroll', onClose, true);
    addEventListener('resize', onClose);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc, true); removeEventListener('scroll', onClose, true); removeEventListener('resize', onClose); };
  }, [anchor, onClose, autoFocus]);
  if (!box) return null;
  return createPortal(<div ref={ref} className="ov-info-pop" role="dialog" aria-label={label} style={{ ...box, width: 'min(320px, calc(100vw - 16px))', maxHeight: 'calc(100dvh - 16px)', overflow: 'auto' }}>{children}</div>, tsfxPortalRoot());
}

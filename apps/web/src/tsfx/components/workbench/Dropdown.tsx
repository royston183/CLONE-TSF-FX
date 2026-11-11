import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { tsfxPortalRoot } from '@tsfx/lib/portal-root';
import { createPortal } from 'react-dom';

export interface DropItem { value: string; label: string; code?: string }
interface Box { top: number; left: number; width: number }

/** Dropdown list anchored under an input, positioned in the viewport so modal scrolling never clips it. */
export function Dropdown({ anchor, items, onPick, active, onClose }: { anchor: RefObject<HTMLInputElement | null>; items: DropItem[]; onPick: (item: DropItem) => void; active: number; onClose: () => void }) {
  const [box, setBox] = useState<Box | null>(null);
  const list = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    // Follow the input when the page or modal scrolls; scrolling the list itself must not move or close it.
    const place = (e?: Event) => {
      if (e?.target instanceof Node && list.current?.contains(e.target)) return;
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      if (r.bottom < 0 || r.top > innerHeight) { onClose(); return; }
      const width = Math.max(r.width, 300);
      setBox({ top: r.bottom + 3, left: Math.min(r.left, innerWidth - width - 8), width });
    };
    const frame = requestAnimationFrame(() => place());
    addEventListener('resize', place);
    addEventListener('scroll', place, true);
    return () => { cancelAnimationFrame(frame); removeEventListener('resize', place); removeEventListener('scroll', place, true); };
  }, [anchor, onClose]);
  useEffect(() => { list.current?.querySelector('.active')?.scrollIntoView({ block: 'nearest' }); }, [active]);
  if (!box) return null;
  return createPortal(
    <div className="ds-drop" ref={list} style={box} role="listbox" onMouseDown={e => e.preventDefault()}>
      {items.length
        ? items.map((item, i) => <button type="button" key={item.value} role="option" aria-selected={i === active} className={i === active ? 'active' : ''} onClick={() => onPick(item)}>{item.code !== undefined && <b>{item.code}</b>}<span>{item.label}</span></button>)
        : <div className="ds-drop-empty">Nothing matches that search.</div>}
    </div>,
    tsfxPortalRoot()
  );
}

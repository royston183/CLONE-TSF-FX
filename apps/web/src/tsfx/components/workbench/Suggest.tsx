import { useCallback, useRef, useState, type InputHTMLAttributes, type KeyboardEvent } from 'react';
import { str } from '@tsfx/lib/grid/grid';
import { Dropdown, type DropItem } from './Dropdown';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: string; onText: (text: string) => void; onPick: (item: DropItem) => void; options: DropItem[] };

/** Text input with type-to-search suggestions (value help and filter combobox). */
export function Suggest({ value, onText, onPick, options, className = '', onKeyDown, ...props }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const q = str(value).toLowerCase();
  const items = options.filter(o => !q || `${o.code ?? ''} ${o.label}`.toLowerCase().includes(q)).slice(0, 80);
  const close = useCallback(() => setOpen(false), []);
  function key(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && open && items[active]) { e.preventDefault(); e.stopPropagation(); onPick(items[active]); setOpen(false); }
    else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
    onKeyDown?.(e);
  }
  return (
    <>
      <input {...props} ref={ref} className={className} value={value} autoComplete="off"
        onFocus={() => { setOpen(true); setActive(-1); }} onBlur={() => setOpen(false)}
        onChange={e => { onText(e.target.value); setOpen(true); setActive(-1); }} onKeyDown={key} />
      {open && <Dropdown anchor={ref} items={items} active={active} onClose={close} onPick={item => { onPick(item); setOpen(false); }} />}
    </>
  );
}

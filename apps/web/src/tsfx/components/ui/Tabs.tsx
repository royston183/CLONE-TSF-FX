import { useId, type KeyboardEvent, type ReactNode } from 'react';

export interface TabItem { id: string; label: string; className?: string }

/** The tab a key moves to (Arrow Left / Right wrap around, Home, End); null for any other key. */
export function tabAfterKey(ids: string[], current: string, key: string): string | null {
  if (!ids.length) return null;
  const at = Math.max(0, ids.indexOf(current));
  if (key === 'ArrowRight') return ids[(at + 1) % ids.length];
  if (key === 'ArrowLeft') return ids[(at - 1 + ids.length) % ids.length];
  if (key === 'Home') return ids[0];
  if (key === 'End') return ids[ids.length - 1];
  return null;
}

/**
 * One tab strip and its panel (WAI-ARIA tabs): the selected tab is the one Tab stop, Arrow keys, Home and End move
 * between tabs, and every tab names the panel it controls. `panelClassName` styles the panel (it scrolls with the body).
 */
export function Tabs({ label, tabs, current, onSelect, children, panelClassName }: {
  label: string; tabs: TabItem[]; current: string; onSelect: (id: string) => void; children: ReactNode; panelClassName?: string;
}) {
  const base = useId();
  const tabId = (id: string) => `${base}tab-${id}`, panelId = `${base}panel`;
  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    const next = tabAfterKey(tabs.map(t => t.id), current, e.key);
    if (!next) return;
    e.preventDefault();
    onSelect(next);
    document.getElementById(tabId(next))?.focus();
  };
  return <>
    <div className="kit-tabs" role="tablist" aria-label={label} onKeyDown={keys}>
      {tabs.map(t => (
        <button key={t.id} id={tabId(t.id)} type="button" role="tab" aria-selected={t.id === current} aria-controls={panelId} tabIndex={t.id === current ? 0 : -1}
          className={t.className} onClick={() => onSelect(t.id)}>{t.label}</button>
      ))}
    </div>
    <div id={panelId} className={panelClassName} role="tabpanel" aria-labelledby={tabId(current)} tabIndex={0}>{children}</div>
  </>;
}

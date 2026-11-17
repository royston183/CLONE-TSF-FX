// Master Contract style KPI cards and the drag-and-drop helpers the Trade Flows and Invoice screens share.
import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { FX_LOGO } from '../../../shared/fx/logo.ts';

/** The Fourth Signal mark every screen of the Trade Flows and Invoice frame shows (the same asset Create Master Contract uses). */
export const FS_LOGO = FX_LOGO;

/** The page header every Trade Flows and Invoice screen shares: leading actions, title and description, trailing actions. */
export function PageHeader({ title, description, before, after }: { title: string; description?: string; before?: ReactNode; after?: ReactNode }) {
  return (
    <header className="mc-page-header">
      {before}
      <img className="mc-logo" src={FS_LOGO} alt="Fourth Signal" />
      <div className="mc-page-header__text"><h1>{title}</h1>{description && <p>{description}</p>}</div>
      <span className="mc-grow" />
      {after}
    </header>
  );
}

export type KpiTone = 'blue' | 'green' | 'amber' | 'violet' | 'red';
// Earlier call sites named a mood (ok / warn / bad); they map onto the report's tints.
const TONE: Record<string, KpiTone> = { ok: 'green', warn: 'amber', bad: 'red', blue: 'blue', green: 'green', amber: 'amber', violet: 'violet', red: 'red' };
export interface Kpi { value: ReactNode; unit?: string; label: string; note?: string; tone?: KpiTone | 'ok' | 'warn' | 'bad'; /** The small icon in the card's corner. */ icon?: ReactNode; title?: string; onClick?: () => void }

/** KPI cards as in the ZFS_CASHPOS3 report: label, value and subtitle, with a tinted icon in the corner. With four, the first is wider. */
export function KpiRow({ items, label = 'Summary', compact = false }: { items: Kpi[]; label?: string; compact?: boolean }) {
  const cols = items.map((_, i) => (i === 0 && items.length === 4 ? '1.5fr' : '1fr')).join(' ');
  return (
    <div className={`mc-kpi-row${compact ? ' compact' : ''}`} role="group" aria-label={label} style={{ gridTemplateColumns: cols }}>
      {items.map((k, i) => {
        const body = <>
          <span className="mc-kpi__label">{k.label}</span>
          <div className="mc-kpi__value">{k.value}{k.unit && <small>{k.unit}</small>}</div>
          {k.note && <div className="mc-kpi__note">{k.note}</div>}
          {k.icon && <span className="mc-kpi__icon" aria-hidden="true">{k.icon}</span>}
        </>;
        const cls = `mc-kpi t-${TONE[k.tone ?? 'blue']}${i === 0 && items.length === 4 ? ' wide' : ''}`;
        return k.onClick
          ? <button key={k.label} type="button" className={cls} title={k.title} onClick={k.onClick}>{body}</button>
          : <div key={k.label} className={cls} title={k.title}>{body}</div>;
      })}
    </div>
  );
}

/**
 * Drag a table row onto a drop target, as on Create Master Contract: a compact ghost label, the dragged row dimmed, the
 * target lit while the row is over it. `source(item, label)` makes a row draggable; `target(name, onDrop)` makes a drop target.
 */
export function useRowDrag<T>() {
  const dragged = useRef<T | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const source = (item: T, label: string, enabled = true) => ({
    draggable: enabled,
    onDragStart: (e: DragEvent<HTMLElement>) => {
      dragged.current = item; setActive(true);
      e.currentTarget.classList.add('mc-dragging');
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/plain', label);
      const ghost = document.createElement('div');
      ghost.className = 'mc-drag-ghost'; ghost.textContent = label;
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 12, 14);
      setTimeout(() => ghost.remove(), 0);
    },
    onDragEnd: (e: DragEvent<HTMLElement>) => { dragged.current = null; setActive(false); setOver(null); e.currentTarget.classList.remove('mc-dragging'); }
  });
  const target = (name: string, onDrop: (item: T) => void, enabled = true) => ({
    onDragOver: (e: DragEvent<HTMLElement>) => { if (!dragged.current || !enabled) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setOver(name); },
    onDragLeave: () => setOver(o => (o === name ? null : o)),
    onDrop: (e: DragEvent<HTMLElement>) => { e.preventDefault(); setOver(null); if (dragged.current && enabled) onDrop(dragged.current); }
  });
  return { source, target, over, active };
}

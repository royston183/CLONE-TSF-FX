import type { ReactNode } from 'react';

/** ALM notice: info (default), warn or error, with an optional text-button action such as Retry. */
export function Notice({ children, error = false, kind, action }: { children: ReactNode; error?: boolean; kind?: 'info' | 'warn' | 'error'; action?: { label: string; onClick: () => void } }) {
  const k = kind ?? (error ? 'error' : 'info');
  const cls = k === 'error' ? 'notice error' : k === 'warn' ? 'notice td-warn' : 'notice';
  return <div className={cls} role={k === 'error' ? 'alert' : 'status'}>{children}{action && <button className="text-button" onClick={action.onClick}>{action.label}</button>}</div>;
}

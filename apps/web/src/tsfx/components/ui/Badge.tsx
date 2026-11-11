import type { ReactNode } from 'react';

/** Status always uses a labelled green, amber or red tag; colour is accompanied by text and a dot. */
export function TrafficLightTag({ tone, children }: { tone: 'green' | 'amber' | 'red'; children: ReactNode }) {
  return <span className={`kit-status ${tone}`}><span className="kit-status-dot" aria-hidden="true" />{children}</span>;
}

/** neutral → ALM .pill; green/amber/red/info → ALM .ov-rag. */
export function Badge({ tone, children }: { tone: 'neutral' | 'green' | 'amber' | 'red' | 'info'; children: ReactNode }) {
  return tone === 'neutral' || tone === 'info' ? <span className="pill">{children}</span> : <TrafficLightTag tone={tone}>{children}</TrafficLightTag>;
}

const STATUS = { create: 'New', update: 'Update', invalid: 'Invalid', duplicate: 'Duplicate', rejected: 'Rejected' } as const;
/** Upload/preview row status (ALM .tb-status). */
export function StatusBadge({ status }: { status: keyof typeof STATUS }) {
  return <TrafficLightTag tone={status === 'create' ? 'green' : status === 'update' ? 'amber' : 'red'}>{STATUS[status]}</TrafficLightTag>;
}

// src/components/fields/FormGrid.tsx
import type { CSSProperties, ReactNode } from 'react';

/** Form fields in one or two columns (one on phones). */
export function FormGrid({ columns = 1, children }: { columns?: 1 | 2; children: ReactNode }) {
  return <div className="kit-form" data-columns={columns} style={{ '--kit-cols': columns } as CSSProperties}>{children}</div>;
}

/** A titled group of fields in a record: a small-caps heading over its fields, no frame of its own. */
export function FieldGroup({ title, children }: { title: string; children: ReactNode }) {
  return <section className="kit-group"><h3>{title}</h3>{children}</section>;
}

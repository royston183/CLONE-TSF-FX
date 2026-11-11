import { useId, type ReactNode } from 'react';

/** Consistent labelled sections for modal inputs, options, previews and review summaries. */
export function DialogSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const id = useId();
  return <section className="kit-dialog-section" aria-labelledby={id}>
    <div className="kit-dialog-section-head"><h3 id={id}>{title}</h3>{description && <p>{description}</p>}</div>
    <div className="kit-dialog-section-body">{children}</div>
  </section>;
}

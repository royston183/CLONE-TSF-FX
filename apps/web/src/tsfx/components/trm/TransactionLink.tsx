import { useContext, type ReactNode } from 'react';
import type { TransactionTarget } from '@tsfx/lib/trm/types';
import { TransactionContext } from './context';

/**
 * A TRM transaction number (or security class) as a link that opens its FTR_DISPLAY pop-up (SAP Reporting's hotspot).
 * The click and Enter stay with the link: a list row that opens on click or Enter does not open as well. Outside the
 * provider it is plain text.
 */
export function TransactionLink({ target, children }: { target: TransactionTarget; children?: ReactNode }) {
  const context = useContext(TransactionContext);
  if (!context) return <span>{children}</span>;
  return (
    <button type="button" className="td-link trm-hotspot" onClick={e => { e.stopPropagation(); context.open(target); }}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}>
      {children ?? (target.kind === 'deal' ? target.deal : target.securityClass)}
    </button>
  );
}

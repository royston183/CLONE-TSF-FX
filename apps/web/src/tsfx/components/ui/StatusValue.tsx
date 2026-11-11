import type { ReactNode } from 'react';
import type { Row } from '@tsfx/lib/grid/types';
import { transactionTargetOf } from '@tsfx/lib/trm/rules';
import type { TransactionRef } from '@tsfx/lib/trm/types';
import { TransactionLink } from '@tsfx/components/trm/TransactionLink';
import { TrafficLightTag } from './Badge';

/**
 * A value as lists, report cells, object headers and display fields show it: a TRM transaction number as a link to its
 * pop-up (declared with `transaction`, or a FinancialTransaction / transactionNo / dealNumber column next to the row's
 * company code), a business status as a traffic-light tag. Exports keep plain values.
 */
export function StatusValue({ definition, row, children }: {
  definition: { field?: string; id?: string; statusTone?: (row: Row) => 'green' | 'amber' | 'red'; transaction?: TransactionRef }; row: Row; children: ReactNode;
}) {
  const target = transactionTargetOf(definition, row);
  const value = target ? <TransactionLink target={target}>{children}</TransactionLink> : children;
  return definition.statusTone ? <TrafficLightTag tone={definition.statusTone(row)}>{value}</TrafficLightTag> : <>{value}</>;
}

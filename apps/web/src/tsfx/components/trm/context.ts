import { createContext } from 'react';
import type { TransactionTarget } from '@tsfx/lib/trm/types';

/** What a transaction link asks of the pop-up provider (TransactionProvider, mounted once in WorkspaceShell). */
export interface TransactionContextValue { open: (target: TransactionTarget) => void; openLookup: () => void }
export const TransactionContext = createContext<TransactionContextValue | null>(null);

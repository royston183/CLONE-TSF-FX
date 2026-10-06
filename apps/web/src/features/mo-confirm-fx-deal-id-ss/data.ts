/**
 * Display constants only. The deals, invoice plan and transaction lists are read from SAP
 * through the middleware (api.ts); the former dummy deals survive only as test fixtures
 * (fixtures.ts).
 */
import { round2 } from './format.ts'
import type { BadgeMeta, Leg, LegInput, TxnStatus } from './types.ts'

/**
 * Badge colour per Deal ID status code. Styling only: the text is ZSGTSFTR_DEAL_ST's
 * (Deal.statusText); an unlisted code is grey.
 */
export const STATUS_BADGE: Readonly<Record<string, string>> = {
  '01': 'badge-amber',
  '02': 'badge-green',
  '03': 'badge-blue',
  '30': 'badge-gray',
  '50': 'badge-gray',
}

/**
 * KEPT STATIC: leg transaction-status labels. TXN_STATUS comes from ZSGTSFCDS_FX / _OPTION,
 * whose text table is not part of the export; an unlisted code shows as itself.
 */
export const TXN_STATUS_META: Record<TxnStatus, BadgeMeta> = {
  '03': { text: 'Awaiting Settlement', badge: 'badge-amber' },
  '07': { text: 'Settlement Ready', badge: 'badge-green' },
}

/** Stamps the total P&L onto a leg. */
export function leg(o: LegInput): Leg {
  return { ...o, totPl: round2(o.fxPl + o.setPl) }
}

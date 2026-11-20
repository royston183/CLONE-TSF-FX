import { useAsync } from '@slc/api-client/react'
import { PlannedTables, type PlannedParts } from '../../shared/fx/PlannedTables.tsx'
import { loadPlanned } from './planned.ts'

/**
 * Deal ID: Planned Trade Invoices and Planned P&L for the Deal ID given, loaded and calculated here. Drop it into any screen that
 * shows a Deal ID; `parts` picks one of the two tables when the screen already has its own other half. Renders nothing without a
 * Deal ID, and says so when the Deal ID is not an FX Deal ID.
 */
export function PlannedForDeal({ dealId, parts = 'both' }: { dealId: string; parts?: PlannedParts }) {
  const state = useAsync((signal) => (dealId ? loadPlanned(dealId, signal) : Promise.resolve(undefined)), [dealId])
  if (!dealId) return null
  if (!state.loading && !state.error && state.data === null) {
    return <div className="pt-wrap"><p className="pt-note">Deal ID {dealId} is not an FX Deal ID, so it has no planned trade invoices or P&amp;L.</p></div>
  }
  return <PlannedTables data={state.data ?? null} loading={state.loading} error={state.error?.message ?? ''} onRetry={state.reload} parts={parts} />
}

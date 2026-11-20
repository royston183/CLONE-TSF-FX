import type { DealStatus } from './types.ts'

/** Status as plain coloured text, like the Master Contracts table: open is blue, matured purple, settled teal. */
export function statusClass(status: DealStatus): string {
  return `status-text status-text-${status === 'Open' ? 'confirmed' : status === 'Matured' ? 'matured' : 'settled'}`
}

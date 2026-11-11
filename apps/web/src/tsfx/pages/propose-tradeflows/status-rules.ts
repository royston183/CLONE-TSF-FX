// Which Deal ID statuses (ZSGTSFTR_DEAL_ST) may receive BLs, and which status change the app itself may make. One place, so a Deal ID
// cannot skip a stage: 02 (MO confirmed) → 03 (marked for invoicing, the MO screen "Mark Deal IDs for invoicing") → 04 (BLs assigned).
// The texts of the statuses stay in the status master; only the order the app relies on is named here.

/** "03 - Deal ID marked for Invoicing": the stage a Deal ID must have reached before BLs are assigned to it. */
export const MARKED_FOR_INVOICING = '03';
/** "04 - BL Assigned to Deal ID for Invoicing". */
export const BL_ASSIGNED = '04';

/** Statuses in which BLs may be assigned: marked for invoicing, or already holding BLs (more can be added until it is full). */
export const BL_ASSIGNABLE: readonly string[] = [MARKED_FOR_INVOICING, BL_ASSIGNED];

/** The status changes the app makes itself, from → to. Anything else is refused. */
const TRANSITIONS: Readonly<Record<string, readonly string[]>> = { [MARKED_FOR_INVOICING]: [BL_ASSIGNED] };

export const canMove = (from: string, to: string): boolean => (TRANSITIONS[from] ?? []).includes(to);

/** Why BLs may not be assigned to a Deal ID at this status ('' when they may). */
export function assignStatusProblem(dealId: string, status: string): string {
  if (BL_ASSIGNABLE.includes(status)) return '';
  const n = parseInt(status, 10);
  if (Number.isFinite(n) && n < Number(MARKED_FOR_INVOICING)) {
    return `Deal ID ${dealId} is at status ${status || '(none)'}: it must be marked for invoicing (status ${MARKED_FOR_INVOICING}) in Mid-Office before BLs can be assigned to it.`;
  }
  return `Deal ID ${dealId} is at status ${status || '(none)'}, past BL assignment, so no BLs can be assigned to it.`;
}

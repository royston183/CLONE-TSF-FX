/**
 * MO: View List of Deal IDs for Settlement — ZSGTSFR106.
 *
 * NO SOURCE. The legacy page names only ZSGTSFTR_DEALID, ZSGTSFTR_DEAL_ST, FM
 * ZSGTSFFM_MC_DETAILS and the drill-down SUBMIT ZSGTSF_RDEAL_TRD_INV; the list program itself
 * is in no export and no dependency note (ZSGTSFR061 is ZSGTSF_RDEAL_ID_SETT, a different
 * transaction; ZSGTSF_RDEAL_TRD_INV is ZSGTSFR060's program and is known only from its note).
 *
 * So, per the no-source rule:
 *   Deal ID worklist      which Deal IDs are "for settlement" (status range, dates, CO area,
 *                         utilisation from ZSGTSFCDS_FX) is a guessed selection -> WAITING FOR API.
 *                         The utilisation column alone is no longer a blocker: its D1 legs are
 *                         TrmFxApp (Deal ID / Deal Type / MC ref) + FxTransaction, see
 *                         mo-deal-id-invoice-mark/amount.ts loadUsdAmounts. The selection is.
 *   Region list           the SAP region codes, shared/fx/regions.ts (COMP and BPEXT) -> live.
 *   Status / Origin Entity / CO Area lists
 *                         none is a standard master with an unambiguous key (the status list
 *                         needs a sub type / code range, the entity list comes from a Z master
 *                         with an unknown restriction, CO Area is a controlling area, not T001)
 *                         -> WAITING FOR API.
 *   Trade Invoice drill-down (SUBMIT ZSGTSF_RDEAL_TRD_INV) -> WAITING FOR API.
 *   No action writes anything (the screen has none besides display / filters).
 *
 * Nothing falls back to sample data: the legacy rows are in fixtures.ts, for tests only.
 */
import type { Deal, MasterContract } from './types.ts'

export const WAITING = 'WAITING FOR API'

export const LIST_WAITING = `${WAITING} — ABAP source for ZSGTSFR106 not exported (its list program is in no dependency note); the selection of Deal IDs for settlement on ZSGTSFTR_DEALID / ZSGTSFTR_MAS_CON / ZSGTSFTR_DEAL_ST cannot be reproduced.`

export const MASTER_WAITING = `${WAITING} — ZSGTSFR106 source not exported`

export const INVOICES_WAITING = `${WAITING} — SUBMIT ZSGTSF_RDEAL_TRD_INV: source not exported (only dependency notes); the invoice legs (ZSGTSFTR_TRD_POS / ZSGTSFTR_SET_TYP / ZSGTSFTR_BIL_ADJ) cannot be reproduced.`

export type SettlementList = {
  state: 'waiting'
  reason: string
  deals: readonly Deal[]
  masterContracts: readonly MasterContract[]
}

/** The worklist: always waiting until the program's selection is exported or an API exists. */
export function loadSettlementList(): SettlementList {
  return { state: 'waiting', reason: LIST_WAITING, deals: [], masterContracts: [] }
}

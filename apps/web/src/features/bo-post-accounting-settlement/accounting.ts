/**
 * Accounting Completed: ZSGTSFTR_DEALID ZDEAL_STAT 21 -> 22 (Settlement Completed - Accounting).
 *
 * The legs' state is ZSGTSFTR_TRD_POS (the gateway's local SQLite, /api/localdb/tsf-trade-position). The rule is
 * the screen's own (all FX deal and trade invoice documents posted before accounting is complete), on top of
 * execution being complete (21): every row, FX and trade invoice legs alike, has to be settled on MO
 * (Settlement Complete, ZEXE_CO = 'X'; ZSET_CHECK is only the SET_TYP configuration flag), and every leg that is posted to FI (an FX leg; an invoice leg with ZPOST_CHECK = 'X') has
 * to carry its FI document (ZBELNR). Only a SAP posting fills ZBELNR, and that posting has no API yet, so until
 * it does a Deal ID cannot reach 22 from here. The Deal ID row is
 * re-read by key so its status is current and its full key (ZDEAL_TYPE, ZSUB_TYPE) is at hand for the write.
 */
import { apiFetch, service } from '@slc/api-client'
import { setDealStatus } from '../../shared/fx/deal-id.ts'
import { messageOf } from '../../shared/fx/master-contract.ts'
import { txt } from '../../shared/fx/masters.ts'
import { fxList, type FxRow } from '../../shared/fx/mw.ts'

export const EXECUTION_COMPLETED = 21
export const ACCOUNTING_COMPLETED = '22'

const tradePositionApi = service('localdb')('tsf-trade-position')

export type AccountingDeps = {
  readDeal: (dealId: string) => Promise<FxRow | undefined>
  readPositions: (dealId: string) => Promise<Record<string, unknown>[]>
  writeStatus: (deal: FxRow, status: string) => Promise<void>
}

export const defaultDeps: AccountingDeps = {
  readDeal: async (dealId) => (await fxList('tsfDealId', { ZDEAL_ID: dealId }))[0],
  readPositions: async (dealId) =>
    (await apiFetch<{ value?: Record<string, unknown>[] }>(`${tradePositionApi}?ZDEAL_ID=${encodeURIComponent(dealId)}`))?.value ?? [],
  writeStatus: (deal, status) => setDealStatus([deal], status),
}

export type AccountingResult = { ok: true; message: string } | { ok: false; error: string }

/** A leg's name for the messages: an invoice leg by its type (T2-S), an FX leg by its transaction. */
const legName = (p: Record<string, unknown>): string => {
  const type = String(p['ZT_TYPE'] ?? '').trim()
  return type === 'FX' ? `FX ${String(p['ZD_MAP'] ?? '').trim()} ${String(p['ZRP'] ?? '').trim()}`.trim() : type
}

export async function markAccountingComplete(dealId: string, deps: AccountingDeps = defaultDeps): Promise<AccountingResult> {
  let row: FxRow | undefined
  let positions: Record<string, unknown>[]
  try {
    ;[row, positions] = await Promise.all([deps.readDeal(dealId), deps.readPositions(dealId)])
  } catch (error) {
    return { ok: false, error: `Deal ID ${dealId} or its settlement legs could not be read: ${messageOf(error)}` }
  }
  if (!row) return { ok: false, error: `Deal ID ${dealId} is not in ZSGTSFTR_DEALID.` }

  const status = Number(txt(row, 'ZDEAL_STAT')) || 0
  if (status >= 22) return { ok: false, error: `Deal ID ${dealId} is already at ${txt(row, 'ZDEAL_STAT')}.` }
  if (status < 20) return { ok: false, error: 'Settlement has not been initiated yet.' }
  if (status < EXECUTION_COMPLETED) {
    return { ok: false, error: 'Execution is not complete yet: run Execution Complete on MO: Execute Settlement for Deal ID first (status 21).' }
  }
  if (!positions.length) {
    return { ok: false, error: 'No settlement legs are stored for this Deal ID: settle them on MO: Execute Settlement for Deal ID first.' }
  }
  const open = positions.filter((p) => String(p['ZEXE_CO'] ?? '').trim() !== 'X').map(legName)
  if (open.length) return { ok: false, error: `These legs are not settled yet: ${open.join(', ')}.` }
  const unposted = positions
    .filter((p) => String(p['ZT_TYPE'] ?? '').trim() === 'FX' || String(p['ZPOST_CHECK'] ?? '').trim() === 'X')
    .filter((p) => String(p['ZBELNR'] ?? '').trim() === '')
    .map(legName)
  if (unposted.length) {
    return {
      ok: false,
      error: `All FX deal and trade invoice documents must be posted before accounting can be marked complete. Not posted yet: ${unposted.join(', ')} (Post FX Deal / Post Trade Invoice).`,
    }
  }

  try {
    await deps.writeStatus(row, ACCOUNTING_COMPLETED)
  } catch (error) {
    return { ok: false, error: messageOf(error) }
  }
  return { ok: true, message: `Deal ID ${dealId} marked Accounting Complete: status 22 - Settlement Completed - Accounting.` }
}

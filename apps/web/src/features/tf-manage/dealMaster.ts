import { list, odataString, runLimited, service, toNum } from '@slc/api-client'
import { listDealIds } from '../../shared/fx/deal-id.ts'
import { listMasterContracts } from '../../shared/fx/master-contract.ts'
import { txt } from '../../shared/fx/masters.ts'
import { fxList, isAbort } from '../../shared/fx/mw.ts'
import type { FxRow } from '../../shared/fx/mw.ts'
import { mwList } from '../../shared/middleware.ts'
import { UTILIZATION_DEAL_TYPE, loadFxLegs, toLink, txnKey } from '../mo-deal-id-invoice-mark/amount.ts'
import type { AppStrLink, Leg } from '../mo-deal-id-invoice-mark/amount.ts'
import { dealCommodity, type DealCommodity } from './assignmentCommodity.ts'

/**
 * The deal master behind BL Data 1's "Assign Deal ID & Release for Invoicing" popup.
 *
 * It is the TSF Deal ID, as ZSGTSF_RTF_MANAGE reads it, not the SLC one:
 *
 *  - Deal IDs, MC Ref No and the sub type from ZSGTSFTR_DEALID (middleware "tsfDealId");
 *  - the status text from ZSGTSFTR_DEAL_ST (middleware "tsfDealStatus"), keyed by sub type + status;
 *  - Deal Structures from ZSGTSFTR_TSF_STR, whose ZTYPE is the structure and whose ZSUB_TYPE is
 *    what a Deal ID stores in its own ZSUB_TYPE;
 *  - the Deal Amount from the Deal ID's D1 transaction, never from the Master Contract: see
 *    calculateDealAmounts. The popup's remaining-amount validation depends on it.
 *
 * Read only. Nothing here writes a Deal ID, an APP_STR row or a Treasury transaction.
 */
export type DealMasterRecord = DealCommodity & {
  dealStatus: string
  dealStatusText: string
  dealAmount: number
}

export type DealStructureOption = { key: string; text: string }

export type DealMaster = {
  deals: DealMasterRecord[]
  structures: DealStructureOption[]
}

const APP = service('trmfxapp')('TrmFxApp')

/** Keys per request, as the other APP_STR readers chunk them. */
const CHUNK = 25

/** The slice of TrmFxApp read here: which transaction belongs to which Deal ID. */
type AppStrEntity = Parameters<typeof toLink>[0]

const chunked = <T>(items: readonly T[]): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK))
  return out
}

/** A request that failed is a failed load: a zero amount would claim the Deal ID has nothing left to assign. */
function fulfilled<T>(results: ReadonlyArray<PromiseSettledResult<T>>): T[] {
  return results.map((r) => {
    if (r.status === 'rejected') throw r.reason
    return r.value
  })
}

/** The D1 transactions of these Deal IDs in APP_STR (ZTSF_DEAL_ID, ZTSF_DEAL_TYPE = 'D1'). */
async function loadDealLinks(dealIds: readonly string[], signal?: AbortSignal): Promise<AppStrLink[]> {
  const tasks = chunked(dealIds).map((chunk) => () =>
    list<AppStrEntity>(
      APP,
      {
        filter: `(${chunk.map((id) => `ZtsfDealID eq ${odataString(id)}`).join(' or ')}) and ZtsfDealType eq ${odataString(UTILIZATION_DEAL_TYPE)}`,
        top: 1000,
      },
      signal ? { signal } : undefined,
    ),
  )
  return fulfilled(await runLimited(tasks)).flat().map(toLink).filter((l) => l.dealId)
}

/** The FX legs of those links, in chunks, as one list. */
async function loadLegs(links: readonly AppStrLink[], signal?: AbortSignal): Promise<Leg[]> {
  const tasks = chunked(links).map((chunk) => () => loadFxLegs(chunk, signal))
  return fulfilled(await runLimited(tasks)).flat()
}

/**
 * Deal Amount per Deal ID, as the legacy program computed it from the Deal ID's D1 transaction:
 * CURR1 = 'USD' gives ABS(AMT1), anything else gives ABS(AMT2).
 *
 * Only a Deal ID with a D1 transaction that SAP still serves gets an entry (a reversed one is
 * not served as a leg). When a Deal ID has several, the first by transaction key is used, as the
 * legacy SELECT SINGLE does, and they are never summed. A Deal ID with none has no entry, and
 * buildDealMaster leaves it out.
 *
 * Option Deal IDs are not covered: the legacy program fell back to ZSGTSFV_OP for them, and no
 * middleware resource or Option service exposes it yet. Options are on hold, so such a Deal ID
 * is simply excluded.
 */
export function calculateDealAmounts(links: readonly AppStrLink[], legs: readonly Leg[]): Map<string, number> {
  const legByKey = new Map(legs.map((l) => [txnKey(l.companyCode, l.transaction), l]))
  const amounts = new Map<string, number>()
  const ordered = [...links].sort((a, b) => txnKey(a.companyCode, a.transaction).localeCompare(txnKey(b.companyCode, b.transaction)))
  for (const link of ordered) {
    if (link.dealType !== UTILIZATION_DEAL_TYPE || amounts.has(link.dealId)) continue
    const leg = legByKey.get(txnKey(link.companyCode, link.transaction))
    if (leg) amounts.set(link.dealId, Math.abs(leg.curr1 === 'USD' ? leg.amt1 : leg.amt2))
  }
  return amounts
}

type StructureRow = { Ztype?: string; Zdesc?: string; ZsubType?: string }

export async function loadDealMaster(signal?: AbortSignal): Promise<DealMaster> {
  const [dealRows, statusRows, structureRows, mcRows] = await Promise.all([
    listDealIds({}, signal),
    // Status text is decoration: without it a deal still lists, with its code.
    fxList('tsfDealStatus', {}, { signal }).catch((error) => {
      if (isAbort(error)) throw error
      return [] as FxRow[]
    }),
    // Structure text is decoration too.
    mwList<StructureRow>('tsfStructure', undefined, signal).catch(() => [] as StructureRow[]),
    // Required for the FX commodity gate: an unavailable MC must not become an allowed match.
    listMasterContracts({}, signal).catch((error) => {
      if (isAbort(error)) throw error
      console.warn('[tf-manage] Master contract commodities unavailable; FX assignment remains blocked', error)
      return [] as FxRow[]
    }),
  ])

  const dealIds = [...new Set(dealRows.map((r) => txt(r, 'ZDEAL_ID')).filter(Boolean))]
  let amounts: Map<string, number>
  try {
    const links = await loadDealLinks(dealIds, signal)
    amounts = calculateDealAmounts(links, await loadLegs(links, signal))
  } catch (error) {
    if (isAbort(error)) throw error
    console.warn('[tf-manage] Deal Amount unavailable: ZSGTSFTR_APP_STR (trmfxapp) or FxTransaction (fx) could not be read', error)
    throw error
  }

  return buildDealMaster(dealRows, statusRows, structureRows, amounts, mcRows)
}

/** The pure half of loadDealMaster: deal, status, structure rows and amounts in, the popup's lists out. */
export function buildDealMaster(
  dealRows: readonly FxRow[],
  statusRows: readonly FxRow[],
  structureRows: readonly StructureRow[],
  amounts: ReadonlyMap<string, number>,
  mcRows: readonly FxRow[] = [],
): DealMaster {
  const contracts = new Map(mcRows.map((row) => [txt(row, 'ZMC_REF_NO'), row]))
  const typeOfSubType = new Map<string, string>()
  const structureText = new Map<string, string>()
  for (const row of structureRows) {
    const type = String(row.Ztype ?? '').trim()
    if (!type) continue
    if (!structureText.has(type)) structureText.set(type, String(row.Zdesc ?? '').trim())
    const sub = String(row.ZsubType ?? '').trim()
    if (sub) typeOfSubType.set(sub, type)
  }

  const statusText = new Map<string, string>()
  for (const row of statusRows) {
    const key = `${txt(row, 'ZSUB_TYPE')}|${txt(row, 'ZDEAL_STAT')}`
    if (!statusText.has(key)) statusText.set(key, txt(row, 'ZDEAL_SDESC'))
  }

  const deals = dealRows
    // A Deal ID with no D1 transaction behind it has no amount to assign against, so it is left
    // out, as the legacy program left it out. That is per Deal ID: it never fails the whole list.
    .filter((row) => amounts.has(txt(row, 'ZDEAL_ID')))
    .map((row) => {
      const dealId = txt(row, 'ZDEAL_ID')
      const subType = txt(row, 'ZSUB_TYPE')
      const status = txt(row, 'ZDEAL_STAT')
      return {
        ...dealCommodity(row, contracts.get(txt(row, 'ZMC_REF')), typeOfSubType.get(subType)),
        dealStatus: status,
        dealStatusText: statusText.get(`${subType}|${status}`) ?? '',
        dealAmount: toNum(amounts.get(dealId)),
      }
    })
    .sort((a, b) => b.dealId.localeCompare(a.dealId))

  const structures = [...structureText.entries()]
    .map(([key, text]) => ({ key, text: text || key }))
    .sort((a, b) => a.key.localeCompare(b.key))

  return { deals, structures }
}

export function findDeal(deals: readonly DealMasterRecord[], dealId: string): DealMasterRecord | undefined {
  const id = dealId.trim()
  return id ? deals.find((d) => d.dealId === id) : undefined
}

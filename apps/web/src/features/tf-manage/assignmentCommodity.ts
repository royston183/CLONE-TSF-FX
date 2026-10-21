import { listDealIds } from '../../shared/fx/deal-id.ts'
import { listMasterContracts } from '../../shared/fx/master-contract.ts'
import { txt } from '../../shared/fx/masters.ts'
import type { FxRow } from '../../shared/fx/mw.ts'

export type DealCommodity = {
  dealId: string
  dealStructure: string
  mcRefNo: string
  mcCommodity: string
  mcCommodityDescription: string
}

/** ASS_DEAL: GV_CMMD comes from the Deal ID's own MC, never from the TF or invoice text. */
export function dealCommodity(deal: FxRow, mc?: FxRow, structure = ''): DealCommodity {
  const subType = txt(deal, 'ZSUB_TYPE')
  return {
    dealId: txt(deal, 'ZDEAL_ID'),
    // Use the stored type first so changing the popup's structure cannot bypass the FX check.
    dealStructure: txt(deal, 'ZDEAL_TYPE') || (/^FX[12]$/.test(subType) ? 'FX' : structure),
    mcRefNo: txt(deal, 'ZMC_REF'),
    mcCommodity: mc ? txt(mc, 'ZCOMMODITY') : '',
    mcCommodityDescription: mc ? txt(mc, 'ZCOM_DESC') : '',
  }
}

/** USER_COMMAND_9009: FX requires the TF's ZTRM_COM_ID to match, except MC commodity C001. */
export function assignmentCommodityError(deal: DealCommodity, gtCommodity: string): string {
  if (!deal.dealStructure) return `Cannot verify the structure of Deal ID ${deal.dealId}. Reload the Deal IDs and try again.`
  if (deal.dealStructure !== 'FX') return ''
  if (!deal.mcRefNo || !deal.mcCommodity) {
    return `Cannot verify the master contract commodity for Deal ID ${deal.dealId}. Assignment is blocked until it is available.`
  }
  if (deal.mcCommodity === 'C001') return ''
  const commodity = gtCommodity.trim()
  if (!commodity) return 'GT Commodity is not maintained for this trade flow. Select its GT commodity before assigning an FX Deal ID.'
  return deal.mcCommodity === commodity ? '' :
    `GT commodity ${commodity} does not match master contract ${deal.mcRefNo}'s commodity ${deal.mcCommodity}. Select a matching FX Deal ID or a multi-commodity master contract (C001).`
}

/** Re-read the authoritative Deal ID and MC before Update can insert or change any BL. */
export async function validateAssignmentCommodity(dealId: string, gtCommodity: string, signal?: AbortSignal): Promise<void> {
  const rows = await listDealIds({ ZDEAL_ID: dealId }, signal)
  if (!rows.length) throw new Error(`Deal ID ${dealId} does not exist.`)
  const contracts = new Map<string, FxRow | undefined>()
  for (const row of rows) {
    const context = dealCommodity(row)
    if (context.dealStructure === 'FX' && context.mcRefNo) {
      if (!contracts.has(context.mcRefNo)) {
        const mcs = await listMasterContracts({ ZMC_REF_NO: context.mcRefNo }, signal)
        contracts.set(context.mcRefNo, mcs.find((mc) => txt(mc, 'ZMC_REF_NO') === context.mcRefNo))
      }
      const mc = contracts.get(context.mcRefNo)
      const error = assignmentCommodityError(dealCommodity(row, mc), gtCommodity)
      if (error) throw new Error(error)
    } else {
      const error = assignmentCommodityError(context, gtCommodity)
      if (error) throw new Error(error)
    }
  }
}

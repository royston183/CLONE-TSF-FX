import { fxList, isAbort, type FxRow } from '../../shared/fx/mw.ts'
import { txt } from '../../shared/fx/masters.ts'
import { regionText } from '../../shared/fx/deal-id.ts'

export type ReportRow = Record<string, string | null> & { id: string }
export type Sources = { deals: FxRow[]; mcs: FxRow[]; companies: FxRow[]; statuses: FxRow[]; models: FxRow[]; fx: FxRow[] }
export function joinRows(s: Sources): ReportRow[] {
  const mcs = new Map(s.mcs.map(r => [txt(r, 'ZMC_REF_NO'), r]))
  return s.deals.flatMap(d => {
    const mc = mcs.get(txt(d, 'ZMC_REF'))
    if (!mc) return []
    const comp = s.companies.find(r => txt(r, 'ZCOM_ID') === txt(mc, 'ZORIGIN')) ?? {}
    const modelId = txt(d, 'ZTSF_MODEL') || txt(mc, 'ZMOD_ID')
    const model = s.models.find(r => txt(r, 'ZMOD_ID') === modelId && (!txt(r, 'ZSUB_TYPE') || txt(r, 'ZSUB_TYPE') === txt(d, 'ZSUB_TYPE'))) ?? {}
    const status = s.statuses.find(r => txt(r, 'ZDEAL_TYPE') === txt(d, 'ZDEAL_TYPE') && txt(r, 'ZSUB_TYPE') === txt(d, 'ZSUB_TYPE') && txt(r, 'ZDEAL_STAT') === txt(d, 'ZDEAL_STAT')) ?? {}
    const bp = (slot: number) => {
      if (txt(d, 'ZSUB_TYPE') === 'FX2') return ''
      const leg = s.fx.find(r => txt(r, 'BUKRS') === txt(d, 'ZBUKRS' + slot) && txt(r, 'RFHA').replace(/^0+/, '') === txt(d, 'ZRFHA' + slot).replace(/^0+/, '') && !!txt(d, 'ZRFHA' + slot))
      return leg ? txt(leg, 'BP_NAME') || txt(leg, 'KONTRH') : ''
    }
    const r: ReportRow = {
      id: [txt(d, 'ZDEAL_ID'), txt(d, 'ZDEAL_TYPE'), txt(d, 'ZSUB_TYPE')].join('|'),
      zdealId: txt(d, 'ZDEAL_ID'), mcRef: txt(d, 'ZMC_REF'), dealDesc: txt(d, 'ZDEAL_DESC'),
      status: txt(d, 'ZDEAL_STAT'), statusDesc: txt(status, 'ZDEAL_SDESC') || txt(d, 'ZDEAL_STAT'),
      origin: txt(mc, 'ZORIGIN'), region: regionText(txt(comp, 'ZREG_ID')), co: txt(model, 'ZCO_AREA'),
      model: modelId, modelDesc: txt(model, 'ZMOD_DESC') || txt(mc, 'ZMOD_DESC'),
      start: txt(d, 'ZS_DATE'), end: txt(d, 'ZE_DATE'), mcDesc: txt(mc, 'ZMC_DESC'), mcDate: txt(mc, 'ZMC_DATE'),
      mcAmt: txt(mc, 'ZCURR') === 'USD' ? txt(mc, 'ZAMT') : null,
      util: null, d1bp: bp(1), d2bp: bp(2), shipStart: txt(mc, 'ZSHIP_START'), shipEnd: txt(mc, 'ZSHIP_END'),
      dealType: txt(d, 'ZDEAL_TYPE'), subType: txt(d, 'ZSUB_TYPE'),
    }
    const fields: Record<string, string> = { dealCurrId: 'ZDEAL_CURR_ID', dealCurrDesc: 'ZDEAL_CURR_DESC', mcCurrId: 'ZMC_CURR_ID', mcCurrDesc: 'ZMC_CURR_DESC', trader: 'ZTRD_CODE', dealRef: 'ZDEAL_REF', confirm: 'ZCONFIRM', dm: 'ZDM', pl: 'ZPL', plCurr: 'ZPL_CURR', plRate: 'ZPL_RATE', plLocal: 'ZPL_LAMT', plLocalCurr: 'ZPL_LCURR', createdBy: 'ZCREATED_BY', createdDate: 'ZCREATED_DATE', changedBy: 'ZCHANGED_BY', changedDate: 'ZCHANGED_DATE' }
    for (const [key, col] of Object.entries(fields)) r[key] = txt(d, col)
    r.mcCurrency = txt(mc, 'ZCURR'); r.mcOriginalAmount = txt(mc, 'ZAMT')
    return [r]
  })
}
export async function loadReport(signal?: AbortSignal) {
  const resources = ['tsfDealId', 'masterContract', 'comp', 'tsfDealStatus', 'fxModel'] as const
  const [deals, mcs, companies, statuses, models] = await Promise.all(resources.map(resource => fxList(resource, {}, { signal })))
  let fx: FxRow[] = []
  const notices = ['USD utilization and option business partners are unavailable from the connected sources. Non-USD contract amounts are shown in their original currency in Master Contract details.']
  try { fx = await fxList('tsfvFx', {}, { signal }) } catch (e) { if (isAbort(e) || signal?.aborted) throw e; notices.push('FX business partners could not be read.') }
  const sources = { deals: deals!, mcs: mcs!, companies: companies!, statuses: statuses!, models: models!, fx }
  const rows = joinRows(sources)
  const omitted = sources.deals.length - rows.length
  if (omitted) notices.push(omitted + ' Deal IDs have no matching Master Contract and were excluded.')
  return { rows, notices }
}

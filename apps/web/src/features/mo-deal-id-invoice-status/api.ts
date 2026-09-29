/**
 * MO: Check Invoice Status of Deal IDs (ZSGTSFR014 / ZSGTSF_RDEAL_ID_INV_STAT) against the
 * SLC middleware.
 *
 * Mirrors the report: every ZSGTSFTR_DEALID row, joined to ZSGTSFTR_MAS_CON (origin, model),
 * the origin's ZSGTSFTR_COMP row (region) and ZSGTSFTR_DEAL_ST (status text). The key-date,
 * origin, region and model filters stay in logic.ts.
 *
 * Read-only, like the report. What stays empty, and why:
 *  - D1 utilization (ZSGTSFV_FX / _OP): the FX view has no deals in MySQL yet, so 0;
 *  - invoice status and T1 amount: the report reads ZSGTSFTR_BIL_ADJ but its assignment
 *    block is commented out, so it shows nothing there either.
 */
import { replaceInPlace, txt, type MasterSource } from '../../shared/fx/masters.ts'
import { loadTransactions, type DealRow as DealIdRow } from '../../shared/fx/master-contract.ts'
import { FORWARD_SUB_TYPE, dealJoin, dealStatusText, listDealIds, loadDealContext, REGION_TEXT, type DealContext } from '../../shared/fx/deal-id.ts'
import { buildSampleData, MODELS, ORIGIN_OPTIONS, REGION_OPTIONS, STATUS_MAP } from './data.ts'
import type { DealRow } from './types.ts'

export type Loaded = { rows: DealRow[]; source: MasterSource }

/** YYYY-MM-DD, the shape the seed rows and filterRows compare; '' for a missing date. */
const iso = (value: string | null | undefined): string => (value ? String(value).slice(0, 10) : '')

export async function loadScreen(signal?: AbortSignal): Promise<Loaded> {
  let ctx: DealContext | undefined
  const { rows, source } = await loadTransactions(
    async () => {
      const [context, deals] = await Promise.all([loadDealContext(signal), listDealIds({}, signal)])
      ctx = context
      return deals.map((d) => toRow(d, context))
    },
    buildSampleData,
    'Deal ID invoice status',
  )
  if (ctx) applyMasters(ctx)
  return { rows, source }
}

function applyMasters(ctx: DealContext): void {
  const comp = [...ctx.comp.values()]
  if (comp.length) {
    replaceInPlace(ORIGIN_OPTIONS, comp.map((r) => ({ id: txt(r, 'ZCOM_ID'), desc: txt(r, 'ZBUTXT') })))
    const used = new Set(comp.map((r) => txt(r, 'ZREG_ID')).filter(Boolean))
    replaceInPlace(
      REGION_OPTIONS,
      Object.entries(REGION_TEXT)
        .filter(([id]) => used.has(id))
        .map(([id, desc]) => ({ id, desc })),
    )
  }
  const models = [...ctx.models.values()]
  if (models.length) replaceInPlace(MODELS, models.map((r) => ({ id: txt(r, 'ZMOD_ID'), desc: txt(r, 'ZMOD_DESC') })))
  // The amend dropdown and the row texts: the FX1 status master, as the report reads it.
  const fx1 = ctx.statuses.filter((s) => txt(s, 'ZSUB_TYPE') === FORWARD_SUB_TYPE)
  if (fx1.length) {
    for (const code of Object.keys(STATUS_MAP)) delete STATUS_MAP[code]
    for (const s of fx1) STATUS_MAP[txt(s, 'ZDEAL_STAT')] = txt(s, 'ZDEAL_SDESC')
  }
}

export function toRow(d: DealIdRow, ctx: DealContext): DealRow {
  const { mc, comp, model } = dealJoin(ctx, d)
  const status = txt(d, 'ZDEAL_STAT')
  return {
    dealId: txt(d, 'ZDEAL_ID'),
    dealDesc: txt(d, 'ZDEAL_DESC'),
    mcRef: txt(d, 'ZMC_REF'),
    startDate: iso(d['ZS_DATE']),
    endDate: iso(d['ZE_DATE']),
    rfha1: txt(d, 'ZRFHA1'),
    rfha2: txt(d, 'ZRFHA2'),
    rfha3: txt(d, 'ZRFHA3'),
    rfha4: txt(d, 'ZRFHA4'),
    rfha5: txt(d, 'ZRFHA5'),
    dealStatus: status,
    dealStatusDesc: dealStatusText(ctx, txt(d, 'ZSUB_TYPE'), status) || status,
    origin: mc ? txt(mc, 'ZORIGIN') : '',
    modelId: txt(d, 'ZTSF_MODEL') || (mc ? txt(mc, 'ZMOD_ID') : ''),
    region: comp ? txt(comp, 'ZREG_ID') : '',
    modelDesc: (mc ? txt(mc, 'ZMOD_DESC') : '') || (model ? txt(model, 'ZMOD_DESC') : ''),
    // ZSGTSFV_FX / _OP are not in MySQL: nothing to sum.
    utiAmt: 0,
    invStatus: '',
    t1Amt: null,
    bukrs1: txt(d, 'ZBUKRS1'),
    bukrs2: txt(d, 'ZBUKRS2'),
  }
}

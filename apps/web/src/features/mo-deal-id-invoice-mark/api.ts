/**
 * MO: Deal ID Invoice Marking (ZSGTSFR015 / ZSGTSF_RDEAL_ID_INV_MARK) against the SLC
 * middleware.
 *
 * Mirrors the report:
 *  - eligible Deal IDs are ZSGTSFTR_DEALID at ZDEAL_STAT 02 (MO confirmed), joined to
 *    ZSGTSFTR_MAS_CON (commodity, origin, model, shipment window) and the origin's
 *    ZSGTSFTR_COMP row (region);
 *  - models configured as no-invoice (ZSGTSFTR_RULE_BT-ZNO_INV = 'X') are left out;
 *  - Mark for Invoicing sets ZDEAL_STAT = 03 "Deal ID marked for Invoicing", one update per
 *    deal, with the changed-by stamp.
 *
 * The View Deal popup's FX legs, planned invoices and P&L still use the screen's own values:
 * they come from ZSGTSFCDS_FX / _OPTION, which are not in MySQL yet.
 */
import { txt, type MasterSource } from '../../shared/fx/masters.ts'
import { loadTransactions, type DealRow as DealIdRow } from '../../shared/fx/master-contract.ts'
import { dealJoin, dealStatusText, listDealIds, loadDealContext, setDealStatus, type DealContext } from '../../shared/fx/deal-id.ts'
import { dmyFromIso, num } from '../../shared/fx/sap.ts'
import { buildInitialData } from './data.ts'
import { enrichRow } from './logic.ts'
import type { DealRow } from './types.ts'

/** The report's selection: WHERE zdeal_stat = '02'. */
export const ELIGIBLE_STATUS = '02'
/** What Mark for Invoicing writes. */
export const MARKED_STATUS = '03'

export type Loaded = {
  rows: DealRow[]
  /** The DEALID rows behind the screen rows, by Deal ID — their key is needed to write. */
  keys: ReadonlyMap<string, DealIdRow>
  source: MasterSource
}

export async function loadScreen(signal?: AbortSignal): Promise<Loaded> {
  const keys = new Map<string, DealIdRow>()
  const { rows, source } = await loadTransactions(
    async () => {
      const [ctx, deals] = await Promise.all([loadDealContext(signal), listDealIds({ ZDEAL_STAT: ELIGIBLE_STATUS }, signal)])
      const eligible = deals.filter((d) => !isNoInvoiceModel(d, ctx))
      for (const d of eligible) keys.set(txt(d, 'ZDEAL_ID'), d)
      return eligible.map((d) => toRow(d, ctx))
    },
    () => buildInitialData().map(enrichRow),
    'Deal IDs for invoice marking',
  )
  return { rows, keys, source }
}

function isNoInvoiceModel(d: DealIdRow, ctx: DealContext): boolean {
  const { model } = dealJoin(ctx, d)
  return !!model && txt(model, 'ZNO_INV') === 'X'
}

export function toRow(d: DealIdRow, ctx: DealContext): DealRow {
  const { mc, comp, model } = dealJoin(ctx, d)
  const status = txt(d, 'ZDEAL_STAT')
  const modelId = txt(d, 'ZTSF_MODEL') || (mc ? txt(mc, 'ZMOD_ID') : '')
  const row = enrichRow({
    dealId: txt(d, 'ZDEAL_ID'),
    dealDesc: txt(d, 'ZDEAL_DESC'),
    mcRef: txt(d, 'ZMC_REF'),
    commodity: mc ? txt(mc, 'ZCOM_DESC') || txt(mc, 'ZCOMMODITY') : '',
    dealStart: dmyFromIso(d['ZS_DATE']),
    dealEnd: dmyFromIso(d['ZE_DATE']),
    origin: mc ? txt(mc, 'ZORIGIN') : '',
    model: modelId,
    region: comp ? txt(comp, 'ZREG_ID') : '',
    // The deal's own amount; a deal booked without one falls back to its MC's.
    amount: num(d['ZDEAL_AMT']) || (mc ? num(mc['ZAMT']) : 0),
    shipStart: mc ? dmyFromIso(mc['ZSHIP_START']) : '',
    shipEnd: mc ? dmyFromIso(mc['ZSHIP_END']) : '',
  })
  return {
    ...row,
    status,
    statusDesc: dealStatusText(ctx, txt(d, 'ZSUB_TYPE'), status) || row.statusDesc,
    modelDesc: (mc ? txt(mc, 'ZMOD_DESC') : '') || (model ? txt(model, 'ZMOD_DESC') : '') || row.modelDesc,
  }
}

/** Mark for Invoicing: each eligible Deal ID to 03. Throws on the first failure, naming what moved. */
export async function markForInvoicing(deals: readonly DealIdRow[]): Promise<void> {
  await setDealStatus(deals, MARKED_STATUS)
}

/**
 * MO: View List of Deal IDs for Invoicing (ZSGTSFR008 / ZSGTSF_RDEAL_INV_LIST) against the
 * SLC middleware.
 *
 * Mirrors the report, which is read-only:
 *  - the Deal IDs in the invoicing workflow (ZSGTSFTR_DEALID at 03 - 08), joined to
 *    ZSGTSFTR_MAS_CON (description, dates, shipment window, amount, commodity, model), the
 *    MC's origin in ZSGTSFTR_COMP (region), ZSGTSFTR_DEAL_ST (status text) and
 *    ZSGTSFTR_RULE_BT (model, entity and currency string);
 *  - invoice legs: the planned T1/T2/T3 of ZSGTSFTR_INV_REF, with the invoice actually raised
 *    (number, dates, quantity, price, banks) from ZSGTSFTR_BIL_ADJ where there is one;
 *  - the Bills of Lading assigned to the deal (ZSGTSFTR_BL, ZDEAL_ID) and their status text.
 *
 * Still empty: the FX legs (ZSGTSFCDS_FX_N / _OPTION_N are not in MySQL). The invoice-
 * generation popup (ZSGTSF_RBILL_ADJUST) keeps working on the screen only — that program needs
 * tables not yet migrated (SET_TYP, IF_INV, BL_DASS, ...), so none of its actions are saved.
 */
import { txt, type MasterSource } from '../../shared/fx/masters.ts'
import { loadTransactions, type DealRow as DealIdRow } from '../../shared/fx/master-contract.ts'
import { dealJoin, dealStatusText, FORWARD_SUB_TYPE, listDealIds, loadDealContext, REGION_TEXT, type DealContext } from '../../shared/fx/deal-id.ts'
import { fxList, type FxRow } from '../../shared/fx/mw.ts'
import { dmyFromIso, num } from '../../shared/fx/sap.ts'
import { buildDeals, ENTITIES, FX_MODELS, REGIONS, STATUS_META, TRADERS } from './data.ts'
import type { BillOfLading, Deal, InvoiceLeg } from './types.ts'

/** The invoicing workflow's statuses: marked (03) through GT invoice no. updated (08). */
export const INVOICING_STATUSES = ['03', '04', '05', '06', '07', '08'] as const
const STATUS_CLASS: Readonly<Record<string, string>> = { '04': 'st-booked', '05': 'st-confirmed', '07': 'st-partial' }

export type Loaded = { deals: Deal[]; source: MasterSource }

export async function loadScreen(signal?: AbortSignal): Promise<Loaded> {
  const { rows, source } = await loadTransactions(
    async () => {
      const [ctx, deals, traders] = await Promise.all([
        loadDealContext(signal),
        listDealIds({ 'ZDEAL_STAT[in]': INVOICING_STATUSES.join(',') }, signal),
        fxList('trmTrader', {}, { signal }).catch(() => [] as FxRow[]),
      ])
      applyMasters(ctx, traders)
      const ids = deals.map((d) => txt(d, 'ZDEAL_ID'))
      const [plans, invoices, bls, blStatuses] = await Promise.all([
        inChunks('invRef', 'ZDEAL_ID', ids, signal),
        inChunks('billAdjustment', 'ZDEAL_ID', ids, signal),
        inChunks('billOfLading', 'ZDEAL_ID', ids, signal),
        fxList('blStatus', {}, { signal }).catch(() => [] as FxRow[]),
      ])
      return deals.map((d) => toDeal(d, ctx, { plans, invoices, bls, blStatuses }))
    },
    buildDeals,
    'Deal IDs for invoicing',
  )
  return { deals: rows, source }
}

/** `col[in]` reads, 50 values at a time to keep the URLs short. */
async function inChunks(resource: string, column: string, values: readonly string[], signal?: AbortSignal): Promise<FxRow[]> {
  const out: FxRow[] = []
  for (let i = 0; i < values.length; i += 50) {
    const chunk = values.slice(i, i + 50)
    if (chunk.length) out.push(...(await fxList(resource, { [`${column}[in]`]: chunk.join(',') }, { signal })))
  }
  return out
}

/**
 * The screen's lookups are records the table and popups index with `!`, so every code a
 * MySQL row can carry has to be in them: all of COMP, all of RULE_BT, the traders and the
 * FX1 statuses. The seed entries stay alongside, for the dummy fallback.
 */
function applyMasters(ctx: DealContext, traders: readonly FxRow[]): void {
  // A master MySQL answers replaces the seed entries, so the filters offer only real codes.
  if (ctx.comp.size) {
    clear(ENTITIES)
    clear(REGIONS)
  }
  if (ctx.models.size) clear(FX_MODELS)
  if (traders.length) clear(TRADERS)
  if (ctx.statuses.some((s) => txt(s, 'ZSUB_TYPE') === FORWARD_SUB_TYPE)) clear(STATUS_META)
  for (const r of ctx.comp.values()) {
    const code = txt(r, 'ZCOM_ID')
    ENTITIES[code] = { code, cocode: txt(r, 'ZBUKRS'), name: txt(r, 'ZBUTXT') }
    const region = txt(r, 'ZREG_ID')
    if (region) REGIONS[region] = REGION_TEXT[region] ?? region
  }
  for (const r of ctx.models.values()) {
    const code = txt(r, 'ZMOD_ID')
    FX_MODELS[code] = {
      code,
      desc: txt(r, 'ZMOD_DESC'),
      entities: txt(r, 'ZENT_DESC').split('-').filter(Boolean),
      curr: txt(r, 'ZCURR_DESC').split('-').filter(Boolean),
      region: txt(r, 'ZREG_ID'),
    }
  }
  for (const r of traders) {
    const code = txt(r, 'ZTCODE')
    if (code) TRADERS[code] = txt(r, 'ZTRADER') || txt(r, 'ZNAME')
  }
  for (const s of ctx.statuses) {
    if (txt(s, 'ZSUB_TYPE') !== FORWARD_SUB_TYPE) continue
    const code = txt(s, 'ZDEAL_STAT')
    STATUS_META[code] = { label: txt(s, 'ZDEAL_SDESC'), cls: STATUS_CLASS[code] ?? 'st-booked' }
  }
}

function clear(record: Record<string, unknown>): void {
  for (const key of Object.keys(record)) delete record[key]
}

/** The Status filter: the workflow statuses DEAL_ST names, or the seed's three for dummy data. */
export function statusOptions(source: MasterSource | 'loading'): Array<[string, string]> {
  if (source !== 'mysql') {
    return [
      ['04', 'Booked, Pending Invoice'],
      ['07', 'Partial Invoice Created'],
      ['05', 'Confirmed, Fully Invoiced'],
    ]
  }
  return INVOICING_STATUSES.filter((c) => STATUS_META[c]).map((c) => [c, STATUS_META[c]!.label])
}

type Related = { plans: readonly FxRow[]; invoices: readonly FxRow[]; bls: readonly FxRow[]; blStatuses: readonly FxRow[] }

export function toDeal(d: DealIdRow, ctx: DealContext, rel: Related): Deal {
  const { mc, comp } = dealJoin(ctx, d)
  const dealId = txt(d, 'ZDEAL_ID')
  const status = txt(d, 'ZDEAL_STAT')
  const modelId = txt(d, 'ZTSF_MODEL') || (mc ? txt(mc, 'ZMOD_ID') : '')
  ensureModel(modelId, mc)
  if (!STATUS_META[status]) STATUS_META[status] = { label: dealStatusText(ctx, txt(d, 'ZSUB_TYPE'), status) || status, cls: STATUS_CLASS[status] ?? 'st-booked' }
  const origin = mc ? txt(mc, 'ZORIGIN') : ''
  if (origin && !ENTITIES[origin]) ENTITIES[origin] = { code: origin, cocode: '', name: origin }
  const commodity = mc ? txt(mc, 'ZCOM_DESC') || txt(mc, 'ZCOMMODITY') : ''
  return {
    dealId,
    dealDesc: txt(d, 'ZDEAL_DESC'),
    mcRef: txt(d, 'ZMC_REF'),
    mcDesc: mc ? txt(mc, 'ZMC_DESC') : '',
    mcDate: mc ? dmyFromIso(mc['ZMC_DATE']) : '',
    shipStart: mc ? dmyFromIso(mc['ZSHIP_START']) : '',
    shipEnd: mc ? dmyFromIso(mc['ZSHIP_END']) : '',
    model: modelId,
    commodity: mc && txt(mc, 'ZCOMMODITY') ? `${commodity} (${txt(mc, 'ZCOMMODITY')})` : commodity,
    trader: txt(d, 'ZTRD_CODE'),
    dealStart: dmyFromIso(d['ZS_DATE']),
    dealEnd: dmyFromIso(d['ZE_DATE']),
    dealStat: status,
    origin,
    region: comp ? txt(comp, 'ZREG_ID') : '',
    mcAmtUsd: mc ? num(mc['ZAMT']) : num(d['ZDEAL_AMT']),
    // ZSGTSFCDS_FX_N / _OPTION_N are not in MySQL.
    fx: [],
    inv: invoiceLegs(dealId, rel),
    bls: rel.bls.filter((b) => txt(b, 'ZDEAL_ID') === dealId).map((b) => toBl(b, rel.blStatuses)),
  }
}

/** A deal whose model RULE_BT lacks still needs an FX_MODELS entry; its MC describes it. */
function ensureModel(modelId: string, mc: FxRow | undefined): void {
  if (!modelId || FX_MODELS[modelId]) return
  FX_MODELS[modelId] = {
    code: modelId,
    desc: mc ? txt(mc, 'ZMOD_DESC') : modelId,
    entities: mc ? txt(mc, 'ZENT_DESC').split('-').filter(Boolean) : [],
    curr: mc ? txt(mc, 'ZCURR_DESC').split('-').filter(Boolean) : [],
    region: '',
  }
}

const TTYPES = new Set(['T1', 'T2', 'T3'])

/** The planned legs (INV_REF), each overlaid with the invoice raised against it (BIL_ADJ). */
function invoiceLegs(dealId: string, rel: Related): InvoiceLeg[] {
  const raised = rel.invoices.filter((r) => txt(r, 'ZDEAL_ID') === dealId)
  return rel.plans
    .filter((p) => txt(p, 'ZDEAL_ID') === dealId && TTYPES.has(txt(p, 'ZTTYPE')))
    .map((p) => {
      const ttype = txt(p, 'ZTTYPE') as InvoiceLeg['ttype']
      const inv = raised.find((r) => txt(r, 'ZINV_TYPE') === ttype)
      const invNo = inv ? txt(inv, 'ZINV_NO') : ''
      return {
        ttype,
        ref: txt(p, 'ZINV_TRM_NO'),
        seller: txt(p, 'ZTRD_SELL'),
        buyer: txt(p, 'ZTRD_BUY'),
        qty: inv ? num(inv['ZQTY']) : 0,
        usdPrice: inv ? num(inv['ZUSD_PRICE']) : 0,
        dueDate: inv ? dmyFromIso(inv['ZDUE_DATE']) : '',
        invDate: inv ? dmyFromIso(inv['ZINV_DATE']) : '',
        invNo,
        marked: !!inv,
        invoiced: !!invNo,
        hb: inv ? txt(inv, 'ZHBKID') : '',
        acct: inv ? txt(inv, 'ZHKTID') : '',
        ptnr: inv ? txt(inv, 'ZPTNR_BKID') : '',
      }
    })
}

function toBl(b: FxRow, statuses: readonly FxRow[]): BillOfLading {
  const statusId = txt(b, 'ZBL_STAT_ID')
  const status = statuses.find((s) => txt(s, 'ZBL_ST_ID') === statusId)
  return {
    blNo: txt(b, 'ZBL_NO'),
    vessel: txt(b, 'ZBL_VSSL_NAME'),
    loadPort: txt(b, 'ZPOL'),
    dischargePort: txt(b, 'ZPOD'),
    shipDate: dmyFromIso(b['ZBL_DATE']),
    qty: num(b['ZQUANTITY']),
    status: status ? txt(status, 'ZBL_ST_NAME') || txt(status, 'ZBL_ST_DESC') : statusId,
  }
}

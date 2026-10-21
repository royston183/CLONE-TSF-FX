/** Screen 9004: DIFF.STATUS_9004 -> PROCESS_DATA (not screen 9006's PROCESS_DATA_NEW).
 * Headsup is a read-only invoice/deal comparison. EMLBD and READ_TEXT belong to other flows.
 */
import { fxList, type FxRow } from '../../shared/fx/mw.ts'
import { txt } from '../../shared/fx/masters.ts'
import { formatAmount } from './format.ts'
import type { Deal, FxDeal, Headsup } from './types.ts'

export type HeadsupInput = {
  model: string
  fxDeals: readonly FxDeal[]
  rules: readonly FxRow[]
  invRef: readonly FxRow[]
  billAdj: readonly FxRow[]
  setTyp: readonly FxRow[]
}
export type HeadsupView = { rows: Headsup[]; notice: string }
const SPOTS = new Set(['DS1', 'DS2', 'DSS1', 'DSS2'])
const numberOf = (value: unknown): number => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}
const round = (value: number) => Math.round(value * 100) / 100

/** PROCESS_DATA: link by INV_REF row position; absolute final/deal difference; first DSS-linked SET_TYP per trade. */
export function computeHeadsup(input: HeadsupInput): HeadsupView {
  const baseLegs = input.fxDeals.filter((r) => !SPOTS.has(r.dealType))
  const rule = baseLegs.length <= 2 ? input.rules[0] : input.rules.find((r) => numberOf(r['ZD1_PUT_CALL']) === 1)
  if (!rule) throw new Error(`The Headsup invoice-link rules for model ${input.model} could not be found.`)
  if (txt(rule, 'ZSUB_TYPE') === 'FX2') {
    return { rows: [], notice: 'Heads Up for option models requires option transaction amounts and expiry dates. ZSGTSFCDS_OPTION is not exposed by an API yet.' }
  }
  if (txt(rule, 'ZSUB_TYPE') !== 'FX1') throw new Error(`Model ${input.model} has no supported Headsup subtype in RULE_BT.`)
  const templates = input.setTyp.filter((r) => txt(r, 'ZDSS_DEAL') !== '')
  const rows: Headsup[] = []
  for (const [index, invoice] of input.invRef.entries()) {
    const tradeType = txt(invoice, 'ZTTYPE')
    const currency = txt(invoice, 'ZTRD_CURR')
    const template = templates.find((r) => txt(r, 'ZT_TYPE').slice(0, 2) === tradeType)
    if (!template) continue // DELETE GT_DIFF WHERE ZENTITY IS INITIAL.
    const count = String(index + 1)
    const linked = (slot: '1' | '2') => ['ZD' + slot + '_INV_LINK', 'ZD' + slot + '_INV_LINK2'].some((k) => txt(rule, k).slice(1, 2) === count)
    const type = linked('1') ? 'D1' : linked('2') ? (input.model === 'M025' ? 'D3' : 'D2') : ''
    const leg = type ? input.fxDeals.find((r) => r.dealType === type) : undefined
    // The source compares against the opposite amount when currency 1 is not the invoice currency.
    const dealAmount = leg ? Math.abs(currency === leg.curr1 ? leg.amt1 : leg.amt2) : 0
    const total = input.billAdj
      .filter((r) => txt(r, 'ZINV_REF').slice(11, 13) === tradeType)
      .reduce((sum, r) => sum + numberOf(r[currency === 'USD' ? 'ZAMT_USD' : 'ZAMT']), 0)
    // The ABAP takes ABS after the signed sum and computes the difference before taking ABS(final).
    const difference = round(Math.abs(total - dealAmount))
    const finalAmount = round(Math.abs(total))
    const seller = txt(template, 'ZSELL'), buyer = txt(template, 'ZBUY')
    let action = ''
    if (txt(template, 'ZHEAD_FX') === 'X') {
      const amount = [seller, buyer].some((e) => e === 'OIL' || e === 'OGA')
        ? difference
        : [seller, buyer].includes('DMCC') ? finalAmount : null
      if (amount !== null) action = [txt(template, 'ZACTFX'), currency, formatAmount(amount)].filter(Boolean).join(' ')
    }
    rows.push({ entity: `${seller}-${buyer}`, tradeType, currency, dealAmount, finalAmount, difference, action })
  }
  return { rows, notice: '' }
}

type ReadRows = (resource: string, filter: Record<string, string>, options?: { signal?: AbortSignal | undefined }) => Promise<FxRow[]>

/** Four SELECTs from PROCESS_DATA. A failed read is an error, not an empty Headsup list. */
export async function loadHeadsup(deal: Deal, fxDeals: readonly FxDeal[], signal?: AbortSignal, read: ReadRows = fxList): Promise<HeadsupView> {
  if (!deal.fxModelId) throw new Error('This Deal ID has no master-contract model for Heads Up.')
  const options = { signal }
  const [rules, invRef, billAdj, setTyp] = await Promise.all([
    read('fxModel', { ZMOD_ID: deal.fxModelId.slice(0, 4) }, options),
    read('invRef', { ZDEAL_ID: deal.dealId }, options),
    read('billAdjustment', { ZDEAL_ID: deal.dealId }, options),
    read('setTyp', { ZMOD_ID: deal.fxModelId }, options),
  ])
  return computeHeadsup({ model: deal.fxModelId, fxDeals, rules, invRef, billAdj, setTyp })
}

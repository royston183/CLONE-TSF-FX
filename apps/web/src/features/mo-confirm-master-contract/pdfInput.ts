import type { McPdfInput } from '../../shared/pdf/mcPdf.ts'
import { MC_TOLERANCE, PAYMENT_TERMS, entityOf } from './data.ts'
import { fmtDate } from './format.ts'
import { buildChildLegs } from './logic.ts'
import type { MasterContract } from './types.ts'

const date = (value: Date | null) => (value && Number.isFinite(value.getTime()) ? fmtDate(value) : '')
const both = (code: string, text: string) => [code, text].filter(Boolean).join(' - ')

/** A Master Contract of this screen as the plain record the confirmation PDF is drawn from. */
export function pdfInput(mc: MasterContract): McPdfInput {
  const term = PAYMENT_TERMS.find((p) => p.code === mc.paymentTerms)
  return {
    mcNumber: String(mc.mcNumber),
    reference: mc.mcDescription,
    status: mc.status,
    mcDate: date(mc.mcDate),
    originEntity: both(mc.originEntity, entityOf(mc.originEntity)?.name ?? ''),
    entityString: mc.entities.join(' → '),
    amountUsd: mc.amtUSD,
    amountOrigin: mc.amtOrigin,
    originCurrency: mc.currOrigin,
    exchangeRate: mc.exRate,
    tolerance: MC_TOLERANCE.value === null ? '' : MC_TOLERANCE.value.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 }),
    commodity: both(mc.commodityCode, mc.commodityDesc),
    commodityDescription: mc.commodityDesc,
    shipStart: date(mc.shipStart),
    shipEnd: date(mc.shipEnd),
    paymentTerms: both(mc.paymentTerms, term?.desc ?? ''),
    paymentDate: date(mc.paymentDate),
    portOfShipment: mc.portOfShipment,
    portOfDestination: mc.portOfDestination,
    fxModel: mc.fxModel,
    modelDescription: mc.modelDesc,
    currencyString: mc.currChain.join(' / '),
    foRemarks: mc.foRemarks,
    moRemarks: mc.moRemarks,
    children: buildChildLegs(mc).map((leg) => ({
      type: leg.t, seller: leg.seller, buyer: leg.buyer, side: leg.ps, description: leg.desc,
      amountUsd: leg.amt, plannedAmount: leg.planned, currency: leg.curr,
    })),
  }
}

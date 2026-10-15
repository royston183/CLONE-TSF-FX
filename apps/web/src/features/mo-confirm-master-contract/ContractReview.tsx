import { ReviewDetails } from '../../shared/master-contract/ReviewDetails.tsx'
import { MC_TOLERANCE, PAYMENT_TERMS, entityOf } from './data.ts'
import { fmtDate, fmtNum } from './format.ts'
import type { MasterContract } from './types.ts'

const date = (value: Date) => Number.isFinite(value.getTime()) ? fmtDate(value) : '—'
const both = (code: string, text: string) => [code, text].filter(Boolean).join(' - ')

/** Tolerance % keeps six decimals, as Create Master Contract shows it. */
const tolerance = (value: number | null) => value === null ? '' : value.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 })

/**
 * One contract as the same expandable record FX Deal Confirmation's Confirm Deal popup uses (ReviewDetails): a label / value
 * row per field, in the order and wording of Create Master Contract, with the FO / MO remarks last. Several contracts each get
 * their own record, and only the first starts open.
 */
export function ContractReview({ contract: mc, open }: { contract: MasterContract; open: boolean }) {
  const term = PAYMENT_TERMS.find((p) => p.code === mc.paymentTerms)
  return <ReviewDetails title={`MC ${mc.mcNumber} · ${mc.mcDescription}`} open={open} rows={[
    ['MC Number', mc.mcNumber],
    ['Current Status', mc.status],
    ['Origin Entity', both(mc.originEntity, entityOf(mc.originEntity)?.name ?? '')],
    ['MC Date', date(mc.mcDate)],
    ['MC Reference No', mc.mcDescription],
    ['MC Amount (USD)', `${fmtNum(mc.amtUSD)} USD`],
    ['Exchange Rate', mc.exRate.toFixed(4)],
    ['MC Amount (Origin)', `${fmtNum(mc.amtOrigin)} ${mc.currOrigin}`],
    ['Tolerance %', tolerance(MC_TOLERANCE.value)],
    ['Commodity', both(mc.commodityCode, mc.commodityDesc)],
    ['Comm. Description Long', mc.commodityDesc],
    ['Shipment Start', date(mc.shipStart)],
    ['Shipment End', date(mc.shipEnd)],
    ['Payment Terms', both(mc.paymentTerms, term?.desc ?? '')],
    ['Payment Date', date(mc.paymentDate)],
    ['Port of Shipment', mc.portOfShipment],
    ['Port of Destination', mc.portOfDestination],
    ['FX Model', both(mc.fxModel, mc.modelDesc)],
    ['Entity String', mc.entities.join(' → ')],
    ['Currency String', mc.currChain.join(' / ')],
    ['FO Remarks', mc.foRemarks],
    ['MO Remarks', mc.moRemarks],
  ]} />
}

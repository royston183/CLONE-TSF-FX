/**
 * The payment amount of a trade invoice leg: INVOICE_SETTLEMENT_DATA of ZSGTSF_RDEAL_TRD_INV (MO) and of
 * ZSGTSF_RDEAL_TRD_POST (BO), where both read
 *
 *   currency of the invoice <> settlement currency   ZPAY_AMT = invoice amount / OTOT_RATE of the FX deal the leg maps to
 *                                                    (ZSGTSFTR_SET_TYP ZD_MAP = that deal's type), and EX_RATE = that rate
 *   same currency                                    ZPAY_AMT = invoice amount
 *   then, where the leg has a premium adjustment     ZPAY_AMT = ZPAY_AMT - | premium of the deal of type ZPREM_ADJ |
 *
 * OTOT_RATE is the all-in rate of the mapped FX deal (this app's `rate`: FxTransaction ForwardRate). The ABAP leaves the
 * amount at zero when the mapped deal is missing, and ignores a zero rate; this returns the reason instead, so a zero is
 * never stored or posted as if it were an amount.
 */
export type PayDeal = { dealType: string; rate: number; preAmt?: number; preCurr?: string }

export type PayInput = {
  invAmt: number
  /** Invoice currency (ZCURR) and settlement currency (ZSET_CURR). A blank settlement currency means no conversion. */
  curr: string
  setCurr: string
  /** ZD_MAP: the deal type the leg converts at. */
  dMap: string
  /** ZPREM_ADJ: the deal type whose premium is deducted; blank for none. */
  premAdj?: string
}

export type PayResult = {
  /** The payment amount, rounded to two decimals; 0 together with a `reason` when it cannot be worked out. */
  amount: number
  /** OTOT_RATE used (EX_RATE); 0 when no conversion applied. */
  rate: number
  premium: number
  premiumCurr: string
  /** Why the amount could not be worked out; empty when it could. */
  reason: string
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100

export function paymentAmount(input: PayInput, deals: readonly PayDeal[]): PayResult {
  const { invAmt, curr, setCurr, dMap } = input
  let amount = invAmt
  let rate = 0
  if (setCurr && curr !== setCurr) {
    const deal = dMap ? deals.find((d) => d.dealType === dMap) : undefined
    if (!deal) {
      const why = dMap
        ? `the mapped FX deal ${dMap} does not exist yet (for a settlement spot: create it first)`
        : 'the leg has no mapped FX deal (ZD_MAP)'
      return { amount: 0, rate: 0, premium: 0, premiumCurr: '', reason: `Payment amount in ${setCurr} cannot be worked out: ${why}.` }
    }
    if (!(deal.rate > 0)) {
      return { amount: 0, rate: 0, premium: 0, premiumCurr: '', reason: `Payment amount in ${setCurr} cannot be worked out: FX deal ${dMap} has no all-in rate.` }
    }
    rate = deal.rate
    amount = invAmt / rate
  }
  let premium = 0
  let premiumCurr = ''
  const adj = input.premAdj ? deals.find((d) => d.dealType === input.premAdj) : undefined
  if (adj) {
    premium = Math.abs(adj.preAmt ?? 0)
    premiumCurr = adj.preCurr ?? ''
    amount -= premium
  }
  return { amount: round2(amount), rate, premium, premiumCurr, reason: '' }
}

/**
 * Update of BO's posting pop-up (ZSGTSF_RDEAL_TRD_POST: UPD_DATA -> SAVE_BANK_DATA -> SAVE_POSTING_DATA), and what the pop-up does when it
 * opens, for one trade invoice leg: work out the payment amount and the debit / credit lines, and store them in ZSGTSFTR_TRD_POS so
 * the posting (and Post All, which reads only stored values) has them.
 *
 * Nothing is stored unless the whole leg resolves: a payment amount that cannot be worked out (the mapped FX deal or its rate does not
 * exist yet), or a line whose account cannot be found, is returned as the reason and the row is left as it was, never half-filled
 * and never with a zero amount standing in. The banks are not changed here: they are the MO screen's (Update / Settlement Complete).
 */
import { messageOf } from '../../shared/fx/master-contract.ts'
import { paymentAmount, type PayDeal } from '../../shared/fx/payment-amount.ts'
import { determinePosting, livePorts, positionFields, type Determined, type DeterminationPorts } from './determination.ts'
import { defaultInvDeps, type InvPostDeps, type PositionRow, type PostingType } from './posting.ts'
import type { FxLeg } from './types.ts'

export type PrepareOutcome = { ok: true; message: string; fields: Record<string, string | number> } | { ok: false; message: string }

export type PrepareDeps = Pick<InvPostDeps, 'readPosition' | 'readPostingType' | 'writePosition'> & { ports: DeterminationPorts }

export const defaultPrepareDeps: PrepareDeps = {
  readPosition: defaultInvDeps.readPosition,
  readPostingType: defaultInvDeps.readPostingType,
  writePosition: defaultInvDeps.writePosition,
  ports: livePorts,
}

const text = (r: PositionRow, k: string): string => String(r[k] ?? '').trim()
const num = (r: PositionRow, k: string): number => {
  const n = Number(r[k])
  return Number.isFinite(n) ? n : 0
}
const fmt = (n: number): string => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** The FX deals' all-in rates, by deal type, as the legs of the Deal ID show them (a settlement spot appears once it is booked). */
export const payDealsOf = (top: readonly FxLeg[]): PayDeal[] => top.map((f) => ({ dealType: f.dealType, rate: f.rate }))

export async function prepareInvoiceLeg(dealId: string, seq: string, top: readonly FxLeg[], deps: PrepareDeps = defaultPrepareDeps): Promise<PrepareOutcome> {
  let row: PositionRow | null
  try {
    row = await deps.readPosition(dealId, seq)
  } catch (error) {
    return { ok: false, message: `The settlement leg ${seq} of ${dealId} could not be read: ${messageOf(error)}` }
  }
  if (!row) return { ok: false, message: `No settlement leg ${seq} is stored for Deal ID ${dealId}.` }
  const name = text(row, 'ZT_TYPE') || seq
  if (text(row, 'ZBELNR')) return { ok: false, message: `${name} is already posted (FI document ${text(row, 'ZBELNR')}), so its posting details are not changed.` }

  const pay = paymentAmount(
    { invAmt: num(row, 'ZAMT'), curr: text(row, 'ZCURR'), setCurr: text(row, 'ZSET_CURR'), dMap: text(row, 'ZD_MAP') },
    payDealsOf(top),
  )
  if (pay.reason) return { ok: false, message: `${name}: ${pay.reason}` }

  let acc: PostingType | undefined
  let determined: Determined
  try {
    acc = await deps.readPostingType(text(row, 'ZFI_TYPE'))
    determined = await determinePosting(row, acc ?? {}, { dealId }, deps.ports)
  } catch (error) {
    return { ok: false, message: `${name}: the debit / credit accounts could not be determined (${messageOf(error)}). Nothing was changed.` }
  }
  if (determined.issues.length) return { ok: false, message: `${determined.issues.join(' ')} Nothing was changed.` }

  const fields: Record<string, string | number> = {
    ...positionFields(determined),
    ZDOC_TYPE: text(row, 'ZDOC_TYPE') || (acc ? text(acc, 'ZDOC_TYPE') : ''),
    // The posting date is the stored one, else the due date (status_9002: d_date).
    ZP_DATE: text(row, 'ZP_DATE') || text(row, 'ZDUE_DATE'),
    ZPAY_AMT: pay.amount,
  }
  try {
    await deps.writePosition(dealId, seq, fields)
  } catch (error) {
    return { ok: false, message: `${name}: the posting details could not be saved to TRD_POS (${messageOf(error)}).` }
  }
  const d = determined.debit
  const c = determined.credit
  const side = (l: typeof d) => `${l.label || `category ${l.category}`}${l.partner ? ` ${l.partner}` : ''}${l.glAccount ? ` / G/L ${l.glAccount}` : ''}`
  return {
    ok: true,
    fields,
    message: `${name}: Dr ${d.postingKey} ${side(d)}; Cr ${c.postingKey} ${side(c)}; payment ${fmt(pay.amount)} ${text(row, 'ZSET_CURR') || text(row, 'ZCURR')}.`,
  }
}

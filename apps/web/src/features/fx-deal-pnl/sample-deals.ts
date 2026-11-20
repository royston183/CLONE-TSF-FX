import type { DealDetail, Entity, Flow, Leg } from './types.ts'

/**
 * Ten sample Deal IDs for the FX Deal P&L Analysis report, on FX models the application has (fo-create-master-contract/data.ts):
 * M032 INR Long Forward, M033 INR-INR-INR Forward and M037 INR Short Forward. They are inputs only (legs, fixings and settlement
 * flows); every P&L figure shown is calculated from them by calc.ts. Remove them by emptying SAMPLE_DEALS in api.ts's DEALS.
 *
 * A long model buys USD on the Indian entity's deferred forward (D1) and sells it on OIL's NDF (D2); a short model does the
 * reverse. The planned P&L is the INR gap between the two. A settled deal has settlement flows per entity, a matured one has its
 * fixing only, an open one neither.
 */

const OIL: Entity = { code: 'OIL-USD', company: 'SG00', ccy: 'USD' }
const INDIA: Entity = { code: 'OFIIPL-INR', company: 'IN11', ccy: 'INR' }
const DMCC: Entity = { code: 'DMCC-USD', company: 'AE13', ccy: 'USD' }

const MODELS: Record<string, string> = { M032: 'INR Long Forward', M033: 'INR-INR-INR Forward', M037: 'INR Short Forward' }

type Spec = {
  id: string
  model: keyof typeof MODELS
  status: 'Open' | 'Matured' | 'Settled'
  /** USD notional of each leg. */
  usd: number
  /** INR per USD of the leg that buys USD, and of the leg that sells it. */
  buy: number
  sell: number
  /** The NDF's fixing rate; absent for an open deal. */
  fixing?: number
  trade: string
  maturity: string
  /** A third entity (DMCC) also settles. */
  dmcc?: boolean
}

const SPECS: Spec[] = [
  { id: '1100002750', model: 'M032', status: 'Settled', usd: 10_000_000, buy: 99.0, sell: 99.6, fixing: 100, trade: '2026-10-02', maturity: '2026-11-12', dmcc: true },
  { id: '1100002751', model: 'M032', status: 'Settled', usd: 5_000_000, buy: 98.9, sell: 99.35, fixing: 99.5, trade: '2026-09-14', maturity: '2026-10-29' },
  { id: '1100002752', model: 'M032', status: 'Settled', usd: 8_000_000, buy: 99.2, sell: 99.05, fixing: 99.4, trade: '2026-08-24', maturity: '2026-11-05', dmcc: true },
  { id: '1100002753', model: 'M032', status: 'Open', usd: 6_000_000, buy: 99.1, sell: 99.7, trade: '2026-11-09', maturity: '2027-01-22' },
  { id: '1100002754', model: 'M033', status: 'Settled', usd: 4_000_000, buy: 98.8, sell: 99.1, fixing: 99.3, trade: '2026-09-28', maturity: '2026-11-16', dmcc: true },
  { id: '1100002755', model: 'M033', status: 'Matured', usd: 7_000_000, buy: 99.3, sell: 99.55, fixing: 99.45, trade: '2026-08-03', maturity: '2026-11-18' },
  { id: '1100002756', model: 'M033', status: 'Open', usd: 12_000_000, buy: 99.0, sell: 98.7, trade: '2026-11-12', maturity: '2027-03-31' },
  { id: '1100002757', model: 'M037', status: 'Settled', usd: 5_000_000, buy: 99.0, sell: 99.6, fixing: 99.9, trade: '2026-09-07', maturity: '2026-11-09' },
  { id: '1100002758', model: 'M037', status: 'Open', usd: 9_000_000, buy: 99.05, sell: 99.55, trade: '2026-11-16', maturity: '2027-04-30' },
  { id: '1100002759', model: 'M037', status: 'Matured', usd: 3_000_000, buy: 99.4, sell: 99.15, fixing: 99.6, trade: '2026-09-21', maturity: '2026-11-19' },
]

function build(s: Spec): DealDetail {
  const short = s.model === 'M037'
  const inr = (rate: number) => Math.round(s.usd * rate)
  const leg = (ref: 'D1' | 'D2', label: string, type: string, entity: string, sellsUsd: boolean, rate: number): Leg => ({
    ref, label, type, entity, direction: sellsUsd ? 'Sell USD' : 'Buy USD',
    usd: sellsUsd ? -s.usd : s.usd, local: sellsUsd ? inr(rate) : -inr(rate), localCcy: 'INR', rate,
    tradeDate: s.trade, maturityDate: s.maturity,
  })
  // Long: DF buys at the buy rate, NDF sells at the sell rate. Short: DF sells at the sell rate, NDF buys at the buy rate.
  const legs = short
    ? [leg('D1', 'DF (OFIIPL India)', 'Deliverable Forward', 'OFIIPL-INR', true, s.sell), leg('D2', 'NDF (OIL)', 'Non-Deliverable Forward', 'OIL-USD', false, s.buy)]
    : [leg('D1', 'DF (OFIIPL India)', 'Deliverable Forward', 'OFIIPL-INR', false, s.buy), leg('D2', 'NDF (OIL)', 'Non-Deliverable Forward', 'OIL-USD', true, s.sell)]
  const settled = s.status === 'Settled'
  const flows: Flow[] = settled
    ? [
        { entity: 'OIL-USD', payRef: 'Settlement 20 / OIL', receiveRef: 'Receipt 20 / OIL', pay: -Math.round(s.usd * 0.99598), receive: Math.round(s.usd * 0.99751), note: 'Sample flow.' },
        { entity: 'OFIIPL-INR', payRef: 'Settlement 20 / India', receiveRef: 'Receipt 20 / India', pay: -inr(s.buy), receive: inr(s.sell) + 10_000, note: 'Sample flow.' },
        ...(s.dmcc ? [{ entity: 'DMCC-USD', payRef: 'Settlement 20 / DMCC', receiveRef: 'Receipt 20 / DMCC', pay: -Math.round(s.usd * 0.9975), receive: s.usd, note: 'Sample flow.' }] : []),
      ]
    : []
  return {
    id: s.id, model: s.model, description: `USD-INR ${MODELS[s.model]}`, type: MODELS[s.model]!, pair: 'USD/INR', localCcy: 'INR',
    status: s.status, tradeDate: s.trade, maturityDate: s.maturity,
    entities: s.dmcc ? [OIL, INDIA, DMCC] : [OIL, INDIA],
    legs, fixings: s.fixing ? [{ legRef: 'D2', rate: s.fixing, date: s.maturity }] : [], flows,
    plannedEntity: 'OFIIPL-INR', reportingRate: 100, settlementDate: settled ? s.maturity : null,
  }
}

export const SAMPLE_DEALS: DealDetail[] = SPECS.map(build)

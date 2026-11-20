import type {
  DealDetail, DealPnl, DealSummary, EntityPnl, Leg, MaturityRow, NetBasis, PlannedCalc, SettlementCalc,
} from './types.ts'
import { REPORTING_CCY } from './types.ts'

/**
 * The P&L rules, all pure so they can be tested and audited:
 *
 *  Planned P&L     the arbitrage of the linked legs: local currency received minus paid, booked by the planned entity.
 *  Realised G/L    on maturity, a leg is valued at its fixing rate: |local| / fixing in USD, compared with the USD it was dealt for.
 *  Settlement P&L  what an entity netted in settlement (received + paid) plus the realised G/L it booked, in its own currency.
 *  Actual P&L      the settlement P&L in the reporting currency (USD).
 *  Net P&L         the actual P&L once the deal has settled; before that, the planned P&L as the expected result.
 *
 * Planned, settlement and actual are different measures of the same money, so they are never added together. Amounts
 * in different currencies are only added after conversion to USD.
 */

export const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100

/** An amount in `ccy` expressed in USD; `rate` is units of `ccy` per USD. */
export function toUsd(amount: number, ccy: string, rate: number): number {
  if (ccy === REPORTING_CCY) return round2(amount)
  return rate ? round2(amount / rate) : 0
}

const sum = (values: number[]) => round2(values.reduce((s, v) => s + v, 0))

/** Arbitrage of the linked legs in the counter currency, then in USD at the reporting rate. */
export function arbitrage(legs: Leg[], reportingRate: number): { received: number; paid: number; local: number; usd: number } {
  const received = sum(legs.map((l) => Math.max(0, l.local)))
  const paid = sum(legs.map((l) => Math.max(0, -l.local)))
  const local = round2(received - paid)
  return { received, paid, local, usd: reportingRate ? round2(local / reportingRate) : 0 }
}

/** Highest minus lowest dealt rate of the legs: the spread the arbitrage comes from. */
export function rateSpread(legs: Leg[]): number {
  const rates = legs.map((l) => l.rate)
  return rates.length ? round2(Math.max(...rates) - Math.min(...rates)) : 0
}

/** A leg valued at its fixing: what its counter-currency amount is worth in USD at that rate. */
export function fixedUsd(leg: Leg, fixing: number): number {
  return fixing ? round2(Math.abs(leg.local) / fixing) : 0
}

/** Realised gain or loss in USD: selling USD gains when the fixing values the INR received above the USD given up, buying the reverse. */
export function realisedGain(leg: Leg, fixing: number): number {
  const value = fixedUsd(leg, fixing)
  return leg.direction === 'Sell USD' ? round2(value - Math.abs(leg.usd)) : round2(Math.abs(leg.usd) - value)
}

export function maturityRows(deal: DealDetail): MaturityRow[] {
  return deal.legs.map((leg) => {
    const fixing = deal.fixings.find((f) => f.legRef === leg.ref)
    return {
      legRef: leg.ref, label: leg.label, type: leg.type, entity: leg.entity,
      usd: fixing ? fixedUsd(leg, fixing.rate) : null,
      local: fixing ? -leg.local : null,
      fixingRate: fixing?.rate ?? null,
      realised: fixing ? realisedGain(leg, fixing.rate) : null,
      date: fixing?.date ?? null,
    }
  })
}

export function plannedCalc(deal: DealDetail): PlannedCalc {
  const a = arbitrage(deal.legs, deal.reportingRate)
  return {
    dealId: deal.id, legs: deal.legs, localCcy: deal.localCcy, receivedLocal: a.received, paidLocal: a.paid,
    arbitrageLocal: a.local, reportingRate: deal.reportingRate, arbitrageUsd: a.usd, rateSpread: rateSpread(deal.legs),
    plannedEntity: deal.plannedEntity,
  }
}

export function settlementCalc(deal: DealDetail): SettlementCalc {
  const maturity = maturityRows(deal)
  return {
    dealId: deal.id, maturity, realisedTotal: sum(maturity.map((m) => m.realised ?? 0)),
    flows: deal.flows.map((f) => {
      const entity = deal.entities.find((e) => e.code === f.entity)
      const ccy = entity?.ccy ?? deal.localCcy
      const rate = ccy === REPORTING_CCY ? 1 : deal.reportingRate
      const net = round2(f.pay + f.receive)
      return { entity: f.entity, company: entity?.company ?? '', ccy, rate, pay: f.pay, receive: f.receive, net, netUsd: toUsd(net, ccy, rate), payRef: f.payRef, receiveRef: f.receiveRef, note: f.note }
    }),
    settlementDate: deal.settlementDate, reportingRate: deal.reportingRate, localCcy: deal.localCcy,
  }
}

export function entityPnl(deal: DealDetail): DealPnl {
  const arb = arbitrage(deal.legs, deal.reportingRate)
  const maturity = maturityRows(deal)
  const settled = deal.flows.length > 0
  const entities: EntityPnl[] = deal.entities.map((e) => {
    const rate = e.ccy === REPORTING_CCY ? 1 : deal.reportingRate
    const planned = e.code === deal.plannedEntity ? arb.local : null
    const flow = deal.flows.find((f) => f.entity === e.code)
    const realisedUsd = sum(maturity.filter((m) => m.entity === e.code).map((m) => m.realised ?? 0))
    const settlement = flow ? round2(flow.pay + flow.receive + (e.ccy === REPORTING_CCY ? realisedUsd : realisedUsd * rate)) : null
    const plannedUsd = planned === null ? null : toUsd(planned, e.ccy, rate)
    const settlementUsd = settlement === null ? null : toUsd(settlement, e.ccy, rate)
    return {
      entity: e.code, company: e.company, ccy: e.ccy, rate, planned, plannedUsd, settlement, settlementUsd,
      actualUsd: settlementUsd, netUsd: settled ? settlementUsd : plannedUsd,
    }
  })
  const basis: NetBasis = settled ? 'actual' : entities.some((e) => e.plannedUsd !== null) ? 'planned' : 'none'
  return {
    dealId: deal.id, entities, consolidatedNetUsd: sum(entities.map((e) => e.netUsd ?? 0)), basis,
    reportingCcy: REPORTING_CCY, reportingRate: deal.reportingRate, localCcy: deal.localCcy,
  }
}

const orNull = (values: (number | null)[]) => (values.some((v) => v !== null) ? sum(values.map((v) => v ?? 0)) : null)

export function dealSummary(deal: DealDetail): DealSummary {
  const p = entityPnl(deal)
  return {
    id: deal.id, model: deal.model, description: deal.description, type: deal.type, entities: deal.entities.map((e) => e.code), pair: deal.pair,
    localCcy: deal.localCcy, status: deal.status, tradeDate: deal.tradeDate, maturityDate: deal.maturityDate,
    plannedUsd: orNull(p.entities.map((e) => e.plannedUsd)),
    settlementUsd: orNull(p.entities.map((e) => e.settlementUsd)),
    actualUsd: orNull(p.entities.map((e) => e.actualUsd)),
    netUsd: p.basis === 'none' ? null : p.consolidatedNetUsd,
    basis: p.basis,
  }
}

/** KPI totals over the deals shown. Every amount is already in USD, so they can be added. */
export function portfolioTotals(rows: DealSummary[]) {
  const add = (pick: (r: DealSummary) => number | null) => round2(rows.reduce((s, r) => s + (pick(r) ?? 0), 0))
  return {
    deals: rows.length,
    plannedUsd: add((r) => r.plannedUsd),
    actualUsd: add((r) => r.actualUsd),
    netUsd: add((r) => r.netUsd),
    profitable: rows.filter((r) => (r.netUsd ?? 0) > 0).length,
    losing: rows.filter((r) => (r.netUsd ?? 0) < 0).length,
  }
}

// ---------------------------------------------------------------- formatting

/** 1,234 / -1,234, the same way everywhere. */
export function fmt(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined) return '—'
  const text = Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  return value < 0 && Number(text.replace(/,/g, '')) !== 0 ? '-' + text : text
}

export function fmtCcy(value: number | null | undefined, ccy: string, decimals = 0): string {
  return value === null || value === undefined ? '—' : `${fmt(value, decimals)} ${ccy}`
}

export const sign = (value: number | null | undefined): 'pos' | 'neg' | 'zero' =>
  !value ? 'zero' : value > 0 ? 'pos' : 'neg'

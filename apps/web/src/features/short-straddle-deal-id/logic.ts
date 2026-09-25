/**
 * The page's business rules, lifted out of the legacy script as pure functions so the
 * component only holds state. The original never called an API: the ABAP report's reads and
 * updates (sub_get_data, GEN_NO_DEAL, UPDATE_DEAL_ID, USER_COMMAND_9000) were simulated in
 * memory. They still compute the screen's next state here; api.ts writes that state to
 * MySQL first when the middleware is up, and the Deal ID number range below is used only
 * when it is not.
 */
import {
  CANCELLED_DEAL_STATUS,
  DOC_SOURCE,
  ENTITIES,
  FX_MODELS,
  PAYMENT_TERMS,
  PORT_PAIRS,
  SEED_COMMODITIES,
  SEED_FX_MODELS,
  SEED_PAYMENT_TERMS,
  STATUS_MASTER,
  TRADE_CODE,
  TRADER_NAME,
} from './data.ts'
import { addDays, parseAmountShorthand, parseDMY, parseISO } from './format.ts'
import type {
  Amounts,
  Deal,
  EditForm,
  Entity,
  Filters,
  FxModel,
  MasterContract,
  McSeed,
  McStatus,
  PaymentTerm,
  StatusFilter,
} from './types.ts'

/** Who the page stamps as the changing user on edit / reverse. */
export const MO_USER = 'MO_REVIEWER'
/** Who the page stamps as the creator of a new Deal ID. */
export const DEAL_CREATOR = 'SIDDHI.P'

// ---------------------------------------------------------------- lookups

export const entityOf = (code: string): Entity | undefined => ENTITIES.find((e) => e.code === code)
export const modelOf = (code: string): FxModel | undefined => FX_MODELS.find((m) => m.code === code)
export const payTermOf = (code: string): PaymentTerm | undefined => PAYMENT_TERMS.find((p) => p.code === code)

/** The origin is the last leg of the model's entity string (e.g. OSIPL in OGA-DMCC-OSIPL). */
export const originOf = (m: FxModel): string => m.origin || (m.entities.at(-1) ?? '')
export const originCurrencyOf = (m: FxModel): string => m.curr.at(-1) ?? ''

/** MC_STAT's text for a code; the bare code for one this screen has no text for. */
export const statusName = (code: McStatus): string => STATUS_MASTER[code] ?? code
export const statusLabel = (code: McStatus): string => `${code} - ${statusName(code)}`
export const payTermLabel = (code: string): string => `${code} - ${payTermOf(code)?.desc ?? ''}`

// ---------------------------------------------------------------- Deal ID number range

/** Number-range object ZSGTSFNR01 renders its numbers as 10 zero-padded digits. */
export const formatDealId = (seq: number): string => String(seq).padStart(10, '0')

/** The Deal ID the next draw from the number range will yield, given the last one drawn. */
export const nextDealId = (lastSeq: number): string => formatDealId(lastSeq + 1)

/** TRADER_ORIGIN_YEAR/ENTITY-STRING, the ABAP deal description. */
export function dealDescription(origin: string, year: number, model: FxModel): string {
  return `${TRADER_NAME}_${origin}_${year}/${model.entities.join('-')}`
}

// ---------------------------------------------------------------- seed

/**
 * Derives the full Master Contract and Deal ID rows from MC_SEED exactly as the original's
 * start-up loop did, drawing a Deal ID from the number range for every seeded deal.
 */
export function buildSeed(
  seed: McSeed[],
  initialSeq: number,
): { contracts: MasterContract[]; deals: Deal[]; lastSeq: number } {
  const contracts: MasterContract[] = []
  const deals: Deal[] = []
  let seq = initialSeq

  seed.forEach((s, idx) => {
    // The seed is derived from the dummy masters it was written against, never MySQL's.
    const m = SEED_FX_MODELS.find((x) => x.code === s.model)
    if (!m) return
    const origin = originOf(m)
    const mcDate = parseDMY(s.mcDate)
    const shipStart = addDays(mcDate, s.shipStartOff)
    const shipEnd = addDays(shipStart, s.shipDur)
    const currOrigin = originCurrencyOf(m)
    const pt = SEED_PAYMENT_TERMS[idx % SEED_PAYMENT_TERMS.length]
    const ports = PORT_PAIRS[idx % PORT_PAIRS.length]
    const cDesc = SEED_COMMODITIES.find((c) => c.code === s.comm)?.desc ?? ''
    const reversed = s.stat === '21'

    contracts.push({
      mcRef: s.ref,
      mcDesc: `${origin}_${cDesc.replace(/\s+/g, '')}_${s.model}_${(s.amt / 1e6).toFixed(1)}M`,
      mcDate,
      sellBuy: idx % 2 === 0 ? 'S' : 'B',
      origin,
      amtUSD: s.amt,
      curr: 'USD',
      shipStart,
      shipEnd,
      commodityCode: s.comm,
      commodityDesc: cDesc,
      entityId: m.entityId,
      entityDesc: m.entities.join('-'),
      currId: m.currId,
      currDesc: m.curr.join('-'),
      payTerms: pt?.code ?? '',
      fxModel: s.model,
      modelDesc: m.desc,
      amtOrigin: s.amt * s.exRate,
      origCurr: currOrigin,
      exRate: s.exRate,
      mcStat: s.stat,
      pos: ports?.ship ?? '',
      pod: ports?.dest ?? '',
      moRemarks: s.moNote || '',
      foRemarks: s.foNote || '',
      createdBy: 'TINAKSHAYM',
      createdOn: addDays(mcDate, -1),
      createdTime: '10:14:22',
      changedBy: reversed ? MO_USER : '',
      changedOn: reversed ? addDays(mcDate, 6) : null,
      docDate: addDays(mcDate, 3),
      sourcePath: `${DOC_SOURCE}${s.ref}_MC.pdf`,
    })

    for (const d of s.deals) {
      const sDate = addDays(shipStart, d.offsetDays)
      seq += 1
      deals.push({
        dealId: formatDealId(seq),
        mcRef: s.ref,
        dealDesc: dealDescription(origin, sDate.getFullYear(), m),
        dealType: 'FX',
        subType: 'FX1',
        model: s.model,
        sDate,
        eDate: shipEnd,
        amtUSD: d.amtUSD,
        tradeCode: TRADE_CODE,
        dealStat: d.stat,
        currId: m.currId,
        currDesc: m.curr.join('-'),
        curr1: 'USD',
        curr2: currOrigin,
        amt1: d.amtUSD,
        amt2: d.amtUSD * s.exRate,
        createdBy: DEAL_CREATOR,
        createdOn: addDays(sDate, -1),
        createdTime: `11:02:0${1 + (d.offsetDays % 8)}`,
      })
    }
  })

  return { contracts, deals, lastSeq: seq }
}

// ---------------------------------------------------------------- amounts

export const dealsForMc = (deals: Deal[], mcRef: number): Deal[] => deals.filter((d) => d.mcRef === mcRef)

/**
 * Utilized = sum of Amt1 over the MC's deals except Cancelled (status 30); balance is the
 * rest. An Expired (09) contract has no balance: whatever was not utilized is its expiry amount.
 */
export function computeAmounts(mc: MasterContract, deals: Deal[]): Amounts {
  const uti = dealsForMc(deals, mc.mcRef)
    .filter((d) => d.dealStat !== CANCELLED_DEAL_STATUS)
    .reduce((sum, d) => sum + d.amt1, 0)
  if (mc.mcStat === '09') return { uti, bal: 0, exp: mc.amtUSD - uti }
  return { uti, bal: mc.amtUSD - uti, exp: 0 }
}

// ---------------------------------------------------------------- filtering

/**
 * Every filter except status. The ABAP selection screen is replaced by these live filters:
 * the Ship End Date field is the report's p_date (WHERE zship_end > p_date).
 */
export function matchesNonStatusFilters(mc: MasterContract, f: Filters, now: Date = new Date()): boolean {
  const asOf = parseISO(f.asOf) ?? now
  if (mc.shipEnd <= asOf) return false
  const q = f.search.trim().toLowerCase()
  if (q) {
    const hay = [mc.mcRef, mc.mcDesc, mc.origin, mc.entityId, mc.entityDesc, mc.fxModel, mc.modelDesc, mc.commodityCode, mc.commodityDesc]
      .join(' ')
      .toLowerCase()
    if (!hay.includes(q)) return false
  }
  if (f.entity !== 'ALL' && mc.origin !== f.entity) return false
  if (f.region !== 'ALL' && entityOf(mc.origin)?.region !== f.region) return false
  if (f.model !== 'ALL' && mc.fxModel !== f.model) return false
  return true
}

/**
 * scope honours every filter except status — it is what the KPI cards summarise; filtered
 * adds the status filter and is what the table shows.
 */
export function applyFilters(
  contracts: MasterContract[],
  f: Filters,
  now: Date = new Date(),
): { scope: MasterContract[]; filtered: MasterContract[] } {
  const scope = contracts.filter((mc) => matchesNonStatusFilters(mc, f, now))
  const filtered = scope.filter((mc) => f.status === 'ALL' || mc.mcStat === f.status)
  return { scope, filtered }
}

export type Kpi = { key: StatusFilter; val: number; lbl: string }

export function computeKpis(scope: MasterContract[], deals: Deal[]): { cards: Kpi[]; totalUti: number } {
  const byStat: Partial<Record<McStatus, number>> = {}
  let totalUti = 0
  for (const mc of scope) {
    totalUti += computeAmounts(mc, deals).uti
    byStat[mc.mcStat] = (byStat[mc.mcStat] ?? 0) + 1
  }
  return {
    totalUti,
    cards: [
      { key: 'ALL', val: scope.length, lbl: 'Master Contracts in Scope' },
      { key: '03', val: byStat['03'] ?? 0, lbl: 'Confirmed by MO' },
      { key: '04', val: byStat['04'] ?? 0, lbl: 'Deal ID Created (In-Use)' },
      { key: '09', val: byStat['09'] ?? 0, lbl: 'Expired' },
    ],
  }
}

// ---------------------------------------------------------------- pager

/** At most five numbered buttons, centred on the current page where possible. */
export function pagerWindow(page: number, totalPages: number, maxBtns = 5): number[] {
  let first = 1
  let last = totalPages
  if (totalPages > maxBtns) {
    first = Math.max(1, page - Math.floor(maxBtns / 2))
    last = first + maxBtns - 1
    if (last > totalPages) {
      last = totalPages
      first = last - maxBtns + 1
    }
  }
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => first + i)
}

// ---------------------------------------------------------------- toolbar actions

/** Create Deal ID and Reverse MC are only offered for Confirmed (03) or In-Use (04) contracts. */
export const canCreateOrReverse = (mc: MasterContract | undefined): boolean =>
  !!mc && (mc.mcStat === '03' || mc.mcStat === '04')

export function selectionInfo(mc: MasterContract | undefined): string {
  if (!mc) return 'Select a row to enable Create Deal ID / Reverse MC'
  return `Selected MC ${mc.mcRef} (${statusName(mc.mcStat)}) — drag the row onto a button, or click it`
}

// ---------------------------------------------------------------- Edit MC (dynpro 9001)

/**
 * editable: Expired and Reversed contracts are never editable. locked: MODIFY_SCR_9001 greys
 * the inputs once IF zmc_stat >= '03'. Only a contract that is editable and not locked can be saved.
 */
export function editAccess(mc: MasterContract): { editable: boolean; locked: boolean; canSave: boolean } {
  const editable = mc.mcStat !== '09' && mc.mcStat !== '21'
  const locked = mc.mcStat >= '03'
  return { editable, locked, canSave: editable && !locked }
}

/** Models the Edit screen offers: Short Straddle models whose origin leg is this MC's origin. */
export const editModelCandidates = (origin: string): FxModel[] => FX_MODELS.filter((m) => originOf(m) === origin)

export function applyEdit(mc: MasterContract, form: EditForm, now: Date): MasterContract {
  const amt = parseAmountShorthand(form.amount)
  const model = modelOf(form.model) ?? modelOf(mc.fxModel)
  const next: MasterContract = { ...mc, amtUSD: amt, amtOrigin: amt * mc.exRate, payTerms: form.payTerms, changedBy: MO_USER, changedOn: now }
  if (!model) return next
  return {
    ...next,
    fxModel: model.code,
    modelDesc: model.desc,
    entityId: model.entityId,
    entityDesc: model.entities.join('-'),
    currId: model.currId,
    currDesc: model.curr.join('-'),
    origCurr: originCurrencyOf(model),
  }
}

// ---------------------------------------------------------------- Create Deal ID (dynpro 9002)

/** The Deal Amount the popup opens with: whatever the contract has not utilized yet. */
export const defaultDealAmount = (mc: MasterContract, deals: Deal[]): number =>
  Math.max(0, mc.amtUSD - computeAmounts(mc, deals).uti)

/**
 * GEN_NO_DEAL + UPDATE_DEAL_ID: draw the next number, book a Created (01) FX deal for the
 * whole ship window, and move the Master Contract to 04 — Deal ID Created (In-Use).
 */
export function createDeal(
  mc: MasterContract,
  rawAmount: string,
  lastSeq: number,
  now: Date,
): { deal: Deal; contract: MasterContract; lastSeq: number } {
  const amt = parseAmountShorthand(rawAmount)
  const model = modelOf(mc.fxModel)
  const seq = lastSeq + 1
  const deal: Deal = {
    dealId: formatDealId(seq),
    mcRef: mc.mcRef,
    dealDesc: model
      ? dealDescription(mc.origin, mc.shipStart.getFullYear(), model)
      : `${TRADER_NAME}_${mc.origin}_${mc.shipStart.getFullYear()}/${mc.entityDesc}`,
    // The model's RULE_BT ZTYPE / ZSUB_TYPE; the dummy models carry the FX / FX1 the page used.
    dealType: model ? model.dealType : 'FX',
    subType: model ? model.subType : 'FX1',
    model: mc.fxModel,
    sDate: mc.shipStart,
    eDate: mc.shipEnd,
    amtUSD: amt,
    tradeCode: TRADE_CODE,
    dealStat: '01',
    currId: mc.currId,
    currDesc: mc.currDesc,
    curr1: 'USD',
    curr2: mc.origCurr,
    amt1: amt,
    amt2: amt * mc.exRate,
    createdBy: DEAL_CREATOR,
    createdOn: now,
    createdTime: now.toTimeString().slice(0, 8),
  }
  return { deal, contract: { ...mc, mcStat: '04' }, lastSeq: seq }
}

// ---------------------------------------------------------------- Reverse MC (dynpro 9000)

/** IF gv_rem IS INITIAL ... MESSAGE 'Please enter remarks'. */
export const validateReverseRemark = (remark: string): boolean => remark.trim() !== ''

/** Status 21 — Reversed by MO, with the remark stored as the MO remark. */
export function reverseMc(mc: MasterContract, remark: string, now: Date): MasterContract {
  return { ...mc, mcStat: '21', moRemarks: remark.trim(), changedBy: MO_USER, changedOn: now }
}

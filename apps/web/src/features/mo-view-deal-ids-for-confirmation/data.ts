/*
 * The screen's live masters (REGIONS, ENTITIES, MODELS, STATUSES) start empty and are filled
 * only from SAP's tables by api.ts — a filter never offers a made-up value.
 *
 * The legacy page's dummy masters and its generated deal list stay below as test fixtures
 * (logic.test.ts); nothing on the screen shows them.
 */
import { pad } from './format.ts'
import type { Column, Currency, Deal, Entity, FxModel, Region, Status, StatusCode } from './types.ts'

/** COMP-ZREG_ID values (ZSGTSFSH_REGION), filled by api.ts. */
export const REGIONS: Region[] = []
/** ZSGTSFTR_COMP (ZSGTSFSH_ENTITY), filled by api.ts. */
export const ENTITIES: Entity[] = []
/** ZSGTSFTR_RULE_BT (ZSGTSFSH_MODEL), filled by api.ts. */
export const MODELS: FxModel[] = []
/** ZSGTSFTR_DEAL_ST WHERE zsub_type = 'FX1' AND zdeal_stat <= '02' (FORM modify_drop_down), filled by api.ts. */
export const STATUSES: Status[] = []

/* ---------------- Test fixtures: the legacy page's dummy masters ---------------- */

const SEED_ENTITIES: Entity[] = [
  { id: 'OSIPL', name: 'Olam Agri India Pvt Ltd', region: 'APAC', currency: 'INR' },
  { id: 'OTL', name: 'Olam (Thailand) Ltd', region: 'APAC', currency: 'THB' },
  { id: 'OVL', name: 'Olam Vietnam Limited', region: 'APAC', currency: 'VND' },
  { id: 'OGA', name: 'Olam Global Agri Pte Ltd', region: 'APAC', currency: 'SGD' },
  { id: 'DMCC', name: 'Olam International DMCC', region: 'EMEA', currency: 'AED' },
]

const SEED_MODELS: FxModel[] = [
  { id: 'M032', desc: 'INR Long Forward', type: 'FORWARD' },
  { id: 'M033', desc: 'INR-INR Forward', type: 'FORWARD' },
  { id: 'M034', desc: 'INR–INR Staggered Call & Put Option', type: 'OPTION' },
  { id: 'M035', desc: 'INR-INR-Put & Call Option', type: 'OPTION' },
  { id: 'M036', desc: 'USD-INR-Put & Call Option', type: 'OPTION' },
  { id: 'M037', desc: 'INR Short Forward', type: 'FORWARD' },
  { id: 'M041', desc: 'INR–INR Staggered Call & Put Option', type: 'OPTION' },
]

const SEED_STATUSES: Status[] = [
  { code: '01', desc: 'Pending Confirmation' },
  { code: '02', desc: 'Confirmed' },
]

export const USERS: readonly string[] = ['KRAMASAM', 'SKARUNAK', 'VPARAB', 'RDSOUZA', 'NTHAKUR', 'AMEHTA', 'JLIM', 'PSRINIVAS']

export const FX_RATES: Readonly<Record<Currency, number>> = { INR: 87.4, THB: 34.6, VND: 25350, SGD: 1.34, AED: 3.6725, USD: 1 }

/** The page's hard-coded "today": 28-Sep-2026, the default Key Date and the generation anchor. */
export function defaultKeyDate(): Date {
  return new Date(2026, 8, 28)
}

export function lookupEntity(id: string): Entity | null {
  return ENTITIES.find((e) => e.id === id) ?? null
}
export function lookupModel(id: string): FxModel | null {
  return MODELS.find((m) => m.id === id) ?? null
}
export function lookupStatus(code: string): Status | null {
  return STATUSES.find((s) => s.code === code) ?? null
}

export const COLUMNS: readonly Column[] = [
  { key: 'zdeal_id', label: 'Deal ID', essential: true, type: 'hotspot-green', sortable: true, width: 118 },
  { key: 'zdeal_type', label: 'Type', essential: true, type: 'text', sortable: true },
  { key: 'zsub_type', label: 'Sub Type', essential: false, type: 'text', sortable: true },
  { key: 'zdeal_desc', label: 'Deal ID Description', essential: true, type: 'desc', sortable: true },
  { key: 'zdeal_stat', label: 'Deal Status', essential: true, type: 'status', sortable: true },
  { key: 'zconfirm', label: 'Confirmed', essential: true, type: 'flag', sortable: true },
  { key: 'zss', label: 'Short Straddle', essential: false, type: 'flag', sortable: true },
  { key: 'zs_date', label: 'Start Date', essential: true, type: 'date', sortable: true },
  { key: 'ze_date', label: 'End Date', essential: true, type: 'date', sortable: true },
  { key: 'zrev_dedate', label: 'Revised End Date', essential: false, type: 'date', sortable: true },
  { key: 'zmc_ref', label: 'MC Reference No', essential: true, type: 'hotspot-blue', sortable: true, width: 130 },
  { key: 'zmc_desc', label: 'MC Description', essential: false, type: 'desc', sortable: true },
  { key: 'zmc_date', label: 'MC Date', essential: false, type: 'date', sortable: true },
  { key: 'zamt', label: 'MC Amount (USD)', essential: true, type: 'currency-blue', sortable: true },
  { key: 'zmod_id', label: 'FX Model', essential: true, type: 'text', sortable: true },
  { key: 'zmod_desc', label: 'Model Description', essential: false, type: 'desc', sortable: true },
  { key: 'zorigin', label: 'Origin Entity', essential: true, type: 'text', sortable: true },
  { key: 'zreg_id', label: 'Region', essential: true, type: 'text', sortable: true },
  { key: 'zship_start', label: 'Ship Start', essential: false, type: 'date', sortable: true },
  { key: 'zship_end', label: 'Ship End', essential: false, type: 'date', sortable: true },
  { key: 'uti_amt', label: 'Utilized Amt (USD)', essential: true, type: 'currency-green', sortable: true },
  { key: 'zpl', label: 'FX P&L Amount', essential: true, type: 'pl', sortable: true },
  { key: 'zpl_curr', label: 'P&L Ccy', essential: false, type: 'text', sortable: true },
  { key: 'zpl_rate', label: 'P&L Ex Rate', essential: false, type: 'rate', sortable: true },
  { key: 'zpl_lamt', label: 'FX P&L Local Amt', essential: false, type: 'pl', sortable: true },
  { key: 'zpl_lcurr', label: 'P&L Local Ccy', essential: false, type: 'text', sortable: true },
  { key: 'zcreated_by', label: 'Entered By', essential: false, type: 'text', sortable: true },
  { key: 'zcreated_date', label: 'Entered On', essential: false, type: 'date', sortable: true },
  { key: 'zchanged_by', label: 'Last Changed By', essential: false, type: 'text', sortable: true },
  { key: 'zchanged_date', label: 'Changed On', essential: false, type: 'date', sortable: true },
]

function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

/**
 * The original's generateDeals, draw for draw. Its seeded generator is stateful, so a fresh
 * one is created on every call: each mount sees the same list, in the same order, as the
 * legacy page did on every load. Do not reorder any rnd() call below.
 */
export function generateDeals(count: number): Deal[] {
  const rnd = seededRandom(20260928)
  const randInt = (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min
  const randPick = <T>(arr: readonly T[]): T => {
    const v = arr[randInt(0, arr.length - 1)]
    if (v === undefined) throw new Error('randPick on an empty list')
    return v
  }

  const anchor = defaultKeyDate()
  const out: Deal[] = []
  for (let i = 1; i <= count; i++) {
    const entity = randPick(SEED_ENTITIES)
    const model = randPick(SEED_MODELS)
    const statusRoll = rnd()
    const status: StatusCode = statusRoll < 0.62 ? '01' : '02'

    const startOffset = randInt(-75, 20)
    const startDate = addDays(anchor, startOffset)
    const duration = randInt(30, 330)
    const endDate = addDays(startDate, duration)

    const hasRevised = rnd() < 0.22
    const revisedEnd = hasRevised ? addDays(endDate, randInt(5, 45)) : null

    const shortStraddle = rnd() < 0.16 ? 'X' : ''
    const shipStart = addDays(startDate, randInt(2, 15))
    const shipEnd = addDays(endDate, randInt(-10, 25))

    const mcDate = addDays(startDate, -randInt(1, 10))
    const mcAmt = randInt(50, 950) * 10000 // 500,000 - 9,500,000
    const mcRefNo = `2000${pad(27000 + i, 6)}`

    const confirm = status === '02' ? 'X' : ''

    const plCurr: Currency = 'USD'
    const plLocalCurr = entity.currency
    // The trailing "* 0" term is the original's: it adds nothing but still consumes a draw.
    let plAmt = (rnd() < 0.28 ? -1 : 1) * randInt(2000, 165000) + Number((rnd() * 100).toFixed(2)) * 0
    plAmt = Math.round(plAmt * 100) / 100
    let rate = (FX_RATES[plLocalCurr] ?? 1) * (0.985 + rnd() * 0.03)
    rate = Math.round(rate * 10000) / 10000
    const plLamt = Math.round(plAmt * rate * 100) / 100

    const utiAmt = Math.round(mcAmt * (0.12 + rnd() * 0.78) * 100) / 100

    const createdBy = randPick(USERS)
    const createdDate = addDays(mcDate, -randInt(0, 4))
    const createdTime = `${pad(randInt(7, 18), 2)}:${pad(randInt(0, 59), 2)}:${pad(randInt(0, 59), 2)}`

    const wasChanged = rnd() < 0.45
    const changedBy = wasChanged ? randPick(USERS) : createdBy
    const changedDate = wasChanged ? addDays(createdDate, randInt(1, 20)) : createdDate

    let dealDesc = `${model.desc} - ${entity.id}`
    if (dealDesc.length > 78) dealDesc = dealDesc.substring(0, 78)

    // Drawn inside the original's object literal, after everything above.
    const changedTime = `${pad(randInt(7, 18), 2)}:${pad(randInt(0, 59), 2)}:${pad(randInt(0, 59), 2)}`

    out.push({
      zdeal_type: model.type,
      zsub_type: 'FX1',
      zdeal_id: `FXD${pad(1000000 + i, 7)}`,
      zdeal_desc: dealDesc,
      zs_date: startDate,
      ze_date: endDate,
      zrev_dedate: revisedEnd,
      zmc_ref: mcRefNo,
      zdeal_stat: status,
      zdeal_sdesc: SEED_STATUSES.find((s) => s.code === status)?.desc ?? '',
      zconfirm: confirm,
      zss: shortStraddle,
      zship_start: shipStart,
      zship_end: shipEnd,
      zpl: plAmt,
      zpl_curr: plCurr,
      zpl_rate: rate,
      zpl_lamt: plLamt,
      zpl_lcurr: plLocalCurr,
      zcreated_by: createdBy,
      zcreated_date: createdDate,
      zcreated_time: createdTime,
      zchanged_by: changedBy,
      zchanged_date: changedDate,
      zchanged_time: changedTime,
      zorigin: entity.id,
      zreg_id: entity.region,
      zmod_id: model.id,
      zmod_desc: model.desc,
      zmc_desc: `${entity.id}_${model.type}_${model.id}`,
      zmc_date: mcDate,
      zamt: mcAmt,
      uti_amt: utiAmt,
    })
  }
  return out
}

/** The original's loadDeals(): 46 generated deals. */
export function loadDeals(): Deal[] {
  return generateDeals(46)
}

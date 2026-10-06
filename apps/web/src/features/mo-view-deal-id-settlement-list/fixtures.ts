/**
 * TEST FIXTURES ONLY — imported by the *.test.ts files, never by the screen.
 *
 * The legacy page's dummy Master Contracts and Deal IDs (and its invented invoice-leg markup),
 * kept so the pure filter / sort / KPI helpers in logic.ts stay covered while the screen's
 * selection (ZSGTSFR106, source not exported) has no API.
 */
import { addDays, parseDate } from './format.ts'
import { statusIsSettled } from './logic.ts'
import type {
  CoArea,
  Commodity,
  Deal,
  DealSeed,
  DealStatus,
  Entity,
  FxModel,
  InvoiceLeg,
  MasterContract,
  McSeed,
  Region,
} from './types.ts'

export const REGIONS: readonly Region[] = [
  { id: 'R01', name: 'South-East Asia' },
  { id: 'R02', name: 'China' },
  { id: 'R03', name: 'United States of America' },
  { id: 'R04', name: 'Middle East & Africa' },
  { id: 'R05', name: 'Europe' },
  { id: 'R06', name: 'United Kingdom' },
  { id: 'R07', name: 'Latin America' },
  { id: 'R08', name: 'Brazil' },
  { id: 'R09', name: 'Canada' },
]

export const ENTITIES: readonly Entity[] = [
  { code: 'AMBER', cocode: 'KY10', name: 'Amber Foods Limited', region: 'R04', origin: false },
  { code: 'DMCC', cocode: 'AE13', name: 'Olam International DMCC', region: 'R04', origin: false },
  { code: 'OAL', cocode: 'US40', name: 'Olam Global Agri Americas', region: 'R03', origin: false },
  { code: 'OGA', cocode: 'SG03', name: 'Olam Global Agri Pte. Ltd', region: 'R01', origin: false },
  { code: 'OGAT', cocode: 'SG39', name: 'Olam Global Agri Treasury', region: 'R01', origin: false },
  { code: 'OSIPL', cocode: 'IN11', name: 'Olam Agri India Pvt Ltd', region: 'R01', origin: true },
  { code: 'OSL', cocode: 'CN10', name: 'Olam Shanghai Limited', region: 'R02', origin: false },
  { code: 'OTL', cocode: 'TH10', name: 'Olam (Thailand) Ltd', region: 'R01', origin: true },
  { code: 'OVL', cocode: 'VN10', name: 'Olam Vietnam Limited', region: 'R01', origin: true },
  { code: 'PAN', cocode: 'AE11', name: 'Panasia International FZE', region: 'R04', origin: false },
  { code: 'SEDA', cocode: 'ES12', name: 'SEDA OUTSPAN IBERIA S.L.U', region: 'R05', origin: false },
]

/** Each FX Model pre-sets the 3-entity chain and the currency each leg settles in. */
export const FX_MODELS: readonly FxModel[] = [
  { code: 'M021', desc: 'INR Long Forward', entities: ['OGA', 'DMCC', 'OSIPL'], curr: ['USD', 'USD', 'INR'], entityId: 'E015', currId: 'C002' },
  { code: 'M032', desc: 'INR Long Forward', entities: ['OGA', 'DMCC', 'OSIPL'], curr: ['USD', 'USD', 'INR'], entityId: 'E015', currId: 'C002' },
  { code: 'M034', desc: 'INR - INR Staggered Call & Put Option', entities: ['OGA', 'DMCC', 'OSIPL'], curr: ['USD', 'USD', 'INR'], entityId: 'E026', currId: 'C002' },
  { code: 'M041', desc: 'INR Short Forward', entities: ['OGAT', 'DMCC', 'OSIPL'], curr: ['USD', 'USD', 'INR'], entityId: 'E017', currId: 'C002' },
  { code: 'M017', desc: 'USD Long Forward', entities: ['OAL', 'DMCC', 'OTL'], curr: ['USD', 'USD', 'USD'], entityId: 'E016', currId: 'C003' },
  { code: 'M025', desc: 'EUR Long Forward', entities: ['SEDA', 'DMCC', 'OVL'], curr: ['USD', 'USD', 'EUR'], entityId: 'E018', currId: 'C006' },
]

export const COMMODITIES: readonly Commodity[] = [
  { code: 'C102', desc: 'WHEAT' },
  { code: 'C125', desc: 'RICE' },
  { code: 'C001', desc: 'Multi-Commodity' },
  { code: 'C110', desc: 'SOYABEAN OIL' },
  { code: 'C140', desc: 'SUGAR' },
]

export const CO_AREAS: readonly CoArea[] = [
  { code: '1000', desc: 'Olam Agri Global' },
  { code: '2000', desc: 'Olam International' },
]

/** The CO Area selected on load and after Reset. */
export const DEFAULT_CO_AREA = '1000'

/**
 * zdeal_stat master (ZSGTSFTR_DEAL_ST where zsub_type = FX1), ordered by code. Status 30
 * exists in the table but the report deletes it from the result set, so it is left out.
 */
export const DEAL_STATUSES: readonly DealStatus[] = [
  { code: '01', desc: 'Deal Booked' },
  { code: '02', desc: 'Confirmed by MO' },
  { code: '05', desc: 'BL Attached' },
  { code: '07', desc: 'Invoiced' },
  { code: '21', desc: 'Ready for Settlement' },
  { code: '22', desc: 'Settled' },
]

export const PARTNER_BANKS: readonly string[] = [
  'Standard Chartered Bank Singapore',
  'Barclays Bank PLC',
  'DBS Bank Ltd',
  'HSBC Singapore',
  'Citibank N.A.',
  'JPMorgan Chase Bank N.A.',
]

/** Master Contracts already Confirmed / In-Use: every one has at least one Deal ID against it. */
export const MC_SEED: readonly McSeed[] = [
  { ref: 'MC-7001', model: 'M021', comm: 'C110', qty: '5,000 MT', desc: 'OSIPL_SOYABEANOIL_M021_5KMT', mcDate: '02.01.2026', amtUSD: 5000000, shipStartOff: 35, shipDur: 30, port: { ship: 'Any Port(s) in India or any other port(s)', dest: 'Any Port(s) in Middle East or any other port(s)' } },
  { ref: 'MC-7014', model: 'M017', comm: 'C110', qty: '3,000 MT', desc: 'OTL_SOYABEANOIL_M017_3KMT', mcDate: '08.01.2026', amtUSD: 3000000, shipStartOff: 40, shipDur: 45, port: { ship: 'Any Port(s) in Thailand or any other port(s)', dest: 'Any Port(s) in China or any other port(s)' } },
  { ref: 'MC-7022', model: 'M025', comm: 'C140', qty: '8,000 MT', desc: 'OVL_SUGAR_M025_8KMT', mcDate: '14.01.2026', amtUSD: 4200000, shipStartOff: 50, shipDur: 60, port: { ship: 'Any Port(s) in Vietnam or any other port(s)', dest: 'Any Port(s) in Europe or any other port(s)' } },
  { ref: 'MC-7035', model: 'M041', comm: 'C001', qty: 'n/a', desc: 'OSIPL_Multi-Commodity_M041', mcDate: '20.01.2026', amtUSD: 900000, shipStartOff: 25, shipDur: 25, port: { ship: 'Any Port(s) in India or any other port(s)', dest: 'Any Port(s) in Middle East or any other port(s)' } },
  { ref: 'MC-7048', model: 'M032', comm: 'C102', qty: '12,000 MT', desc: 'OSIPL_WHEAT_M032_12KMT', mcDate: '27.01.2026', amtUSD: 6500000, shipStartOff: 30, shipDur: 90, port: { ship: 'Any Port(s) in India or any other port(s)', dest: 'Any Port(s) in Middle East or any other port(s)' } },
  { ref: 'MC-7056', model: 'M034', comm: 'C125', qty: '2,500 MT', desc: 'OSIPL_RICE_M034_2.5KMT', mcDate: '03.02.2026', amtUSD: 1250000, shipStartOff: 45, shipDur: 40, port: { ship: 'Any Port(s) in India or any other port(s)', dest: 'Any Port(s) in Middle East or any other port(s)' } },
]

/** ZSGTSFTR_DEALID rows; `bank` indexes PARTNER_BANKS. The first row is the worked example. */
export const DEAL_SEED: readonly DealSeed[] = [
  { id: 'TSF-9081', mc: 'MC-7001', stat: '07', trd: '03.01.2026', val: '05.02.2026', bank: 0, co: '1000', pl: 18400, uti: 5000000, spot: true },
  { id: 'TSF-9102', mc: 'MC-7001', stat: '21', trd: '20.01.2026', val: '18.03.2026', bank: 1, co: '1000', pl: 21650, uti: 2500000, spot: true },
  { id: 'TSF-9095', mc: 'MC-7014', stat: '22', trd: '09.01.2026', val: '22.02.2026', bank: 2, co: '1000', pl: 9800, uti: 3000000, spot: true },
  { id: 'TSF-9110', mc: 'MC-7022', stat: '05', trd: '15.01.2026', val: '13.04.2026', bank: 3, co: '2000', pl: 14200, uti: 2100000, spot: false },
  { id: 'TSF-9127', mc: 'MC-7022', stat: '02', trd: '02.02.2026', val: '20.04.2026', bank: 3, co: '2000', pl: 6300, uti: 2100000, spot: false },
  { id: 'TSF-9118', mc: 'MC-7035', stat: '01', trd: '21.01.2026', val: '15.02.2026', bank: 4, co: '1000', pl: 1250, uti: 900000, spot: false },
  { id: 'TSF-9131', mc: 'MC-7048', stat: '22', trd: '28.01.2026', val: '27.04.2026', bank: 1, co: '1000', pl: 31200, uti: 3250000, spot: true },
  { id: 'TSF-9142', mc: 'MC-7048', stat: '21', trd: '11.02.2026', val: '11.05.2026', bank: 0, co: '1000', pl: 24750, uti: 3250000, spot: true },
  { id: 'TSF-9150', mc: 'MC-7048', stat: '02', trd: '19.02.2026', val: '20.05.2026', bank: 5, co: '1000', pl: 5100, uti: 3250000, spot: false },
  { id: 'TSF-9121', mc: 'MC-7056', stat: '07', trd: '04.02.2026', val: '13.03.2026', bank: 2, co: '2000', pl: 7650, uti: 625000, spot: true },
  { id: 'TSF-9138', mc: 'MC-7056', stat: '05', trd: '04.02.2026', val: '13.03.2026', bank: 2, co: '2000', pl: 7600, uti: 625000, spot: false },
]

const entityOf = (code: string): Entity | undefined => ENTITIES.find((e) => e.code === code)

export function buildMasterContracts(seed: readonly McSeed[] = MC_SEED): MasterContract[] {
  return seed.map((s) => {
    const m = FX_MODELS.find((x) => x.code === s.model)
    const commodity = COMMODITIES.find((c) => c.code === s.comm)
    if (!m || !commodity) throw new Error(`bad Master Contract seed ${s.ref}`)
    const origin = m.entities[m.entities.length - 1] ?? ''
    const mcDate = parseDate(s.mcDate)
    const shipStart = addDays(mcDate, s.shipStartOff)
    const shipEnd = addDays(shipStart, s.shipDur)
    return {
      mcRef: s.ref,
      fxModel: s.model,
      modelDesc: m.desc,
      entities: m.entities,
      currChain: m.curr,
      originEntity: origin,
      region: entityOf(origin)?.region ?? '',
      commodityCode: s.comm,
      commodityDesc: commodity.desc,
      qty: s.qty,
      mcDate,
      amtUSD: s.amtUSD,
      shipStart,
      shipEnd,
      portOfShipment: s.port.ship,
      portOfDestination: s.port.dest,
    }
  })
}

export function buildDeals(mcs: readonly MasterContract[], seed: readonly DealSeed[] = DEAL_SEED): Deal[] {
  return seed.map((s, i) => {
    const mc = mcs.find((m) => m.mcRef === s.mc)
    const st = DEAL_STATUSES.find((x) => x.code === s.stat)
    if (!mc || !st) throw new Error(`bad Deal ID seed ${s.id}`)
    const trd = parseDate(s.trd)
    const val = parseDate(s.val)
    const createdOn = addDays(trd, -1)
    const changed = s.stat !== '01'
    return {
      dealId: s.id,
      dealType: 'FX1',
      subType: 'D1',
      dealDesc: `${mc.commodityDesc} deal under ${mc.mcRef} (${mc.fxModel})`,
      shortDesc: `${mc.commodityDesc.slice(0, 12)} ${s.id.slice(-4)}`,
      mcRef: s.mc,
      fxModel: mc.fxModel,
      modelDesc: mc.modelDesc,
      origin: mc.originEntity,
      region: mc.region,
      status: s.stat,
      statusDesc: st.desc,
      confirm: changed,
      tradeDate: trd,
      valueDate: val,
      revisedEndDate: statusIsSettled(s.stat) ? val : null,
      coArea: s.co,
      partner: PARTNER_BANKS[s.bank] ?? '',
      plAmt: s.pl,
      plCurr: 'USD',
      plRate: +(1 + (i % 7) * 0.013).toFixed(4),
      utiAmt: s.uti,
      fixingDay: addDays(val, -5),
      spot: s.spot,
      createdBy: i % 2 === 0 ? 'TINAKSHAYM' : 'AERAHULY',
      createdDate: createdOn,
      createdTime: `${String(8 + (i % 9)).padStart(2, '0')}:${String((i * 11) % 60).padStart(2, '0')}:00`,
      changedBy: changed ? (i % 2 === 0 ? 'AERAHULY' : 'TINAKSHAYM') : '',
      changedDate: changed ? addDays(createdOn, 1 + (i % 4)) : null,
      changedTime: changed ? `${String(9 + (i % 8)).padStart(2, '0')}:${String((i * 17) % 60).padStart(2, '0')}:00` : '',
    }
  })
}

/**
 * One invoice per leg of the Entity String. The first leg is invoiced at the utilised amount;
 * each onward leg adds a small, increasing trade markup on the running amount.
 */
export function invoiceLegs(deal: Deal, mc: MasterContract): InvoiceLeg[] {
  const legs = mc.entities.length - 1
  const base = deal.utiAmt
  let cumulative = base
  const rows: InvoiceLeg[] = []
  for (let i = 0; i < legs; i++) {
    const markupPct = 0.001 + i * 0.0012
    const markupAmt = i === 0 ? 0 : cumulative * markupPct
    cumulative = i === 0 ? base : cumulative + markupAmt
    rows.push({
      leg: `T${i + 1}${i === legs - 1 ? ' (final)' : ''}`,
      seller: mc.entities[i] ?? '',
      buyer: mc.entities[i + 1] ?? '',
      curr: mc.currChain[i + 1] ?? '',
      amt: cumulative,
      markup: i === 0 ? null : markupAmt,
    })
  }
  return rows
}

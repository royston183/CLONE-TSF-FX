/**
 * Seed data, verbatim from the legacy page's "Master / reference data" and "Dummy master
 * contract data" blocks. Every list here stands in for an SAP value help or the
 * master-contract table behind ZSGTSFR011.
 *
 * They are now the fallback: api.ts replaces the master lists in place with MySQL's rows once
 * the middleware answers (ENTITIES, FX_MODELS, COMMODITIES, PAYMENT_TERMS), and
 * seedContracts() is only shown when it cannot be reached. A master that is registered but
 * still empty in MySQL keeps these values. REGIONS is replaced by the SAP region codes
 * (shared/fx/regions.ts) and is only this fallback when SAP cannot be read; PORT_PAIRS has no
 * migrated master and always stays as it is.
 */
import { addDays, parseSeedDate } from './format.ts'
import type {
  Commodity,
  Entity,
  FxModel,
  MasterContract,
  McSeed,
  PaymentTerm,
  PortPair,
  Region,
  StatusKey,
  StatusValue,
} from './types.ts'

export const REGIONS: Region[] = [
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

export const ENTITIES: Entity[] = [
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

export const FX_MODELS: FxModel[] = [
  { code: 'M021', desc: 'INR Long Forward', entities: ['OGA', 'DMCC', 'OSIPL'], curr: ['USD', 'USD', 'INR'], entityId: 'E015', currId: 'C002' },
  { code: 'M032', desc: 'INR Long Forward', entities: ['OGA', 'DMCC', 'OSIPL'], curr: ['USD', 'USD', 'INR'], entityId: 'E015', currId: 'C002' },
  { code: 'M034', desc: 'INR - INR Staggered Call & Put Option', entities: ['OGA', 'DMCC', 'OSIPL'], curr: ['USD', 'USD', 'INR'], entityId: 'E026', currId: 'C002' },
  { code: 'M041', desc: 'INR Short Forward', entities: ['OGAT', 'DMCC', 'OSIPL'], curr: ['USD', 'USD', 'INR'], entityId: 'E017', currId: 'C002' },
  { code: 'M017', desc: 'USD Long Forward', entities: ['OAL', 'DMCC', 'OTL'], curr: ['USD', 'USD', 'USD'], entityId: 'E016', currId: 'C003' },
  { code: 'M025', desc: 'EUR Long Forward', entities: ['SEDA', 'DMCC', 'OVL'], curr: ['USD', 'USD', 'EUR'], entityId: 'E018', currId: 'C006' },
]

export const COMMODITIES: Commodity[] = [
  { code: 'C102', desc: 'WHEAT' },
  { code: 'C125', desc: 'RICE' },
  { code: 'C001', desc: 'Multi-Commodity' },
  { code: 'C110', desc: 'SOYABEAN OIL' },
  { code: 'C140', desc: 'SUGAR' },
]

/** Reference masters for the extra ALV columns (Payment Terms, Ports, audit trail). */
export const PAYMENT_TERMS: PaymentTerm[] = [
  { code: 'P01', desc: '30 days from B/L date' },
  { code: 'P05', desc: 'Advance payment' },
  { code: 'P07', desc: '60 days from B/L date' },
]

/**
 * The Master Contract tolerance %: no MAS_CON column holds it, the program reads tolerance ID T01 of ZSGTSFTR_TOLR each time
 * (as Create Master Contract does). null until it has been read, or when it could not be.
 */
export const MC_TOLERANCE: { value: number | null } = { value: null }

export const PORT_PAIRS: PortPair[] = [
  { ship: 'Any Port(s) in Vietnam or any other port(s)', dest: 'Any Port(s) in Europe or any other port(s)' },
  { ship: 'Any Port(s) in Africa, Europe or any other port(s)', dest: 'Any Port(s) in Belgium, Netherlands or any other port(s)' },
  { ship: 'Any Port(s) in India or any other port(s)', dest: 'Any Port(s) in Middle East or any other port(s)' },
  { ship: 'Any Port(s) in Thailand or any other port(s)', dest: 'Any Port(s) in China or any other port(s)' },
]

export const ENTERED_BY_USERS = ['TINAKSHAYM', 'AERAHULY']

/**
 * ZMC_STAT, as this queue actually uses it: Reject moves a contract to 11 (MO->FO: Correction
 * Required), which takes it out of MO's queue and into FO's Error Correction screen; once FO
 * corrects and resubmits, it comes back as 13 (or 22, from a Correction-after-Deal 21) for MO
 * to review again. STATUS.ERRCORR is the 13 case, the more common of the two.
 */
export const STATUS: Record<StatusKey, StatusValue> = {
  RELEASE: '02-Release to MO',
  ERRCORR: '13-FO: Error Correction - Correct',
  CONFIRMED: '03-Confirmed by MO',
  INUSE: '04-In-Use',
  REJECTED: '11-MO->FO: Correction Required',
}

/** The other code ERRCORR covers: FO's resubmission of a 21 (Correction after Deal). */
export const ERRCORR_AFTER_DEAL: StatusValue = '22-FO: Error Correction - Correct'

export const STATUS_KEY: Record<StatusValue, StatusKey> = {
  '02-Release to MO': 'RELEASE',
  '13-FO: Error Correction - Correct': 'ERRCORR',
  '22-FO: Error Correction - Correct': 'ERRCORR',
  '03-Confirmed by MO': 'CONFIRMED',
  '04-In-Use': 'INUSE',
  '11-MO->FO: Correction Required': 'REJECTED',
}

export const STATUS_SHORT: Record<StatusValue, string> = {
  '02-Release to MO': 'Release to MO',
  '13-FO: Error Correction - Correct': 'Error Correction',
  '22-FO: Error Correction - Correct': 'Error Correction',
  '03-Confirmed by MO': 'Confirmed',
  '04-In-Use': 'In Use',
  '11-MO->FO: Correction Required': 'Rejected',
}

/**
 * Who the MO actions and edits made on this screen are recorded against in dummy mode. Against
 * MySQL the signed-in user (sapUser) is written to ZCHANGED_BY and shown instead.
 */
export const MO_REVIEWER = 'MO_REVIEWER'

/** The MC Date range the pickers open with, and return to on Reset. */
export const DEFAULT_DATE_FROM = '01-01-2026'
export const DEFAULT_DATE_TO = '31-12-2026'

export const entityOf = (code: string) => ENTITIES.find((e) => e.code === code) ?? null
export const modelOf = (code: string) => FX_MODELS.find((m) => m.code === code) ?? null
export const commodityOf = (code: string) => COMMODITIES.find((c) => c.code === code) ?? null

export const MC_SEED: McSeed[] = [
  { n: 2000002729, model: 'M032', status: STATUS.ERRCORR, comm: 'C102', client: 'OSIPL_WHEAT_M032_100M', date: '01.09.2026', amtUSD: 100000000.0, exRate: 90.0, shipStartOff: 14, shipDur: 120, dealId: '', moNote: 'Shipping window overlaps an existing Master Contract on the same vessel slot - please revise.' },
  { n: 2000002728, model: 'M032', status: STATUS.ERRCORR, comm: 'C125', client: 'OSIPL_RICE_M032_0.1M', date: '22.08.2026', amtUSD: 100000.0, exRate: 95.7112, shipStartOff: 31, shipDur: 730, dealId: '', moNote: 'Commodity code does not match the description on the supporting contract - please correct.' },
  { n: 2000002727, model: 'M032', status: STATUS.ERRCORR, comm: 'C001', client: 'OSIPL_Multi-Commodity_M032_500M', date: '21.09.2026', amtUSD: 500000000.0, exRate: 90.0, shipStartOff: 25, shipDur: 460, dealId: '', moNote: 'Amount exceeds the pre-approved credit line for this entity - please confirm limit approval.' },
  { n: 2000002725, model: 'M034', status: STATUS.ERRCORR, comm: 'C001', client: 'OSIPL_Multi-Commodity_M034_33K', date: '21.09.2026', amtUSD: 33055.0, exRate: 4.0, shipStartOff: 25, shipDur: 26, dealId: '', moNote: "Exchange rate looks stale versus today's market - please re-quote and resubmit." },
  { n: 2000002724, model: 'M034', status: STATUS.ERRCORR, comm: 'C001', client: 'OSIPL_Multi-Commodity_M034_22K', date: '21.09.2026', amtUSD: 22889.0, exRate: 6.0, shipStartOff: 25, shipDur: 26, dealId: '', moNote: "Origin entity does not match the FX Model's configured entity string - please align." },
  { n: 2000002704, model: 'M025', status: STATUS.ERRCORR, comm: 'C140', client: 'OVL_SUGAR_M025_2M', date: '03.09.2026', amtUSD: 2000000.0, exRate: 0.92, shipStartOff: 60, shipDur: 90, dealId: '', moNote: 'Port of destination is not in the approved list for this trade lane - please revise.' },
  { n: 2000002715, model: 'M041', status: STATUS.RELEASE, comm: 'C001', client: 'OSIPL_Multi-Commodity_M041_10K', date: '19.09.2026', amtUSD: 10904.0, exRate: 8.0, shipStartOff: 25, shipDur: 25, dealId: '' },
  { n: 2000002714, model: 'M041', status: STATUS.RELEASE, comm: 'C001', client: 'OSIPL_Multi-Commodity_M041_25K', date: '19.09.2026', amtUSD: 25021.0, exRate: 9.0, shipStartOff: 25, shipDur: 25, dealId: '' },
  { n: 2000002713, model: 'M041', status: STATUS.RELEASE, comm: 'C001', client: 'OSIPL_Multi-Commodity_M041_48K', date: '19.09.2026', amtUSD: 48524.0, exRate: 9.0, shipStartOff: 25, shipDur: 25, dealId: '' },
  { n: 2000002706, model: 'M017', status: STATUS.RELEASE, comm: 'C110', client: 'OTL_SOYABEANOIL_M017_5M', date: '05.09.2026', amtUSD: 5000000.0, exRate: 1.0, shipStartOff: 40, shipDur: 55, dealId: '' },
]

// The seed contracts are built from the dummy masters as they were, not from whatever the
// lists hold after MySQL's rows are swapped in: M021 or C140 are not in MySQL.
const SEED_FX_MODELS = [...FX_MODELS]
const SEED_COMMODITIES = [...COMMODITIES]
const SEED_PAYMENT_TERMS = [...PAYMENT_TERMS]

/** Expands MC_SEED into full rows, filling the derived and audit columns as the page did. */
export function seedContracts(): MasterContract[] {
  const list = MC_SEED.map((s, i): MasterContract => {
    const m = SEED_FX_MODELS.find((x) => x.code === s.model)
    const comm = SEED_COMMODITIES.find((c) => c.code === s.comm)
    const pt = SEED_PAYMENT_TERMS[i % SEED_PAYMENT_TERMS.length]
    const ports = PORT_PAIRS[i % PORT_PAIRS.length]
    const enteredBy = ENTERED_BY_USERS[i % ENTERED_BY_USERS.length]
    if (!m || !comm || !pt || !ports || !enteredBy) throw new Error(`seed contract ${s.n} references unknown master data`)

    const origin = m.entities[m.entities.length - 1] ?? ''
    const mcDate = parseSeedDate(s.date)
    const shipStart = addDays(mcDate, s.shipStartOff)
    const shipEnd = addDays(shipStart, s.shipDur)
    const entryTime = [8 + (i % 14), (i * 7) % 60, (i * 13) % 60].map((v) => String(v).padStart(2, '0')).join(':')

    return {
      mcNumber: s.n,
      mcReference: `MC/${origin}/2026/${String(s.n).slice(-3)}`,
      dealId: s.dealId,
      fxModel: s.model,
      modelDesc: m.desc,
      entities: m.entities,
      entityId: m.entityId,
      currChain: m.curr,
      currId: m.currId,
      status: s.status,
      mcDescription: s.client,
      mcDate,
      originEntity: origin,
      commodityCode: s.comm,
      commodityDesc: comm.desc,
      amtUSD: s.amtUSD,
      amtOrigin: s.amtUSD * s.exRate,
      currOrigin: m.curr[m.curr.length - 1] ?? '',
      exRate: s.exRate,
      shipStart,
      shipEnd,
      balUSD: s.amtUSD,
      utilizedAmt: 0,
      paymentTerms: pt.code,
      paymentDate: addDays(shipEnd, 30),
      portOfShipment: ports.ship,
      portOfDestination: ports.dest,
      moRemarks: s.moNote ?? '',
      foRemarks: '',
      enteredBy,
      enteredOn: addDays(mcDate, -((i * 3) % 6)),
      entryTime,
      changedBy: '',
      changedOn: null,
    }
  })

  // Seeded Error Correction rows already carry a reason (moNote) — back-fill who sent them
  // back and when, so the audit trail looks realistic without waiting for a live action.
  list
    .filter((mc) => mc.status === STATUS.ERRCORR)
    .forEach((mc, idx) => {
      mc.changedBy = idx % 2 === 0 ? 'TINAKSHAYM' : 'AERAHULY'
      mc.changedOn = addDays(mc.mcDate, 2 + idx)
    })

  return list
}

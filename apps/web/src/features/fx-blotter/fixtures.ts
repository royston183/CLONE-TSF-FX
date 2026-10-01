/**
 * TEST FIXTURES ONLY — not imported by the running screen.
 *
 * The entity, profit centre, business area, FX model, commodity and Master Contract lists used
 * to be hard-coded in data.ts; the blotter now loads them from the middleware before it opens.
 * These are the values that used to be there, kept so the business-rule tests (Auto Deal,
 * pair / tolerance checks, Release, Upload) keep running against the same data they always
 * did. `installFixtures()` puts them into the live lists the way the loader does.
 */
import { COMMODITIES, ENTITIES, FX_MODELS, PROFIT_CENTERS, BUSINESS_AREAS } from './data.ts'
import type { CodeDesc, CodeLabel, Entity, FxModel, McSeed } from './types.ts'

export const ENTITIES_FIXTURE: Entity[] = [
  { code: 'OGA', cocode: 'SG03', name: 'Olam Global Agri Pte. Ltd', currency: 'USD', defaultProfitCenter: 'TSF-FX', businessArea: 'SINGAPORE' },
  { code: 'OGAT', cocode: 'SG39', name: 'Olam Global Agri Treasury', currency: 'USD', defaultProfitCenter: 'TSF-FX', businessArea: 'SINGAPORE' },
  { code: 'DMCC', cocode: 'AE13', name: 'Olam International DMCC', currency: 'USD', defaultProfitCenter: 'TSF-FX', businessArea: 'OLAM INTERNATIONAL DMCC' },
  { code: 'OSIPL', cocode: 'IN11', name: 'Olam Agri India Pvt Ltd', currency: 'INR', defaultProfitCenter: 'TSF-FX', businessArea: 'OLAM AGRI INDIA PRIVATE LIMITED' },
  { code: 'OTL', cocode: 'TH10', name: 'Olam (Thailand) Ltd', currency: 'THB', defaultProfitCenter: 'FX', businessArea: 'OLAM (THAILAND) LIMITED' },
  { code: 'OVL', cocode: 'VN10', name: 'Olam Vietnam Limited', currency: 'VND', defaultProfitCenter: 'TSF-FX', businessArea: 'OLAM VIETNAM LIMITED' },
  { code: 'OAL', cocode: 'US40', name: 'Olam Global Agri Americas', currency: 'USD', defaultProfitCenter: 'FX', businessArea: 'OLAM GLOBAL AGRI AMERICAS LLC' },
  { code: 'SEDA', cocode: 'ES12', name: 'SEDA OUTSPAN IBERIA S.L.U', currency: 'EUR', defaultProfitCenter: 'TSF-FX', businessArea: 'PANASIA INTERNATIONAL FZCO' },
]

export const PROFIT_CENTERS_FIXTURE: CodeLabel[] = [
  { code: 'TSF-FX', label: 'TSF-FX' },
  { code: 'TSF - FX', label: 'TSF - FX' },
  { code: 'FX', label: 'FX' },
]

export const BUSINESS_AREAS_FIXTURE: CodeLabel[] = [
  { code: 'OLAM AGRI INDIA PRIVATE LIMITED', label: 'OLAM AGRI INDIA PRIVATE LIMITED' },
  { code: 'OLAM VIETNAM LIMITED', label: 'OLAM VIETNAM LIMITED' },
  { code: 'OLAM (THAILAND) LIMITED', label: 'OLAM (THAILAND) LIMITED' },
  { code: 'PANASIA INTERNATIONAL FZCO', label: 'PANASIA INTERNATIONAL FZCO' },
  { code: 'OLAM INTERNATIONAL DMCC', label: 'OLAM INTERNATIONAL DMCC' },
  { code: 'OLAM GLOBAL AGRI AMERICAS LLC', label: 'OLAM GLOBAL AGRI AMERICAS LLC' },
  { code: 'SINGAPORE', label: 'SINGAPORE' },
  { code: 'OLAM OUTSPAN TSF', label: 'Olam Outspan TSF' },
  { code: 'HCMC HEAD OFFICE', label: 'HCMC Head Office' },
  { code: 'KAMOLKHI - THAILAND', label: 'Kamolkhi - Thailand' },
]

/** Tolerances default to 5% and 5 days where the original's model list left them out. */
export const FX_MODELS_FIXTURE: FxModel[] = [
  { code: 'M017', desc: 'USD Long Forward', entities: ['OAL', 'DMCC', 'OTL'], pair: 'USD/THB', d1: { from: 'OAL', to: 'DMCC', bs1: 'S', bs2: 'B' }, d2: { from: 'DMCC', to: 'OTL', bs1: 'S', bs2: 'B' }, spreadBp: 35, tolerancePct: 5, valueDateToleranceDays: 5 },
  { code: 'M021', desc: 'INR Long Forward', entities: ['OGA', 'DMCC', 'OSIPL'], pair: 'USD/INR', d1: { from: 'OGA', to: 'DMCC', bs1: 'S', bs2: 'B' }, d2: { from: 'DMCC', to: 'OSIPL', bs1: 'S', bs2: 'B' }, spreadBp: 28, tolerancePct: 5, valueDateToleranceDays: 5 },
  { code: 'M025', desc: 'EUR Long Forward', entities: ['SEDA', 'DMCC', 'OVL'], pair: 'USD/EUR', d1: { from: 'SEDA', to: 'DMCC', bs1: 'S', bs2: 'B' }, d2: { from: 'DMCC', to: 'OVL', bs1: 'S', bs2: 'B' }, spreadBp: 22, tolerancePct: 5, valueDateToleranceDays: 5 },
  { code: 'M032', desc: 'INR Long Forward (Alt)', entities: ['OGA', 'DMCC', 'OSIPL'], pair: 'USD/INR', d1: { from: 'OGA', to: 'DMCC', bs1: 'S', bs2: 'B' }, d2: { from: 'DMCC', to: 'OSIPL', bs1: 'S', bs2: 'B' }, spreadBp: 30, tolerancePct: 5, valueDateToleranceDays: 5 },
  { code: 'M034', desc: 'INR-INR Staggered Option', entities: ['OGA', 'DMCC', 'OSIPL'], pair: 'USD/INR', d1: { from: 'OGA', to: 'DMCC', bs1: 'S', bs2: 'B' }, d2: { from: 'DMCC', to: 'OSIPL', bs1: 'S', bs2: 'B' }, spreadBp: 40, tolerancePct: 5, valueDateToleranceDays: 5 },
  { code: 'M041', desc: 'INR Short Forward', entities: ['OGAT', 'DMCC', 'OSIPL'], pair: 'USD/INR', d1: { from: 'OGAT', to: 'DMCC', bs1: 'B', bs2: 'S' }, d2: { from: 'DMCC', to: 'OSIPL', bs1: 'B', bs2: 'S' }, spreadBp: 25, tolerancePct: 5, valueDateToleranceDays: 5 },
  { code: 'M052', desc: 'VND Long Forward', entities: ['OGA', 'DMCC', 'OVL'], pair: 'USD/VND', d1: { from: 'OGA', to: 'DMCC', bs1: 'S', bs2: 'B' }, d2: { from: 'DMCC', to: 'OVL', bs1: 'S', bs2: 'B' }, spreadBp: 45, tolerancePct: 5, valueDateToleranceDays: 5 },
  { code: 'M061', desc: 'IDR Long Forward', entities: ['OGA', 'DMCC', 'OTL'], pair: 'USD/IDR', d1: { from: 'OGA', to: 'DMCC', bs1: 'S', bs2: 'B' }, d2: { from: 'DMCC', to: 'OTL', bs1: 'S', bs2: 'B' }, spreadBp: 50, tolerancePct: 5, valueDateToleranceDays: 5 },
  { code: 'M070', desc: 'TWD Short Straddle', entities: ['OGA', 'DMCC', 'OTL'], pair: 'USD/TWD', d1: { from: 'OGA', to: 'DMCC', bs1: 'S', bs2: 'B' }, d2: { from: 'DMCC', to: 'OTL', bs1: 'S', bs2: 'B' }, spreadBp: 38, ssEligible: true, tolerancePct: 5, valueDateToleranceDays: 5 },
  { code: 'M081', desc: 'THB Long Forward', entities: ['OAL', 'DMCC', 'OSIPL'], pair: 'USD/THB', d1: { from: 'OAL', to: 'DMCC', bs1: 'S', bs2: 'B' }, d2: { from: 'DMCC', to: 'OSIPL', bs1: 'S', bs2: 'B' }, spreadBp: 33, tolerancePct: 5, valueDateToleranceDays: 5 },
]

export const COMMODITIES_FIXTURE: CodeDesc[] = [
  { code: 'C110', desc: 'Soyabean Oil' },
  { code: 'C102', desc: 'Wheat' },
  { code: 'C125', desc: 'Rice' },
  { code: 'C140', desc: 'Sugar' },
]

/** Seed Master Contracts; ship dates are offsets in days from the day the page opens. */
export const MC_SEED_FIXTURE: McSeed[] = [
  { n: 'MC-7001', model: 'M021', comm: 'C110', desc: '5,000 MT Soyabean Oil - OSIPL', amtUSD: 5000000, shipStartOff: 20, shipDur: 90, group: 'G02' },
  { n: 'MC-7014', model: 'M017', comm: 'C102', desc: 'Wheat Financing - OTL', amtUSD: 8000000, shipStartOff: 15, shipDur: 60, group: 'G03' },
  { n: 'MC-7028', model: 'M052', comm: 'C125', desc: 'Rice Financing - OVL', amtUSD: 3000000, shipStartOff: 10, shipDur: 75, group: 'G03' },
  { n: 'MC-7033', model: 'M025', comm: 'C140', desc: 'Sugar Financing - OVL(EUR)', amtUSD: 4500000, shipStartOff: 25, shipDur: 100, group: 'G03' },
  { n: 'MC-7041', model: 'M041', comm: 'C110', desc: 'Soyabean Oil Short Fwd - OSIPL', amtUSD: 2500000, shipStartOff: 5, shipDur: 45, group: 'G02' },
  { n: 'MC-7052', model: 'M070', comm: 'C102', desc: 'TWD Straddle - OTL', amtUSD: 6000000, shipStartOff: 12, shipDur: 80, group: 'G03' },
]

const swap = <T>(list: T[], rows: readonly T[]): void => void list.splice(0, list.length, ...rows)

/** Installs the fixtures into the live lists; call once at the top of a test file. */
export function installFixtures(): void {
  swap(ENTITIES, ENTITIES_FIXTURE)
  swap(PROFIT_CENTERS, PROFIT_CENTERS_FIXTURE)
  swap(BUSINESS_AREAS, BUSINESS_AREAS_FIXTURE)
  swap(FX_MODELS, FX_MODELS_FIXTURE)
  swap(COMMODITIES, COMMODITIES_FIXTURE)
}

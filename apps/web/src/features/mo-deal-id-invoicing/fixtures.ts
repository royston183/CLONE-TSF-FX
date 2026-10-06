/**
 * Test fixtures only — imported by the *.test.ts files, never by the screen. The legacy
 * page's dummy masters and buildDeals(); the live masters are in data.ts.
 */
import type { Deal, Entity, FxModel } from './types.ts'

export const SEED_ENTITIES: Record<string, Entity> = {
  AMBER: { code: 'AMBER', cocode: 'KY10', name: 'Amber Foods Limited' },
  DMCC: { code: 'DMCC', cocode: 'AE13', name: 'Olam International DMCC' },
  OAL: { code: 'OAL', cocode: 'US40', name: 'Olam Global Agri Americas' },
  OGA: { code: 'OGA', cocode: 'SG03', name: 'Olam Global Agri Pte. Ltd' },
  OGAT: { code: 'OGAT', cocode: 'SG39', name: 'Olam Global Agri Treasury' },
  OSIPL: { code: 'OSIPL', cocode: 'IN11', name: 'Olam Agri India Pvt Ltd' },
  OSL: { code: 'OSL', cocode: 'CN10', name: 'Olam Shanghai Limited' },
  OTL: { code: 'OTL', cocode: 'TH10', name: 'Olam (Thailand) Ltd' },
  OVL: { code: 'OVL', cocode: 'VN10', name: 'Olam Vietnam Limited' },
  SEDA: { code: 'SEDA', cocode: 'ES12', name: 'SEDA OUTSPAN IBERIA S.L.U' },
}

export const SEED_REGIONS: Record<string, string> = {
  R01: 'South-East Asia',
  R03: 'United States of America',
  R04: 'Middle East & Africa',
  R05: 'Europe',
}

export const SEED_FX_MODELS: Record<string, FxModel> = {
  M021: { code: 'M021', desc: 'INR Long Forward', entities: ['OGA', 'DMCC', 'OSIPL'], curr: ['USD', 'USD', 'INR'], region: 'R01' },
  M017: { code: 'M017', desc: 'USD Long Forward', entities: ['OAL', 'DMCC', 'OTL'], curr: ['USD', 'USD', 'USD'], region: 'R03' },
  M025: { code: 'M025', desc: 'EUR Long Forward', entities: ['SEDA', 'DMCC', 'OVL'], curr: ['USD', 'USD', 'EUR'], region: 'R05' },
  M041: { code: 'M041', desc: 'INR Short Forward', entities: ['OGAT', 'DMCC', 'OSIPL'], curr: ['USD', 'USD', 'INR'], region: 'R01' },
}

export const SEED_STATUS_META: Record<string, { label: string; cls: string }> = {
  '04': { label: 'Booked – Pending Invoice', cls: 'st-booked' },
  '07': { label: 'Partial Invoice Created', cls: 'st-partial' },
  '05': { label: 'Confirmed – Fully Invoiced', cls: 'st-confirmed' },
}

export const SEED_TRADERS: Record<string, string> = { JSM: 'James Miller', RKN: 'Ravi Kannan', ATL: 'Anna Tan' }


/** Four Deal IDs spanning Booked, Partial and Fully Invoiced, one with no BL attached yet. */
export function buildDeals(): Deal[] {
  return [
    {
      dealId: 'TSF-9081',
      dealDesc: 'OSIPL Soyabean Oil Long Fwd',
      mcRef: 'MC-7001',
      mcDesc: 'OSIPL_SOYABEANOIL_M021_5M',
      mcDate: '03-08-2026',
      shipStart: '10-09-2026',
      shipEnd: '25-09-2026',
      model: 'M021',
      commodity: 'Soyabean Oil (C110)',
      trader: 'JSM',
      dealStart: '03-08-2026',
      dealEnd: '25-09-2026',
      dealStat: '04',
      mcAmtUsd: 5000000,
      fx: [
        { type: 'D1', bukrs: 'SG03', rfha: '5000123456', curr1: 'USD', curr2: 'INR', amt1: 5000000, amt2: -415250000, bp: 'OSIPL0001', bpName: 'Olam Agri India Pvt Ltd', rate: 83.05 },
        { type: 'D2', bukrs: 'AE13', rfha: '5000123457', curr1: 'USD', curr2: 'USD', amt1: -5000000, amt2: 5010000, bp: 'DMCC0002', bpName: 'Olam International DMCC', rate: 1.002 },
      ],
      inv: [
        { ttype: 'T1', ref: 'TSF-9081-T1', seller: 'OGA', buyer: 'DMCC', qty: 5000, usdPrice: 1000.0, dueDate: '25-09-2026', invDate: '', invNo: '', marked: false, invoiced: false, hb: '', acct: '', ptnr: '' },
        { ttype: 'T2', ref: 'TSF-9081-T2', seller: 'DMCC', buyer: 'DMCC', qty: 5000, usdPrice: 1002.0, dueDate: '25-09-2026', invDate: '', invNo: '', marked: false, invoiced: false, hb: '', acct: '', ptnr: '' },
        { ttype: 'T3', ref: 'TSF-9081-T3', seller: 'DMCC', buyer: 'OSIPL', qty: 5000, usdPrice: 1002.0, dueDate: '25-09-2026', invDate: '', invNo: '', marked: false, invoiced: false, hb: '', acct: '', ptnr: '' },
      ],
      bls: [{ blNo: 'BL-2026-04471', vessel: 'MV Pacific Star', loadPort: 'Bangkok, TH', dischargePort: 'Chennai, IN', shipDate: '11-09-2026', qty: 5000, status: 'Attached' }],
    },
    {
      dealId: 'TSF-9042',
      dealDesc: 'OTL Wheat Long Fwd',
      mcRef: 'MC-6899',
      mcDesc: 'OTL_WHEAT_M017_3.2M',
      mcDate: '14-06-2026',
      shipStart: '01-07-2026',
      shipEnd: '20-07-2026',
      model: 'M017',
      commodity: 'Wheat (C102)',
      trader: 'RKN',
      dealStart: '14-06-2026',
      dealEnd: '20-07-2026',
      dealStat: '07',
      mcAmtUsd: 3200000,
      fx: [
        { type: 'D1', bukrs: 'US40', rfha: '5000119832', curr1: 'USD', curr2: 'USD', amt1: 3200000, amt2: -3200000, bp: 'OAL0007', bpName: 'Olam Global Agri Americas', rate: 1.0 },
        { type: 'D2', bukrs: 'AE13', rfha: '5000119833', curr1: 'USD', curr2: 'USD', amt1: -3200000, amt2: 3206400, bp: 'DMCC0002', bpName: 'Olam International DMCC', rate: 1.002 },
      ],
      inv: [
        { ttype: 'T1', ref: 'TSF-9042-T1', seller: 'OAL', buyer: 'DMCC', qty: 3200, usdPrice: 1000.0, dueDate: '20-07-2026', invDate: '18-07-2026', invNo: 'IF-000512', marked: true, invoiced: true, hb: 'HB01', acct: 'AC01', ptnr: 'P001' },
        { ttype: 'T2', ref: 'TSF-9042-T2', seller: 'DMCC', buyer: 'DMCC', qty: 3200, usdPrice: 1002.0, dueDate: '20-07-2026', invDate: '18-07-2026', invNo: 'IF-000513', marked: true, invoiced: true, hb: 'HB01', acct: 'AC01', ptnr: 'P001' },
        { ttype: 'T3', ref: 'TSF-9042-T3', seller: 'DMCC', buyer: 'OTL', qty: 3200, usdPrice: 1002.0, dueDate: '20-07-2026', invDate: '', invNo: '', marked: false, invoiced: false, hb: '', acct: '', ptnr: '' },
      ],
      bls: [{ blNo: 'BL-2026-03310', vessel: 'MV Golden Horizon', loadPort: 'Houston, US', dischargePort: 'Laem Chabang, TH', shipDate: '03-07-2026', qty: 3200, status: 'Attached' }],
    },
    {
      dealId: 'TSF-8890',
      dealDesc: 'OVL Sugar Long Fwd (EUR)',
      mcRef: 'MC-6650',
      mcDesc: 'OVL_SUGAR_M025_2M',
      mcDate: '02-05-2026',
      shipStart: '20-05-2026',
      shipEnd: '10-06-2026',
      model: 'M025',
      commodity: 'Refined Sugar (C140)',
      trader: 'ATL',
      dealStart: '02-05-2026',
      dealEnd: '10-06-2026',
      dealStat: '05',
      mcAmtUsd: 2000000,
      fx: [
        { type: 'D1', bukrs: 'ES12', rfha: '5000108821', curr1: 'USD', curr2: 'EUR', amt1: 2000000, amt2: -1840000, bp: 'SEDA0004', bpName: 'SEDA OUTSPAN IBERIA S.L.U', rate: 0.92 },
        { type: 'D2', bukrs: 'AE13', rfha: '5000108822', curr1: 'USD', curr2: 'USD', amt1: -2000000, amt2: 2004000, bp: 'DMCC0002', bpName: 'Olam International DMCC', rate: 1.002 },
      ],
      inv: [
        { ttype: 'T1', ref: 'TSF-8890-T1', seller: 'SEDA', buyer: 'DMCC', qty: 20000, usdPrice: 100.0, dueDate: '10-06-2026', invDate: '09-06-2026', invNo: 'IF-000488', marked: true, invoiced: true, hb: 'HB02', acct: 'AC03', ptnr: 'P002' },
        { ttype: 'T2', ref: 'TSF-8890-T2', seller: 'DMCC', buyer: 'DMCC', qty: 20000, usdPrice: 100.2, dueDate: '10-06-2026', invDate: '09-06-2026', invNo: 'IF-000489', marked: true, invoiced: true, hb: 'HB02', acct: 'AC03', ptnr: 'P002' },
        { ttype: 'T3', ref: 'TSF-8890-T3', seller: 'DMCC', buyer: 'OVL', qty: 20000, usdPrice: 100.2, dueDate: '10-06-2026', invDate: '09-06-2026', invNo: 'IF-000490', marked: true, invoiced: true, hb: 'HB02', acct: 'AC03', ptnr: 'P002' },
      ],
      bls: [{ blNo: 'BL-2026-02207', vessel: 'MV Atlantic Trader', loadPort: 'Valencia, ES', dischargePort: 'Haiphong, VN', shipDate: '22-05-2026', qty: 20000, status: 'Attached' }],
    },
    {
      dealId: 'TSF-9105',
      dealDesc: 'OSIPL Basmati Rice Short Fwd',
      mcRef: 'MC-7042',
      mcDesc: 'OSIPL_RICE_M041_1.1M',
      mcDate: '20-09-2026',
      shipStart: '05-11-2026',
      shipEnd: '25-11-2026',
      model: 'M041',
      commodity: 'Basmati Rice (C125)',
      trader: 'JSM',
      dealStart: '20-09-2026',
      dealEnd: '25-11-2026',
      dealStat: '04',
      mcAmtUsd: 1100000,
      fx: [
        { type: 'D1', bukrs: 'SG39', rfha: '5000131209', curr1: 'USD', curr2: 'INR', amt1: 1100000, amt2: -91355000, bp: 'OSIPL0001', bpName: 'Olam Agri India Pvt Ltd', rate: 83.05 },
        { type: 'D2', bukrs: 'AE13', rfha: '5000131210', curr1: 'USD', curr2: 'USD', amt1: -1100000, amt2: 1102200, bp: 'DMCC0002', bpName: 'Olam International DMCC', rate: 1.002 },
      ],
      inv: [
        { ttype: 'T1', ref: 'TSF-9105-T1', seller: 'OGAT', buyer: 'DMCC', qty: 1100, usdPrice: 1000.0, dueDate: '25-11-2026', invDate: '', invNo: '', marked: false, invoiced: false, hb: '', acct: '', ptnr: '' },
        { ttype: 'T2', ref: 'TSF-9105-T2', seller: 'DMCC', buyer: 'DMCC', qty: 1100, usdPrice: 1002.0, dueDate: '25-11-2026', invDate: '', invNo: '', marked: false, invoiced: false, hb: '', acct: '', ptnr: '' },
        { ttype: 'T3', ref: 'TSF-9105-T3', seller: 'DMCC', buyer: 'OSIPL', qty: 1100, usdPrice: 1002.0, dueDate: '25-11-2026', invDate: '', invNo: '', marked: false, invoiced: false, hb: '', acct: '', ptnr: '' },
      ],
      bls: [],
    },
  ]
}

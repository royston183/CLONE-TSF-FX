/*
 * TEST FIXTURES ONLY — the legacy page's dummy data (legacy/trader-workbench.html), kept so
 * logic.test.ts can pin the ported rules to the same cases. The screen never imports this
 * file: it reads SAP through api.ts.
 */
import { mkTxn } from './data.ts'
import type { AppData, Deal, InSpot, Lookups, Txn } from './types.ts'

/** The legacy demo user's authorised company codes (F_BKPF_BUK). */
export const DEMO_USER = {
  name: 'Demo Trader',
  /* AUTHORITY-CHECK F_BKPF_BUK / ACTVT 03 — SG10 is intentionally not authorised */
  authorizedCompanyCodes: ['IN11', 'TH10', 'VN10', 'AE10'] as readonly string[],
}

export const FIXTURE_LOOKUPS: Lookups = {
  /* entity -> company code (reuses the entities from Create Master Contract) */
  companies: [
    { code: 'IN11', name: 'Olam Agri India Pvt Ltd', entity: 'OSIPL' },
    { code: 'TH10', name: 'Olam (Thailand) Ltd', entity: 'OTL' },
    { code: 'VN10', name: 'Olam Vietnam Limited', entity: 'OVL' },
    { code: 'SG10', name: 'Olam Global Agri Pte Ltd', entity: 'OGA' },
    { code: 'AE10', name: 'Olam DMCC', entity: 'DMCC' },
  ],
  /* FX models (reused from Create Master Contract) */
  models: [
    { id: 'M032', desc: 'INR Long Forward' },
    { id: 'M033', desc: 'INR-INR-INR Forward' },
    { id: 'M034', desc: 'INR – INR Staggered Call & Put Option' },
    { id: 'M035', desc: 'INR-INR-Put & Call Option' },
    { id: 'M036', desc: 'USD-INR-INR-Put & Call Option' },
    { id: 'M037', desc: 'INR Short Forward' },
    { id: 'M041', desc: 'INR – INR Staggered Call & Put Option' },
  ],
  /* ZSGTSFTR_DEAL_ST (sub type FX1) — descriptions are dummy */
  dealStatus: [
    { code: '10', desc: 'New', cls: 'status-text-confirmed', closed: false },
    { code: '20', desc: 'In Progress', cls: 'status-text-pending', closed: false },
    { code: '25', desc: 'Partially Settled', cls: 'status-text-matured', closed: false },
    { code: '30', desc: 'Cancelled', cls: 'status-text-rejected', closed: false },
    { code: '40', desc: 'Settled', cls: 'status-text-in-use', closed: true },
  ],
  /* txn_status (VTBFHA) — "open" = code <= 07, per COLOR_DETAILS / COLOR_CODE_ACTION_ITEMS */
  txnStatus: {
    '03': { desc: 'Entered', cls: 'status-text-draft' },
    '05': { desc: 'Confirmed', cls: 'status-text-confirmed' },
    '07': { desc: 'Validated', cls: 'status-text-confirmed' },
    '10': { desc: 'NDF Fixed', cls: 'status-text-matured' },
    '24': { desc: 'Exercised', cls: 'status-text-in-use' },
    '30': { desc: 'Settled', cls: 'status-text-settled' },
    '34': { desc: 'Expired', cls: 'status-text-pending' },
  },
  /* sfhaart (transaction type) descriptions — dummy */
  txnTypes: {
    '604': 'FX Spot (Exercise)',
    '605': 'FX Spot (Expiry)',
    '609': 'FX Spot',
    '619': 'FX Forward',
    '631': 'NDF',
    '632': 'DNDF',
    '643': 'FX Option (SS Put)',
    '645': 'FX Option',
    '646': 'FX Option (SS Call)',
    '647': 'FX Option (Sell)',
    '648': 'FX Option (Pay)',
  },
  /* Business partners grouped by ZGRP (ZSGTRMTR_BP_GRP + ZSGTRMTR_BPEXT) */
  bps: [
    { bp: '1000124', name: 'HSBC', grp: 'G1' },
    { bp: '1000131', name: 'Citi', grp: 'G1' },
    { bp: '1000147', name: 'Standard Chartered', grp: 'G1' },
    { bp: '1000152', name: 'JPMorgan', grp: 'G2' },
    { bp: '1000168', name: 'Deutsche Bank', grp: 'G2' },
    { bp: '1000124', name: 'HSBC', grp: 'G2' },
  ],
  /* Action item texts — ZSGTSFTR_TRDWAI (dummy). code 01 = normal, 02 = expired, 03 = short straddle */
  actionTexts: [
    { sf: '619', code: '01', text: 'Create settlement spot for invoice difference' },
    { sf: '619', code: '03', text: 'Create opposite spot for forward' },
    { sf: '604', code: '01', text: 'Create settlement spot for invoice difference' },
    { sf: '631', code: '01', text: 'Update NDF fixing rate' },
    { sf: '632', code: '01', text: 'Update DNDF fixing rate' },
    { sf: '643', code: '01', text: 'Exercise or expire the option' },
    { sf: '643', code: '02', text: 'Option expired – create settlement spot' },
    { sf: '643', code: '03', text: 'Exercise or expire the straddle leg' },
    { sf: '645', code: '01', text: 'Exercise or expire the option' },
    { sf: '645', code: '02', text: 'Option expired – create settlement spot' },
    { sf: '645', code: '03', text: 'Exercise or expire the straddle leg' },
    { sf: '646', code: '01', text: 'Exercise or expire the option' },
    { sf: '646', code: '02', text: 'Option expired – create settlement spot' },
    { sf: '646', code: '03', text: 'Exercise or expire the straddle leg' },
    { sf: '647', code: '01', text: 'Exercise or expire the option' },
    { sf: '647', code: '02', text: 'Option expired – create settlement spot' },
    { sf: '648', code: '01', text: 'Exercise or expire the option' },
    { sf: '648', code: '02', text: 'Option expired – create settlement spot' },
  ],
  /* ZSGTSFTR_RULE_BT: model -> sub type (deal type DS1 actions are removed for FX1) */
  ruleBt: { M041: 'FX1' },
  /* TCURF (kurst MTM) conversion factors, keyed "from>to" */
  tcurf: {
    'VND>USD': { ffact: 100, tfact: 1 },
    'IDR>USD': { ffact: 100, tfact: 1 },
    'TWD>USD': { ffact: 1, tfact: 1 },
  },
  /* TCURR kurst 'M' (market) — first row with date >= expiry date is used */
  marketRates: {
    'USD-INR': [
      { d: '2026-10-20', r: 91.25 },
      { d: '2026-10-27', r: 94.1 },
      { d: '2026-11-10', r: 90.75 },
      { d: '2026-11-24', r: 92.4 },
    ],
    'USD-VND': [{ d: '2026-09-01', r: 25300 }],
    'USD-SGD': [{ d: '2026-09-01', r: 1.32 }],
  },
  /* TCURR kurst 'RBI' — exact fixing date for pair USD:INR */
  rbiRates: { '2026-10-12': 95.8425, '2026-10-06': 95.221 },
  /* ZSGTSFTR_SS_SPOT for the straddle model M036: the legacy Put/Call map, per option side */
  ssSpot: ['01', '02'].flatMap((opBs) => [
    { model: 'M036', opBs, pc: '1', bs1: 'Buy', curr1: 'USD', bs2: 'Sell', curr2: 'INR' },
    { model: 'M036', opBs, pc: '2', bs1: 'Sell', curr1: 'USD', bs2: 'Buy', curr2: 'INR' },
  ]),
  /* Lead currency ranking used by ZSGTRMFM_LEAD_CURR (assumption: market convention) */
  leadRank: ['EUR', 'GBP', 'AUD', 'NZD', 'USD'],
}

/* ---- deals (ZSGTSFTR_DEALID + master contract join) ---- */
type DealOpts = Partial<Pick<Deal, 'type' | 'trader' | 'region' | 'dealRef' | 'fxInvModel' | 'pl' | 'plCurr' | 'plRate' | 'plLocal' | 'plLCurr' | 'mcCurr' | 'dealCurr'>>
function mkDeal(
  id: string,
  desc: string,
  model: string,
  status: string,
  ss: boolean,
  origin: string,
  mcRef: string,
  mcDate: string,
  mcAmt: number,
  start: string,
  end: string,
  o: DealOpts = {},
): Deal {
  return {
    id,
    type: o.type || 'Hedge',
    subType: 'FX1',
    desc,
    model,
    status,
    ss: ss ? 'X' : '',
    origin,
    mcRef,
    mcDate,
    mcAmt,
    mcAmtCurr: o.mcCurr || 'INR',
    start,
    end,
    trader: o.trader || 'TRD01',
    region: o.region || 'IN',
    dealRef: o.dealRef || '',
    fxInvModel: o.fxInvModel || model,
    pl: o.pl || 0,
    plCurr: o.plCurr || 'USD',
    plRate: o.plRate || 0,
    plLocal: o.plLocal || 0,
    plLCurr: o.plLCurr || 'INR',
    mcCurr: o.mcCurr || 'INR',
    dealCurr: o.dealCurr || 'USD',
  }
}

// prettier-ignore
export const SEED_DEALS: readonly Deal[] = [
  mkDeal('DL26000101','OSIPL_RICE_M032_2.0M','M032','20',false,'OSIPL','2000002728','2026-08-22',100000000,'2026-09-22','2026-10-15',{dealRef:'FWD-0926-01',pl:12450.5,plRate:95.7112,plLocal:1191674.9}),
  mkDeal('DL26000102','OSIPL_Multi-Commodity_M034_0.5M','M034','20',false,'OSIPL','2000002725','2026-09-21',22889,'2026-09-21','2026-10-28',{dealRef:'OPT-0926-02',pl:-3200,plRate:91.25,plLocal:-291999.9}),
  mkDeal('DL26000103','OSIPL_Multi-Commodity_M035_1.0M','M035','10',false,'OSIPL','2000002691','2026-09-15',500000000,'2026-09-15','2026-11-02',{dealRef:'OPT-0926-03'}),
  mkDeal('DL26000104','OSIPL_Multi-Commodity_M036_SS','M036','20',true,'OSIPL','2000002702','2026-09-19',12450,'2026-09-19','2026-11-12',{dealRef:'SS-0926-04',region:'IN'}),
  mkDeal('DL26000105','OSIPL_CORN_M037_NDF','M037','20',false,'OSIPL','2000002717','2026-09-19',44758,'2026-09-19','2026-10-14',{dealRef:'NDF-0926-05'}),
  mkDeal('DL26000106','OVL_RICE_M033_DNDF','M033','20',false,'OVL','2000002689','2026-08-24',22756,'2026-09-01','2026-10-16',{dealRef:'DNDF-0926-06',region:'VN',mcCurr:'VND'}),
  mkDeal('DL26000107','OSIPL_Multi-Commodity_M041_0.3M','M041','25',false,'OSIPL','2000002724','2026-09-21',48602,'2026-09-21','2026-10-22',{dealRef:'OPT-0926-07',pl:5120,plRate:92.1,plLocal:471552}),
  mkDeal('DL26000108','OSIPL_Multi-Commodity_M034_NDF','M034','25',false,'OSIPL','2000002719','2026-09-19',16763,'2026-09-19','2026-10-09',{dealRef:'NDF-0926-08',pl:820,plRate:95.2,plLocal:78064}),
  mkDeal('DL26000109','OSIPL_WHEAT_M032_1.5M','M032','40',false,'OSIPL','2000002727','2026-09-21',500000000,'2026-09-01','2026-10-05',{dealRef:'FWD-0926-09',pl:18200,plRate:94.8,plLocal:1725360}),
  mkDeal('DL26000110','OSIPL_Multi-Commodity_M035_0.2M','M035','25',false,'OSIPL','2000002709','2026-09-19',28838,'2026-09-12','2026-10-07',{dealRef:'OPT-0926-10'}),
  mkDeal('DL26000111','OSIPL_Multi-Commodity_M036_SS_OLD','M036','25',true,'OSIPL','2000002698','2026-07-30',9800,'2026-07-30','2026-08-15',{dealRef:'SS-0726-11'}),
  mkDeal('DL26000112','OSIPL_BARLEY_M034_0.1M','M034','20',false,'OSIPL','2000002688','2026-08-24',22459,'2026-08-24','2026-08-20',{dealRef:'OPT-0826-12'}),
  mkDeal('DL26000113','OGA_SOYABEAN_M032_0.8M','M032','20',false,'OGA','2000002676','2026-09-10',800000,'2026-09-10','2026-11-20',{dealRef:'FWD-0926-13',region:'SG'}),
  mkDeal('DL26000114','OSIPL_COTTON_M034_CANCELLED','M034','30',false,'OSIPL','2000002670','2026-09-02',15000,'2026-09-02','2026-10-30',{dealRef:'OPT-0926-14'}),
]

/* ---- transactions (ZSGTSFCDS_FX + ZSGTSFCDS_OPTION, unified like gt_txn) ---- */
/** The legacy page's mkTxn defaults. */
const legacyTxn = (dealId: string, rfha: string, o: Partial<Txn>): Txn =>
  mkTxn(dealId, rfha, {
    bukrs: 'IN11',
    sfhaart: '619',
    sgsart: '12B',
    cpty: '1000124',
    cptyName: 'HSBC',
    grp: 'G1',
    entity: 'OSIPL',
    curr1: 'USD',
    curr2: 'INR',
    status: '05',
    portfolio: 'PF-IN-01',
    ...o,
  })

// prettier-ignore
export const SEED_TXNS: readonly Txn[] = [
  /* DL26000101 — forward, pending invoice-difference spot */
  legacyTxn('DL26000101','1700004101',{sfhaart:'619',sgsart:'12B',dealType:'D1',tradeDate:'2026-09-22',valueDate:'2026-10-15',xtext:'USD/INR Fwd 2.0M',bs1:'Buy',curr1:'USD',amt1:2000000,bs2:'Sell',curr2:'INR',amt2:-191422400,ospot:95.5112,oswap:0.2,rate:95.7112,status:'05',mcRef:'2000002728',seq:1}),
  /* DL26000102 — two options: call (exercise) and put (expire) */
  legacyTxn('DL26000102','1700004201',{sfhaart:'645',sgsart:'14A',dealType:'D1',tradeDate:'2026-09-21',valueDate:'2026-10-22',eDate:'2026-10-20',xtext:'USD Call / INR 90.00',pc1:'Call',bs1:'Buy',curr1:'USD',amt1:500000,bs2:'Sell',curr2:'INR',amt2:45000000,strike:90.0,preAmt:12500,preCurr:'USD',status:'05',settlfl:'1',mcRef:'2000002725',seq:1}),
  legacyTxn('DL26000102','1700004202',{sfhaart:'645',sgsart:'14A',dealType:'D2',tradeDate:'2026-09-21',valueDate:'2026-10-22',eDate:'2026-10-20',xtext:'USD Put / INR 86.00',pc1:'Put',bs1:'Sell',curr1:'USD',amt1:250000,bs2:'Buy',curr2:'INR',amt2:21500000,strike:86.0,preAmt:6100,preCurr:'USD',status:'05',settlfl:'1',cpty:'1000131',cptyName:'Citi',mcRef:'2000002725',seq:2}),
  /* DL26000103 — cash-settled call */
  legacyTxn('DL26000103','1700004301',{sfhaart:'645',sgsart:'14A',dealType:'D1',tradeDate:'2026-09-15',valueDate:'2026-10-29',eDate:'2026-10-27',xtext:'USD Call / INR 93.00 cash',pc1:'Call',bs1:'Buy',curr1:'USD',amt1:1000000,bs2:'Sell',curr2:'INR',amt2:93000000,strike:93.0,preAmt:21000,preCurr:'USD',status:'05',settlfl:'2',cpty:'1000147',cptyName:'Standard Chartered',mcRef:'2000002691',seq:1}),
  /* DL26000104 — short straddle: call leg, put leg, forward cover */
  legacyTxn('DL26000104','1700004401',{sfhaart:'646',sgsart:'14A',dealType:'DS1',tradeDate:'2026-09-19',valueDate:'2026-11-14',eDate:'2026-11-10',xtext:'SS USD Call 91.00',pc1:'Call',bs1:'Sell',curr1:'USD',amt1:300000,bs2:'Buy',curr2:'INR',amt2:27300000,strike:91.0,preAmt:7400,preCurr:'USD',status:'05',settlfl:'1',cpty:'1000152',cptyName:'JPMorgan',grp:'G2',mcRef:'2000002702',coverTxn:'1700004403',seq:1}),
  legacyTxn('DL26000104','1700004402',{sfhaart:'643',sgsart:'14A',dealType:'DS2',tradeDate:'2026-09-19',valueDate:'2026-11-14',eDate:'2026-11-10',xtext:'SS USD Put 91.00',pc1:'Put',bs1:'Sell',curr1:'USD',amt1:300000,bs2:'Buy',curr2:'INR',amt2:27300000,strike:91.0,preAmt:7900,preCurr:'USD',status:'05',settlfl:'1',cpty:'1000152',cptyName:'JPMorgan',grp:'G2',mcRef:'2000002702',seq:2}),
  legacyTxn('DL26000104','1700004403',{sfhaart:'619',sgsart:'12B',dealType:'00',tradeDate:'2026-09-19',valueDate:'2026-11-14',xtext:'USD/INR Fwd cover',bs1:'Buy',curr1:'USD',amt1:300000,bs2:'Sell',curr2:'INR',amt2:-27450000,ospot:91.3,oswap:0.2,rate:91.5,status:'05',cpty:'1000152',cptyName:'JPMorgan',grp:'G2',mcRef:'2000002702',seq:3}),
  /* DL26000105 — NDF USD/INR */
  legacyTxn('DL26000105','1700004501',{sfhaart:'631',sgsart:'12B',dealType:'D1',tradeDate:'2026-09-19',valueDate:'2026-10-14',xtext:'USD/INR NDF 1.0M',bs1:'Buy',curr1:'USD',amt1:1000000,bs2:'Sell',curr2:'INR',amt2:-96200000,rate:96.2,status:'05',ndfDate:'2026-10-12',ndfRef:'RBI-USDINR',ndfRefName:'RBI USD/INR Reference Rate',cpair:'USD:INR',mcRef:'2000002717',seq:1}),
  /* DL26000106 — DNDF VND/USD */
  legacyTxn('DL26000106','1700004601',{bukrs:'VN10',entity:'OVL',sfhaart:'632',sgsart:'12B',dealType:'D1',tradeDate:'2026-09-01',valueDate:'2026-10-16',xtext:'VND/USD DNDF 100K',bs1:'Sell',curr1:'VND',amt1:2500000000,bs2:'Buy',curr2:'USD',amt2:-100000,rate:25000,status:'05',ndfDate:'2026-10-14',ndfRef:'FIX-USDVND',ndfRefName:'SBV USD/VND Fixing',cpair:'VND:USD',cpty:'1000168',cptyName:'Deutsche Bank',grp:'G2',mcRef:'2000002689',seq:1}),
  /* DL26000107 — exercised option, settlement spot still pending */
  legacyTxn('DL26000107','1700004701',{sfhaart:'645',sgsart:'14A',dealType:'D2',tradeDate:'2026-09-21',valueDate:'2026-10-24',eDate:'2026-10-20',xtext:'USD Call / INR 89.50',pc1:'Call',bs1:'Buy',curr1:'USD',amt1:310000,bs2:'Sell',curr2:'INR',amt2:27745000,strike:89.5,preAmt:8000,preCurr:'USD',status:'24',settlfl:'1',mcRef:'2000002724',seq:1}),
  /* DL26000108 — NDF fixed, spot created */
  legacyTxn('DL26000108','1700004801',{sfhaart:'631',sgsart:'12B',dealType:'D1',tradeDate:'2026-09-19',valueDate:'2026-10-09',xtext:'USD/INR NDF 200K',bs1:'Buy',curr1:'USD',amt1:200000,bs2:'Sell',curr2:'INR',amt2:-19000000,rate:95.0,status:'10',ndfDate:'2026-10-06',ndfRef:'RBI-USDINR',ndfRefName:'RBI USD/INR Reference Rate',ndfRate:95.221,cpair:'USD:INR',cashAmt:442.1,cashCurr:'USD',mcRef:'2000002719',seq:1}),
  legacyTxn('DL26000108','1700004802',{sfhaart:'605',sgsart:'12A',dealType:'D1',tradeDate:'2026-10-06',valueDate:'2026-10-08',xtext:'Spot – NDF settlement',bs1:'Buy',curr1:'USD',amt1:442.1,bs2:'Sell',curr2:'INR',amt2:-42100,rate:95.221,status:'05',mcRef:'2000002719',seq:2}),
  /* DL26000109 — settled forward with spot */
  legacyTxn('DL26000109','1700004901',{sfhaart:'619',sgsart:'12B',dealType:'D1',tradeDate:'2026-09-01',valueDate:'2026-10-05',xtext:'USD/INR Fwd 1.5M',bs1:'Buy',curr1:'USD',amt1:1500000,bs2:'Sell',curr2:'INR',amt2:-142200000,rate:94.8,status:'30',mcRef:'2000002727',seq:1}),
  legacyTxn('DL26000109','1700004902',{sfhaart:'604',sgsart:'12A',dealType:'D1',tradeDate:'2026-10-05',valueDate:'2026-10-07',xtext:'Spot – invoice settlement',bs1:'Sell',curr1:'USD',amt1:38000,bs2:'Buy',curr2:'INR',amt2:3610000,rate:95.0,status:'30',mcRef:'2000002727',seq:2}),
  /* DL26000110 — expired option */
  legacyTxn('DL26000110','1700005001',{sfhaart:'645',sgsart:'14A',dealType:'D1',tradeDate:'2026-09-12',valueDate:'2026-10-09',eDate:'2026-10-07',xtext:'USD Put / INR 84.00',pc1:'Put',bs1:'Sell',curr1:'USD',amt1:150000,bs2:'Buy',curr2:'INR',amt2:12600000,strike:84.0,preAmt:2100,preCurr:'USD',status:'34',settlfl:'1',mcRef:'2000002709',seq:1}),
  /* DL26000111 — old short straddle (still listed because SS = X) */
  legacyTxn('DL26000111','1700005101',{sfhaart:'646',sgsart:'14A',dealType:'DS1',tradeDate:'2026-07-30',valueDate:'2026-08-17',eDate:'2026-08-13',xtext:'SS USD Call 90.00',pc1:'Call',bs1:'Sell',curr1:'USD',amt1:100000,bs2:'Buy',curr2:'INR',amt2:9000000,strike:90.0,status:'24',settlfl:'1',cpty:'1000152',cptyName:'JPMorgan',grp:'G2',mcRef:'2000002698',seq:1}),
  legacyTxn('DL26000111','1700005102',{sfhaart:'619',sgsart:'12B',dealType:'00',tradeDate:'2026-07-30',valueDate:'2026-08-17',xtext:'USD/INR Fwd cover',bs1:'Buy',curr1:'USD',amt1:100000,bs2:'Sell',curr2:'INR',amt2:-9040000,ospot:90.3,oswap:0.1,rate:90.4,status:'05',cpty:'1000152',cptyName:'JPMorgan',grp:'G2',mcRef:'2000002698',seq:2}),
  /* DL26000112 — ended before the default From date */
  legacyTxn('DL26000112','1700005201',{sfhaart:'645',sgsart:'14A',dealType:'D1',tradeDate:'2026-08-24',valueDate:'2026-08-22',eDate:'2026-08-20',xtext:'USD Call / INR 88.00',pc1:'Call',bs1:'Buy',curr1:'USD',amt1:250000,bs2:'Sell',curr2:'INR',amt2:22000000,strike:88.0,status:'34',settlfl:'1',mcRef:'2000002688',seq:1}),
  /* DL26000113 — company code SG10: user has no authorisation */
  legacyTxn('DL26000113','1700005301',{bukrs:'SG10',entity:'OGA',sfhaart:'619',sgsart:'12B',dealType:'D1',tradeDate:'2026-09-10',valueDate:'2026-11-20',xtext:'USD/SGD Fwd',bs1:'Buy',curr1:'USD',amt1:800000,bs2:'Sell',curr2:'SGD',amt2:-1056000,rate:1.32,status:'05',mcRef:'2000002676',seq:1}),
  /* DL26000114 — cancelled (status 30): never listed, see FETCH_DEAL_DETAILS */
  legacyTxn('DL26000114','1700005401',{sfhaart:'645',sgsart:'14A',dealType:'D1',tradeDate:'2026-09-02',valueDate:'2026-11-01',eDate:'2026-10-30',pc1:'Call',bs1:'Buy',curr1:'USD',amt1:100000,bs2:'Sell',curr2:'INR',amt2:9000000,strike:90,status:'05',settlfl:'1',mcRef:'2000002670',seq:1}),
]

/* ---- invoice-difference / settlement-spot records (ZSGTSFTR_IN_SPOT) ---- */
function mkSpot(
  dealId: string,
  dealType: string,
  fAmt: number,
  fxAmt: number,
  curr: string,
  bs: string,
  o: Partial<Pick<InSpot, 'rfha' | 'dssType' | 'spotTxn' | 'spotCreate' | 'expiry' | 'bukrs' | 'entity'>> = {},
): InSpot {
  return {
    dealId,
    dealType,
    rfha: o.rfha || '',
    dssType: o.dssType || '',
    fAmt,
    fxAmt,
    curr,
    dAmt: fxAmt - fAmt,
    bs,
    spotTxn: o.spotTxn || '',
    spotCreate: o.spotCreate || '',
    expiry: o.expiry || '',
    bukrs: o.bukrs || 'IN11',
    entity: o.entity || 'OSIPL',
  }
}

// prettier-ignore
export const SEED_INSPOT: readonly InSpot[] = [
  mkSpot('DL26000101','D1',1950000,2000000,'USD','Buy'),
  mkSpot('DL26000102','D1',480000,500000,'USD','Buy'),
  /* D2 intentionally has no invoice amount saved -> confirmation "Invoice amount not saved" */
  mkSpot('DL26000103','D1',990000,1000000,'USD','Buy'),
  mkSpot('DL26000104','DS1',290000,300000,'USD','Sell',{dssType:'SS'}),
  mkSpot('DL26000104','DS2',295000,300000,'USD','Sell',{dssType:'SS'}),
  mkSpot('DL26000105','D1',985000,1000000,'USD','Buy'),
  mkSpot('DL26000106','D1',2480000000,2500000000,'VND','Sell'),
  mkSpot('DL26000107','D2',300000,310000,'USD','Buy'),
  mkSpot('DL26000108','D1',199000,200000,'USD','Buy',{rfha:'1700004801',spotTxn:'1700004802',spotCreate:'X'}),
  mkSpot('DL26000109','D1',1462000,1500000,'USD','Buy',{rfha:'1700004901',spotTxn:'1700004902',spotCreate:'X'}),
  mkSpot('DL26000110','D1',148000,150000,'USD','Sell'),
]

/** A fresh, mutable copy of the seed — what the screen starts from and Refresh returns to. */
export function fixtureData(): AppData {
  return {
    deals: SEED_DEALS.map((d) => ({ ...d })),
    txns: SEED_TXNS.map((t) => ({ ...t })),
    inSpot: SEED_INSPOT.map((s) => ({ ...s })),
    nextRfha: 5900,
  }
}

/** The demo "today" the legacy KPIs were computed against. */
export const FIXTURE_AS_OF = '2026-10-01'

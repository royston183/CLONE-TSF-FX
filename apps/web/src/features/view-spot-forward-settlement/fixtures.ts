import type { Deal, Names } from './types.ts'

/*
 * TEST FIXTURES ONLY (imported by logic.test.ts, never by the screen). The former UI-only demo
 * data of ZSGTSFR062; the screen reads SAP through api.ts.
 */

/** First accounting-document number handed out by Post. */
export const INITIAL_DOC_COUNTER = 1900000200

export const NAMES: Names = {
  transfer: {
    '01': 'TT Form',
    '02': 'ECM',
    '03': 'Letter',
    '04': 'Indirect',
    '05': 'SSI Letter + ECM',
    '06': 'SSI Letter',
  },
  partner: {
    '100234': 'HDFC Bank Ltd',
    '100567': 'ICICI Bank Ltd',
    '100987': 'Axis Bank Ltd',
    '200110': 'Emirates NBD',
    '300045': 'DBS Bank Ltd',
  },
  company: {
    IN01: 'Olam Agro India Pvt Ltd',
    DM01: 'Olam Global Trading DMCC',
    SG01: 'Olam International Pte Ltd',
  },
}

const SEED: readonly Deal[] = [
  { rfha:"0001345671",dealId:"TSF-9081",mcRef:"MC-7001",bukrs:"IN01",entity:"OIL",product:"Forward",tradeDate:"05-09-2026",valueDate:"05-11-2026",bs1:"SELL",curr1:"USD",amt1:5000000,bs2:"BUY",curr2:"INR",amt2:417500000,cpair:"USD/INR",spot:83.10,swap:0.42,allIn:83.52,kontrh:"100234",trader:"Ravi Kumar",doc1:"",doc2:"",trf1:"03",trf2:"02",cruser:"VAISHNAVI",status: "PENDING" },
  { rfha:"0001345672",dealId:"TSF-9082",mcRef:"MC-7001",bukrs:"IN01",entity:"OIL",product:"Forward",tradeDate:"20-09-2026",valueDate:"20-12-2026",bs1:"SELL",curr1:"USD",amt1:3250000,bs2:"BUY",curr2:"INR",amt2:270000000,cpair:"USD/INR",spot:83.25,swap:0.58,allIn:83.83,kontrh:"100567",trader:"Ananya Shah",doc1:"",doc2:"",trf1:"03",trf2:"02",cruser:"ASHOK",status: "PENDING" },
  { rfha:"0001345501",dealId:"TSF-8890",mcRef:"MC-6998",bukrs:"IN01",entity:"OIL",product:"Spot",tradeDate:"01-10-2026",valueDate:"03-10-2026",bs1:"SELL",curr1:"USD",amt1:1200000,bs2:"BUY",curr2:"INR",amt2:99700000,cpair:"USD/INR",spot:83.05,swap:0,allIn:83.05,kontrh:"100234",trader:"Ravi Kumar",doc1:"1900000123",doc2:"1900000124",trf1:"01",trf2:"01",cruser:"VAISHNAVI",status: "SETTLED" },
  { rfha:"0001345502",dealId:"TSF-8891",mcRef:"MC-6998",bukrs:"IN01",entity:"OIL",product:"Spot",tradeDate:"02-10-2026",valueDate:"04-10-2026",bs1:"SELL",curr1:"USD",amt1:900000,bs2:"BUY",curr2:"INR",amt2:74800000,cpair:"USD/INR",spot:83.12,swap:0,allIn:83.12,kontrh:"100987",trader:"Ananya Shah",doc1:"",doc2:"",trf1:"03",trf2:"03",cruser:"ASHOK",status: "OVERDUE" },
  { rfha:"0001345321",dealId:"TSF-8750",mcRef:"MC-6890",bukrs:"IN01",entity:"OIL",product:"Forward",tradeDate:"15-08-2026",valueDate:"05-10-2026",bs1:"SELL",curr1:"USD",amt1:2000000,bs2:"BUY",curr2:"INR",amt2:166600000,cpair:"USD/INR",spot:82.95,swap:0.35,allIn:83.30,kontrh:"100234",trader:"Ravi Kumar",doc1:"",doc2:"",trf1:"02",trf2:"02",cruser:"VAISHNAVI",status: "PENDING" },
  { rfha:"0001345322",dealId:"TSF-8751",mcRef:"MC-6890",bukrs:"IN01",entity:"OIL",product:"Forward",tradeDate:"16-08-2026",valueDate:"05-10-2026",bs1:"SELL",curr1:"USD",amt1:1750000,bs2:"BUY",curr2:"INR",amt2:145950000,cpair:"USD/INR",spot:83.00,swap:0.40,allIn:83.40,kontrh:"100567",trader:"Ananya Shah",doc1:"",doc2:"",trf1:"02",trf2:"02",cruser:"ASHOK",status: "PENDING" },
  { rfha:"0001344980",dealId:"TSF-8600",mcRef:"MC-6750",bukrs:"IN01",entity:"OIL",product:"Spot",tradeDate:"28-09-2026",valueDate:"02-10-2026",bs1:"SELL",curr1:"USD",amt1:1500000,bs2:"BUY",curr2:"INR",amt2:124500000,cpair:"USD/INR",spot:83.00,swap:0,allIn:83.00,kontrh:"100234",trader:"Priya Nair",doc1:"",doc2:"",trf1:"04",trf2:"04",cruser:"KARTHIK",status: "OVERDUE" },
  { rfha:"0002200456",dealId:"TSF-7701",mcRef:"MC-6500",bukrs:"DM01",entity:"DMCC",product:"Spot",tradeDate:"01-10-2026",valueDate:"06-10-2026",bs1:"SELL",curr1:"USD",amt1:2000000,bs2:"BUY",curr2:"AED",amt2:7346000,cpair:"USD/AED",spot:3.6730,swap:0,allIn:3.6730,kontrh:"200110",trader:"Karthik Ramasamy",doc1:"",doc2:"",trf1:"01",trf2:"01",cruser:"KARTHIK",status: "PENDING" },
  { rfha:"0002200457",dealId:"TSF-7702",mcRef:"MC-6500",bukrs:"DM01",entity:"DMCC",product:"Forward",tradeDate:"02-10-2026",valueDate:"02-01-2027",bs1:"SELL",curr1:"USD",amt1:1500000,bs2:"BUY",curr2:"AED",amt2:5515000,cpair:"USD/AED",spot:3.6730,swap:0.012,allIn:3.6850,kontrh:"200110",trader:"Karthik Ramasamy",doc1:"",doc2:"",trf1:"02",trf2:"02",cruser:"KARTHIK",status: "PENDING" },
  { rfha:"0002100788",dealId:"TSF-7500",mcRef:"MC-6300",bukrs:"SG01",entity:"OAIPL",product:"Spot",tradeDate:"28-09-2026",valueDate:"02-10-2026",bs1:"SELL",curr1:"USD",amt1:800000,bs2:"BUY",curr2:"SGD",amt2:1073600,cpair:"USD/SGD",spot:1.3420,swap:0,allIn:1.3420,kontrh:"300045",trader:"Priya Nair",doc1:"",doc2:"",trf1:"03",trf2:"03",cruser:"KARTHIK",status: "OVERDUE" },
  { rfha:"0001344870",dealId:"TSF-8400",mcRef:"MC-6700",bukrs:"IN01",entity:"OIL",product:"Forward",tradeDate:"10-08-2026",valueDate:"30-09-2026",bs1:"SELL",curr1:"USD",amt1:2600000,bs2:"BUY",curr2:"INR",amt2:215930000,cpair:"USD/INR",spot:82.40,swap:0.65,allIn:83.05,kontrh:"100234",trader:"Ravi Kumar",doc1:"1900000050",doc2:"1900000051",trf1:"01",trf2:"01",cruser:"VAISHNAVI",status: "SETTLED" },
  { rfha:"0001344871",dealId:"TSF-8401",mcRef:"MC-6700",bukrs:"IN01",entity:"OIL",product:"Forward",tradeDate:"11-08-2026",valueDate:"30-09-2026",bs1:"SELL",curr1:"USD",amt1:1400000,bs2:"BUY",curr2:"INR",amt2:117040000,cpair:"USD/INR",spot:83.10,swap:0.50,allIn:83.60,kontrh:"100567",trader:"Ananya Shah",doc1:"",doc2:"",trf1:"05",trf2:"05",cruser:"ASHOK",status: "ERRCORR" },
  { rfha:"0001345890",dealId:"TSF-9150",mcRef:"MC-7050",bukrs:"IN01",entity:"OIL",product:"Forward",tradeDate:"25-09-2026",valueDate:"15-10-2026",bs1:"SELL",curr1:"USD",amt1:4000000,bs2:"BUY",curr2:"INR",amt2:334400000,cpair:"USD/INR",spot:83.20,swap:0.38,allIn:83.58,kontrh:"100987",trader:"Ravi Kumar",doc1:"",doc2:"",trf1:"02",trf2:"02",cruser:"VAISHNAVI",status: "PENDING" },
  { rfha:"0001345891",dealId:"TSF-9151",mcRef:"MC-7050",bukrs:"IN01",entity:"OIL",product:"Forward",tradeDate:"26-09-2026",valueDate:"15-10-2026",bs1:"SELL",curr1:"USD",amt1:1800000,bs2:"BUY",curr2:"INR",amt2:150480000,cpair:"USD/INR",spot:83.22,swap:0.40,allIn:83.62,kontrh:"100987",trader:"Ravi Kumar",doc1:"",doc2:"",trf1:"02",trf2:"02",cruser:"VAISHNAVI",status: "PENDING" }
]

/** A fresh copy of the seed deals; Post mutates nothing, it returns new objects. */
export function seedDeals(): Deal[] {
  return SEED.map((d) => ({ ...d }))
}

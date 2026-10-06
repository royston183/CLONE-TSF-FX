/**
 * TEST FIXTURES ONLY (imported by logic.test.ts, never by the screen; the screen reads SAP via
 * api.ts). Former dummy data. The legacy page ships a single worked example (Model M021,
 * 5,000 MT soybean oil, Master Contract MC-7001 -> Deal ID TSF-9081 -> invoices T1/T2/T3).
 * Nothing here is read from SAP.
 */
import type { Deal } from './types.ts'

export const SAMPLE_DEAL_ID = 'TSF-9081'

/** First document number the legacy demo hands out; each posting takes the next one. */
export const INITIAL_DOC_COUNTER = 1900010001

export const DEAL_LIBRARY: Readonly<Record<string, Deal>> = {
  'TSF-9081': {
    dealId: 'TSF-9081',
    dealRef: 'OSIPL Soyoil M021 5000MT - Sep Shipment',
    dealStartDate: '01.09.2026',
    dealEndDate: '31.03.2027',
    mcRefNo: 'MC-7001',
    mcDesc: 'OSIPL_SOYOIL_M021_5000MT',
    mcDate: '15.08.2026',
    shipEndDate: '31.10.2026',
    fxModelId: 'M021',
    modelDesc: 'INR Long Forward',
    entityString: 'OIL - DMCC - OAIPL',
    currencyString: 'USD - USD - INR',
    fxInvModel: 'M021',
    traderCode: 'T01',
    traderDesc: 'J. Fernandes',
    status: 10,
    statusCode: '10',
    statusText: 'Confirmed by MO',
    top: [
      {
        entity: 'OIL', dealType: 'D1', rfha: '5000011041', buyCurr: 'INR', buyAmt: 415500000.0, sellCurr: 'USD',
        sellAmt: 5000000.0, rate: 83.1, status: 'Confirmed', doc1: '', doc2: '', dssDeal: '', sgsart: '12A',
      },
      {
        entity: 'DMCC', dealType: 'D2', rfha: '5000011042', buyCurr: 'INR', buyAmt: 416331000.0, sellCurr: 'USD',
        sellAmt: 5010000.0, rate: 83.0998, status: 'Confirmed', doc1: '', doc2: '', dssDeal: '', sgsart: '12A',
      },
    ],
    inv: [
      {
        tType: 'T1S', tradeType: 'T1 · OIL → DMCC', setDesc: 'Soybean Oil Sale · Leg 1 (Origination)', dMap: 'D1',
        dssDeal: '', trfType: 'SWIFT MT103', invAmt: 5000000.0, invCurr: 'USD', payAmt: 415500000.0, payCurr: 'INR',
        preAmt: 0, postCheck: true, setCheck: false, fiDoc: '', docMsg: '', buy: 'OIL', sell: 'DMCC',
      },
      {
        tType: 'T2S', tradeType: 'T2 · DMCC → OAIPL', setDesc: 'Soybean Oil Sale · Leg 2 (Markup)', dMap: 'D2',
        dssDeal: '', trfType: 'SWIFT MT103', invAmt: 5010000.0, invCurr: 'USD', payAmt: 416331000.0, payCurr: 'INR',
        preAmt: 0, postCheck: true, setCheck: false, fiDoc: '', docMsg: '', buy: 'DMCC', sell: 'OAIPL',
      },
      {
        tType: 'T3S', tradeType: 'T3 · OAIPL → Customer', setDesc: 'Final Sale · Domestic Customer', dMap: '',
        dssDeal: '', trfType: 'Letter of Credit', invAmt: 420500000.0, invCurr: 'INR', payAmt: 420500000.0,
        payCurr: 'INR', preAmt: 0, postCheck: true, setCheck: false, fiDoc: '', docMsg: '', buy: 'OAIPL',
        sell: 'CUST-DOM-04',
      },
    ],
  },
}

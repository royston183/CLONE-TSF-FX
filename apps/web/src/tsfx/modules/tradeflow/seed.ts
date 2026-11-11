// Sample trade flows (UI approval): rows of TF.xlsx as if uploaded on three days, plus a COTTON and a CASHEW row
// (CASHEW has no price: the "No price" case). Numbers stand in for SAP's ZSGTSFNR02 / ZSGTSFNR05.
import type { Row } from '@tsfx/lib/grid/types';
import type { ModuleSeed } from '../types';
import { PRICE_ROWS } from '../commodity-price/seed';
import { priceOn, valueOf } from './pricing';

const NOTIFY = 'Olam Viet Nam Ltd - BIEN HOA II';
// tfDate, blNumber, blDate, etd, eta, contractRef, invoiceRef, invoiceDate, commodity, goods, quantity, unit
const ROWS: string[][] = [
  ['2026-10-15', 'NAM6036645', '2023-02-07', '2023-02-07', '2023-03-07', '1490004320', '9230140002', '2026-02-08', 'ALMOND', 'ALMONDS BUTTE/PADRE SSR 36/40', '44000', 'LBS'],
  ['2026-10-15', 'OOLU2713071710', '2023-02-10', '2023-10-02', '2023-03-08', '1481405219', '9230140070', '2026-02-09', 'ALMOND', 'ALMOND STD5', '264554.93', 'LBS'],
  ['2026-10-15', 'NAM6036570', '2023-02-10', '2023-02-10', '2023-03-10', '1490004318', '9230140089', '2026-02-19', 'ALMOND', 'ALMOND STD5', '44000', 'LBS'],
  ['2026-11-01', 'NAM6036015', '2023-02-20', '2023-02-20', '2023-03-20', '1490004318', '9230140054', '2026-02-18', 'ALMOND', 'ALMOND STD5', '44000', 'LBS'],
  ['2026-11-01', 'NAM6036608', '2023-02-20', '2023-02-20', '2023-03-20', '1490004318', '9230140090', '2026-02-19', 'ALMOND', 'ALMOND STD5', '44000', 'LBS'],
  ['2026-11-05', 'NAM6036623', '2023-02-14', '2023-02-14', '2023-03-14', '1490004320', '9230140025', '2026-02-12', 'ALMOND', 'ALMOND BUTTE/PADRSE SSR36/40', '44000', 'LBS'],
  ['2026-11-05', 'YMLUW160408071', '2023-02-08', '2023-02-08', '2023-03-08', '1481405188', '9230140043', '2026-02-08', 'ALMOND', 'ALMOND CAL SSR 25/27', '44000', 'LBS'],
  ['2026-11-05', 'MAEU221804455', '2026-10-28', '2026-10-28', '2026-11-30', '1481405301', '9230141102', '2026-10-30', 'COTTON', 'RAW COTTON BALES 29MM', '19958.059', 'KG'],
  ['2026-11-05', 'CMAU771240019', '2026-10-21', '2026-10-21', '2026-11-25', '1481405302', '9230141110', '2026-10-24', 'CASHEW', 'CASHEW KERNELS W320', '15.876', 'MTS']
];

export function tradeflowSeed(): ModuleSeed {
  const tradeflows: Row[] = [], bl: Row[] = [];
  ROWS.forEach(([tfDate, blNumber, blDate, etd, eta, contractRef, invoiceRef, invoiceDate, commodity, goods, quantity, unit], i) => {
    const tfNo = `TF${String(i + 1).padStart(8, '0')}`, blNo = `BL${String(i + 1).padStart(8, '0')}`;
    const fields: Row = { notifyParty: NOTIFY, blNumber, blDate, etd, eta, contractRef, contractDate: '', invoiceRef, invoiceDate, commodity, goods, quantity, unit };
    const price = priceOn(PRICE_ROWS, commodity, tfDate);
    tradeflows.push({ tfNo, tfDate, blNo, dealId: '', ...fields, price, value: valueOf(price, quantity), currency: 'USD' });
    bl.push({ tfNo, tfDate, blNo, blRecordDate: tfDate, dealId: '', ...fields });
  });
  return { tables: { tradeflows, bl } };
}

// The BL row the invoice screen builds T1, T2 and T3 from (ZSGTSFTR_BL on the SLC middleware, resource billOfLading).
// In the original SAP process assigning a BL to a Deal ID creates it; Propose writes it too, from what it assigned.
// Pure: the page's live data calls it, the tests check it. The shape follows the rows of Deal IDs that were invoiced
// (invoice groups = invoice date + invoice commodity + GT commodity; total value ZTTV ÷ quantity is the group price).
import { str } from '@tsfx/lib/grid/grid';
import type { Row } from '@tsfx/lib/grid/types';

/** "assigned" BL status of ZSGTSFTR_BL.ZBL_STAT_ID (the existing rows of Deal IDs at status 04 carry it). */
export const MW_BL_ASSIGNED = '02';

const day = (v: unknown) => str(v).slice(0, 10);
const fixed = (v: string, places: number) => (Number.isFinite(Number(v)) && v !== '' ? Number(v).toFixed(places) : '');

/**
 * The middleware row of one assigned BL.
 * @param bl the SAP BL (blNo, tfNo, tfDate, blRecordDate, blDate, quantity, commodity, unit)
 * @param usd the USD the BL was assigned with (becomes the row's total value, so the invoice adds up to the deal)
 * @param commodity the commodity master row of the BL (description, tsfCommodity)
 */
export function middlewareBlRow(dealId: string, bl: Row, usd: string, commodity: Row | undefined, today: string): Record<string, string> {
  const quantity = fixed(str(bl.quantity), 3);
  const description = str(commodity?.description) || str(bl.commodity);
  const price = Number(quantity) > 0 ? fixed(String(Number(usd) / Number(quantity)), 2) : '';
  const row: Record<string, string> = {
    ZTF_NO: str(bl.tfNo), ZTF_SPLIT: '01', ZBL_NO: str(bl.blNo), ZBL_SPLIT: '01',
    ZBL_DATE: day(bl.blDate) || day(bl.blRecordDate), ZTF_DATE: day(bl.tfDate),
    ZDEAL_ID: dealId,
    ZINV_COMM: description, ZTRM_COM_ID: str(commodity?.tsfCommodity), ZBU: description.toUpperCase(),
    ZINV_DATE: today, ZSO_DATE: day(bl.tfDate) || today,
    ZQUANTITY: quantity, ZUNIT: price, ZCPRICE: price, ZTTV: fixed(usd, 2),
    ZBL_STAT_ID: MW_BL_ASSIGNED, ZTF_TYPE: '01',
    ZREMARK: 'ASSIGNED FROM PROPOSE TRADEFLOW'
  };
  if (str(bl.blNumber)) row.ZBLNO = str(bl.blNumber);
  // ZBL_REUSE is part of the key and is blank on a first-time BL; the middleware wants it present.
  return { ...Object.fromEntries(Object.entries(row).filter(([, v]) => v !== '')), ZBL_REUSE: '' };
}

/** The key of a middleware BL row: a row that is already there is never written twice. */
export const mwBlKey = (r: Record<string, unknown>): string => [r.ZTF_NO, r.ZTF_SPLIT || '01', r.ZBL_NO, r.ZBL_SPLIT || '01', r.ZBL_REUSE || ''].map(v => str(v)).join('|');

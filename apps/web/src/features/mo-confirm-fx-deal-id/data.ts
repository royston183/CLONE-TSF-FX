/**
 * Presentation constants only. The screen's former mock backend (DEALS_DB, INVOICE_DB,
 * PREMIUM_DB, REPLACEMENT_POOL, DMS_DB) now lives in fixtures.ts, which only the tests import;
 * at runtime every value comes from the SLC middleware (see api.ts).
 */

/** The badge colour per status code. The text is ZSGTSFTR_DEAL_ST-ZDEAL_SDESC, never a local list. */
export const STATUS_CLS: Readonly<Record<string, string>> = {
  '01': 'status-01',
  '02': 'status-02',
  '03': 'status-03',
  '07': 'status-07',
  '30': 'status-30',
}

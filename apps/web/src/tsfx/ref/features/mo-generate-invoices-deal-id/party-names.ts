/**
 * The company names printed as Seller / Buyer on the invoice documents, by TSF entity code (ZSGTSFTR_COMP-ZCOM_ID).
 * These are the names the company uses on its documents; the entities of other systems (OFIIPL, OIL) are listed too.
 * An entity that is not here is printed with the name SAP holds for it. Nothing but the name is printed.
 */
export const PRINT_NAMES: Readonly<Record<string, string>> = {
  DMCC: 'Olam Food Ingredients DMC',
  OSIPL: 'Olam Food Ingd. India Pvt.',
  OFIIPL: 'Olam Food Ingd. India Pvt.',
  OGA: 'OLAM International Ltd',
  OIL: 'OLAM International Ltd',
}

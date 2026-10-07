/*
 * Constants of ZSGTSF_RFX_NDF_FIX. The screen's data — companies, traders, NDF deals, fixing
 * references — is read from SAP by api.ts; nothing here invents a value. The lead / following
 * currency (ZSGTRMFM_LEAD_CURR) is FxTransaction's LeadCurrency / FollowCurrency, i.e. CURR1 / CURR2.
 */

/** Currencies the ABAP quotes per 100 in the cash settlement (c_idr, c_vnd, c_twd). */
export const PER_100_CURRENCIES = ['IDR', 'VND', 'TWD'] as const

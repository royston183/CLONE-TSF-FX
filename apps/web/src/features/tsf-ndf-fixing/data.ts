/*
 * Constants of ZSGTSF_RFX_NDF_FIX. The screen's data — companies, traders, NDF deals, fixing
 * references — is read from SAP by api.ts; nothing here invents a value.
 */

/**
 * ZSGTRMFM_LEAD_CURR (lead / following currency) is a custom FM that is not in the export and
 * has no API. Until the backend exposes it, the lead currency follows this market-convention
 * ranking (KEPT STATIC — needs backend parity): the higher-ranked currency leads, USD leads
 * any currency not listed.
 */
export const LEAD_RANK = ['EUR', 'GBP', 'AUD', 'NZD', 'USD'] as const

/** Currencies the ABAP quotes per 100 in the cash settlement (c_idr, c_vnd, c_twd). */
export const PER_100_CURRENCIES = ['IDR', 'VND', 'TWD'] as const

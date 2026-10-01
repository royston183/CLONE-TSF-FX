/*
 * Constants of ZSGTSF_RFX_NDF_FIX_FO. The rows, companies and fixing-reference texts are read
 * from SAP by api.ts; nothing here invents a value.
 */

/**
 * ZSGTRMFM_LEAD_CURR / ZSGTRMFM_LEAD_CURR_S (lead and following / settlement currency) are custom
 * FMs that are not in the export and have no API. Until the backend exposes them, the lead
 * currency follows this market-convention ranking (KEPT STATIC — needs backend parity): the
 * higher-ranked currency leads, USD leads any currency not listed.
 */
export const LEAD_RANK = ['EUR', 'GBP', 'AUD', 'NZD', 'USD'] as const

export function leadCurr(c1: string, c2: string): { lead: string; follow: string } {
  const rank = (c: string) => {
    const i = (LEAD_RANK as readonly string[]).indexOf(c)
    return i < 0 ? 99 : i
  }
  return rank(c1) <= rank(c2) ? { lead: c1, follow: c2 } : { lead: c2, follow: c1 }
}

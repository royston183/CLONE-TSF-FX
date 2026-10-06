/**
 * The screen's live selection helps. They start empty and are filled only from SAP's tables
 * by api.ts, so a dropdown never offers a made-up value. The legacy page's sample rows live in
 * fixtures.ts, imported by the tests only.
 */

/** P_ORG, MATCHCODE OBJECT ZSGTSFSH_ENTITY: ZSGTSFTR_COMP-ZCOM_ID. */
export const ORIGIN_OPTIONS: string[] = []
/** P_REG, MATCHCODE OBJECT ZSGTSFSH_REGION: the COMP-ZREG_ID codes. */
export const REGION_OPTIONS: string[] = []
/** P_MOD, MATCHCODE OBJECT ZSGTSFSH_MODEL: ZSGTSFTR_RULE_BT-ZMOD_ID. */
export const MODEL_OPTIONS: string[] = []

/**
 * The screen's live masters. They start empty and are filled only from SAP's tables by
 * api.ts, so a dropdown never offers a made-up value. The legacy page's sample rows and
 * dummy masters live in fixtures.ts, imported by the tests only.
 */
import type { CodeDesc } from './types.ts'

/** ZSGTSFTR_DEAL_ST at ZSUB_TYPE 'FX1' (the report's LEFT OUTER JOIN), code -> ZDEAL_SDESC. */
export const STATUS_MAP: Record<string, string> = {}

/** P_ORG, MATCHCODE OBJECT ZSGTSFSH_ENTITY: ZSGTSFTR_COMP (ZCOM_ID, ZBUTXT). */
export const ORIGIN_OPTIONS: CodeDesc[] = []

/** P_REG, MATCHCODE OBJECT ZSGTSFSH_REGION: the COMP-ZREG_ID codes. No region text master is migrated, so desc stays ''. */
export const REGION_OPTIONS: CodeDesc[] = []

/** P_MOD, MATCHCODE OBJECT ZSGTSFSH_MODEL: ZSGTSFTR_RULE_BT, one entry per ZMOD_ID. */
export const MODELS: CodeDesc[] = []

/**
 * KEPT STATIC: the DMS popup's document types. The popup belongs to ZSGTSF_PDEAL_ID_ANALYS
 * (SUBMIT from the Deal ID hotspot), which is not in this export, so its DMS category and
 * ZSGTSFTR_DMS_TYP selection are unknown; the legacy list stays until that program is ported.
 */
export const DMS_DOCS: Array<[string, string]> = [
  ['D01', 'Bank Trade Recap confirmed by trader'],
  ['D02', 'Signed Long Form Confirmation from Bank'],
  ['D03', 'Miscellaneous 1'],
  ['D19', 'Miscellaneous 2'],
  ['D20', 'Miscellaneous 3'],
  ['D21', 'Miscellaneous 4'],
  ['D22', 'Miscellaneous 5'],
]

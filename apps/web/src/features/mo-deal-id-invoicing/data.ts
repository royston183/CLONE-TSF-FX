/**
 * The screen's live masters. They start empty and are filled only from SAP's tables by
 * api.ts, so a dropdown never offers a made-up value. The legacy page's dummy masters and
 * deals live in fixtures.ts, imported by the tests only.
 */
import type { Entity, FxModel } from './types.ts'

/** S_ORG, MATCHCODE OBJECT ZSGTSFSH_ENTITY: ZSGTSFTR_COMP (ZCOM_ID, ZBUKRS, ZBUTXT). */
export const ENTITIES: Record<string, Entity> = {}

/** S_REG, MATCHCODE OBJECT ZSGTSFSH_REGION: the COMP-ZREG_ID codes. No region text master is migrated, so the code is its own label. */
export const REGIONS: Record<string, string> = {}

/** S_MOD (ZSGTSFDT_MOD_ID): ZSGTSFTR_RULE_BT, with its entity and currency strings. */
export const FX_MODELS: Record<string, FxModel> = {}

/** ZSGTSFTR_DEAL_ST at ZSUB_TYPE 'FX1' (the report's INNER JOIN), code -> text + status pill class. */
export const STATUS_META: Record<string, { label: string; cls: string }> = {}

/** P_STAT's list box: FORM modify_drop_down — DEAL_ST WHERE zsub_type = 'FX1' AND zdeal_stat <= gv_deal. */
export const STATUS_OPTIONS: Array<[string, string]> = []

/** ZSGTRMTR_TRADER: trade code -> trader name (the rbill popup's header). */
export const TRADERS: Record<string, string> = {}

export const entStr = (model: string): string => (FX_MODELS[model]?.entities ?? []).join('-')
export const currStr = (model: string): string => (FX_MODELS[model]?.curr ?? []).join('-')

/**
 * The real backends behind `SpotPorts` (spotCreate.ts).
 *
 *   IN_SPOT, SET_SPT, COMP, ZGTCATR_PARAM   SLC middleware (fxList / fxUpdate)
 *   original deal                           FxTransaction, ZFS_SB_TRMFX_O4_API ("fx")
 *   deal data of any transaction            TrmFxApp = ZSGTSFTR_APP_STR, by BUKRS + RFHA
 *   the new Spot                            FxTransaction POST (api.ts)
 */
import { odataString } from '@slc/api-client'
import { fxList, fxUpdate } from '../../shared/fx/mw.ts'
import { changedStamp } from '../../shared/fx/sap.ts'
import { listTrmFxApp, loadFxFor, loadTrmFxAppFor } from '../../shared/fx/app-str.ts'
import { createAppStrRecord, getAppStrRecord, updateAppStrRecord } from '../fx-blotter/appStr.ts'
import { createSpotTransaction } from './api.ts'
import { SPOT_PARAM_PROGRAM, type SpotPorts } from './spotCreate.ts'

/** Middleware resource of ZSGTSFTR_SET_SPT. */
export const SET_SPT_RESOURCE = 'setSpt'

export const spotPorts: SpotPorts = {
  async readSpotRow(key) {
    const rows = await fxList('inSpot', key)
    return rows[0] ?? null
  },
  async loadOriginal(key) {
    const [fx, app] = await Promise.all([loadFxFor([key]), loadTrmFxAppFor([key])])
    return { fx: fx[0] ?? null, app: app[0] ?? null }
  },
  async findDealTransactions(dealId, dealType) {
    const apps = await listTrmFxApp(`ZtsfDealID eq ${odataString(dealId)} and ZtsfDealType eq ${odataString(dealType)}`)
    return apps.map((a) => ({ CompanyCode: a.CompanyCode, FinancialTransaction: a.FinancialTransaction }))
  },
  loadSetupRows: () => fxList(SET_SPT_RESOURCE),
  loadCompanies: () => fxList('comp'),
  loadParams: () => fxList('catrParam', { PROGNAM: SPOT_PARAM_PROGRAM }),
  createFx: createSpotTransaction,
  getAppStr: (key) => getAppStrRecord(key.CompanyCode, key.FinancialTransaction),
  createAppStr: (key, fields) => createAppStrRecord(key.CompanyCode, key.FinancialTransaction, fields),
  updateAppStr: (key, fields) => updateAppStrRecord(key.CompanyCode, key.FinancialTransaction, fields),
  async updateSpotRow(key, changes) {
    await fxUpdate('inSpot', key, { ...changes, ...(await changedStamp()) })
  },
  now: () => new Date(),
}


import type { AppStrFields, AppStrRecord } from '../fx-blotter/appStr.ts'
import type { FxRow } from '../../shared/fx/mw.ts'
import type { Ports } from './analysis.ts'

/** In-memory stand-ins for the Deal ID, invoice-reference and APP_STR services, shared by the analysis tests. */
export const dealRow = (over: FxRow = {}): FxRow => ({
  ZDEAL_ID: '1000000231',
  ZDEAL_TYPE: 'FX',
  ZSUB_TYPE: 'FX1',
  ZDEAL_STAT: '01',
  ZMC_REF: '2000000028',
  ZBUKRS1: 'SG03',
  ZRFHA1: '100001',
  ZBUKRS2: 'SG03',
  ZRFHA2: '100002',
  ...over,
})

export const rec = (rfha: string, over: Partial<AppStrRecord> = {}, bukrs = 'SG03'): AppStrRecord => ({
  CompanyCode: bukrs,
  FinancialTransaction: rfha,
  TxnStatus: '07',
  ZtsfDealID: '1000000231',
  ZtsfDealType: 'D1',
  ZtsfDealDesc: 'Deal',
  ZtsfMcRefNo: '2000000028',
  ...over,
})

type Log = string[]

/** An in-memory stand-in for the three services, logging every write in order. */
export function fake(opts: { deal?: FxRow; app?: AppStrRecord[]; inv?: FxRow[]; failOn?: string } = {}) {
  const log: Log = []
  const state = {
    deal: opts.deal ?? dealRow(),
    app: new Map((opts.app ?? []).map((r) => [`${r.CompanyCode}|${r.FinancialTransaction}`, { ...r }])),
    inv: [...(opts.inv ?? [])],
  }
  const maybeFail = (what: string) => {
    if (opts.failOn === what) throw new Error(`${what} refused`)
  }
  const ports: Ports = {
    async patchDeal(_row, changes) {
      maybeFail('patchDeal')
      log.push(`deal ${JSON.stringify(changes)}`)
      state.deal = { ...state.deal, ...(changes as FxRow) }
    },
    readDeal: async () => state.deal,
    listInvoiceRefs: async () => [...state.inv],
    async createInvoiceRef(row) {
      maybeFail('createInvoiceRef')
      log.push(`inv+ ${String(row['ZINV_TRM_NO'])}`)
      state.inv.push(row as FxRow)
    },
    async updateInvoiceRef(key) {
      log.push(`inv~ ${key['ZINV_TRM_NO']}`)
    },
    async deleteInvoiceRef(key) {
      maybeFail('deleteInvoiceRef')
      log.push(`inv- ${key['ZINV_TRM_NO']}`)
      state.inv = state.inv.filter((r) => r['ZINV_TRM_NO'] !== key['ZINV_TRM_NO'])
    },
    getAppStr: async (c, r) => state.app.get(`${c}|${r}`) ?? null,
    async createAppStr(c, r, f: AppStrFields) {
      log.push(`app+ ${c}|${r} ${JSON.stringify(f)}`)
      state.app.set(`${c}|${r}`, { CompanyCode: c, FinancialTransaction: r, ...f })
    },
    async updateAppStr(c, r, f: AppStrFields) {
      maybeFail('updateAppStr')
      log.push(`app~ ${c}|${r} ${JSON.stringify(f)}`)
      state.app.set(`${c}|${r}`, { ...state.app.get(`${c}|${r}`)!, ...f })
    },
    async clearAppStrLink(c, r) {
      maybeFail('clearAppStrLink')
      log.push(`app0 ${c}|${r}`)
      const cur = state.app.get(`${c}|${r}`)!
      const { ZtsfDealID: _a, ZtsfDealType: _b, ZtsfDealDesc: _c, ZtsfMcRefNo: _d, ...rest } = cur
      state.app.set(`${c}|${r}`, rest as AppStrRecord)
    },
  }
  return { ports, log, state }
}


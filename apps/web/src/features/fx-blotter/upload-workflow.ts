import { service } from '@slc/api-client'
import { FX_TXN_STATUS, FX_TXN_STATUS_LABEL } from '../../shared/fx/txn-status.ts'
import { sapMessage, settleDeal } from './api.ts'
import { fieldsOfRow, saveAppStr, type AppStrFields } from './appStr.ts'
import { ENTITIES, SPOT_TXN_TYPES, TRANSACTION_TYPES, pairOf } from './data.ts'
import { declaredProperties } from './extendedFields.ts'
import { toISO } from './format.ts'
import { validateUploadRows } from './logic.ts'
import { parseUploadDate, uploadNumber } from './upload-schema.ts'
import { createBlotterDeal } from './workflow.ts'
import type { BlotterRow, BusinessPartner, UploadLevel, UploadRow } from './types.ts'

export type UploadCapabilities = {
  fx: ReadonlySet<string>
  app: ReadonlySet<string>
  appLengths: ReadonlyMap<string, number>
  settle: boolean
}

export async function loadUploadCapabilities(): Promise<UploadCapabilities> {
  const read = async (key: string): Promise<string> => {
    const response = await fetch(service(key)('$metadata'), { headers: { accept: 'application/xml' }, credentials: 'same-origin' })
    if (!response.ok) throw new Error(`Could not check the upload connection (${key}: ${response.status}).`)
    return response.text()
  }
  const [fx, app] = await Promise.all([read('fx'), read('trmfxapp')])
  const result = uploadCapabilities(fx, app)
  if (!result.fx.has('FinancialTransaction') || !result.app.has('TxnStatus')) throw new Error('The connected services do not provide FX upload and workflow data.')
  return result
}

export function uploadCapabilities(fx: string, app: string): UploadCapabilities {
  const appType = /<EntityType\s+Name="TrmFxApp[^"]*"[\s\S]*?<\/EntityType>/.exec(app)?.[0] ?? ''
  const lengths = new Map<string, number>()
  for (const match of appType.matchAll(/<Property\s+Name="([^"]+)"[^>]*MaxLength="(\d+)"/g)) lengths.set(match[1]!, Number(match[2]))
  return { fx: declaredProperties(fx, 'FxTransaction'), app: declaredProperties(app, 'TrmFxApp'), appLengths: lengths,
    settle: /<Action\b[^>]*\bName="Settle"[^>]*\bIsBound="true"/.test(fx) }
}

const OPTIONAL_FX: ReadonlyArray<[keyof UploadRow, string[], string]> = [
  ['profitCenter', ['ProfitCenter', 'Prctr'], 'Profit Center'],
  ['businessArea', ['BusinessArea', 'Rbusa'], 'Business Area'],
  ['assignment', ['Assignment', 'Zuond'], 'Mode of Trade'],
  ['remark', ['Characteristics'], 'Remark'],
  ['externalRef', ['ExternalReference', 'Nordext'], 'External Reference'],
  ['financeProject', ['FinanceProject'], 'Finance Project'],
]
const OPTIONAL_APP: ReadonlyArray<[keyof UploadRow, string, string]> = [
  ['deal', 'ZolamDealNo', 'Olam Deal Number'], ['mcRef', 'ZtsfMcRefNo', 'Master Contract Reference'],
  ['dealId', 'ZtsfDealID', 'Deal ID'], ['dealDesc', 'ZtsfDealDesc', 'Deal Description'],
  ['dealType', 'ZtsfDealType', 'Deal Type'], ['dealSeq', 'ZtsfDealSq', 'Deal Sequence'],
  ['foRemark', 'NdfFoRem', 'FO Remark'], ['moRemark', 'NdfMoRem', 'MO Remark'],
]
const isNdfInput = (row: UploadRow): boolean => /NDF/i.test(row.txnType) || ['631', '632'].includes(row.txnType)
const isRemark = (field: keyof UploadRow): boolean => field === 'foRemark' || field === 'moRemark'

/** Shown before confirming; an unsupported field is never silently treated as saved. */
export function unsupportedUploadFields(rows: UploadRow[], caps: UploadCapabilities): string[] {
  return [
    ...OPTIONAL_FX.filter(([field, names]) => rows.some((r) => r[field]) && !names.some((name) => caps.fx.has(name))).map(([, , label]) => label),
    ...OPTIONAL_APP.filter(([field, name]) => rows.some((r) => r[field] && (!caps.app.has(name) || isRemark(field) && !isNdfInput(r)))).map(([, , label]) => label),
  ]
}

export type PreparedUpload = { input: UploadRow; row: BlotterRow; blotterDate: Date }
export type UploadContext = { date: string; group: string; trader: string }

/** Resolve every row before the first write; never fabricate a partner, company or SAP number. */
export function prepareUpload(rows: UploadRow[], context: UploadContext, partners: BusinessPartner[], caps: UploadCapabilities): PreparedUpload[] {
  if (!rows.length) throw new Error('Load at least one upload row.')
  const errors = validateUploadRows(rows).errors
  if (errors.length) throw new Error(errors.join(' '))
  const contextDate = parseUploadDate(context.date)
  if (!contextDate) throw new Error('Blotter Date is invalid.')
  if (!context.group || !context.trader) throw new Error('Group and Trader are required.')
  return rows.map((input, i) => {
    const fail = (message: string): never => { throw new Error(`Row ${i + 1}: ${message}`) }
    const company = ENTITIES.find((e) => e.cocode.toUpperCase() === input.companyCode.toUpperCase())
    if (!company) fail(`Company Code ${input.companyCode} is not in the loaded company list.`)
    const match = partners.find((p) => [p.code, p.short, p.name].some((v) => v.toUpperCase() === input.bp.toUpperCase()))
    const bp = match && !/^(BP100\d|UPL\d+)$/i.test(match.code) ? match.code : input.bp
    if (!/^[A-Z0-9_-]{1,10}$/i.test(bp) || /^(BP100\d|UPL\d+)$/i.test(bp)) fail('Use a SAP Business Partner code, or a short name linked to a real SAP partner in the loaded list.')
    const type = TRANSACTION_TYPES.find((t) => t.code === input.txnType.toUpperCase() || t.desc.toUpperCase() === input.txnType.toUpperCase())
    const product = type?.product ? { productType: type.product, transactionType: type.sapType }
      : (() => { const t = SPOT_TXN_TYPES.find((t) => t.code === input.txnType || t.desc.toUpperCase() === input.txnType.toUpperCase()); return t ? { productType: t.product, transactionType: t.code } : null })()
    if (!product) fail(`Transaction Type ${input.txnType} is not supported. Use a listed SAP type or Spot, TOM, FWD, NDF or DNDF.`)
    const txnType = type?.code ?? (product!.productType === '12D' ? (product!.transactionType === '632' ? 'DNDF' : 'NDF') : product!.productType === '12B' ? 'FWD' : product!.transactionType === '602' ? 'TOM' : 'SPOT')
    const curr1 = input.curr1.toUpperCase()
    const curr2 = input.curr2.toUpperCase()
    const pair = pairOf(`${curr1}/${curr2}`) ?? pairOf(`${curr2}/${curr1}`)
    if (!pair) fail(`Currency pair ${curr1}/${curr2} is not in the loaded rate convention list.`)
    if (!input.valueDate) fail('Value Date is required for direct deal creation. Enter the agreed value date; it is not derived using SAP holiday calendars here.')
    const amt1 = uploadNumber(input.amt1)
    const rate = uploadNumber(input.totalRate)
    const amt2 = curr1 === pair!.lead ? amt1 * rate / pair!.quotePer : amt1 * pair!.quotePer / rate
    if (!Number.isFinite(amt1) || Math.round(amt1 * 10000) <= 0 || !Number.isFinite(amt2) || Math.round(amt2 * 10000) <= 0) fail('Amounts are outside the supported range (four decimal places).')
    if (input.txnStatus && !Object.hasOwn(FX_TXN_STATUS_LABEL, input.txnStatus)) fail(`Transaction Status ${input.txnStatus} is not a valid workflow status.`)
    if (txnType === 'NDF' && !input.ndfRef) fail('NDF Fixing Ref is required.')
    if (txnType === 'NDF' && !input.ndfDate) fail('NDF Fixing Date is required for direct deal creation.')
    for (const name of txnType === 'NDF' ? ['NdfFixingCurrency', 'NdfFixingDate', 'FixingReferenceId'] : []) {
      if (!caps.fx.has(name)) fail(`The connected SAP service cannot save ${name}.`)
    }
    for (const [field, name, label] of OPTIONAL_APP) {
      if (!caps.app.has(name) || isRemark(field) && !isNdfInput(input)) continue
      const length = caps.appLengths.get(name)
      if (length && (input[field]?.length ?? 0) > length) fail(`${label} exceeds the connected service limit of ${length} characters.`)
    }
    if (input.dealType && !/^[A-Z0-9]{1,2}$/i.test(input.dealType)) fail('Deal Type must be a one or two character code when supplied.')
    const blotterDate = input.blotterDate ? parseUploadDate(input.blotterDate)! : contextDate
    const buysFirst = /^(B|BUY|1)$/i.test(input.buySell)
    const swap = input.swap ? uploadNumber(input.swap) : 0
    const row: BlotterRow = {
      id: `UPLOAD-${i + 1}`, seq: i + 1, status: 'DRAFT', draftLabel: `Upload row ${i + 1}`, transactionNumber: '',
      companyCode: company!.cocode, entity: company!.code, group: context.group, trader: context.trader,
      tradeDate: parseUploadDate(input.tradeDate), valueDate: parseUploadDate(input.valueDate),
      txnType, uploadProduct: product!, bp, buySell: buysFirst ? 'B' : 'S', buySell2: buysFirst ? 'S' : 'B',
      curr1, curr2, amt1, amt2, totalRate: rate, swapPoints: swap, spotRate: input.spot ? uploadNumber(input.spot) : rate - swap,
      ndfDate: parseUploadDate(input.ndfDate), ndfRef: input.ndfRef,
      profitCenter: input.profitCenter, businessArea: input.businessArea, portfolio: '', assignment: input.assignment,
      notes: input.remark, externalReference: input.externalRef, financeProject: input.financeProject,
      dealId: input.dealId, mcRef: input.mcRef, dealType: input.dealType.toUpperCase(), fxModel: '',
      dealDescription: input.dealDesc, dealSequence: input.dealSeq, olamDealNumber: input.deal ?? '',
      foRemark: input.foRemark, moRemark: input.moRemark, uploaded: true, uploadBlotterDate: blotterDate,
    }
    return { input, row, blotterDate }
  })
}

export type UploadOutcome = {
  sr: number; state: 'success' | 'partial' | 'error' | 'skipped'; stage: string; message: string
  row: BlotterRow
}

/** Called only for deals this batch just created. Retries use APP_STR alone. */
async function saveStage(row: BlotterRow, caps: UploadCapabilities, intent: 'release' | 'settle' | 'create', status: string): Promise<void> {
  const fields: AppStrFields = { ...fieldsOfRow(row), BlotterDate: toISO(row.uploadBlotterDate!) }
  const supported = Object.fromEntries(Object.entries(fields).filter(([name]) => caps.app.has(name))) as AppStrFields
  try {
    await saveAppStr(row.companyCode!, row.transactionNumber, supported, intent, status)
    row.txnStatus = status
  } catch (error) {
    row.appDataPending = { intent, status, fields: supported as Record<string, string | boolean> }
    throw error
  }
}

/** Serial writes, server-assigned RFHAs, and no automatic retry of a create or settlement. */
export async function processSapUpload(prepared: PreparedUpload[], level: UploadLevel, caps: UploadCapabilities,
  onResult?: (result: UploadOutcome) => void): Promise<UploadOutcome[]> {
  if (level === 'SETTLEMENT' && !caps.settle) throw new Error('The connected SAP service does not support settlement.')
  const results: UploadOutcome[] = []
  let stopped = false
  for (const [i, item] of prepared.entries()) {
    const row = { ...item.row }
    let stage = 'Create deal'
    let result: UploadOutcome
    if (stopped) {
      result = { sr: i + 1, row, state: 'skipped', stage: 'Not started', message: 'Not processed because an earlier row failed. No SAP request was sent for this row.' }
    } else {
      try {
        const booked = await createBlotterDeal(row, item.blotterDate, { initialStatus: item.input.txnStatus || FX_TXN_STATUS.FO_CREATE, appProperties: caps.app })
        Object.assign(row, { transactionNumber: booked.transaction, companyCode: booked.companyCode, status: 'CREATED', live: true,
          txnStatus: item.input.txnStatus || FX_TXN_STATUS.FO_CREATE })
        if (booked.appDataPending) {
          row.appDataPending = booked.appDataPending
          stage = 'Save application data'
          throw new Error(booked.appDataError)
        }
        if (level !== 'CREATE') {
          stage = 'Release to MO'
          await saveStage(row, caps, item.input.txnStatus ? 'create' : 'release', item.input.txnStatus || FX_TXN_STATUS.FO_TO_MO_UNMATCHED)
          row.status = 'RELEASED'
        }
        if (level === 'SETTLEMENT') {
          stage = 'Settle contract'
          await settleDeal(row.companyCode!, row.transactionNumber)
          row.settled = true
          stage = 'Save settlement status'
          await saveStage(row, caps, item.input.txnStatus ? 'create' : 'settle', item.input.txnStatus || FX_TXN_STATUS.MO_MATCH_RELEASE)
        }
        result = { sr: i + 1, row, state: 'success', stage: level === 'SETTLEMENT' ? 'Settled' : level === 'CONTRACT' ? 'Released to MO' : 'Created',
          message: level === 'SETTLEMENT' ? 'Deal created, released to MO and settled in SAP.' : level === 'CONTRACT' ? 'Deal created and released to MO.' : 'Deal created in SAP.' }
      } catch (error) {
        stopped = true
        result = { sr: i + 1, row, state: row.live ? 'partial' : 'error', stage,
          message: `${row.live ? `SAP transaction ${row.transactionNumber} exists${row.settled ? ' and is settled' : ''}. ` : ''}${sapMessage(error)}${!row.live ? ' Check SAP before resubmitting if the request timed out.' : ''}` }
      }
    }
    results.push(result)
    onResult?.(result)
  }
  return results
}

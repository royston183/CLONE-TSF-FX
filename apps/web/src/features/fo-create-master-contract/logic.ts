/**
 * The page's business rules, lifted out of the legacy script as pure functions so the
 * component only holds state. The "Future:" comments mark where the original expected an
 * API call; none exists yet, so contracts live in component state for the session.
 */
import {
  DEFAULT_TOLERANCE,
  EMAIL_RECIPIENT,
  isMultiCommodity,
  findCommodity,
  findEntity,
  findFxModel,
  findPaymentTerm,
} from './data.ts'
import { formatAmount, formatRate, parseAmountInput, parseDMY } from './format.ts'
import type {
  ChildContract,
  ChildStore,
  FieldErrors,
  Filters,
  FormValues,
  MasterContract,
  Sort,
  TradeType,
} from './types.ts'

// ---------------------------------------------------------------- child contracts

const CHILD_DEFS: Array<{
  type: string
  side: 'Sell' | 'Purchase'
  sideCode: string
  sell: 0 | 1 | 2
  buy: 0 | 1 | 2
  trade: TradeType
  desc: [0 | 1 | 2, 0 | 1 | 2, 'S' | 'P']
}> = [
  { type: 'T1S', side: 'Sell', sideCode: '02', sell: 0, buy: 1, trade: 'T1', desc: [0, 1, 'S'] },
  { type: 'T1P', side: 'Purchase', sideCode: '01', sell: 0, buy: 1, trade: 'T1', desc: [1, 0, 'P'] },
  { type: 'T2S', side: 'Sell', sideCode: '02', sell: 1, buy: 2, trade: 'T2', desc: [1, 2, 'S'] },
  { type: 'T2P', side: 'Purchase', sideCode: '01', sell: 1, buy: 2, trade: 'T2', desc: [2, 1, 'P'] },
  { type: 'T3S', side: 'Sell', sideCode: '02', sell: 2, buy: 0, trade: 'T3', desc: [2, 0, 'S'] },
  { type: 'T3P', side: 'Purchase', sideCode: '01', sell: 2, buy: 0, trade: 'T3', desc: [0, 2, 'P'] },
]

/**
 * ABAP-equivalent child setup: each MC gets T1/T2/T3 Sell and Purchase combinations. Both
 * sides of one trade type share a child reference, mirroring the program's number-range
 * reuse. An MC that already has children keeps them and consumes no numbers.
 */
export function ensureChildContracts(
  store: ChildStore,
  contract: MasterContract,
): { store: ChildStore; children: ChildContract[] } {
  const key = String(contract.mcNumber)
  const existing = store.byMc[key]
  if (existing && existing.length) return { store, children: existing }

  const parts = String(contract.entityString || '').split('-').filter(Boolean)
  while (parts.length < 3) parts.push(contract.originEntity || 'ENTITY')
  const entities = parts as [string, string, string, ...string[]]
  const year = parseDMY(contract.mcDate)?.getFullYear() ?? 2026
  const refs = store.nextRef

  const children = CHILD_DEFS.map((d) => ({
    parentMcNumber: contract.mcNumber,
    childType: d.type,
    childContractNo: `${year} / ${contract.mcNumber} / ${d.type}`,
    childReference: refs[d.trade],
    description: `${entities[d.desc[0]]}-${entities[d.desc[1]]}-${d.desc[2]}`,
    sellEntity: entities[d.sell],
    buyEntity: entities[d.buy],
    side: d.side,
    sideCode: d.sideCode,
    tradeType: d.trade,
  }))

  return {
    children,
    store: {
      byMc: { ...store.byMc, [key]: children },
      nextRef: { T1: refs.T1 + 1, T2: refs.T2 + 1, T3: refs.T3 + 1 },
    },
  }
}

export function seedChildStore(contracts: MasterContract[], firstRefs: Record<TradeType, number>): ChildStore {
  let store: ChildStore = { byMc: {}, nextRef: { ...firstRefs } }
  for (const c of contracts) store = ensureChildContracts(store, c).store
  return store
}

// ---------------------------------------------------------------- form

export function blankForm(mcDate = ''): FormValues {
  return {
    originEntity: null,
    mcDate,
    mcAmountUsd: '',
    exchangeRate: '',
    mcReference: '',
    tolerance: DEFAULT_TOLERANCE.T01.toFixed(6),
    commodity: null,
    selectedCommodities: [],
    shipStart: '',
    shipEnd: '',
    paymentTerms: null,
    paymentDate: '',
    portShipment: null,
    portDestination: null,
    fxModel: null,
  }
}

/** Edit and Copy start from an existing contract's values. */
export function formFromContract(c: MasterContract): FormValues {
  return {
    originEntity: c.originEntity || null,
    mcDate: c.mcDate || '',
    mcAmountUsd: formatAmount(c.mcAmountUsd || 0),
    exchangeRate: formatRate(c.exchangeRate || 0),
    mcReference: c.reference || '',
    tolerance: formatRate(c.tolerance || 0),
    commodity: c.commodityCode || null,
    selectedCommodities: c.selectedCommodities ? [...c.selectedCommodities] : [],
    shipStart: c.shipStart || '',
    shipEnd: c.shipEnd || '',
    paymentTerms: c.paymentTerms || null,
    paymentDate: c.paymentDate || '',
    portShipment: c.portShipment || null,
    portDestination: c.portDestination || null,
    fxModel: c.fxModelId || null,
  }
}

/** MC Amount (Origin): USD × rate, blank until both are positive numbers. */
export function originAmount(values: FormValues): string {
  const usd = parseAmountInput(values.mcAmountUsd)
  const rate = parseFloat(values.exchangeRate)
  return !Number.isNaN(usd) && !Number.isNaN(rate) && usd > 0 && rate > 0 ? formatAmount(usd * rate) : ''
}

export function commodityNames(codes: readonly string[]): string[] {
  return codes.map((code) => findCommodity(code)?.name ?? code)
}

/** "Comm. Description Long": the commodity's description, or up to three picked names. */
export function commodityDescription(values: FormValues): { value: string; title: string } {
  if (isMultiCommodity(values.commodity)) {
    const names = commodityNames(values.selectedCommodities)
    const full = names.join(', ')
    const maxShow = 3
    const compact = names.length > maxShow ? `${names.slice(0, maxShow).join(', ')} +${names.length - maxShow} more` : full
    return { value: compact, title: full }
  }
  return { value: findCommodity(values.commodity)?.desc ?? '', title: '' }
}

export function validateForm(values: FormValues): { valid: boolean; errors: FieldErrors } {
  const errors: FieldErrors = {}
  const req = (key: keyof FieldErrors, ok: boolean) => {
    if (!ok) errors[key] = true
  }

  req('originEntity', !!values.originEntity)
  req('mcDate', !!parseDMY(values.mcDate))

  const usd = parseAmountInput(values.mcAmountUsd)
  req('mcAmountUsd', !Number.isNaN(usd) && usd > 0)

  const rate = parseFloat(values.exchangeRate)
  req('exchangeRate', !Number.isNaN(rate) && rate > 0)

  req(
    'commodity',
    isMultiCommodity(values.commodity) ? values.selectedCommodities.length > 0 : !!values.commodity,
  )

  const start = parseDMY(values.shipStart)
  req('shipStart', !!start)
  const end = parseDMY(values.shipEnd)
  req('shipEnd', !!end && (!start || end >= start))

  const tolNum = values.tolerance === '' ? 0 : parseFloat(values.tolerance)
  req('tolerance', !Number.isNaN(tolNum) && tolNum >= 0)

  req('fxModel', !!values.fxModel)

  return { valid: Object.keys(errors).length === 0, errors }
}

/**
 * The contract the form describes. `existing` is the contract being edited, which keeps its
 * status and linked deal; a create or copy starts at status 01 "Created".
 */
export function buildContract(values: FormValues, mcNumber: number, existing: MasterContract | null): MasterContract {
  const entity = findEntity(values.originEntity)
  const comm = findCommodity(values.commodity)
  const fx = findFxModel(values.fxModel)
  if (!entity || !comm || !fx) throw new Error('buildContract called with an unvalidated form')
  const isMulti = isMultiCommodity(values.commodity)

  return {
    mcNumber,
    status: existing ? existing.status : 'Created',
    statusCode: existing ? (existing.statusCode ?? null) : '01',
    originEntity: entity.code,
    originEntityName: entity.name,
    originCurrency: entity.currency,
    fxModelId: fx.id,
    fxModelCode: fx.code,
    fxModelDesc: fx.desc,
    entityString: fx.entity,
    currencyString: fx.currency,
    commodityCode: comm.code,
    commodityName: comm.name,
    selectedCommodities: isMulti ? [...values.selectedCommodities] : null,
    mcDate: values.mcDate,
    mcAmountUsd: parseAmountInput(values.mcAmountUsd),
    mcAmountOrigin: parseFloat((originAmount(values) || '0').replace(/,/g, '')),
    exchangeRate: parseFloat(values.exchangeRate),
    tolerance: parseFloat(values.tolerance || '0'),
    reference: values.mcReference || `MC/${entity.code}/2026/${String(mcNumber).slice(-3)}`,
    paymentTerms: values.paymentTerms || 'P01',
    paymentDate: values.paymentDate || values.shipEnd,
    portShipment: values.portShipment || 'Mumbai',
    portDestination: values.portDestination || 'Singapore',
    shipStart: values.shipStart,
    shipEnd: values.shipEnd,
    linkedDealId: existing ? (existing.linkedDealId ?? null) : null,
  }
}

// ---------------------------------------------------------------- table

const DATE_FIELDS = new Set(['mcDate', 'shipStart', 'shipEnd'])

export function filterSortContracts(
  contracts: readonly MasterContract[],
  search: string,
  filters: Filters,
  sort: Sort,
): MasterContract[] {
  let list = contracts.slice()
  const q = search.trim().toLowerCase()
  if (q) {
    list = list.filter((c) =>
      `${c.mcNumber} ${c.originEntity} ${c.originEntityName} ${c.commodityName} ${c.reference} ${c.fxModelCode}`
        .toLowerCase()
        .includes(q),
    )
  }
  if (filters.status) list = list.filter((c) => c.status === filters.status)
  if (filters.entity) list = list.filter((c) => c.originEntity === filters.entity)
  if (filters.fxModel) list = list.filter((c) => c.fxModelCode === filters.fxModel)
  if (filters.commodity) list = list.filter((c) => c.commodityCode === filters.commodity)

  const { field, dir } = sort
  const key = (c: MasterContract): string | number => {
    const v = c[field]
    if (DATE_FIELDS.has(field)) return parseDMY(String(v))?.getTime() ?? 0
    return typeof v === 'string' ? v.toLowerCase() : v
  }
  list.sort((a, b) => {
    const av = key(a)
    const bv = key(b)
    if (av < bv) return dir === 'asc' ? -1 : 1
    if (av > bv) return dir === 'asc' ? 1 : -1
    return 0
  })
  return list
}

export function totalAmount(contracts: readonly MasterContract[]): number {
  return contracts.reduce((sum, c) => sum + (c.mcAmountUsd || 0), 0)
}

// ---------------------------------------------------------------- send to M.O.

/** ABAP RELEASE_TO_MO moves only a newly created contract (status 01) to status 02. */
export function releaseToMO(c: MasterContract): MasterContract {
  return c.statusCode === '01' || c.status === 'Created'
    ? { ...c, statusCode: '02', status: 'Released to M.O.' }
    : c
}

export function buildContractEmailHtml(contract: MasterContract): string {
  const paymentTermLabel = findPaymentTerm(contract.paymentTerms)?.label ?? (contract.paymentTerms || '—')
  const commodityDesc =
    contract.selectedCommodities && contract.selectedCommodities.length
      ? commodityNames(contract.selectedCommodities).join(', ')
      : contract.commodityName

  const rows: Array<[string, string | number | null | undefined]> = [
    ['Master Contract Number', contract.mcNumber],
    ['Origin Entity', contract.originEntity + (contract.originEntityName ? ` - ${contract.originEntityName}` : '')],
    ['MC Reference No', contract.reference],
    ['MC Date', contract.mcDate],
    ['MC Amount (USD)', formatAmount(contract.mcAmountUsd)],
    ['MC Amount (Origin)', formatAmount(contract.mcAmountOrigin)],
    ['Exchange Rate', formatRate(contract.exchangeRate)],
    ['Currency', contract.originCurrency || '—'],
    ['Tolerance %', formatRate(contract.tolerance)],
    ['Commodity', contract.commodityName],
    ['Commodity Description', commodityDesc],
    ['Shipment Start Date', contract.shipStart],
    ['Shipment End Date', contract.shipEnd],
    ['Payment Terms', paymentTermLabel],
    ['Payment Date', contract.paymentDate],
    ['Port of Shipment', contract.portShipment],
    ['Port of Destination', contract.portDestination],
    ['FX Model', contract.fxModelCode + (contract.fxModelDesc ? ` - ${contract.fxModelDesc}` : '')],
    ['Entity String', contract.entityString],
    ['Currency String', contract.currencyString],
    ['Status', contract.status],
  ]

  const rowsHtml = rows
    .map(([label, raw]) => {
      const value = raw === undefined || raw === null || raw === '' ? '—' : raw
      return (
        '<tr>' +
        `<td style="padding:10px 14px;border:1px solid #E1E9F2;background:#F7FAFD;font-weight:600;color:#1D2D3E;font-size:13px;width:220px;">${label}</td>` +
        `<td style="padding:10px 14px;border:1px solid #E1E9F2;color:#1D2D3E;font-size:13px;">${value}</td>` +
        '</tr>'
      )
    })
    .join('')

  return (
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;border:1px solid #E1E9F2;border-radius:10px;overflow:hidden;">' +
    '<div style="background:#1F6FEB;color:#ffffff;padding:18px 22px;font-size:17px;font-weight:700;">Master Contract Creation Notification</div>' +
    '<div style="background:#ffffff;padding:22px;">' +
    '<p style="margin:0 0 14px;font-size:14px;color:#1D2D3E;">Dear Team,</p>' +
    `<p style="margin:0 0 20px;font-size:14px;color:#1D2D3E;line-height:1.5;">The Master Contract <strong>${contract.mcNumber}</strong> has been successfully created and is available for further processing.</p>` +
    '<div style="font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:#1657C4;margin-bottom:8px;">Contract Details</div>' +
    `<table style="width:100%;border-collapse:collapse;">${rowsHtml}</table>` +
    '</div>' +
    '</div>'
  )
}

/**
 * Mock email service: the payload is fully built so this can later become, e.g.,
 * fetch('/api/notifications/email', { method: 'POST', body: JSON.stringify(payload) }).
 */
export function sendMasterContractEmail(contract: MasterContract) {
  const payload = {
    to: EMAIL_RECIPIENT,
    subject: `Master Contract Creation Notification — ${contract.mcNumber}`,
    html: buildContractEmailHtml(contract),
  }
  console.log('[Mock Email Service] Master Contract creation email:', payload)
  return payload
}

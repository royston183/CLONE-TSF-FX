export type OriginEntity = { code: string; companyCode: string; name: string; currency: string }
/**
 * An FX model as the dropdowns and rows name it. `id` is unique per model and currency string
 * (the dummy's M034a / M034b); entityId / currId are ZSGTSFTR_RULE_BT's ZENT_ID / ZCURR_ID
 * when the model came from MySQL.
 */
export type FxModel = { id: string; code: string; desc: string; entity: string; currency: string; entityId?: string; currId?: string }
export type PaymentTerm = { code: string; label: string }
/**
 * A port / region group (PG01..PG14) or a business region (R01..R09): both are code + label.
 * A port group read from ZSGTSFTR_PORTGRP also carries ZPORT_GRP_DESC as `desc`, the final
 * port description the program writes to ZPOS / ZPOD.
 */
export type CodeLabel = { code: string; label: string; desc?: string }

export type McStatus = 'correction' | 'resubmitted' | 'reversed'

/** One row of the seed list, as typed in the legacy page before derivation. */
export type RawRow = {
  mcRef: number
  fxId: string
  mcAmt: number
  exRate: number
  mcDate: string
  shipStart: string
  shipEnd: string
  origin: string
  region?: string
  specificCommodity?: string
  shipRegion?: string
  destRegion?: string
}

/** A Master Contract Mid-Office sent back to Front Office for correction. */
export type ErrorRow = {
  mcRef: number
  fxId: string
  fxCode: string
  modelDesc: string
  entityId: string
  entityString: string
  currencyI: string
  currencyS: string
  mcBalAmt: number
  mcAmt: number
  mcAmountOrigin: number
  curr1: string
  exRate: number
  mcDate: string
  origin: string
  mcDescription: string
  gtCommodity: string
  specificCommodity: string | null
  commodityText: string
  shipStart: string
  shipEnd: string
  paymentTermsCode: string
  paymentDate: string
  ownExplanation: string
  shipRegionCode: string
  destRegionCode: string
  regionId: string
  utilization: number
  moRemarks: string
  foRemarks: string
  mcAmendedDate: string
  status: McStatus
  /**
   * ZPOS / ZPOD as stored, kept only when no port group's description matches it, so the
   * text stays visible (and is written back unchanged) instead of turning into '—'.
   */
  shipPortText?: string
  destPortText?: string
  /**
   * ABAP status code. '21' lifts the one-month cutoff on MC Amended Date; any other value
   * (and a missing one, read as '11') applies it. The seed rows carry none.
   */
  abapStatus?: string
}

export type ColumnKey =
  | 'select'
  | 'status'
  | 'mcRef'
  | 'fxCode'
  | 'mcBalAmt'
  | 'mcDescription'
  | 'mcDate'
  | 'origin'
  | 'regionId'
  | 'mcAmt'
  | 'curr1'
  | 'exRate'
  | 'shipStart'
  | 'shipEnd'
  | 'gtCommodity'
  | 'commodityText'
  | 'entityId'
  | 'entityString'
  | 'currencyI'
  | 'currencyS'
  | 'modelDesc'
  | 'paymentTermsCode'
  | 'paymentDate'
  | 'ownExplanation'
  | 'portShipment'
  | 'portDestination'
  | 'utilization'
  | 'moRemarks'
  | 'foRemarks'

/** Every sortable column is keyed by the row field it sorts on. */
export type SortField = Extract<ColumnKey, keyof ErrorRow>
export type Sort = { field: SortField; dir: 'asc' | 'desc' }

export type ColumnDef = { key: ColumnKey; label: string; sort: boolean; num?: boolean }

export type Filters = { origin: string; region: string; fxModel: string; dateFrom: string; dateTo: string }

/** The Error Correction modal's editable fields, as the text in each box. */
export type CorrectionForm = {
  amendedDate: string
  amountUsd: string
  exRate: string
  /** Read-only; recalculated from USD × rate as either is typed. */
  amountOrigin: string
  shipStart: string
  shipEnd: string
  /** The dropdowns' hidden values: emptied while the user is typing a new search. */
  paymentTerms: string
  portShipment: string
  portDestination: string
  foRemarks: string
}

/**
 * The last value picked in each dropdown (the original's `correctionForm`). Unlike the
 * hidden value it survives typing, and Update falls back to it.
 */
export type Picks = { paymentTerms: string; portShipment: string; portDestination: string }

export type FieldKey = 'amendedDate' | 'amountUsd' | 'exRate' | 'shipStart' | 'shipEnd' | 'foRemarks'
export type FieldErrors = Partial<Record<FieldKey, boolean>>

export type ToastKind = '' | 'error' | 'warn'
export type Toast = { message: string; kind: ToastKind; id: number }

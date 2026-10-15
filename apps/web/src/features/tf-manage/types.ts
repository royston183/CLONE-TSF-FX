/**
 * A TrdFlow row as the gateway returns it. Property names are the OData field names, so a
 * row can be PATCHed back without a translation layer. Every field is optional: SAP omits
 * nulls from a JSON projection rather than sending them as null.
 */
export type TrdFlowRow = {
  ZtfNo?: string
  ZtfSplit?: string
  ZtfDate?: string
  Zbu?: string
  Zoprtr?: string
  ZblVsslName?: string
  Zcmmd?: string
  ZconNum1?: string
  ZpurInc?: string
  Zpaypur?: string
  Zbplsb?: string
  Zbplbb?: string
  ZconNum2?: string
  Zsalesinc?: string
  Zptss?: string
  Zbslsb?: string
  Zbslbb?: string
  Zotfd?: string
  Zottd?: string
  Zquantity?: number
  Zunit?: number
  Zcprice?: number
  Zttv?: number
  Zpol?: string
  Zpod?: string
  Zsldate?: string
  Zblno?: string
  Zdays?: string
  ZetaDsPort?: string
  Zcob?: string
  Znotify?: string
  Zlc?: string
  Zoentity?: string
  Zsod?: string
  Zbod?: string
  Zaobf13?: string
  Zaobt13?: string
  Zaobf33?: string
  Zaobt33?: string
  Zremark?: string
  ZblRcpdt?: string
  ZflwSts?: string
  ZpolCtry?: string
  ZpodCtry?: string
  ZogbsStatId?: string
  /** The OGBS status text, kept beside its code as SAP's own column does. */
  ZogbsStatDesc?: string
  ZbuId?: string
  ZtfType?: string
  ZtrmComId?: string
  ZtrmComDesc?: string
  ZchName1?: string
  ZchName2?: string
  ZcpmAmt?: number
  /** Blocked amount (ZSGTSFDT_BLK_AMT). */
  Zamt?: number
  ZblkFrom?: string
  ZblkTo?: string
  ZblkRemark?: string
  Ztrader?: string
  ZdealId?: string
  ZottkNo?: string
  ZdttkNo?: string
  /** TF Status and its text (SE11: ZFLW_COD1 "TF Status", ZFLW_STAS1 "TF Status Desc"). */
  ZflwCod1?: string
  ZflwStas1?: string
  /** Blocked Status and its text (SE11: ZFLW_COD2 "Blocked Status", ZFLW_STAS2 "Blocked Status Desc"). */
  ZflwCod2?: string
  ZflwStas2?: string
  /** The trader a flow is blocked under (SE11: ZFO_TRADER "Trader"). */
  ZfoTrader?: string
  ZtfExp?: string
  ZtfDelete?: string
  ZcreatedBy?: string
  ZcreatedDate?: string
  ZcreatedTime?: string
  ZchangedBy?: string
  ZchangedDate?: string
  ZchangedTime?: string
}

/** The composite key identifying one row. */
export type TrdFlowKey = { ZtfNo: string; ZtfSplit: string }

/**
 * Filter state for the list. Empty string means "no filter on this column".
 *
 * The legacy page's five filter dropdowns. The three status filters offer ZSGTSFTR_TF_STAT's
 * codes by type: TF Status type 01 (01, 03, 04), Blocked Status type 02 (11, 12, 14), OGBS
 * Status type 03 (21-26). The Include Expired / Include Deleted checkboxes render disabled.
 */
export type TfFilters = {
  Zbu: string
  Zcmmd: string
  /** TF Status (SE11: ZFLW_COD1). */
  ZflwCod1: string
  ZogbsStatId: string
  /** Blocked Status (SE11: ZFLW_COD2). */
  ZflwCod2: string
}

export const EMPTY_FILTERS: TfFilters = { Zbu: '', Zcmmd: '', ZflwCod1: '', ZogbsStatId: '', ZflwCod2: '' }

/**
 * A Deal ID assigned in the Assign Deal ID popup, held here until the shared Update button
 * commits it — mirroring the legacy prototype's state.pendingDealAssignment.
 */
/** The ZSGTSFTR_BL key of one BL within its trade flow split. */
export type BlKey = { ZblNo: string; ZblSplit: string; ZblReuse: string }

export type PendingBlAssignment = {
  tfKey: TrdFlowKey
  /** Every BL line item this one Deal ID is being assigned to, in a single Update. */
  targets: ReadonlyArray<{
    blId: string
    /** The row's own key, so the assignment can be written back to ZSGTSFTR_BL. */
    bl: BlKey
  }>
  dealId: string
  /** The popup's Invoice Details, written to the same ZSGTSFTR_BL rows with the Deal ID. */
  details: BlInvoiceDetails
  /** Sum of the targeted rows' Quantity, checked against the TF's own Quantity on Update. */
  totalQuantity: number
}

/**
 * The Assign Deal ID popup's Invoice Details as ZSGTSFTR_BL fields, the BL columns the Trade
 * Invoice Workbench builds its lines from (INVOICE_PLAN): SO/PO Date ZSO_DATE, Proposed Inv Date
 * ZINV_DATE, Inv Commodity ZINV_COMM, Inco Terms ZINCO, exception notes ZEXC_NOTES, and the trade
 * flow's GT commodity ZTRM_COM_ID. A blank entry is not written, so it never clears a stored value.
 */
export type BlInvoiceDetails = {
  ZsoDate: string
  ZinvDate: string
  ZinvComm: string
  Zinco: string
  ZexcNotes: string
  ZtrmComId: string
  /** Explicitly blank for normal compliance, X for Yes With Exception. */
  ZblExc?: string
}

/**
 * A ZSGTSFTR_BL row as BL Data 1 shows it, under the middleware's field names. Amounts arrive
 * as DECIMAL strings and are normalised to numbers by the loader.
 */
export type BlRow = {
  ZtfNo?: string
  ZtfSplit?: string
  ZblNo?: string
  ZblSplit?: string
  ZblReuse?: string
  Zblno?: string
  ZblVsslName?: string
  Zgrade?: string
  Zcmmd?: string
  Zquantity?: number
  Zcprice?: number
  ZcpmAmt?: number
  ZdealId?: string
  ZblStatId?: string
  ZblStat?: string
  ZblDate?: string
  ZtsfDmsCode?: string
  ZdmsCodeExc?: string
  ZblExc?: string
  /**
   * Set only on a row Create BL or BL Split added on screen and not yet saved. It identifies
   * the row until Update writes it; a created row has no BL ID before then, since the SNRO range
   * issues that on insert.
   */
  localId?: string
}

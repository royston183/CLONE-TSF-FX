// TRM transactions as the FTR_DISPLAY pop-up shows them (components/trm): what a source reads, what a link opens.
// Shared by the browser and the core; ported from the SAP Reporting app (src/pages/trm-deal, src/api/trmdeal.js).

/** One value of a record as OData sends it. */
export type TrmValue = string | number | boolean | null | undefined;
/** One flow of a transaction (`_Flow` of the NIIF Transaction set). */
export type TrmFlow = Record<string, TrmValue>;
/**
 * The record FTR_DISPLAY is drawn from: the Transaction set of ZFS_SB_TRMPOSVAL26E_O4_API (NIIF) with its `_Flow`, by
 * SAP's property names (CompanyCode, FinancialTransaction, FinancialInstrProductCategory, …). A source of another
 * service returns the same shape: the screen follows FinancialInstrProductCategory (lib/trm/ftr.ts layoutOf).
 */
export interface TrmDeal { [field: string]: TrmValue | TrmFlow[]; _Flow?: TrmFlow[] }
/** Another name for the record a transaction source reads: the model of the FTR_DISPLAY screen. */
export type FtrModel = TrmDeal;

/** A transaction to display: company code and transaction number (as typed, without SAP's leading zeros or with them). */
export interface DealTarget { kind: 'deal'; bukrs: string; deal: string }
/** A security class to display with its transactions in the company code. */
export interface ClassTarget { kind: 'class'; bukrs: string; securityClass: string }
export type TransactionTarget = DealTarget | ClassTarget;

/** A security class and its transactions in one company code (the class pop-up). */
export interface SecurityClassView { securityClass: TrmDeal; transactions: TrmDeal[] }

/**
 * A column or field that holds a TRM number: its value is the transaction (or, with kind 'class', the security class)
 * and `companyField` names the row's field with the company code. It renders as a link that opens the pop-up.
 */
export interface TransactionRef { companyField: string; kind?: 'deal' | 'class' }

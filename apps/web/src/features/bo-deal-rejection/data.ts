/*
 * Static presentation tables of the BO Deal Rejection page (ZSGTSFR092 / ZSGTSF_RFXOP_BO): the ALV
 * field catalogue (labels, types, groups), the list columns and the paging sizes. No business data
 * lives here: the deals, company codes and the status selection are read from SAP in api.ts. The
 * former seeded demo dataset is in fixtures.ts, which only the tests import.
 */
import type { FieldDef, FieldDefs, FieldType, TxnType } from './types.ts'

export const DEFAULT_PAGE_SIZE = 20
export const PAGE_SIZES = [8, 12, 20] as const

/**
 * KEPT STATIC (presentation only): the colour of a Txn Status. 07 / 13 are the statuses the ABAP
 * rejects (07 -> 08, 13 -> 11); any other status uses the draft colour.
 */
export const STATUS_TEXT_CLASS: Record<string, string> = {
  '07': 'status-text-confirmed',
  '13': 'status-text-offset',
}

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export const GROUP_ORDER = ['Transaction', 'Partner & Organisation', 'References', 'Dates', 'Currency & Amounts', 'Rates', 'Option Details', 'Premium', 'Cash Settlement', 'TSF Attributes', 'Profit & Loss', 'Remarks', 'Audit']

/** "key|label|type|group" lines to a field-definition list plus a by-key map. */
function parseDefs(lines: string[]): FieldDefs {
  const list: FieldDef[] = []
  const byKey: Record<string, FieldDef> = {}
  for (const line of lines) {
    const p = line.split('|')
    const d: FieldDef = { key: p[0] ?? '', label: p[1] ?? '', type: (p[2] ?? 'text') as FieldType, group: p[3] ?? '' }
    list.push(d)
    byKey[d.key] = d
  }
  return { list, byKey }
}

/** Field definitions: key | label | type | group.  Types: text, date, time, amt, rate. */
export const FX_FIELD_DEFS = parseDefs([
  'rfha|Transaction|text|Transaction','bukrs|Company Code|text|Transaction','butxt|Company Name|text|Transaction','zcom_id|TSF Entity|text|Transaction','zwaers|Co Code Curr|text|Transaction',
  'sgsart|Product Type|text|Transaction','ltx|Product Type Desc|text|Transaction','sanlf|Product Category|text|Transaction','sfgtyp|Transaction Category|text|Transaction',
  'sfhaart|Transaction Type|text|Transaction','xtext|Transaction Type Description|text|Transaction','saktiv|Active Status|text|Transaction','rfhazul|Active Activity|text|Transaction',
  'txn_status|Txn Status|text|Transaction','ext_stat_desc|External Status Desc|text|Transaction','mat_unmat|Matched / Unmatched|text|Transaction','objnr|Object Number|text|Transaction','refnr|Reference|text|Transaction',
  'kontrh|Business Partner|text|Partner & Organisation','bp_name|Partner Name|text|Partner & Organisation','gsppart|Contact Person|text|Partner & Organisation','nordext|External Reference|text|Partner & Organisation',
  'rdealer|Trader|text|Partner & Organisation','ztrcode|Trader Code|text|Partner & Organisation','trd_name|Trader Name|text|Partner & Organisation',
  'prctr|Profit Center|text|Partner & Organisation','pc_name|Profit Center Name|text|Partner & Organisation','rbusa|Business Area|text|Partner & Organisation','ba_name|Business Area Desc|text|Partner & Organisation',
  'rportb|Portfolio|text|Partner & Organisation','xportb|Accounting Category|text|Partner & Organisation','zgrp|Group|text|Partner & Organisation','grp_desc|Group Desc|text|Partner & Organisation','tsf_code|Blotter Code|text|Partner & Organisation','blo_desc|Blotter Desc|text|Partner & Organisation',
  'refer|Internal Reference|text|References','int_ref_desc|Internal Reference Desc|text|References','zuonr|Finance Project|text|References','zuond|Assignment|text|References','assign_desc|Assignment Desc|text|References','zsubject|Subject|text|References','email_code|Email Code|text|References','merkm|Characteristic|text|References',
  'blotter_date|Blotter Date|date|Dates','dblfz|Trade Date|date|Dates','delfz|Value Date|date|Dates','v_date|Valuation Date|date|Dates','ndf_date|Fixing Date|date|Dates',
  'bs|Buy/Sell|text|Currency & Amounts','bs_o|Buy/Sell (Original)|text|Currency & Amounts','bs_1|Buy/Sell 1|text|Currency & Amounts','bs_2|Buy/Sell 2|text|Currency & Amounts',
  'curr1|Currency 1|text|Currency & Amounts','amt1|Amount 1|amt|Currency & Amounts','curr2|Currency 2|text|Currency & Amounts','amt2|Amount 2|amt|Currency & Amounts',
  'curr_st1|Incoming Currency|text|Currency & Amounts','zamt_st1|Drawing Amount (Incoming)|amt|Currency & Amounts','curr_st2|Outgoing Currency|text|Currency & Amounts','zamt_st2|Drawing Amount (Outgoing)|amt|Currency & Amounts',
  'cpair|Currency Pair|text|Currency & Amounts','zsett_pair|Settlement Pair|text|Currency & Amounts','f_curr1|From Currency|text|Currency & Amounts','t_curr1|To Currency|text|Currency & Amounts','cash_curr|Cash Currency|text|Currency & Amounts','zcash_amt|Cash Amount|amt|Currency & Amounts',
  'spot|Spot Rate|rate|Rates','swap|Swap Rate|rate|Rates','tot_rate|Total Rate|rate|Rates','t_rate|All in Rate|rate|Rates','ospot|Spot Rate (Original)|rate|Rates','oswap|Swap Rate (Original)|rate|Rates','otot_rate|All in Rate (Original)|rate|Rates','ndf_rate|NDF Rate|rate|Rates','ndf_ref|Fixing Reference ID|text|Rates',
  'ztsf_deal_id|TSF Deal ID|text|TSF Attributes','ztsf_deal_desc|TSF Deal Description|text|TSF Attributes','ztsf_mc_ref_no|MC Reference No|text|TSF Attributes','ztsf_deal_type|TSF Deal Type|text|TSF Attributes','zolam_deal_no|Olam Deal No|text|TSF Attributes','ztsf_trftype|Transfer Type|text|TSF Attributes','ztsf_trftype2|Transfer Type 2|text|TSF Attributes','ztsf_exe_co|Executing Company|text|TSF Attributes',
  'zpl|P&L|amt|Profit & Loss','zpl_curr|P&L Currency|text|Profit & Loss','zpl_rate|P&L Rate|rate|Profit & Loss','zpl_lamt|P&L (Local)|amt|Profit & Loss','zpl_lcurr|P&L Local Currency|text|Profit & Loss',
  'fo_remark|FO Remark|text|Remarks','mo_remark|MO Remark|text|Remarks','ndf_fo_rem|NDF FO Remark|text|Remarks','ndf_mo_rem|NDF MO Remark|text|Remarks',
  'dcrdat|Entered On|date|Audit','cruser|Entered By|text|Audit','tcrtim|Entry Time|time|Audit','dupdat|Changed On|date|Audit','upuser|Last Changed By|text|Audit','tuptim|Time Changed|time|Audit',
])

export const OP_FIELD_DEFS = parseDefs([
  'rfha|Transaction|text|Transaction','bukrs|Company Code|text|Transaction','butxt|Company Name|text|Transaction','zcom_id|TSF Entity|text|Transaction',
  'sgsart|Product Type|text|Transaction','ltx|Product Type Desc|text|Transaction','sfhaart|Transaction Type|text|Transaction','xtext|Transaction Type Description|text|Transaction',
  'saktiv|Active Status|text|Transaction','rfhazul|Active Activity|text|Transaction','txn_status|Txn Status|text|Transaction','ext_stat_desc|External Status Desc|text|Transaction','mat_unmat|Matched / Unmatched|text|Transaction',
  'kontrh|Business Partner|text|Partner & Organisation','bp_name|Partner Name|text|Partner & Organisation','gsppart|Contact Person|text|Partner & Organisation','nordext|External Reference|text|Partner & Organisation',
  'rdealer|Trader|text|Partner & Organisation','ztrcode|Trader Code|text|Partner & Organisation','trd_name|Trader Name|text|Partner & Organisation',
  'prctr|Profit Center|text|Partner & Organisation','pc_name|Profit Center Name|text|Partner & Organisation','rbusa|Business Area|text|Partner & Organisation','ba_name|Business Area Desc|text|Partner & Organisation',
  'rportb|Portfolio|text|Partner & Organisation','xportb|Accounting Category|text|Partner & Organisation','zgrp|Group|text|Partner & Organisation','grp_desc|Group Desc|text|Partner & Organisation','tsf_code|Blotter Code|text|Partner & Organisation','blo_desc|Blotter Desc|text|Partner & Organisation',
  'refer|Internal Reference|text|References','int_ref_desc|Internal Reference Desc|text|References','zuond|Assignment|text|References','assign_desc|Assignment Desc|text|References','email_code|Email Code|text|References','merkm|Characteristic|text|References',
  'blotter_date|Blotter Date|date|Dates','dblfz|Trade Date|date|Dates','delfz|Value Date|date|Dates','e_date|Expiry Date|date|Dates',
  'e_type|Exercise Type|text|Option Details','s_type|Settlement Type|text|Option Details','settlfl|Settlement Flag|text|Option Details','sputcal|Put/Call|text|Option Details','soptaus|Option Category|text|Option Details',
  'pc1|Put/Call 1|text|Option Details','pc2|Put/Call 2|text|Option Details','kkurs|Strike Rate|rate|Option Details','exp_rate|Expiry Rate|rate|Option Details',
  'expiry_location|Expiry Location|text|Option Details','expiry_time|Expiry Time|time|Option Details','loc_code_text|Location Code Text|text|Option Details',
  'curr1|Currency 1|text|Currency & Amounts','amt1|Amount 1|amt|Currency & Amounts','curr2|Currency 2|text|Currency & Amounts','amt2|Amount 2|amt|Currency & Amounts','cpair|Currency Pair|text|Currency & Amounts','f_curr1|From Currency|text|Currency & Amounts','t_curr1|To Currency|text|Currency & Amounts',
  'bzbetr|Premium Amount|amt|Premium','wzbetr|Premium Currency|text|Premium','dzterm|Premium Date|date|Premium','pwkurs|Premium Rate|rate|Premium',
  'cs_date|Cash Settlement Date|date|Cash Settlement','cs_amt|Cash Settlement Amount|amt|Cash Settlement','cs_curr|Cash Settlement Currency|text|Cash Settlement','cs_rate|Cash Settlement Rate|rate|Cash Settlement',
  'ztsf_deal_id|TSF Deal ID|text|TSF Attributes','ztsf_deal_desc|TSF Deal Description|text|TSF Attributes','ztsf_mc_ref_no|MC Reference No|text|TSF Attributes','ztsf_deal_type|TSF Deal Type|text|TSF Attributes','zolam_deal_no|Olam Deal No|text|TSF Attributes','ztsf_trftype|Transfer Type|text|TSF Attributes','ztsf_trftype2|Transfer Type 2|text|TSF Attributes','ztsf_exe_co|Executing Company|text|TSF Attributes',
  'zpl|P&L|amt|Profit & Loss','zpl_curr|P&L Currency|text|Profit & Loss','zpl_rate|P&L Rate|rate|Profit & Loss','zpl_lamt|P&L (Local)|amt|Profit & Loss','zpl_lcurr|P&L Local Currency|text|Profit & Loss',
  'fo_remark|FO Remark|text|Remarks','mo_remark|MO Remark|text|Remarks',
  'dcrdat|Entered On|date|Audit','cruser|Entered By|text|Audit','tcrtim|Entry Time|time|Audit','dupdat|Changed On|date|Audit','upuser|Last Changed By|text|Audit','tuptim|Time Changed|time|Audit',
])

/**
 * Table columns shown in the list (ALV order: checkbox, remarks, then the view fields). The
 * remaining ALV fields are shown in the Transaction Details popup.
 */
export const TABLE_COLUMNS: Record<TxnType, string[]> = {
  FX: ['bo_rem', 'rfha', 'txn_status', 'ext_stat_desc', 'bukrs', 'zcom_id', 'bp_name', 'xtext', 'blotter_date', 'dblfz', 'delfz', 'ndf_date', 'ndf_ref', 'bs_1', 'curr1', 'amt1', 'curr2', 'amt2', 't_rate', 'spot', 'swap', 'ndf_rate', 'cash_curr', 'zcash_amt', 'ztsf_deal_id', 'ztsf_mc_ref_no', 'rdealer', 'fo_remark', 'ndf_fo_rem', 'ndf_mo_rem'],
  OP: ['bo_rem', 'rfha', 'txn_status', 'ext_stat_desc', 'bukrs', 'zcom_id', 'bp_name', 'xtext', 'blotter_date', 'dblfz', 'e_date', 'sputcal', 'curr1', 'amt1', 'curr2', 'amt2', 'kkurs', 'e_type', 's_type', 'ztsf_deal_id', 'ztsf_mc_ref_no', 'rdealer', 'fo_remark'],
}


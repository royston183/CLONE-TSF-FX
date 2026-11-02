# Fields required for Execute Settlement and Post Accounting Entries

Scope: the two original `ZSGTSF_RDEAL_TRD_INV` / `ZSGTSF_RDEAL_TRD_POST` exports reviewed on 16 October 2026. This is the field handoff for the [gap audit](Settlement-OData-Gap-Audit-2026-10-16.md).

See also the [house-bank, partner and company-code configuration map](Settlement-Bank-Partner-Company-Configuration.md). It includes dynamic MO letter mappings `ZSGTRMTR_BPEXT.ZHBKID_OAIPL` (IN10) and `ZHBKID_OSIPL` (IN11), which the export's static dependency CSV omitted; confirm these fields in the active backend.

The first group needs missing SAP access or replacement of local storage. Later groups identify existing data paths that need to be reused or completed. **Not every field below is missing from the current APIs.** Live SAP access returned 401 during the audit, so current publication/authorization remains unverified.

The [original-program field inventory CSV](settlement-audit/Original-Program-Table-Fields.csv) contains **578 distinct table/view-field pairs across 55 tables/views**, including labels, types, lengths, decimals, read/write flags and source references. It combines export-marked read/write dependencies; it is a source inventory, not a claim that 578 new API fields are needed. Whole-row operations and export analysis can include fields beyond a minimum UI payload. Manually verified TSF payload fields and app schema additions below supplement that automated inventory.

## 1. Missing SAP access or local substitutes

### ZSGTSFTR_TRD_POS — settlement legs and posting results

Current path: local `/api/localdb/tsf-trade-position`. Need SAP reads and business-action writes. Use client context plus `ZDEAL_ID`, `ZSEQ` as the application key; confirm actual backend DDIC keys.

| Field group | Exact fields |
| --- | --- |
| Identity | `ZDEAL_ID`, `ZSEQ`, `ZBUKRS`, `ZT_TYPE`, `ZRP`, `ZSELL`, `ZBUY` |
| Amounts and dates | `ZAMT`, `ZCURR`, `ZPAY_AMT`, `ZSET_CURR`, `ZDUE_DATE`, `ZP_DATE` |
| Mapping and configuration copied to the leg | `ZD_MAP`, `ZTRF_TYPE`, `ZSET_TYPE`, `ZSET_DESC`, `ZSET_CHECK`, `ZPOST_CHECK`, `ZFI_TYPE`, `ZPOST_DESC`, `ZDOC_TYPE` |
| Sender/payment bank | `ZAHLVID`, `ZHBKID`, `ZHKTID` |
| Receiver bank | `ZREC_HBKID`, `ZREC_HKTID` |
| Debit posting | `ZDR_PK`, `ZDR_ACC`, `ZDR_ACCNT`, `ZDR_CV`, `ZDR_GL`, `ZDR_PRCTR`, `ZDR_RBUSA` |
| Credit posting | `ZCR_PK`, `ZCR_ACC`, `ZCR_ACCNT`, `ZCR_CV`, `ZCR_GL`, `ZCR_PRCTR`, `ZCR_RBUSA` |
| Completion and FI result | `ZEXE_CO`, `ZACC_CO`, `ZBELNR`, `ZMSG` |
| Audit, maintained by backend | `ZCREATED_BY`, `ZCREATED_DATE`, `ZCREATED_TIME`, `ZCHANGED_BY`, `ZCHANGED_DATE`, `ZCHANGED_TIME` |

`ZEXE_CO` is execution completion; `ZSET_CHECK` is configuration. They cannot substitute for each other. `ZDR_ACCNT` / `ZCR_ACCNT` hold account-category labels, while `ZDR_GL` / `ZCR_GL` contain the actual G/L accounts. Return the committed FI result's company, fiscal year and document number; the legacy table exposes `ZBELNR` but the existing app schema has no separate fiscal-year column. Do not invent a `ZGJAHR` table field without a backend change.

Original evidence: `INV_PAI:47`, `INV_PBO:808`, `POST_PBO:603`, `POST_POST:867`, `POST_POST:1181`. Complete current application shape: `packages/gateway/src/sqlite/repositories/trd-pos-columns.ts`.

### ZSGTSFTR_TRD_ACC — posting-type configuration

Current path: locally seeded `/api/localdb/tsf-posting-type`. Need current SAP configuration, read by `ZFI_TYPE`.

| Requirement | Exact fields |
| --- | --- |
| Original-program posting fields | `ZFI_TYPE`, `ZDOC_TYPE`, `ZXBLNR1`, `ZBKTXT`, `ZDEBIT`, `ZDR_ENT`, `ZDR_ACC`, `ZCREDIT`, `ZCR_ENT`, `ZCR_ACC` |
| Additional fields consumed/exposed by current app schema; confirm backend DDIC | `ZPOST_DESC`, `ZDR_TEXT`, `ZCR_TEXT`, `ZREF1`, `ZREF2` |
| Audit/configuration maintenance if exposed | `ZCREATED_BY`, `ZCREATED_DATE`, `ZCREATED_TIME`, `ZCHANGED_BY`, `ZCHANGED_DATE`, `ZCHANGED_TIME` |

Original evidence: `POST_PBO:603` selects the original fields through its join to TRD_ACC at line 661. The text/reference additions above are from the current repository schema, not from explicit original-program field reads.

### TRACC_ACCSYMBREP — clearing/account-symbol mapping

Read fields: **`CHART_OF_ACC`, `AA_REF`, `ACC_SYMBOL`, `CURRENCY`, `GL_ACCOUNT`**.

Required lookups:

- Trade invoice and external-bank clearing: `CHART_OF_ACC = 'OL10'`, **`AA_REF = 'FXEXT10'`**, `CURRENCY = settlement currency`; return `GL_ACCOUNT`.
- FX accounting preview's internal clearing line: `CHART_OF_ACC = 'OL10'`, `AA_REF = 'FXTSF'`, **`ACC_SYMBOL = '8.5'`**; return `GL_ACCOUNT`.

`FXEXT10` is an **AA_REF filter**, not the value of ACC_SYMBOL. The constant named `c_7p1` in the BO source currently contains `'8.5'`; use the exported value, not the constant's misleading name. Original evidence: `POST_POST:267` / `970`, `POST_TXN_P:304` / `335`, `POST_TOP:65`.

### VTBSTC1 — payment instructions and bank/account derivation

Read fields: **`PARTNR`, `BUKRS`, `WAERS`, `ZAHLVID`, `BVTYP`, `HBKID`, `HKTID`**.

Filter by partner + company + currency, then the selected `ZAHLVID` to derive `HBKID` / `HKTID`. Trade-invoice defaults use `ZAHLVID = 'TRDINV'`. Original evidence: `INV_TXN_POST:2118`, `2139`, `2156`, `2169`; `POST_PBO:603` joins VTBSTC1 for trade defaults.

### BKPF — correct FX document lookup

Read/filter fields: **`BUKRS`, `BELNR`, `GJAHR`, `WAERS`, `XBLNR`, `BLART`, `BUDAT`, `XREF2_HD`, `XREVERSAL`**.

Original matching: company + `XBLNR = RFHA`, `BLART = 'TR'`, `BUDAT = transaction maturity`, `XREF2_HD = 'TSF'`, `XREVERSAL = ''`; select Doc 1 / Doc 2 by transaction currency 1 / 2. Fiscal year comes from `GJAHR`. Original evidence: `POST_PBO:431` onward / `INV_PBO:505` onward. Existing JournalEntry access may be extended; an entirely new service is not automatically required. Full document display additionally needs an item-read contract; these two programs launch FB03 rather than define its complete BSEG field contract.

### ZSGTSFCDS_OPTION — option legs (CDS/view, not a base table)

| Field group | Exact source names |
| --- | --- |
| Identity/link/filter | `BUKRS`, `RFHA`, `RFHAZUL`, `ZTSF_DEAL_ID`, `ZTSF_DEAL_TYPE`, `ZTSF_DEAL_SQ`, `ZTSF_MC_REF_NO`, `SAKTIV` |
| Dates/product/partner | `DBLFZ`, `DELFZ`, `E_DATE`, `SGSART`, `SFHAART`, `KONTRH`, `BP_NAME`, `XTEXT` |
| Accounting/entity/status | `PRCTR`, `RBUSA`, `ZCOM_ID`, `ZTSF_EXE_CO`, `TXN_STATUS`, `EXT_STAT_DESC` |
| Option/currency/amount | `PC1`, `PC2`, `CURR1`, `CURR2`, `AMT1`, `AMT2`, `KKURS`, `BZBETR`, `WZBETR` |

Filter `ZTSF_DEAL_ID = selected deal`, exclude `SAKTIV = 3`. **Source-to-result aliases:** `KKURS -> STRIKE`, `BZBETR -> PRE_AMT`, `WZBETR -> PRE_CURR`, `ZTSF_EXE_CO -> SET_CO`, `ZTSF_DEAL_TYPE -> DEAL_TYPE`, `EXT_STAT_DESC -> TXN_DESC`, `ZCOM_ID -> ENTITY`. These aliases are not additional source fields. Original evidence: `INV_PBO:439`, `POST_PBO:340`. The export marks this object unresolved: confirm the active CDS/view and exposed field types before implementation. Option writes need `BAPI_FTR_CHANGE_FXOPTIONS` behavior as well as these reads.

### ZSGTSFTR_DEALDMS / ZSGTSFTR_DMS_TYP — SAP attachment links/configuration

Current paths: local `/api/localdb/tsf-deal-document` and `/api/localdb/tsf-dms-type`.

| Table | Exact fields |
| --- | --- |
| `ZSGTSFTR_DEALDMS` | `ZDEAL_ID`, `ZDMS_CAT`, `ZDMS_TYPE`, `ZDDATE`, `ZDMS_CODE`, `ZSTND_DMS`, `ZCREATED_BY`, `ZCREATED_DATE`, `ZCREATED_TIME`, `ZCHANGED_BY`, `ZCHANGED_DATE`, `ZCHANGED_TIME` |
| `ZSGTSFTR_DMS_TYP` | `ZDMS_CAT`, `ZDMS_TYPE`, `ZDMS_DESC`, `ZDMS_DTYPE`, `ZDMS_DDESC`, `ZSHORT_DESC`, `ZDMS_OBJ`, `ZDMS_RANGE`, `ZDMS_FROM`, `ZDMS_TO`, `ZCREATED_BY`, `ZCREATED_DATE`, `ZCREATED_TIME`, `ZCHANGED_BY`, `ZCHANGED_DATE`, `ZCHANGED_TIME` |

Deal-link key: deal + category + type. Category for this flow: `10`. Original direct edit references only `ZDEAL_ID`, `ZDMS_CAT`, `ZDMS_TYPE`, `ZDDATE` (`INV_F01:555`); the expanded link/type lists come from the repository DDIC-derived schemas and shared DMS integration. The called DMS FM implementation is not included in these exports, so these are app integration requirements, not a verified inventory of that FM's internals.

## 2. Existing data paths to reuse for the remaining logic

| Table | Required fields for these flows | Purpose/current status |
| --- | --- | --- |
| `ZSGTSFTR_DEALID` | `ZDEAL_ID`, `ZDEAL_TYPE`, `ZSUB_TYPE`, `ZDEAL_REF`, `ZDEAL_DESC`, `ZDEAL_STAT`, `ZS_DATE`, `ZE_DATE`, `ZREV_DEDATE`, `ZMC_REF`, `ZTSF_MODEL`, `ZFX_INV_MODEL`, `ZRFHA1`, `ZRFHA2`, `ZTRD_CODE`, `ZDEAL_CURR_ID`, `ZDEAL_CURR_DESC`, `ZSS`, `ZCHANGED_BY`, `ZCHANGED_DATE`, `ZCHANGED_TIME` | Middleware `tsfDealId` exists. Use the invoice-model override; implement revised end-date writes and 20/21/22 checks. |
| `ZSGTSFTR_MAS_CON` | `ZMC_REF_NO`, `ZMC_DESC`, `ZMC_DATE`, `ZMOD_ID`, `ZMOD_DESC`, `ZENT_ID`, `ZENT_DESC`, `ZSHIP_START`, `ZSHIP_END`, `ZORIGIN`, `ZSELL`, `ZBUY`, `ZAMT`, `ZCURR`, `ZPAY_TERM`, `ZPAY_TERMS`, `ZPAY_TERMS_TEXT` | Middleware `masterContract`; original inventory CSV lists additional whole-row/printing fields. |
| `ZSGTSFTR_RULE_BT` | `ZMOD_ID`, `ZMOD_DESC`, `ZSUB_TYPE`, `ZNO_INV`, `ZD1_INV_LINK`, `ZD1_INV_LINK2`, `ZD2_INV_LINK`, `ZD2_INV_LINK2`, `ZD1_PUT_CALL`, `ZD1_ADJ`, `ZD2_ADJ`, `ZLINK_MODEL`, `ZLINK_MB` | Middleware `fxModel`; no-invoice completion, model resolution and Heads Up/difference calculations. |
| `ZSGTSFTR_SET_TYP` | `ZMOD_ID`, `ZT_TYPE`, `ZT_TYP_NO`, `ZSEQ`, `ZBUKRS`, `ZSELL`, `ZBUY`, `ZCURR`, `ZSET_CURR`, `ZD_MAP`, `ZDSS_DEAL`, `ZTRF_TYPE`, `ZSET_TYPE`, `ZSET_DESC`, `ZSET_CHECK`, `ZPOST_CHECK`, `ZFI_TYPE`, `ZPOST_DESC`, `ZLET_CODE`, `ZPREM_ADJ`, `ZPRCTR`, `ZRBUSA`, `ZHEAD_FX`, `ZHEAD_OPT`, `ZACTFX`, `ZACTITM`, `ZACTITM_LESS`, `ZACTOTM` | Middleware `setTyp`; invoice legs, DSS checks and Heads Up/action determination. |
| `ZSGTSFTR_SET_FX` | `ZMOD_ID`, `ZSEQ`, `ZD_MAP`, `ZDSS_DEAL`, `ZBS`, `ZCURR`, `ZACC`, `ZBUKRS`, `ZRBUKRS`, `ZPAY_ID`, `ZBANK_ID`, `ZTRF_TYPE`, `ZSET_TYPE`, `ZSET_DESC`, `ZLET_CODE`, `ZLET_NAME` | Middleware `setFx`; FX sequencing, side/default banks and letter selection. |
| `ZSGTSFTR_COMP` | `ZCOM_ID`, `ZBUKRS`, `ZBUTXT`, `ZBP`, `ZVENDOR`, `ZCUSTOMER`, `ZRBUSA`, `ZRBUSA_B`, `ZPRCTR_B`, `ZFX_PRCTR`, `ZSLC_PRCTR`, `ZORIGIN`, `ZWAERS` | Middleware `comp`; core company/partner and posting dimensions. Printing uses additional company fields in the inventory CSV. |
| `ZSGTRMTR_BPEXT` | `BP`, `BP_NAME`, `HBKID`, `ZHBKID_OGA`, `ZHBKID_DMCC`, `ACCOUNT`, `SHORT_NAME`, `OFC_CODE` | Middleware `trmBpext`; bank-BP routing. |
| `LFB1` | `BUKRS`, `LIFNR`, `AKONT` | Supplier-company reconciliation account; existing Business Partner API client. |
| `KNB1` | `BUKRS`, `KUNNR`, `AKONT` | Customer-company reconciliation account; existing Business Partner API client. |
| `CVI_VEND_LINK` | `PARTNER_GUID`, `VENDOR` | Original bank BP-to-vendor join; existing BP API may supply equivalent mapping. |
| `BUT000` | `PARTNER`, `PARTNER_GUID`, `NAME_ORG1` | BP identity/name and vendor mapping. |
| `T012` | `BUKRS`, `HBKID`, `BANKS`, `BANKL` | House-bank master. Reuse existing house-bank service where covered. |
| `T012K` | `BUKRS`, `HBKID`, `HKTID`, `HKONT`, `BANKN`, `WAERS` | Bank account and G/L; service exists. |
| `T012T` | `BUKRS`, `HBKID`, `HKTID`, `SPRAS`, `TEXT1` | Bank-account description. |
| `BUT0BK` | `PARTNER`, `BKVID`, `BANKS`, `BANKL`, `BANKN` | Partner-bank IDs/details for selected partner. |
| `LFBK` | `LIFNR`, `BANKS`, `BANKL`, `BANKN` | Vendor-bank details used in original bank/letter lookup. |
| `BNKA` | `BANKS`, `BANKL`, `BANKA`, `BRNCH`, `SWIFT` | Bank name, branch and SWIFT for bank display/letters. |
| `ZSGTSFTR_INV_REF` | `ZDEAL_ID`, `ZTTYPE`, `ZAMT`, `ZINV_AMT`, `ZTRD_CURR` | Middleware `invRef`; planned invoice/Heads Up/difference amounts. |
| `ZSGTSFTR_BIL_ADJ` | `ZDEAL_ID`, `ZINV_REF`, `ZINV_TYPE`, `ZAMT`, `ZAMT_USD`, `ZCURR`, `ZDUE_DATE`, `ZHBKID`, `ZHKTID`, `ZPTNR_BKID`, `ZSELL`, `ZBUY`, `ZINV_NO`, `ZINV_DATE`, `ZINV_PDATE` | Middleware `billAdjustment`; core invoice amounts, dates and assigned banks. More invoice/printing fields are in the CSV. |
| `ZSGTSFTR_DEAL_ST` | `ZSUB_TYPE`, `ZDEAL_STAT`, `ZDEAL_SDESC` | Middleware `tsfDealStatus`; status labels/filtering. The app additionally filters `ZDEAL_TYPE`; confirm that column in the actual resource/schema. |
| `ZSGTRMTR_TRADER` | `ZTCODE`, `ZTRADER` | Middleware `trmTrader`; trader display. |
| `ZSGTRMTR_FLOWS` | `ZBUKRS`, `ZFLOW`, `ZDEBIT`, `ZCREDIT`, `ZPC_DR`, `ZPC_CR`, `ZBA_DR`, `ZBA_CR` | Original FX accounting preview: flow-specific debit/credit keys and dimensions. Confirm active object; export lists this dependency unresolved. |
| `ZSGTSFTR_EMLBD` | `ZCAT`, `ZECODE`, `ZTEMP_ID`, `ZTO1`, `ZCC1`, `ZOID`, `ZSUBJECT` | Separate execution-completion email configuration; original filters `ZCAT = '02'`, `ZECODE = 'E024'`. Not the Heads Up data source. |

`ZSGTSFTR_IN_SPOT`, `ZSGTSFTR_SET_SPT`, `ZSGTSFTR_TSF_PAY`, trade-invoice/report tables, printing/address tables and their exact original fields are also included in the CSV. Those existing flows should not be confused with the missing clearing/position contracts.

## 3. Real transaction state versus APP_STR

The original updates **VTBFHA TSF append fields** through `ZSGTRMFM_VTBFHA_EXPORT` plus the appropriate change BAPI. The app writes **ZSGTSFTR_APP_STR / TrmFxApp** instead. These fields are already represented in APP_STR; verify that its backend synchronizes actual transaction state.

| Purpose | Original field names |
| --- | --- |
| Transaction identity | `BUKRS`, `RFHA` |
| Deal link/leg | `ZTSF_DEAL_ID`, `ZTSF_DEAL_TYPE`, `ZTSF_DEAL_SQ`, `ZTSF_MC_REF_NO` |
| Currency | `ZTSF_BCURR`, `ZTSF_SCURR` |
| House-bank/account | `ZTSF_BHBKID`, `ZTSF_BHKTID`, `ZTSF_SHBKID`, `ZTSF_SHKTID` |
| Payment instruction/partner bank | `ZTSF_BPAYID`, `ZTSF_SPAYID`, `ZTSF_RBUKRS`, `ZTSF_RPAYID`, `ZTSF_PBUKRS`, `ZTSF_PPAYID` |
| Transfer/account type | `ZTSF_TRFTYPE`, `ZTSF_TRFTYPE2`, `ZTSF_BNKTYPE`, `ZTSF_BNKTYPE2` |
| Completion/lifecycle | `ZTSF_EXE_CO`, `ZTSF_ACC_CO`, `TXN_STATUS` |

Bank/currency/completion updates: `INV_POST:2787` onward and `INV_TXN_POST:2013` onward. Posting lifecycle update: `POST_TXN_P:737`. The 578-row CSV does not enumerate every dynamically supplied append component, so use this explicit list as well.

## 4. Service results that are not raw table columns

- **FX posting:** company, transaction, fiscal year, committed accounting document, reference key, valuation area and SAP messages; current PostFlows integration already expects these. Preserve currency-side information for correct document mapping.
- **Invoice posting:** company, fiscal year, committed accounting document and SAP messages; persist the correct leg result in SAP TRD_POS.
- **Exchange-rate calculation:** from/to currencies, rate type `M`, value date, direct/indirect rate and quotation factors. Original uses `BAPI_EXCHANGERATE_GETDETAIL`; the app's TCURR path already reads `KURST`, `FCURR`, `TCURR`, `GDATU`, `UKURS`, but that is not by itself proof of full BAPI factor semantics. These raw-rate fields are a supplemental integration list, not direct SELECT dependencies in the export CSV.
- **Printing:** form selection/template text, resolved BP/bank/address data, amount-to-words output and generated PDF. Original uses `READ_TEXT` and Adobe form functions; raw table reads alone do not implement rendering.

For client-dependent tables, handle `CLIENT` / `MANDT` according to the actual DDIC and authenticated SAP client. Source aliases, computed amounts and generated document references must not be added as assumed physical columns.

# Proposed: ZFS_SD_TRMPOSTING — the TBB1 posting run (RFTBBB00) as a service

Registry key `trmposting` (`config/services.json`),
base `/sap/opu/odata4/sap/zfs_sb_trmposting_o4_api/srvd_a2x/sap/zfs_sd_trmposting/0001`.

## Why

The web screen **TBB1 Posting - SAP Standard** (`apps/web/src/features/tbb1-post-flows`) is a
conversion of `RFTBBB00` (Treasury: Post Flows). The parts it reads already come from SAP:

| Screen part | Source | Status |
| --- | --- | --- |
| Company Code value help | `A_CompanyCode` (API_COMPANYCODE_SRV) | live |
| Product / Transaction / Flow Type, Flow Class | `ZFS_SD_TRMMASTER` ProductType, TransactionType, FlowType | live |
| Flows due for posting | VTBFHAPO through the SLC middleware (`vtbfhapo`), FX headers from `FxTransaction` | live, read-only |
| **Execute (the posting run) and its log** | `SUBMIT RFTBBB00` | **no API** |

Until this service exists, Execute shows the flows that are due for posting as a read-only preview.
The screen reads this service's `$metadata` once per page load. When the metadata declares the
entity set `PostingRun`, Execute starts the real run and shows its log, and no web-app change is needed.

## 1. Entity `PostingRun` (create only)

One row per run. The fields are RFTBBB00's selection screen. Select-options without intervals are sent
as comma-separated lists, in the same way the screen offers them (single values, no ranges).

| Field | Type | RFTBBB00 |
| --- | --- | --- |
| `RunId` | `sysuuid_c32` (key, set by SAP) | — |
| `ForeignExchange`, `MoneyMarket`, `Derivatives`, `Securities`, `TradeFinance` | `abap_boolean` | `p_tx` `p_tm` `p_ti` `p_ts` `p_tf` |
| `CompanyCodes` | `char(1000)` list | `s_bukrs` |
| `TransactionFrom`, `TransactionTo` | `tb_rfha` | `s_rfha` (BT, or EQ when only From) |
| `ProductTypes` | list | `s_sgsart` |
| `TransactionTypes` | list | `s_sfhaar` |
| `SecurityIds` | list | `s_ranl` |
| `SecuritiesAccounts` | list | `s_rldepo` |
| `PositionAccounts` | list | `s_posacc` |
| `Counterparties` | list | `s_kontrh` |
| `Portfolios` | list | `s_rportb` |
| `Currencies` | list | `s_wzbetr` |
| `FlowClasses` | list | `s_bkklas` |
| `FlowTypes` | list | `s_fhazba` |
| `Direction` | `tb_ssign` (`+`, `-`, blank) | `p_sign` |
| `DueDateTo` | `dats` | `p_dzterm` |
| `PostingDateTo` | `dats` (nullable) | `p_dbuchu` |
| `ByCurrencyChosen` | `abap_boolean` | `p_wzbetr` |
| `ReleasedOnly` | `abap_boolean` | `p_releas` |
| `PostingDate` | `dats` (nullable) | `p_budat` |
| `DocumentDate` | `dats` (nullable) | `p_bldat` |
| `PostingPeriod` | `monat` | `p_monat` |
| `PostingDateForTranslation` | `abap_boolean` | `p_postda` |
| `TestRun` | `abap_boolean` | `p_test` |
| `PostingScope` | `char(6)`: `payonl` / `opval` / `allval` | `p_payonl` / `p_opval` / `p_allval` |
| `ProcessInPackages` | `abap_boolean` | `p_pack` |
| `PackageSize` | `numc2` | `p_psize` |
| `Multitasking`, `Server`, `ServerGroup`, `Processes`, `TaskPackageSize` | as DBFTI_TR_PAR_CREATEGUI | multitasking block |

The create returns the row with `RunId` filled in.

A RAP handler cannot use `SUBMIT`. So the save sequence calls an RFC-enabled wrapper with
`DESTINATION 'NONE'`, in the same way as `ZFS_SD_TRMFX`'s existing methods:

```abap
FUNCTION z_fs_trm_posting_run          " RFC-enabled
  IMPORTING is_run   TYPE zfs_s_trmposting_run    " the fields above
  EXPORTING et_log   TYPE zfs_t_trmposting_log.   " section 2

  DATA: rt_bukrs TYPE RANGE OF bukrs, rt_rfha TYPE RANGE OF tb_rfha. " … one range per list
  " split each comma list into sign I / option EQ lines; From/To into one BT line

  SUBMIT rftbbb00 WITH p_tx = is_run-foreign_exchange  WITH p_tm = is_run-money_market
                  WITH p_ti = is_run-derivatives       WITH p_ts = is_run-securities
                  WITH p_tf = is_run-trade_finance
                  WITH s_bukrs IN rt_bukrs  WITH s_rfha IN rt_rfha  " … all select-options
                  WITH p_sign   = is_run-direction
                  WITH p_dzterm = is_run-due_date_to   WITH p_dbuchu = is_run-posting_date_to
                  WITH p_wzbetr = is_run-by_currency   WITH p_releas = is_run-released_only
                  WITH p_budat  = is_run-posting_date  WITH p_bldat  = is_run-document_date
                  WITH p_monat  = is_run-posting_period WITH p_postda = is_run-posting_date_transl
                  WITH p_test   = is_run-test_run
                  WITH p_payonl = xsdbool( is_run-scope = 'payonl' )
                  WITH p_opval  = xsdbool( is_run-scope = 'opval' )
                  WITH p_allval = xsdbool( is_run-scope = 'allval' )
                  WITH p_pack   = is_run-in_packages   WITH p_psize = is_run-package_size
                  EXPORTING LIST TO MEMORY AND RETURN.

  " RFTBBB00 collects its messages in the application log it shows on screen 1010
  " (message handler of CL_FTR_… / MAC_MSG_PUTX). Read that log, not the list in memory, and map each
  " message to one ET_LOG line (section 2), with the flow's keys where the message carries them.
ENDFUNCTION.
```

## 2. Entity `PostingLog` (read only)

One row per message of a run, filtered by `RunId` and ordered by `Line`. These are the columns of
screen 1010's list:

| Field | Type | Log column |
| --- | --- | --- |
| `RunId` | `sysuuid_c32` (key) | — |
| `Line` | `int4` (key) | order |
| `MessageType` | `msgty` (`E` `W` `S` `I`) | Type |
| `CompanyCode` | `bukrs` | Company Code |
| `FinancialTransaction` | `tb_rfha` | Transaction |
| `ProductType` | `vvsart` | Product Type |
| `TransactionType` | `tb_sfhaart` | Transaction Type |
| `FlowType` | `tb_sfhazba` (blank for a transaction-level message) | Flow Type |
| `DueDate` | `dats` | Due Date |
| `Direction` | `tb_ssign` | Direction |
| `AccountingDocument`, `FiscalYear` | `belnr_d`, `gjahr` | Document No. / Year |
| `PaymentRequest` | `prq_keyno` | Payment Request |
| `MessageClass`, `MessageNumber`, `Message` | `msgid`, `msgno`, `bapi_msg` | Message |
| `Amount`, `Currency` | `tb_bzbetr`, `waers` | (Display) |

Keep the runs for a short time only, for example a daily job that deletes runs older than seven days.
The web app reads a run's log right after it creates the run.

## What the web app sends and reads

`POST PostingRun` with the body from `postingRunBody()` in `tbb1-post-flows/api.ts`, then
`GET PostingLog?$filter=RunId eq '<id>'&$orderby=Line`. Each log line is mapped by `logLineFrom()`.

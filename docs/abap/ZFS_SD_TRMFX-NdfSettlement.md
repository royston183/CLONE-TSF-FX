# Proposed: NDF settlement fields and a `PostSettlement` action on ZFS_SD_TRMFX

For **FX NDF Settlement (ZSGTSFR028 / ZSGTSF_RBANKSETTLE_NDF)**. The web screen is built: it reads
ZFS_SD_TRMFX's `$metadata` on page load and uses each field and the action **as soon as the service
declares them, under exactly these names**. Until then it shows those columns blank and keeps TBB1
disabled. No frontend change is needed afterwards; only a page reload.

## Why

The report needs four things that no service offers today:

| Report needs | ABAP source | Today |
|---|---|---|
| NDF Rate, Cash Amount, Cash Currency columns (and the letter's amount) | ZSGTSFV_FX `NDF_RATE`, `ZCASH_AMT`, `CASH_CURR` | Stored in FTR by `NdfFixing`, but `FxTransaction` does not return them |
| FI Document column | `BKPF` (blart `TR`, xref2_hd `TSF`, xblnr = deal, waers = cash currency, not reversed) | `API_JOURNALENTRYITEMBASIC_SRV` answers **403** for FS_DEV |
| TBB1 Test Run / TBB1 Post / Execute | `SUBMIT RFTBBB00` (posting run), then `UPDATE vtbfha txn_status = '50'` | No API |
| Letter account lines | `ZSGTSFCL_GET_BANK_SETTLE->GET_DATA`: VTBSTC1 (FX / FX1 / NFX) + T012 / T012K / BNKA / TBCHAIN21 | No API; `API_HOUSEBANKACCOUNT_SRV` answers **403** |

## 1. Five read-only fields on `FxTransaction`

Add them to the custom entity `ZFS_CE_TrmFxTP` and fill them in `ZCL_FS_TRM_FX_QUERY=>read_deal`
(the query and `read` already go through it):

| Field | Type | Filled from |
|---|---|---|
| `NdfFixingRate` | `abap.dec(13,9)` (as `NdfFixing`'s `FixingRate`) | `BAPI_FTR_FXT_GETDETAIL` → `returncashsettlement-ndf_fixing_rate` |
| `CashSettlementAmount` | `abap.dec(23,4)` | `returncashsettlement-cash_settlement_amount` |
| `CashSettlementCurrency` | `waers` | `returncashsettlement-cash_settlement_currency` |
| `AccountingDocument` | `belnr_d` | BKPF, as FORM get_data selects it (see below) |
| `AccountingDocFiscalYear` | `gjahr` | the same BKPF row |

BKPF selection, as in the report:

```abap
SELECT belnr, gjahr FROM bkpf
  WHERE bukrs      = @company_code
    AND xblnr      = @financial_transaction
    AND blart      = 'TR'
    AND xref2_hd   = 'TSF'
    AND waers      = @cash_settlement_currency
    AND xreversal <> '2'
    AND xreversing <> 'X'
  ORDER BY budat DESCENDING
  INTO @DATA(ls_doc) UP TO 1 ROWS.
ENDSELECT.
```

Mark all five `readonly` in the BDEF. The report's `budat IN s_date` condition stays on the screen
(the value-date range is the screen's selection), so the field returns the latest valid document.

## 2. Action `PostSettlement`

Parameter entity:

```abap
@EndUserText.label: 'NDF settlement posting run'
define abstract entity ZFS_AE_TrmFxPostSettlement
{
  KeyDate : abap.dats;     " p_dzterm
  TestRun : abap_boolean;  " p_test
}
```

BDEF, next to `NdfFixing`:

```abap
  action PostSettlement parameter ZFS_AE_TrmFxPostSettlement result [1] $self;
```

`SUBMIT` is not allowed inside a RAP handler, so the handler calls an RFC-enabled wrapper through
`DESTINATION 'NONE'`, in the same pattern as the existing methods. The wrapper runs the report exactly as
ZSGTSF_RBANKSETTLE_NDF does:

```abap
FUNCTION z_fs_trm_post_settlement     " RFC-enabled
  IMPORTING iv_bukrs TYPE bukrs  iv_rfha TYPE tb_rfha  iv_dzterm TYPE dats  iv_test TYPE abap_boolean
  TABLES    et_return STRUCTURE bapiret2.

  DATA rt_bukrs TYPE RANGE OF bukrs.
  DATA rt_rfha  TYPE RANGE OF tb_rfha.
  rt_bukrs = VALUE #( ( sign = 'I' option = 'EQ' low = iv_bukrs ) ).
  rt_rfha  = VALUE #( ( sign = 'I' option = 'EQ' low = iv_rfha ) ).

  SUBMIT rftbbb00 WITH p_tx = 'X' WITH p_tm = 'X' WITH p_ti = 'X' WITH p_ts = 'X' WITH p_tf = 'X'
                  WITH s_bukrs IN rt_bukrs
                  WITH s_rfha  IN rt_rfha
                  WITH p_dzterm = iv_dzterm
                  WITH p_test   = iv_test
                  WITH p_opval  = ''
                  WITH p_allval = 'X'
                  EXPORTING LIST TO MEMORY AND RETURN.

  " Report what was posted: a flow with SBEWEBE = '2' after an update run, as the report checks before
  " setting TXN_STATUS 50; an error message if nothing was posted.
ENDFUNCTION.
```

The handler:
- returns the deal through `read_deal` (so `AccountingDocument` comes back filled after an update run),
- passes RFTBBB00's messages through `reported`,
- fails the instance when nothing could be posted.

**What the web app does with it:** it calls `PostSettlement` per deal. TBB1 uses the deal's value date
as `KeyDate`; Execute uses the selection's "Value Date To", as `FORM all_posting` does. After a
successful update run that reports an `AccountingDocument`, it sets `TrmFxApp` `TxnStatus` = `50`
("Bank Settlement Completed"), then reads the list again.

## 3. Optional: the letter's account lines

The "Kindly credit / debit … our account …" lines need the deal partner's standing instructions
(VTBSTC1, payment types FX / FX1 / NFX) with house bank account T012K, bank master BNKA and routing
TBCHAIN21. Either:

- **grant FS_DEV** `API_HOUSEBANKACCOUNT_SRV` (today 403), and add a small read entity for VTBSTC1; or
- expose `ZSGTSFCL_GET_BANK_SETTLE->GET_DATA`'s output as a read-only entity keyed by company code,
  partner and currency.

Until then the letter shows "WAITING FOR API" for those lines. The partner address already works,
from the partner's **Z002** address usage via `API_BUSINESS_PARTNER`.

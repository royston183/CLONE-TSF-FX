# Proposed: `FixNdf` action on ZFS_SD_TRMFX

> **Implemented on 2026-10-06 as `NdfFixing`** (not `FixNdf`), parameter entity `ZFS_AE_TrmFxNdfFixing` with
> `FixingRate` only (Edm.Decimal 13,9; no `TestRun`). `ZBP_FS_TRMFXTP=>ndffixing` reads the deal's cash
> settlement with `BAPI_FTR_FXT_GETDETAIL`, sets `NDF_FIXING_RATE`, calls `BAPI_FTR_FXT_NDF_FIXING` and commits.
> The web app uses it (UA1 Save Fixing, AE1 Update). Verified on SG03 / 2000000000016: rate 91 accepted, activity
> category 30 -> 55. A deal that is still a contract (category 20, not yet settled by MO) is refused with T1/079.
> The rest of this page is the original proposal, kept for reference.

**Why:** UA1 Save Fixing (ZSGTSF_RFX_NDF_FIX) and AE1 Update (ZSGTSF_RFX_NDF_FIX_FO) record an NDF
fixing rate. In SAP GUI they call `BAPI_FTR_FXT_NDF_FIXING` with an **empty** `cashsettlement`
structure and then write the rate through a TX02 batch input (`TTMS_FX_SETTLEMENT_DATA-SETTLE_RATE`).
`CALL TRANSACTION` cannot run inside RAP, and `ZFS_SD_TRMFX` exposes only create, update, delete
(reverse) and `Settle` (`BAPI_FTR_FXT_SETTLE`). No operation takes a fixing rate, so both web
screens keep their save buttons disabled.

`BAPI_FTR_CASH_SETTLEMENT` carries the rate itself (`NDF_FIXING_RATE`, `CASH_SETTLEMENT_RATE`),
so one bound action replaces the BAPI and the TX02 step.

## 1. Parameter: abstract entity `ZFS_A_TRMFX_NDFFIX`

```abap
@EndUserText.label: 'NDF fixing parameters'
define abstract entity ZFS_A_TRMFX_NDFFIX
{
  FixingRate : tb_kkurs;
  TestRun    : abap_boolean;
}
```

## 2. Behaviour definition `ZFS_CE_TRMFXTP`: one line next to `Settle`

```abap
  action Settle result [1] $self;
  action FixNdf parameter ZFS_A_TRMFX_NDFFIX result [1] $self;
```

Add `FixNdf` to the service binding's exposure (it is exposed automatically through the
projection if the projection uses `use action`).

## 3. Handler in `ZBP_FS_TRMFXTP` (local class `lhc_trmfx`)

Definition:

```abap
    METHODS fix_ndf FOR MODIFY
      IMPORTING keys FOR ACTION TrmFx~FixNdf RESULT result.
```

and in `get_global_authorizations`:

```abap
    IF requested_authorizations-%action-FixNdf = if_abap_behv=>mk-on.
      result-%action-FixNdf = if_abap_behv=>auth-allowed.
    ENDIF.
```

Implementation. This follows the existing `settle` method exactly: `DESTINATION 'NONE'`, `end_luw`, the
same message mapping, and the deal read back as the result.

```abap
  METHOD fix_ndf.
    DATA ls_cash   TYPE bapi_ftr_cash_settlement.
    DATA lt_return TYPE tt_return.
    DATA lv_msgtxt TYPE c LENGTH 220.

    LOOP AT keys INTO DATA(ls_key).
      CLEAR: ls_cash, lt_return, lv_msgtxt.

      IF ls_key-%param-FixingRate IS INITIAL.
        APPEND VALUE #( %tky = ls_key-%tky %fail-cause = if_abap_behv=>cause-unspecific ) TO failed-trmfx.
        APPEND VALUE #( %tky = ls_key-%tky
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                      text     = 'Fixing rate is required' ) ) TO reported-trmfx.
        CONTINUE.
      ENDIF.

      " The rate the SAP GUI programs put into TX02's SETTLE_RATE after the BAPI.
      ls_cash-ndf_fixing_rate = ls_key-%param-FixingRate.

      CALL FUNCTION 'BAPI_FTR_FXT_NDF_FIXING'
        DESTINATION 'NONE'
        EXPORTING  companycode          = ls_key-CompanyCode
                   financialtransaction = ls_key-FinancialTransaction
                   cashsettlement       = ls_cash
                   testrun              = ls_key-%param-TestRun
        TABLES     return               = lt_return
        EXCEPTIONS system_failure        = 1 MESSAGE lv_msgtxt
                   communication_failure = 2 MESSAGE lv_msgtxt
                   OTHERS                = 3.
      IF sy-subrc <> 0.
        APPEND rfc_error( iv_function = 'BAPI_FTR_FXT_NDF_FIXING'
                          iv_text     = lv_msgtxt ) TO lt_return.
      ELSEIF ls_key-%param-TestRun = abap_true.
        APPEND LINES OF end_luw( abap_false ) TO lt_return.
      ELSE.
        APPEND LINES OF end_luw( xsdbool( has_error( lt_return ) = abap_false ) ) TO lt_return.
      ENDIF.

      LOOP AT lt_return INTO DATA(ls_return).
        APPEND VALUE #( %tky = ls_key-%tky %msg = to_message( ls_return ) ) TO reported-trmfx.
      ENDLOOP.
      IF has_error( lt_return ) = abap_true.
        APPEND VALUE #( %tky = ls_key-%tky %fail-cause = if_abap_behv=>cause-unspecific ) TO failed-trmfx.
        CONTINUE.
      ENDIF.

      zcl_fs_trm_fx_query=>read_deal( EXPORTING iv_company_code = ls_key-CompanyCode
                                                iv_transaction  = ls_key-FinancialTransaction
                                                iv_via_rfc      = abap_true
                                      IMPORTING es_deal         = DATA(ls_deal) ).
      APPEND VALUE #( %tky = ls_key-%tky %param = CORRESPONDING #( ls_deal ) ) TO result.
    ENDLOOP.
  ENDMETHOD.
```

## To confirm on the SAP side before relying on it

1. **Which rate field TX02 really wrote.** Run the action with `TestRun = abap_true` on a status-07
   deal and compare with a GUI fixing of the same deal: does `NDF_FIXING_RATE` alone give the same
   result as `SETTLE_RATE`, or must `CASH_SETTLEMENT_RATE` be set as well?
2. **AE1 corrections.** AE1 changes the rate of an already-fixed deal through TX02 only, without the
   BAPI. Check whether `BAPI_FTR_FXT_NDF_FIXING` accepts a second call on a fixed deal. If it refuses,
   AE1 needs a reverse-then-fix sequence or a different BAPI.
3. **The e-mail.** Both programs send the status-10 / status-12 e-mail through
   `ZSGTSFCL_TEMPLATE_EMAIL`. Neither the action nor the web app sends it.

## The web side is already built

No frontend change is needed once `FixNdf` is active. UA1 and AE1 read ZFS_SD_TRMFX's `$metadata`
on page load (`fixNdfAvailable` in `apps/web/src/shared/fx/ndf.ts`):

- **Action not declared** (today): Save Fixing and Update are disabled and say why.
- **Action declared:** both buttons enable after a page reload. Each POSTs
  `FxTransaction(...)/com.sap.gateway.srvd_a2x.zfs_sd_trmfx.v0001.FixNdf` with
  `{ "FixingRate": <rate, 5 decimals>, "TestRun": false }`. On success it PATCHes `TrmFxApp`:
  - **UA1:** `TxnStatus` `10`, plus `NdfFoRem`.
  - **AE1:** `TxnStatus` `12`.

  The worklist is then read again. A refused fixing changes nothing. A status write that fails after
  a successful fixing is reported as such.

The parameter names must stay exactly `FixingRate` and `TestRun`, as in section 1.

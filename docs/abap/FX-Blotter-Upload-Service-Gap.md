# FX blotter upload: enabled with DEALCREATE

The user approved `BAPI_FTR_FXT_DEALCREATE` instead of order creation on 14 October 2026. The web upload now uses the existing `FxTransaction` create service, `TrmFxApp` workflow data, and the bound `Settle` action. Order Create / Order Execute are no longer required for this approved variant.

The binary XLS template still matches the exact 30-column `TY_UPD` layout in `ZSGTSF_PFX_BLOTTER_TSF_MUPD_UI_DATA_EXPORT_20261014_080241`, `INCLUDE__ZSGTSF_PFX_BLOTTER_TSFMUPD_TOP.abap:183`. XLSX, CSV and TSV are also accepted. Codes retain leading zeros; empty rows are skipped; every imported field and the calculated Amount 2 are visible in the preview.

## Processing choices

| Web choice | SAP and workflow operations | Default workflow status |
| --- | --- | --- |
| Create Deal | `FxTransaction` POST → `BAPI_FTR_FXT_DEALCREATE`; save application data | `01` |
| Contract / Release to MO | Create Deal, then update `TrmFxApp` to release to MO; the deal is already a SAP contract | `03` |
| Settlement | Create Deal, release to MO, invoke the bound `Settle` action → `BAPI_FTR_FXT_SETTLE`, then save application status | `07` |

An explicit `ZTXN_STATUS` in the upload is retained throughout the stages. All status codes are checked against the application workflow list. Per-row `ZBLOTR_DATE` is saved when supplied; otherwise the dialog date is used. `DEAL` is the Olam deal number and is saved separately from `ZTSF_DEAL_ID`.

## Error handling and results

All rows are checked and resolved before the first SAP write. The batch processes one row at a time and stops on the first failure. Results distinguish success, partial completion, error and rows not started, with the actual SAP company code, RFHA, stage, amounts and message. Successfully created deals remain in SAP and are added to the blotter immediately, including deals whose later workflow save or settlement fails. Their transaction number opens the details panel.

Process Upload is locked after an attempt, and file/context inputs are locked while processing. The application never automatically repeats a create or settlement. If application data fails after a successful SAP action, Refresh retries only the saved application-data fields and desired status, with the original per-row blotter date. A missing transaction number or failed create response must be checked in SAP before resubmitting an ambiguous request.

The confirmation names any supplied fields the connected service does not expose. Those fields remain visible in the preview and are omitted from the SAP request; they are not presented as saved. Input values exceeding the connected application-data field length are rejected before creation rather than silently truncated.

## Differences from the original uploader

- The original flow (`F01:159`) calls Order Create (`561`), Order Execute (`1432`) and Settle (`1587`). The approved web flow creates a contract directly and uses application workflow release instead of Order Execute.
- The web uses the existing, working Deal Create defaults: valuation class `0011` and no forced portfolio. The original order routine uses valuation class `0005` and portfolio `1000`.
- `V_DATE` must be entered explicitly: the current create service requires it and does not expose the original SAP calendar/transaction-configuration derivation. Type 631 also requires an explicit fixing date and reference.
- Amounts use the blotter lead/follow quote conventions, including per-100 IDR/KWA/VND/TWD pairs and division for reversed pairs. This is not the original report’s internal currency scaling through `TCURX`. Review the calculated Amount 2 before confirming, especially when migrating a file from SAP GUI.
- Company codes must match the loaded company master. Exact numeric SAP transaction types from the existing value help are retained; unknown types are rejected. A BP short name is accepted only when the loaded partner list links it to a real SAP code; otherwise enter the SAP partner code. No synthetic partner or company is created.
- Metadata controls optional field support. Currently `FxTransaction` exposes rates and NDF fixing fields, but lacks Business Area, Profit Center, Mode of Trade, general Remark, External Reference and Finance Project. The web lists the affected supplied fields before processing. Deal linkage and Olam deal number are saved through `TrmFxApp` where exposed. FO/MO remarks are stored in its NDF remark fields for NDF/DNDF transactions; general FX remarks are listed as unsupported. SAP continues to validate business configuration and rejects invalid requests with its own messages.

No new local table or schema migration was added. Exact original calendar, master lookup, currency scaling, valuation/portfolio defaults and omitted field parity would still require SAP service additions. These gaps no longer prevent using the approved DEALCREATE workflow for supported data.

## Spreadsheet layout

```text
BUKRS,T_DATE,BP,PC,UNIT,TYP,T_CURR,T_AMT,O_CURR,DEAL,BUY_SELL,V_DATE,ALL_RATE,SWAP,SPOT,NDF_DATE,NDF_REF,MOT,REMARK,EXT_REF,MC_REF,ZTSF_DEAL_ID,DEAL_DESC,ZDEAL_TYPE,ZDEAL_SEQ,ZBLOTR_DATE,ZFIN_PROJ,ZTXN_STATUS,ZMO_REMARK,ZFO_REMARK
```

Amount 2 is derived and is not an input column. Group and trader remain dialog context.

## Verification

`upload.test.ts` verifies the real XLS template, XLS/XLSX/CSV/TSV round trips, dates, leading-zero codes and malformed inputs. `upload-workflow.test.ts` uses mocked services to verify exact payloads, real returned RFHAs, stage ordering, workflow statuses, per-row dates, NDF reference handling, supported-field warnings, preflight rejection, every failure stage and application-data-only retries. No live SAP transactions were created or settled during testing.

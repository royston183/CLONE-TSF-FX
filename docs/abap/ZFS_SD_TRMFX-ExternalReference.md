# MO deal confirmation: External Ref and Internal Ref

Live metadata was read on 15 October 2026 without changing a SAP transaction.

| Reference | SAP API | State |
| --- | --- | --- |
| Internal Ref | `TrmFxApp.ZolamDealNo`, CHAR(15), keyed by `CompanyCode` + `FinancialTransaction` | Exposed by the connected service. The web saves it with the workflow status and reads it back into the confirmation dialog. |
| External Ref | Proposed `FxTransaction.ExternalReference`, CHAR(16), on the same transaction key | **Not exposed by the connected service. SAP activation is required.** |

The web implementation is ready for the exact `ExternalReference` property below. Until it appears in live `$metadata`, a nonblank External Ref stops confirmation before settlement. Leaving it blank preserves the existing confirmation flow. A failed capability check also stops confirmation.

## Required SAP extension

Extend the existing `ZFS_SD_TRMFX` / `ZFS_SB_TRMFX_O4_API` service's `FxTransaction` entity. Keep the existing company-code and financial-transaction keys, settlement action, authorization checks and error handling.

1. Add a property to the existing entity and expose it through its projection and service binding:

   ```abap
   ExternalReference : tb_nordext;
   ```

   The OData contract must be `ExternalReference`, `Edm.String`, `MaxLength="16"`. It must support reads and updates; the keys remain read-only.

2. In the query/read handler, populate it from the transaction's general contract data `EXTERNAL_REFERENCE` (`NORDEXT`). Return it on both individual and list reads so a refreshed confirmation dialog shows the saved value.

3. In the update handler, process an explicitly supplied `ExternalReference` using the original report's `UPDATE_EXT_REF_FX` mapping:

   ```abap
   " Use the actual parameter names of the existing handler's BAPI structures.
   ls_generalcontractdata-external_reference  = ls_update-ExternalReference.
   ls_generalcontractdatax-external_reference = abap_true.
   ```

   Pass those structures as `GENERALCONTRACTDATA` and `GENERALCONTRACTDATAX` to `BAPI_FTR_FXT_CHANGE`, with the requested `CompanyCode` and `FinancialTransaction`. Run this mapping only when the property's RAP update control flag is set. A request containing this property alone must not reset rates, dates, amounts, partner data or other contract fields. If the current handler uses a different change BAPI for amount/date edits, add the reference-specific BAPI path; merely adding a CDS property does not save it.

4. Follow the service's existing RFC/LUW pattern for BAPI calls, commit/rollback and RAP messages. A BAPI refusal must return an OData error. Do not introduce a direct SQL update to `VTBFHA` or assume a successful HTTP response without checking BAPI messages. Include the updated value in the returned/read representation.

5. Activate the entity, behavior implementation, projection and binding, and refresh SAP Gateway metadata as needed. The web checks live metadata when External Ref is supplied; it does not cache an unsupported result.

These are integration changes for the existing SAP service, not a deployed transport. The handler's source is not present in this workspace, so the mapping snippet must be fitted into that handler on the SAP side.

## Web request and failure behavior

The web validates External Ref at 16 characters and Internal Ref at 15 characters before settlement. It trims surrounding whitespace and never silently truncates a reference.

For each transaction, it checks External Ref capability when needed, checks the current workflow status, settles once, saves External Ref, then saves Internal Ref and workflow status. It omits blank references, preserving existing saved values.

```http
PATCH /api/fx/FxTransaction(CompanyCode='IN11',FinancialTransaction='3000000000006')
If-Match: *
Content-Type: application/json

{"ExternalReference":"BANK-123"}
```

```http
PATCH /api/trmfxapp/TrmFxApp(CompanyCode='IN11',FinancialTransaction='3000000000006')
If-Match: *
Content-Type: application/json

{"TxnStatus":"07","ZolamDealNo":"OLAM-45"}
```

If settlement succeeds but either subsequent write fails, the dialog reports a partial failure and retains both reference values in its retry data. Retry repeats the reference/workflow writes without settling again. Repeating the same reference assignment is idempotent. The workflow stays open until both reference writes succeed.

After SAP activation, validate on an approved test transaction: confirm with both references, read back both entities, refresh the screen, and compare `ExternalReference` with the Treasury transaction's external reference. Verify reference-only PATCH leaves unrelated transaction fields unchanged and a BAPI refusal is returned as an error.

## Original-program evidence

The supplied `ZSGTSF_ROPTION_MO_EXT_UI_DATA_EXPORT_20261014_060427` export maps `GV_EXT` to `GENERALCONTRACTDATA-EXTERNAL_REFERENCE` and calls `BAPI_FTR_FXT_CHANGE` in `INCLUDE__ZSGTSF_ROPTION_MO_EXT_STATO01.abap:304`. Its `UPDATE_VTBFHA` routine sets `LS_FOREX-ZOLAM_DEAL_NO = P_DEAL` at line 376 and passes that structure to `ZSGTRMFM_VTBFHA_EXPORT` before the change BAPI. The export does not include that custom function's implementation.

MO Remarks remains a separate integration gap; this change does not remap the original general `REMARK` field onto an NDF or Options remark field.

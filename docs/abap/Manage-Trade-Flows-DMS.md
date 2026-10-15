# Manage Trade Flows: BL documents

Implemented from `ZSGTSF_RTF_MANAGE_UI_DATA_EXPORT_20261014_180915`.

| Entry point | Category / type | Result |
| --- | --- | --- |
| Upload BL Document | `01/D01` | Upload one original and link the selected saved BL line items |
| Compliance → Yes With Exception | `01/D02` | Upload the exception approval, then open Deal ID assignment for that same selection |
| Compliance → Yes | No upload | Open Deal ID assignment normally |

Uploads use the existing shared `ZFS_SB_ALMDMSDOC_O4_API` transport and `ZSGTSFTR_TSF_DMS` metadata store. BL documents do not create `DEALDMS` rows. The selected BLs must already be saved, including any new split, so their full composite keys exist. Canceling an exception upload returns to the checklist; it does not silently assign a Deal ID. There is no general mandatory-document gate on normal assignment.

## Links and saves

- `DMS_TYP` is read from the existing local configuration for category `01`.
- `D01` updates `ZSGTSFTR_BL_DMS`, keyed by `ZBL_NO`, and each selected `ZSGTSFTR_BL.ZTSF_DMS_CODE`.
- `D02` updates each selected `ZSGTSFTR_BL.ZDMS_CODE_EXC`. It preserves the normal `BL_DMS` mapping because that table has only one row per BL number. The legacy routine writes its exception SAP number into that same mapping and can clear the normal custom code; the web preserves both documents through their separate BL fields.
- The BL document list reads both code fields and the existing mapping, including legacy mismatched custom-code/SAP-number pairs. Duplicate metadata reads do not duplicate displayed documents.
- `ZBL_EXC = X` is staged with an exception assignment and saved by the existing Update flow. Normal compliance explicitly clears the flag. The file upload itself does not change the Deal ID or invoicing status.
- Existing BL fields are updated by the full trade-flow/split/BL/split/reuse key. Creating a newly numbered BL does not copy another BL’s document codes; a split of the same BL can retain its copy.

The service draws the custom code; the browser never increments or invents it. The middleware currently binds `tsfDocument.ZTSF_DMS_CODE` to `ZSGSLCNR24/01`, as the existing shared DMS implementation does. This is a migration difference from the report’s configured `ZSGTSFNR07/01` and `/02` intervals; exact per-type legacy numbering would require allocator support in the middleware. Category and document type are recorded explicitly in metadata.

## Failure handling

Selection, stored BL keys, type configuration, file size and number-range availability are checked before SAP upload. One file is uploaded for the entire selection. If a subsequent metadata or link write fails, the code restores previous references, removes the new metadata and flags the new SAP document for deletion. The failed write is checked as well, since its response may have been lost after commit.

Rollback checks document ownership before restoring a reference so it does not overwrite another upload. If a remaining reference cannot be restored, the SAP document and metadata are retained and the user sees the affected BLs and document number. The dialog blocks duplicate submission and closing during upload. This is compensating rollback across separate services, not a database transaction across SAP and MySQL.

## Verification

Tests in `bl-dms.test.ts` cover normal and exception uploads, selection across BLs and splits, preserved references, metadata/map/BL failures, a lost write response, incomplete rollback, concurrent replacement, and exception flag persistence. Existing Manage Trade Flows and shared DMS tests also pass. Browser checks use mocked API calls; no live documents or business records are created during verification.

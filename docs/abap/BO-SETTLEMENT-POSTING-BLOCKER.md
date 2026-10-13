# BO settlement posting: verified blocker and required backend work

## Live verification on 9 October 2026

Authenticated requests through the running gateway returned:

| Request | Result |
| --- | --- |
| `GET /api/trmposting/$metadata`, Accept application/xml | HTTP 404, SAP `/IWBEP/CM_V4_COS/014`: Service group `ZFS_SB_TRMPOSTING_O4_API` not published |
| `GET /api/trmfx/$metadata`, Accept application/xml | HTTP 200; actions `Settle`, `NdfFixing`; no accounting posting action |
| `GET /api/trmfxapp/$metadata`, Accept application/xml | HTTP 200; entity set `TrmFxApp`; no accounting posting action |

`trmposting` is configured in `config/services.json` as a proposed service. Its existing design is
[ZFS_SD_TRMPOSTING.md](./ZFS_SD_TRMPOSTING.md). Publishing the service requires SAP backend work;
changing the gateway URL or fabricating a document number cannot resolve this response.

## Current application behavior

In `apps/web/src/features/bo-post-accounting-settlement/index.tsx`, Post FX Deal, Post Document,
and Posting All validate the selection and return `ACTION_WAITING`. They do not send accounting
posting requests. `NO_DOC` returns an empty string. Therefore the screenshot's message is a
placeholder describing a missing backend, rather than the result of a failed posting attempt.

The existing TBB1 screen already supports the proposed `PostingRun` / `PostingLog` service when
published. The BO settlement screen still needs its own integration after the contract is available.
Publishing the Treasury posting service alone does not implement trade invoice FI posting.

## SAP work required

1. Implement and publish the Treasury posting service described in ZFS_SD_TRMPOSTING.md, or
   supply the metadata and contract of an existing equivalent. Restrict each BO request to the
   selected company code and transaction. Return committed accounting document references and
   BAPI/report messages; a successful HTTP response without a document is not proof of posting.
2. Expose trade invoice posting using the accounting rules of `ZSGTSF_RDEAL_TRD_POST` and
   `BAPI_ACC_DOCUMENT_POST`. The implementation needs the actual report's account determination,
   document type, posting date, currencies, company codes, posting items, and bank configuration.
   Those rules cannot be reconstructed merely from the screenshot or invented in JavaScript.
3. Provide document reads linked to each transaction/settlement leg, returning company code,
   fiscal year, document number, currency/side, and reversal state. The current BO FX grid has
   no BKPF read integration for Doc 1 and Doc 2.
4. Authorize the configured SAP user for the service and required posting/document reads.

## Required posting guarantees

- Re-read the deal and execution flags server-side before posting. `ZEXE_CO` is invoice
  execution completion; `ZSET_CHECK` is configuration and cannot establish completion.
- Use server-side account determination and reject missing banks, invalid dates, or incomplete
  accounting data. The screenshot contains zero invoice/payment amounts; verify actual billing
  amounts before posting rather than manufacturing nonzero amounts.
- Test runs validate without committing or populating document fields.
- Commit only successful SAP postings and return the real company code, fiscal year, and BELNR.
- Make retries idempotent per leg/posting purpose. On timeouts, reconcile an existing document
  before retrying; never blindly issue another posting.
- Persist the SAP result before declaring success. If synchronization to local TRD_POS fails after
  SAP commits, report that the document exists and reconcile it without reposting.
- Populate invoice `ZBELNR` only from that committed result. Populate FX Doc 1/Doc 2 from the
  corresponding committed documents, not from the first two arbitrary log entries.
- Report each leg's result separately for bulk operations; partial success must remain visible.

## Acceptance checks after deployment

1. The service metadata answers HTTP 200 and declares the agreed posting operations.
2. A test run returns accounting validation messages and creates no document.
3. An authorized real posting returns a document that can be independently read in SAP.
4. Repeating the same leg request returns its existing document and creates no duplicate.
5. Refreshing BO displays the persisted document numbers and posting status.
6. Accounting Completed remains blocked until the required execution and document checks pass.

No SAP posting or document creation was performed during this investigation.

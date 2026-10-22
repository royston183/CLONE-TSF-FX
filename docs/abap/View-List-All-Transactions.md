# View List of All Transactions (Deal Dump)

Reporting → FX Structure → FX Front-Office → View List of All Transactions.

Route: `/apps/view-all-transactions`. Menu code: `ZSGTRM_RFX_BLOTTER_LIST`.
Reference: `legacy/ZSGTRM_RFX_BLOTTER_DEAL_DUMP_MODERN_v2.html`, preserved from the supplied HTML.
The supplied ABAP analysis is a reference, not a separately verified ABAP source export.

The React screen preserves the report's filters, date-basis controls, horizontally scrolling
grid, transaction selection/details, column chooser, sorting, pagination and CSV download,
with the application's shared ALM theme, Back and sign-out controls. Excel export preserves
transaction/partner identifiers as text and amounts as numbers. Exports contain all filtered
rows and only chosen columns; CSV text neutralises spreadsheet formulas. Date changes require
Run Report, and export is disabled until the displayed selection is applied. The initial range
is the current month through today rather than the HTML demo's 2012–2030 range.

## Available data

- **Blotter Date:** query `TrmFxApp.BlotterDate`, then join SAP `FxTransaction` by
  `CompanyCode + FinancialTransaction`. There is no nonblank-TSF-Deal-ID restriction.
- **Trade / Value Date:** page `FxTransaction` on `ContractDate` / `ValueDate`, then left join
  append data. Transactions without an append row or TSF Deal ID remain in the result.
- Company value help reads middleware `comp`. Trader names read `trdGrp` (`ZTCODE`, `ZTRADER`);
  if unavailable, actual trader codes remain usable.
- Optional middleware `tsfvFx` reads are scoped to returned company/transaction keys. They
  supply partner/product/transaction descriptions, business-area text, bank reference and
  NDF date/reference where provided. Description failures show a notice and retain Treasury
  data. Required Treasury/append failures fail the report with a retry action.
- Company/date conditions are reapplied locally. This guards selection correctness, not
  authorization. Every join and UI selection uses both company and transaction number.
- Original lead/follow currency order and SAP rate quotation are retained; no guessed
  inversion or conversion. Missing/invalid amounts stay empty; zero remains zero. Reversed
  transactions are retained and marked. Blank blotter dates do not pass a blotter selection.
- Abort signals cancel unmounted/superseded loads; late responses cannot replace newer data.

## Differences from the original Deal Dump

No configured API currently serves `ZSGOELVW_DELDUMP` or its exact
`ZSGTRMTR_INT_FX`, `ZSGTRMTR_EXT_FX`, `ZSGTRMTR_FX_STAT`, `ZSGTRMTR_GROUP`,
`ZSGTRMTR_FIELDS` and `ZSGTRMTR_BPEXT` report contract. This is an integration with the
available FX services, not a claim of exact ABAP parity or coverage of SAP option products.
The supplied notes alone are insufficient to reproduce all classification rules.

Internal / External is populated only when the supplementary product description explicitly
says so. **TSF-linked** filters a nonblank append Deal ID; it is not the original EXT_FX TSF
classification. The DE2 selection is omitted without a source. Status text uses the shared
`ZSGTSFTR_TXNSTAT` mapping for the actual append status, not the unavailable Deal Dump status
configuration. Unknown status codes remain visible. The column catalogue follows the HTML;
it does not claim to read SAP layout variants or dynamic ALV fields.

Deal Source, original TSF flag, Trader Group, Profit Center, Trade Category/Code, BU Requestor
and Accounting Category remain blank until their sources are exposed. Trader Group and
Profit Center filters are visibly unavailable. The Report coverage disclosure explains this.

Transaction numbers open an application read-only details dialog. SAP GUI
`TB_TRANSACTION_TO_DISPLAY`, server upload/download, email and FTP/IHSM execution are not
implemented. The HTML's simulated success actions are not included. The screen performs no
transaction writes or external messaging.

The existing signed-in gateway uses its configured SAP technical identity. There is no claim
of per-user `F_BKPF_BUK`, `F_BKPF_GSB` or `K_PCA` enforcement. Exact report parity requires a
backend service exposing the Deal Dump fields/configuration and enforcing those permissions.

## Validation

`report.test.ts` covers date-query routing, missing TSF/append records, original rate/leg
mapping, composite keys, reversals, selected-date/company bounds, Treasury pagination,
supplementary failures/cancellation, CSV formula protection and menu/route registration.

The production build passes. `tools/review-deal-dump.mjs` runs an isolated Chrome review
with intercepted APIs, covering all three date bases, non-TSF transactions, menu/Back,
details, filters, column selection, pagination, full-result CSV/Excel downloads, dirty
selection protection, light/dark/mobile rendering and empty/error/retry states. Screenshots
and the browser report are written to ignored `data/ui-review/deal-dump/`.

The repository-wide test run reports 2247 passing tests and one failure in the existing
`bo-post-accounting-settlement/logic.test.ts`; repository type checking also fails in that
file. The generated dark-CSS check reports existing stale sheets across other features.
Those unrelated files were not changed as part of this integration. Live SAP responses
have not been verified by this review.

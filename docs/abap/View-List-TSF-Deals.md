# View List of TSF Deals

Reporting → FX Structure → FX Front-Office → View List of TSF Deals

Route: `/apps/view-tsf-deals`; source reference: `legacy/ZSGTSF_RFX_BLOTTER_COMP_Demo.html`.
This React feature uses the Master Contract screens' shared ALM theme, logo, Back/sign-out controls
and accessible read-only dialogs. It implements the Forex half of `ZSGTSF_RFX_BLOTTER_COMP`.

The company/date selection reads current `TrmFxApp` rows with a nonblank `ZtsfDealID` and joins
`FxTransaction` on **CompanyCode + FinancialTransaction**. This replaces the incomplete middleware
`ZSGTSFV_FX` contract, which currently lacks the TSF append columns. `BlotterDate`, rather than
contract date, controls the date selection. Trader filtering uses `Ztrcode` and the `trmTrader`
master's `ZTCODE`. Selection is reapplied locally to protect against widened backend responses.

Cloud `masterContract` enriches by MC reference with left-join semantics. Missing contracts do not
remove transactions. `tsfDealId` supplies `ZTSF_MODEL`; `fxModel` supplies model text and sub-type.
`tsfvFx` provides supplementary counterparty/product descriptions, references and transaction audit
fields, matched on both keys. Failure of this supplementary read produces an explicit notice;
failure of the Treasury source or required cloud joins fails the report without demo rows.

USD is shown on side 1 when it is one of the two currencies. Amounts and buy/sell directions move
together. Rates retain SAP's original quotation, shown in each rate cell's tooltip and the details
dialog. There is no guessed inversion or local-currency conversion. The P&L columns display saved
Deal ID `ZPL/ZPL_CURR` and `ZPL_LAMT/ZPL_LCURR` only when their currency is present. They repeat on
linked transactions and are not totalled. The unavailable `ZSGTSFCDS_FX` rollover aggregation and
"new" P&L calculations are not claimed to be implemented.

Users can search, sort, select, paginate, open transaction/details dialogs, refresh/reset and export
the complete filtered result to Excel. Export retains identifiers as strings and amounts as numbers.
Changed selection is labelled until Run Report applies it; export is disabled for unapplied selection.
Requests are cancelled on refresh/unmount and late results cannot overwrite a newer report.

Options, layout variants, email/IHS delivery, and SAP GUI `TB_TRANSACTION_TO_DISPLAY` launch are
omitted. Transaction links open a read-only display within this application; activity category comes
from the Treasury service. No transaction writes or external messages are sent.

Access uses the existing signed-in gateway and configured SAP technical identity. The current demo
authentication does not implement per-user `F_BKPF_BUK` checks; company value help must not be
described as individual SAP authorization. A per-user authorization service is a separate backend
requirement if the original report's user-specific company permissions are required.

# Execute Settlement: Headsup

Source: `ZSGTSF_RDEAL_TRD_INV_UI_DATA_EXPORT_20261016_140702/SOURCE`.

`F01:144` opens screen 9004. `DIFF:64` (`STATUS_9004`) excludes ENTER/SPOT and calls `PROCESS_DATA`. This is a read-only comparison table, separate from screen 9006's `DIFF_NEW.PROCESS_DATA_NEW`. Headsup does not call `READ_TEXT` or read `ZSGTSFTR_EMLBD`; those dependencies elsewhere in the program do not block this screen.

`DIFF.PROCESS_DATA:94–412`:

- Read `INV_REF` and `BIL_ADJ` for the selected Deal ID, `RULE_BT` for the first four model characters, and `SET_TYP` for the full model with nonblank `ZDSS_DEAL`.
- Link planned invoices by row position to `ZD1_INV_LINK` / `ZD1_INV_LINK2`, then D2's link fields. Exclude DS1/DS2/DSS1/DSS2 from the base-leg count used to choose the RULE_BT row.
- Sum bills whose `ZINV_REF+11(2)` matches the trade. USD uses `ZAMT_USD`; other currencies use `ZAMT`. Pick the linked transaction's absolute amount in the invoice currency.
- Difference is `ABS(signed final invoice total − absolute deal amount)`; display the final total as an absolute amount.
- Use the first DSS-linked SET_TYP row for the trade. Entity is `ZSELL-ZBUY`. With `ZHEAD_FX = X`, append currency and difference to `ZACTFX` when OIL/OGA is either party; otherwise DMCC uses the final invoice amount. Blank configured action/indicator values are not replaced with sample reminders.
- FX1 columns are Entity, Trade Type, FX Deal Amount, Final Invoice Amount, Difference, Currency and Action FX. Close only: the Headsup toolbar excludes SPOT.

`headsup.ts` implements these reads and calculations. The popup loads on open, cancels its request when closed or the deal changes, and distinguishes loading, failed reads, no configured trades and option-data gaps. No email, SAP transaction, settlement position or invoice-difference row is written.

FX2's ITM/OTM action substitution depends on option amounts and expiry dates in `ZSGTSFCDS_OPTION`, which is not exposed by the application's APIs. FX2 Headsup explicitly states that dependency rather than displaying zero option amounts or claiming that the ABAP source is missing.

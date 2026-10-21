# NDF settlement spot routing

Source export: `Downloads/PROGRAM FLOW/ZSGTSFR_SET_WSPACE_UI_DATA_EXPORT_20261014_065008/SOURCE`.

The spot's type is derived independently of its source NDF's D1/D2 slot:

| Original include / FORM | Behavior |
| --- | --- |
| `9011`, `co_code_ndf` (433) | Read `IN_SPOT` for the Deal ID / source deal type with blank `ZRFHA`. Use `ZF_AMT`, `ZCURR`, `ZBS` and `ZSBUKRS`. Translate the invoice entity to the default company through `COMP.ZCOM_ID → ZBUKRS`. |
| `9011`, `process_ndf_spot` (86) | Use the final invoice amount as the fixed side and derive the opposite amount from the entered rate. Do not substitute the source NDF's notional when invoice data is absent. |
| `9011`, `update_vtbfha_fields` (328) | Derive using the original transaction's currency 2, falling back to currency 1 only when the first lookup returns no type. Preserve the source transaction as `ZTSF_EX_OPT_NO`. |
| `9O01`, `derive_deal_type_ndf` (1543) | Resolve `MAS_CON.ZMOD_ID = DEALID.ZTSF_MODEL`, read `TSF_PAY` for that model, and translate the selected company to an entity through `COMP`. Matching `ZD1_BUKRS` / `ZD1_BCURR` gives DS1; matching the D2 pair gives DS2. DS2 takes precedence if both match. |
| `9012`, `co_code_dndf` (159) | DNDF defaults to the original transaction's company. |
| `9012`, `update_vtbfha_fields_dndf` / `derive_deal_type_dndf` (344 / 407) | DNDF uses only the original bought currency and the selected deal's model to derive its spot type from `TSF_PAY` / `COMP`. |

Implementation: `fo-trader-workbench/logic.ts` builds the NDF invoice draft; `spotNdf.ts` re-reads the source, Deal ID, master contract, companies, payment model and settlement mapping before creating a transaction. NDF invoice data is also re-read: a changed amount, currency or direction requires refreshing the draft. An unavailable or unresolved configuration refuses creation. Both SET_FX sides must support the derived type, company and currencies, so the app catches missing settlement configuration before booking. These pre-booking guards prevent the later unmapped-settlement failure.

M032's supplied export defines `TSF_PAY.ZD1_BUKRS = OSIPL`, `ZD1_BCURR = INR`, with empty D2 fields. `COMP` maps OSIPL to IN11. Therefore the D2 NDF's invoice spot defaults to **IN11** and derives **DS1**. Its source can remain SG03 / D2. The former source-slot shortcut incorrectly created an SG03 / DS2 spot.

This code change applies to future spot creation. It does not relabel or move existing SAP transactions between company codes, change shared cloud configuration, or reverse/rebook transactions already created by the former logic.

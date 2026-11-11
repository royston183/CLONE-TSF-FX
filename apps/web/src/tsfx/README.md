# TSF_FX screens (Trade Flows and Generate Invoices)

These screens are imported unchanged in behaviour from the TSF_FX application (`TSF - FX v1`, branch `rd_tsfx`):

| Route | Screen |
| --- | --- |
| `/apps/tf-upload` | Tradeflows Upload |
| `/apps/tf-list` | Tradeflows List |
| `/apps/tf-update-price` | Update Price |
| `/apps/tf-manage` | Manage Tradeflows |
| `/apps/tf-propose` | Propose Tradeflow (AI ranking through the gateway) |
| `/apps/mo-generate-invoices-deal-id` | MO: Generate Invoices for Deal ID (Single Deal ID) |

They keep their own UI kit, module engine, styles and logic in this folder, so they look and behave as they do in TSF_FX.
What differs here is only how they reach their data:

* **SAP** (`ZFS_SB_TRADEFLOW_O4_API`, TRM, house banks, ...): the browser calls `/api/<service>` on the gateway, which holds the
  SAP account and the CSRF token (`core/sap/client.ts` replaced the TSF_FX relay client). `tradeflow` is a new entry in `config/services.json`.
* **SLC middleware**: `/api/middleware/data/<resource>` through the gateway (`core/server/rest-backend.ts` runs in the page).
* **AI** (Propose Tradeflow): `POST /api/tsfx-ai/{proposals,ask,interpret}` in `packages/gateway/src/routes/tsfx-ai.ts`.
  The key is `ANTHROPIC_API_KEY` in the gateway environment; without it the page ranks by closeness.
* **Styles**: every stylesheet here is scoped under `.tsfx` (the frame in `entry.tsx`), so nothing leaks into the other screens.
  Dialogs render into `#tsfx-portal`, which carries the same scope.
* **Types**: this folder is checked by `apps/web/tsconfig.tsfx.json` (TSF_FX's compiler options); the rest of the web app keeps its stricter ones.
  `apps/web/src/tsfx-entry.d.ts` declares the entry for the web app's own check.

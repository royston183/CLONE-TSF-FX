# FX Mid Office and Back Office styling review

Implemented on 15 October 2026.

## Files changed

- `apps/web/src/App.tsx`: enable the established ALM wrapper for the 26 implemented target routes; add a target-only `data-office` boundary.
- `apps/web/src/shared/fx/office-theme.css`: adapt target-specific headers, panels, invoice workspaces, controls, dialogs, dropdowns, numeric headings, scrollbars and responsive layouts.
- `tools/fx-office-review.mjs`: isolated Chrome DevTools screenshot and computed-style review.
- `tools/fx-office-interactions.mjs`: isolated search, picker and populated MTM-table interaction checks.
- This review document.

## References and component mapping

The existing `shared/fx/alm-theme.css` supplies the reference typography, palette, light/dark tokens, common controls, table density, dialogs and body-portal popup styles. `fo-create-master-contract` and `fx-blotter` supplied the rendered reference screens. Their theme and feature source files were left unchanged. The ALM source was not separately available during this review; its existing adapter was reused.

| Reference pattern | Target counterparts |
| --- | --- |
| Page header/title/actions | `app-header`, `app-title`, `header-title`, existing `page-head`/`page-header` |
| Cards and panels | Confirmation/filter cards, invoice analysis cards, settlement panels, MTM reversal cards |
| Reference tables | Native confirmation, invoice, settlement, posting and reversal tables, including dialog tables |
| Inputs/buttons/pagination | Existing common classes plus invoice action/header controls and settlement inline actions |
| Dialogs/dropdowns | Existing modal classes, reversal backdrops, invoice subdialogs, search/calendar panels |

## Coverage

Mid Office: deal confirmation, NDF fixing confirmation, bank reference updates, deal IDs for confirmation, single-deal confirmation including short straddles, invoice status, invoice marking, invoicing lists and invoice generation.

Back Office and Settlement: INR reminders, settlement lists and execution, MO/BO non-flow bank settlement (both routes use the same component), accounting entries for settlement, spot-forward settlement, TBB1 flows, deal rejection, NDF settlement, MTM accounting for OIL/DMCC and other origins, external/TSF MTM and all three MTM reversal screens.

All 26 route IDs are explicitly listed in `ALM_FX_OFFICE_FEATURES`. Menu-to-route mapping was checked against `config/fx-menu.json`, `config/apps.json` and `features/registry.ts`. Unimplemented menu entries were not replaced or scaffolded.

## Visual changes

Both groups now reuse Inter typography, ALM page/surface colors, heading hierarchy, compact rounded panels, 32px controls, muted 11px table headings and 12px cells, horizontal row dividers, selection/hover colors, and existing light/dark tokens. Target-only adapters cover structural differences without changing workflows. Numeric column headings remain right aligned. Legacy column widths, sticky offsets and visibility rules remain in control.

Mobile checks exposed fixed-width short-straddle search and nonwrapping settlement titles. Scoped rules now contain the search control and wrap the title. Search icons retain their text inset. No generated legacy/dark sheets, API code, calculations, route definitions or event handlers were edited.

## Validation and artifacts

- Production build passed.
- Browser sweep: 26 target routes and two references at 1440×1000 light/dark and 390×844 light: 84 captures, no runtime exceptions, no page-level horizontal overflow.
- Reference computed styles matched before/after for page body, heading, table header/cell, button and input on Master Contract and FX Blotter.
- Search/deal input focus and typing passed in invoicing, non-flow settlement, accounting settlement and short-straddle confirmation.
- Accounting settlement's View Deals picker opened successfully.
- Populated India MTM reversal: sorting changed the first row, page 2 activated, checkbox selected its row, transaction details opened and the calendar button was exercised. Screenshots captured detail, selection and calendar states.
- Existing test run: 2,060 pass, one failing test file (`bo-post-accounting-settlement/logic.test.ts`) due to its missing `NOT_SETTLED` import/export. This file was not modified.
- Typecheck fails in that same existing test file, with missing symbols including `NOT_INITIATED`, `sixDone`, `executed` and `accountingRefusal`. No remaining diagnostics were reported in changed application files.
- Lint could not execute: `eslint` is not installed/configured as a dependency, although a root lint script exists.
- Optional generated-dark-sheet check reports 61 stale existing sheets. None was regenerated, which would affect unrelated/reference screens.

Local artifacts are in `data/ui-review/fx-office/` (git-ignored): `gallery.html`, before/final screenshots and JSON reports, `interactions-report.json`, `build.log`, `typecheck.log` and `tests.log`. The gallery links desktop before/after, dark and mobile captures. Two initial before captures were still loading and are identified as unavailable in the gallery.

## Remaining limits

Browser review intercepts API requests in an isolated synthetic session; it does not call SAP or post transactions. Screens without existing offline rows were checked in their selection, empty or API-unavailable state. Live settlement, posting, reconciliation and every data-dependent modal require an authenticated SAP environment for full operational verification. This review does not claim those workflows were exercised end to end.

Tables retain their own column geometry and workflow-specific status indicators. No deliberate new visual design was introduced. Responsive coverage is desktop and mobile, with desktop dark mode; a separate tablet or mobile-dark sweep was not performed.

To repeat the browser checks, run Vite on `127.0.0.1:5182`, launch an isolated headless Chrome with remote debugging on port 9222, then run `node tools/fx-office-review.mjs final` and `node tools/fx-office-interactions.mjs`. API interception is confined to those browser tabs.

# FX Master Contract and Front Office: ALM visual alignment

Date: 15 October 2026.

The first styling pass covers the 15 implemented routes in these two sections. All changes are in `clone-ui`. `C:\Users\FSL044-SIDDHI PADAVE\Downloads\ui-reference` was read only, and its Git working tree was clean before and after inspection. Nothing was committed or pushed to either repository. Environment files were not changed.

## Repository and component inventory

| Area | ALM reference | Clone |
| --- | --- | --- |
| Framework | React 19.1, Vite 7.3; JavaScript JSX | React 19.1, Vite 7.3; TypeScript TSX, npm workspaces |
| Entry and navigation | `src/main.jsx`, hash routes, `config/catalog.mjs` | `apps/web/src/main.tsx`, `App.tsx`, React Router 7, lazy `features/registry.ts` |
| Font assets | `@fontsource-variable/inter`, loaded in `src/main.jsx` | Same installed variable font, already loaded by `main.tsx`; older FX rules were overriding it |
| Styles | Plain CSS: `styles.css`, `dsa-theme.css`, `maintenance.css`, `manualdata.css`, `trmdeal.css` | Global UI tokens, scoped generated legacy sheets, generated dark sheets, feature overrides, shared FX components |
| Tables | Native HTML tables; `SortTh`, `useSort`, maintenance `Workbench` | Native HTML tables, feature sorting/filtering/selection/pagination handlers; no replacement grid dependency |
| Forms and dialogs | Native inputs/selects, maintenance suggestion menus and body-portalled modal, TRM field grids | Native controls, `SelectSearch`, feature dropdowns/calendars/modals, shared status/confirmation portals and linked-deal dialog |
| Icons and charts | Lucide React; native application charts | Lucide React plus existing SVGs and legacy icons; charts outside this pass |
| Themes and breakpoints | Explicit `data-theme`; main content adaptations at 750/600px; shell also uses 1150/850px | Existing explicit theme preference retained; adapter uses the reference's 750/600px content breakpoints and preserves feature-specific table scrolling |

ALM does not contain FX Master Contract or Front Office business screens. The corresponding visual references are its maintenance workbench, Overview summary panels, general form controls, and TRM/maintenance dialogs. No reference business data or functionality was copied into production code.

## Extracted visual specifications

The effective styles come from the final rules in ALM's `dsa-theme.css`, together with the page-specific maintenance/TRM sheets, rather than the earlier declarations in `styles.css`.

| Element | Reference specification used |
| --- | --- |
| Typeface | `'Inter Variable', Inter, 'Segoe UI', Arial, sans-serif`; 13px base |
| Page heading | 23px, weight 800, `#16314f`, letter spacing `-.02em`; 21px below 600px |
| Background / surface / ink | `#f4f7fb` / `#ffffff` / `#22354c` |
| Muted / form label | `#718096` / `#4a5e76` |
| Borders | Panel/table `#e6ebf2`; input `#d9e1eb` |
| Primary / selected | `#1265c8` / `#eaf3ff` |
| Panels / buttons / inputs | 9px / 7px / 6px corner radii |
| Controls | 32px tall; 13px text, 12px form labels |
| Maintenance tables | 11px centered headings, weight 600, `9px 12px` padding; 12px cells, `8px 12px` padding; horizontal separators |
| Row states | Hover `#f7faff`; selected `#eaf3ff`; financial numeric alignment retained |
| Summary panels | Neutral surface and border, 22px value, 11px label, compact padding |
| Dialogs | 12px corners; 16px title; `16px 18px` header, `14px 18px` body, `12px 18px` footer; 12.5px dialog table cells |
| Night theme | Background `#0d1724`, surface `#19293a`, text `#e6eef8`, line `#2a3e53`, accent `#78b7ff` |

The editable FX Blotter uses matching header/value alignment: text and dates align left, amounts and rates align right, and selection checkboxes align centrally. This table-specific exception also aligns headings with the draft-row controls.

## Implemented scope

Master Contract: Create Master Contract, Confirm Master Contract, Update MC Expiry, MC Error Correction, Reject MC after Expiry, and Create Deal ID for Short Straddle.

Front Office: FX Blotter, FX Error Correction, Change Deal ID, Create Deal ID Manually, Early Delivery/Unwinding/Rollover, Additional Spot Booking, Trader Workbench, NDF Fixing, and NDF Fixing Error Correction.

The route wrapper opts these screens into `#alm-fx-ui`. The adapter translates their different token names, including later RMC/blotter token families. It handles lazy stylesheet ordering, fonts, titles, panels, controls, table separators and density, hover/selection, dialogs, portals, focus, disabled/invalid controls, night colors, and responsive layout. The mobile Reject MC selection columns now stack rather than overflowing the viewport.

The previous shared Front Office sheet and broad Master Contract appearance overrides were removed. Master Contract confirmation/drag helpers remain. Generated feature stylesheets are unchanged. A limited set of presentation declarations needs `!important` to override the generated SAP/RMC styles that already use it; display rules, open/closed classes, drag handlers and sticky-column offsets remain owned by the features.

## Files changed

| File | Change |
| --- | --- |
| `apps/web/src/App.tsx` | Explicitly opt 15 existing routes into the scoped ALM adapter |
| `apps/web/src/shared/fx/alm-theme.css` | New shared reference palette, component appearance and responsive adapter |
| `apps/web/src/shared/front-office.css` | Removed obsolete table/modal overrides |
| `apps/web/src/shared/master-contract/design.css` | Retain structural confirmation helpers; remove the superseded appearance layer |
| `tools/fx-visual-servers.mjs` | Local previews; ALM is read only and its Vite cache is in clone data storage |
| `tools/fx-visual-review.mjs` | Repeatable screenshots, computed-style measurements and interaction checks using Chrome CDP |
| `docs/ui/FX-ALM-Visual-Alignment.md` | Inventory, evidence, scope and limitations |

No dependencies, API clients, request payloads, data models, authentication logic, calculations, feature event handlers, or route URLs were changed. The existing fallback behavior remains part of the application; synthetic visual-review master rows exist only in the review tool.

## Visual evidence

Review assets are local under `data/ui-review/fx-alm/` (the existing Git ignore rules exclude `data/`). Open [the before/after gallery](../../data/ui-review/fx-alm/comparison.html) for every route, plus night and mobile views. The [machine-readable report](../../data/ui-review/fx-alm/after-report.json) records viewport sizes, computed styles, overflow and browser exceptions.

Reference at 1440 × 1000:

![ALM maintenance reference](../../data/ui-review/fx-alm/after-reference-maintenance.png)

Create Master Contract before and after, both at 1440 × 1000 using the same existing fallback records:

![Create Master Contract before](../../data/ui-review/fx-alm/before-fo-create-master-contract.png)

![Create Master Contract after](../../data/ui-review/fx-alm/after-fo-create-master-contract.png)

![Create Master Contract form](../../data/ui-review/fx-alm/after-create-contract-dialog.png)

![Required-field validation](../../data/ui-review/fx-alm/after-create-contract-validation.png)

The initial before screenshots for some live-only screens show their unavailable-service state. They are not a like-for-like data comparison with later successful fixture-backed views. No pixel-perfect claim is made.

## Validation

- Production build: passed. The final run required the already approved compiler permission after a sandboxed attempt reported `spawn EPERM`.
- Runtime application source type check: passed using an ignored review config extending the existing web config and excluding `*.test.ts`.
- Full repository tests: 2,053 passed, one failed. The unchanged `bo-post-accounting-settlement/logic.test.ts` imports a missing `NOT_SETTLED` export. The tests were rerun outside the sandbox after Node worker spawning was initially blocked.
- Full repository type check: fails in that same unchanged Back Office test file, including missing names such as `NOT_INITIATED`, `sixDone`, and `executed`.
- Lint: unavailable; the repository's script calls `eslint`, which is not installed.
- Existing generated dark-CSS freshness check: reports 61 stale generated sheets. Those input/output files were not changed in this pass.
- `git diff --check`: passed.
- Browser review: 15 routes in day and night at 1440 × 1000 and in day at 390 × 844. Representative Master Contract and FX Blotter views also checked at 1280 × 800 and 768 × 1024, with ALM captured at the same sizes. No uncaught JavaScript exceptions or page-level horizontal overflow in the captured clone states. The ALM maintenance reference itself overflows at 390px; that source was left untouched.
- Create Master Contract: existing search, MC-number sorting, checkbox selection, opening the create dialog, and required-field validation passed in the browser.

The browser review intercepts API traffic, uses a synthetic session, and blocks writes. It therefore validates rendering and local interactions, not authenticated SAP reads, persistence, or live end-to-end settlement/booking flows. API/logic unit tests support functional preservation, but they do not replace a live backend acceptance test.

## Remaining differences and limits

- Merchanting Dashboard, Option Blotter, and View Short Straddle appear in the menu but have no registered feature implementation. This styling task does not invent those workflows.
- ALM has different business pages, so field/column inventories, screen-specific arrangements, custom status meanings and financial precision stay with FX. Some pages can only be reviewed with empty queues without live SAP data.
- This pass targets the two sections' feature content. Application-wide navigation, the launcher, unrelated Middle/Back Office pages and charts are outside this pass; the clone's navigation structure remains in place.
- The generic shared linked-deals dialog retains the existing UI-package structure. Body portals get the scoped font/status palette, while existing searchable selects keep their established interaction model.
- Not every data-dependent dialog, calendar, drag/drop state or backend operation was exercised. Those need representative backend data and a follow-up acceptance review; this report does not claim complete state-by-state or pixel parity.

To repeat locally, start `node tools/fx-visual-servers.mjs <read-only-reference-directory>`, start headless Chrome with remote debugging on port 9222 and an isolated profile in clone data storage, then run `node tools/fx-visual-review.mjs after`. The previews listen only on localhost. The tool never starts the ALM backend.

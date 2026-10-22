# Trader Workbench UX changes

Implemented the approved items in order: **1, 3, 2, 4, 6, 5**. No commits or pushes were made.

All runtime changes are inside this feature. `types.ts`, `api.ts`, `spotNdf.ts`, and `settlementSpot.ts` are unchanged. A TypeScript AST comparison also verified that all 58 pre-existing declarations in `logic.ts` and `format.ts` retain their original implementations. New presentation and preference helpers are separate from the existing calculations.

## Per-item report

| Item | Trader benefit and before/after behaviour | Files touched | New unit tests | Workbench result | Type-check delta |
| --- | --- | --- | --- | --- | --- |
| 1 — Availability | Previously, blocked actions could open forms and fail only at submission. Entry now shows the handler's reason, including missing selection, product prerequisites, metadata checking, unavailable APIs and missing TSF records. Blocked actions remain keyboard reachable and report the reason without opening a form. Action-item routing and its handler share one determination. | `logic.ts`, `flows.ts`, `DealModal.tsx`, `ActionPopups.tsx`, `index.tsx`, legacy CSS, `ux.test.ts` | 4: prerequisite reasons, fixing capability states/ETag, blocked posting reasons, action routing | 53 passed / 0 failed | 0 added |
| 3 — Reload and preferences | Refresh previously reset the view and closed popups. Reload now preserves the view and open work; Reset restores defaults. Saved dates, model, status, deal, sort, search and page size are validated after current options load. Every storage read/write is guarded; invalid or unavailable storage falls back safely. | `logic.ts`, `index.tsx`, `ux.test.ts` | 4: valid restoration, corrupt/wrongly typed data, removed options/invalid columns/sizes, impossible/reversed dates | 57 passed / 0 failed | 0 added |
| 2 — Data states | Failed or missing data could look like zero workload or zero USD value. Loading, failed-with-Retry and genuinely empty results are now distinct. Failed reads show Unavailable; missing conversions show Incomplete. Misleading breakdowns are blocked. Existing KPI arithmetic is unchanged. Invoice and settlement detail reads also have contextual retry controls. The FX-only follow-up below supersedes the original option-coverage warning. | `logic.ts`, `index.tsx`, `DealModal.tsx`, `ActionPopups.tsx`, legacy CSS, `ux.test.ts` | 4: read-state precedence, transaction read failures, missing conversion coverage without changing computed values, genuine empty results | 61 passed / 0 failed | 0 added |
| 4 — Pending writes | Forms could previously be dismissed while a write continued. Posting now locks submit, Cancel, Close, Escape and workbench Reload, with a pending message. Refused and unexpected failures leave entered values in the open form. Successful NDF fixing now has a persistent outcome before the optional spot prompt. Existing spot success/partial-success outcomes remain intact. | `modal.tsx`, `index.tsx`, `ActionPopups.tsx`, legacy CSS | No additional pure calculation was introduced; tested with delayed requests and injected failures in the browser | 61 passed / 0 failed | 0 added |
| 6 — Booking summaries | Important dates and transaction details were scattered or hidden. Live NDF/DNDF spot, invoice-difference spot and fixing forms now show company, counterparty, sides/amounts, rate and effective dates inline. Changed values have a textual Edited marker. Spot amounts/dates use the existing booking-body builders; fixing settlements use the existing calculation. | `logic.ts`, `ActionPopups.tsx`, legacy CSS, `ux.test.ts` | 4: hidden date defaults/value date, entered dates and dependent changes, NDF/DNDF calculation reuse without mutation, settlement payload rounding/dates | 65 passed / 0 failed | 0 added |
| 5 — Keyboard and accessibility | Dropdowns now support arrows/Home/End, Enter and Escape without accidental selection. Calendars support arrows, Home/End, Page Up/Down, Enter and Escape. Dialogs are named, background/lower dialogs become inert, focus stays in the active dialog and returns to its opener. Failed posts restore keyboard focus after controls re-enable. Transaction links, sortable headers and KPI openers are native buttons. Retry is separate from KPI activation. Existing autofocus and top-level Escape behaviour are retained. | `format.ts`, `controls.tsx`, `modal.tsx`, new `focus.ts`, `index.tsx`, `DealModal.tsx`, legacy CSS, `ux.test.ts` | 4: option boundaries, calendar week/year transitions without mutation, leap/month-end handling, Home/End | 69 passed / 0 failed | 0 added |

All new pure helpers have unit coverage in `ux.test.ts`. Existing test files were not edited.

## FX-only follow-up

Options are deferred. Pending Actions and Settlement Progress now show the existing computed FX values and breakdowns, with an explicit “FX only” description. Unimplemented options no longer mark these two cards Incomplete. Actual read failures still show Unavailable with Retry, and missing-conversion warnings are retained. Changed `logic.ts`, `index.tsx` and `ux.test.ts`; added one regression test and updated the read-failure assertions without changing calculations.

Both themes showed 6 pending actions and 33% progress (3 of 9 actions done) in the fixture browser. Enter opened each breakdown, Escape closed it and restored focus. Simulated transaction failure showed Unavailable and Retry recovered. Loading, missing-rate and genuinely empty checks also passed in both themes. Live SAP remains unverified.

## Browser observations

Transaction-type follow-up: the Transactions grid now places the type description below its code in 11px muted text. Existing master descriptions take precedence; known FX type labels cover missing master texts, and unknown types retain their code. Changed `DealModal.tsx`, `logic.ts`, legacy CSS and `ux.test.ts`. One new pure-helper test covers master precedence, known FX labels and unknown codes. Both themes passed fixture checks for the smaller description, live empty-lookup fallback and keyboard row selection. No calculations, API shapes or type exports were changed by this follow-up.

Exercised in headless Chrome 155 using a clearly labelled fixture harness with API reads and writes intercepted. Both legacy and dark themes were exercised. No SAP booking or credentials were used.

- Keyboard selection opened an available NDF form. An unavailable NDF action stayed on the deal and reported its API reason.
- Valid preferences restored, Reload kept them, and Reset restored defaults. Corrupt JSON and denied storage access did not crash the page.
- Delayed reads displayed loading. Simulated deal and transaction failures displayed Unavailable and contextual Retry; retries recovered. Missing rates displayed Incomplete. An empty dataset displayed the empty-state message.
- NDF fixing, NDF spot and invoice-difference spot requests disabled submit/Cancel/Close and ignored Escape while pending. Simulated failures retained the entered rate; retry produced a persistent success outcome. The full workbench additionally kept Reload disabled during posting.
- Fixing and spot summaries showed source currencies, company, counterparty and dates. Rate edits produced Edited markers. Empty-rate validation kept forms open. DNDF fixing/spot summary and validation checks also passed.
- Keyboard checks covered combobox selection/cancellation, calendar date/month navigation and selection, KPI open/close, sorting, transaction-detail buttons, forward/reverse Tab trapping, nested modal restoration, NDF autofocus, keyboard validation and failed-post retry. Portaled success/confirmation dialogs also retained focus and restored it on close.

Local logs, screenshots, fixture-harness source and six per-item review patches are retained under `data/wb-review/` (gitignored). The temporary browser entrypoints were removed from `apps/web` after verification. The review patches use the implementation order above; replay and reverse application were checked in an isolated local copy. This report is separate from the six code patches.

## Verification and existing failures

- Workbench tests: `node --test --test-isolation=none apps/web/src/features/fo-trader-workbench/*.test.ts` — **71 passed, 0 failed**, against the 49-test baseline.
- Repository type-check: still fails with the **24 pre-existing diagnostics** in `bo-post-accounting-settlement/logic.test.ts`; **0 new diagnostics**. That file was not edited.
- Production build: passed.
- Lint: unavailable. `npm.cmd run lint` reports that `eslint` is not recognized; no lint pass is claimed.
- Generated dark-CSS check: fails with **62 stale stylesheets**. Repeating the check with the pre-change workbench stylesheet produced the same 62 failures. Other features and generated dark stylesheets were not regenerated.

## Preserved rules and deferred work

Linked NDF/DNDF spots retain the existing hidden trade-date fallback: fixing date, then source contract date, then the existing current-date fallback. Source value date still takes precedence. Invoice-difference spots retain the existing trade-date default of two calendar days before source value date. The summary exposes effective dates and explains defaults; neither rule was changed.

Items 7 and 8 remain deferred, including the wider validation redesign and grid/layout changes. Net exposure, holiday-aware settlement, My deals, pair-specific precision and movable panels are also deferred as instructed. No new API capability or business rule was invented.

Live SAP acceptance, service-side failures/partial writes, screen-reader behaviour, other browsers and a full WCAG contrast audit remain unverified. Fixture results establish UI behaviour, not live booking acceptance. No business-rule change requires a decision for this implementation.

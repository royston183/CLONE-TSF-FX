# Architecture

## What this replaced

Seven single-file HTML pages, each served by its own `proxy.py` on its own port
(8765–8770), plus a "dynamic gateway" path on 8775. Across the wider effort there were
**13 proxies totalling 3,048 lines** of near-identical Python, each exposing the *same five*
services — the config comment stated the duplication was deliberate so any page could reach
any service without rewiring.

The cost showed up in the frontend. Four pages carried their own copy of `apiRequest`,
`apiFetch`, `esc`, `fmtDate`, `fmtNum` and `looseMatch`; the copies had drifted. Two pages
independently hand-rolled the same three-step recovery of a server-generated key after a
POST. `runLimited(tasks, 3)` existed in two pages purely because the old proxy spoke
HTTP/1.0 without keep-alive, so a few slow SAP reads exhausted the browser's ~6 connections
per origin — a backend defect worked around in UI code.

The seven `:root` blocks defined 74 CSS custom properties under four naming conventions
(`--blue`, `--blueDark`, `--ds-blue`, `--blue-dark`) with 20 outright conflicts; two files
disagreed with themselves across duplicate `:root` blocks.

## Styling: the original stylesheets, scoped

Converted applications keep their **original stylesheet, byte for byte**. `tools/scope-css.mjs`
extracts a legacy page's `<style>` block and prefixes every selector with a root class
(`.mp`, `.dealid`, `.ottk`), rewriting `:root`/`body` to that class and renaming `@keyframes`
so several pages can coexist in one SPA. Declarations are never touched, and each app's
markup mirrors its original element for element and class for class.

An earlier attempt merged the seven pages' 74 custom properties into one token set and
normalised the 20 conflicts. It produced a tidier system and the wrong product: the screens
no longer looked like the originals. Fidelity to the existing applications outranks
consistency between them.

What this means in practice:

- `packages/ui` is used by **new** screens only — currently just sign-in. A converted app
  does not use `AppShell`, `DataTable`, `Dialog` or `Field`, because their markup differs and
  would change the appearance. Do not "tidy" a converted app onto them.
- `packages/api-client` **is** shared by everything. It holds behaviour, not appearance.
- Regenerate rather than hand-edit: `node tools/scope-css.mjs "legacy/X.html" ".x" "apps/web/src/features/x/x.legacy.css"`.
  **Check the diff before you keep it.** 18 of the 21 `*.legacy.css` files have been edited
  since they were generated — different fonts, page colours, deleted rules — without the
  `legacy/*.html` source being updated. For those, the CSS is the source of truth and a
  regeneration will silently revert real work.

## Night mode

One attribute drives the whole product: `<html data-theme="dark">`, written by
`apps/web/src/shared/ThemeContext.tsx`, which sits above the router in `App.tsx`. It has to
live above the router because the hub and the applications are separate routes — a theme held
in `MenuPage` would be unmounted the moment a tile was opened, which is exactly why night mode
once stopped at the launcher.

- The hub's night colours are hand-written in `menu-shell.css`, keyed `:root[data-theme='dark'] .mp`.
- Each application's are **generated**: `node tools/gen-dark-css.mjs` derives
  `<app>.dark.css` from that app's current `<app>.legacy.css` and it is imported straight
  after it. It restates only the declarations whose colour changes, at a higher specificity.
- The rules live in `tools/dark-palette.mjs` and are tested in `tools/dark-palette.test.mjs`.
  A colour is classified by the property it is used in and by its own hue, chroma and
  lightness — 292 distinct (property, colour) pairs across the apps is far too many to keep
  by hand. Surfaces, rules and ink inevitably invert; **brand and status colours deliberately
  do not**, so SAP blue, a confirmed green and a breach red mean the same thing in both
  themes.
- Derived from the CSS rather than the HTML on purpose: see the warning above about the
  stale `legacy/*.html` sources.
- `npm run verify` fails if any `<app>.dark.css` is out of date.

Applications inherit the choice and have no toggle of their own; the switch lives once, in
the hub header.
- `codeText()` joins with a plain space (`01 New`) because the legacy consoles did. An em dash
  there changes every Type and Structure cell; the dash is used deliberately elsewhere
  (`0001 — Bank of Example`).

## Decisions

**One gateway, not one per app.** Every proxy exposed the same services, so splitting them
bought nothing and cost a process, a port and a launcher entry each. Ports 8765–8775
collapse to `:8080`.

**Backend kind is configuration, not architecture.** `config/services.json` declares each
entry's `kind`: `odata` (a dedicated `ZFS_SB_*_O4_API`), `dyngw` (Registry-brokered through
`ZFS_SB_DYNGW_O4_API`, so a new app needs a registry row rather than an ABAP transport), or
`rest` (a non-SAP JSON API), or `sqlite` (a local file answered in-process). Apps call
`/api/<key>/…` and never learn which kind answered.

**`sqlite` is persistence for apps with no SAP contract yet.** The `local` service
(`data/slc.db`, gitignored) stores schemaless JSON records in named collections:
`/api/local/<collection>[/<id>]` with GET, POST, PUT (replace), PATCH (merge) and DELETE.
Lists come back as `{ value: [...] }` and accept `$filter` (`field eq value` joined by
`and`), `$orderby`, `$top` and `$skip`, so the api-client's `list()` works unchanged; any
other query option is a `400`, never silently ignored. Each record carries `id` and a
`_meta` block stamped with the signed-in user. It uses Node's built-in `node:sqlite`, so
there is no native module to build. Schema changes are appended to `MIGRATIONS` in
`packages/gateway/src/sqlite/store.ts` and applied at startup via `PRAGMA user_version`.

**The `rest` seam is built, not populated.** No non-SAP API exists yet, so the code path and
its tests exist and `config/services.json` carries a commented example — but no instance is
configured. Building a speculative backend would have been guessing.

**One origin.** The gateway serves the SPA, and in development Vite proxies `/api`, `/auth`
and `/config` to it. Same-origin is preserved either way, so CORS never has to be configured
on the SAP Gateway — the same guarantee the per-console proxies had.

**Fail loudly, degrade narrowly.** A malformed registry throws at startup: a typo must not
surface later as a confusing 404. A *missing secret* is different — it disables that one
backend, which answers `503` naming the environment variable, while everything else runs.
A developer without the SAP password can still work on sign-in, the launcher and the UI.

## The status contract

`502` means the gateway could not reach the backend at all — network, TLS or timeout. It is
the **only** status that means "disconnected"; the backend never returns it. Every other
status, success or failure, means the backend answered.

This is deliberate and load-bearing. The legacy pages got it right and it is preserved
exactly: a `400` on a bad save must not paint the whole console as offline.
`ApiError.isUnreachable` and the shell's connection indicator both rest on it.

## SAP specifics the gateway handles

- **CSRF.** Fetched lazily per service, then cached with that service's cookie jar. A `403`
  on a write means the token expired: fetch once more and retry exactly once. A second
  `403` is a real authorisation failure and is returned untouched.
- **Cookie jars per service.** Each OData service issues its own session, so they cannot
  share one jar. A jar is created on a service's first call — an unused service costs nothing.
- **Key recovery after POST.** SAP does not return a generated key consistently, so
  `createEntity` reads it from the response body, then the `OData-EntityId`/`Location`
  header, then a `$orderby=<field> desc&$top=1` re-read. `OData-EntityId` and `Location` are
  in the gateway's header passthrough list for exactly this reason.
- **Raw query strings.** OData filters carry percent-encoded quotes and spaces. The query is
  sliced off the raw URL and forwarded byte-for-byte; parsing and re-serialising it changes
  the encoding and SAP rejects the call.
- **Raw request bodies.** The gateway parses nothing: `removeAllContentTypeParsers()` runs
  before the `'*'` buffer parser, because Fastify's built-in `application/json` parser is not
  overridden by a catch-all. Without it every JSON write arrived as a parsed object, failed
  the `Buffer.isBuffer` check in the proxy route, and was dropped — SAP received a POST with
  no fields and answered as if it had worked. Routes that do want JSON (`/auth/login`) decode
  it themselves. `packages/gateway/src/proxy.integration.test.ts` guards this.
- **Per-service TLS.** `tlsVerify` defaults to **true**; `DS4_100_NIIF` sets it false
  explicitly. Each service gets its own undici dispatcher, so one relaxed setting cannot
  leak to another — the old proxy applied one global SSL context.

## Authentication

Sign-in is **demo authentication and not a security boundary**: it checks one shared
username and password from the environment. SAP calls still run as the technical user in
`config/services.json`, so SAP records that user rather than the person signed in. The login
page says so explicitly.

The session is an httpOnly, signed cookie, so no token is readable from JavaScript, and
`AUTH_SECRET` has no shipped default — an unset value produces a fresh random secret each
start, which invalidates sessions on restart but makes it impossible for a default secret to
be the thing protecting a deployment.

### Replacing demo auth

Everything else already treats "who is signed in" as gateway state read through
`GET /auth/me`, so only `packages/gateway/src/routes/auth.ts` changes. For per-user SAP
identity, validate the credentials against a service at sign-in and hold the resulting
authorization per session instead of per service, then have `proxyRequest` take the header
from the session rather than from `Service.authHeader`.

## Deliberate omissions

- **No HTML escaper.** Each legacy page carried `esc()` because it built markup with
  `innerHTML`. React escapes interpolated values, so the helper would be dead code and an
  invitation to go back to string-built HTML.
- **`runLimited` kept, repurposed.** Still exported for genuinely large fan-out, with the
  default raised from 3 to 6 — the socket-exhaustion reason is gone now that the gateway
  speaks HTTP/1.1 with keep-alive.
- **No service-specific TypeScript models.** Typed entity definitions per OData service would
  give better errors, but every new service would then need code rather than config, which
  directly undercuts the dynamic gateway's reason to exist.

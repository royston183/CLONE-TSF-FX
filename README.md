# SLC Application

An API- and OData-driven application platform. One Node gateway fronts every backend — SAP
OData services, the SAP dynamic gateway, and non-SAP REST APIs — and one React SPA hosts
every application behind a sign-in page and a menu hub.

```
browser ──▶ React SPA (one origin)
                │  /api/<service>/*
                ▼
            Node gateway ──┬─▶ odata  ZFS_SB_*_O4_API          (one service per object)
                           ├─▶ dyngw  ZFS_SB_DYNGW_O4_API      (Registry-brokered)
                           └─▶ rest   non-SAP JSON APIs
```

The gateway injects credentials and the SAP CSRF token, so the browser never holds either,
and everything is same-origin by construction — no CORS configuration on the SAP Gateway.

## Quick start

```bash
npm ci
cp .env.example .env      # then fill in SAP_DS4_100_NIIF_PASSWORD
npm run dev               # gateway on :8080, Vite on :5173 — open :5173
```

Sign in with `DEMO_USER` / `DEMO_PASSWORD` (`demo` / `demo` by default).

Without a SAP password the gateway still starts: it logs each unusable backend and answers
calls to them with `503` naming the missing variable, so sign-in, the hub and any app
that does not need SAP all work.

For a production-shaped run: `npm run build && npm start`, then open `:8080` — the gateway
serves the built SPA itself.

## The hub

Signing in lands on the menu hub. A sidebar rests as a 64px icon rail and widens on hover —
or when a keyboard user tabs into it — to reach nine sections:

| Section | Route | Holds |
|---|---|---|
| Overview | `/overview` | KPIs, exposure and volume charts, recent activity. **Placeholder figures — nothing here is read from SAP.** |
| Master Data | `/master-data` | Reference-data tiles. **Placeholders — nothing is wired behind them.** |
| Trade Flows | `/trade-flows` | The `Trade Flows` group from `config/menu.json`, promoted out of the menu path |
| FX Structure | `/fx-structure` | The SAP FX menu tree from `config/fx-menu.json` — master contract, front office, mid office and settlement. **Tiles with an entry in `config/apps.json` open their converted screen; the rest say they are not built yet.** |
| SLC Structure | `/` | The menu path itself: the tile and folder tree from `config/menu.json` that launches every application |
| XLC-CRP Structure | `/xlc-crp-structure` | Stub |
| ICFS Structure | `/icfs-structure` | Stub |
| Reporting | `/reporting` | A parent section: the reports in `config/reporting-menu.json` are held one subtree per structure, and each structure is a child entry under Reporting in the sidebar |
| &nbsp;&nbsp;↳ FX Structure | `/reporting/fx-structure` | The FX report folders — **no report is set up yet** |
| &nbsp;&nbsp;↳ SLC Structure | `/reporting/slc-structure` | The SLC report folders — **no report is set up yet** |
| &nbsp;&nbsp;↳ XLC-CRP Structure | `/reporting/xlc-crp-structure` | XLC-CRP reports — **no report is set up yet** |
| &nbsp;&nbsp;↳ ICFS Structure | `/reporting/icfs-structure` | ICFS reports — **no report is set up yet** |
| Admin | `/admin` | Stub |

SLC Structure keeps `/` because every converted application's Back button returns there.
Overview's figures live in one module, `apps/web/src/menu/mock/overview.ts`; swapping in a
live feed is a change to that file and nothing else.

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Gateway + Vite with hot reload |
| `npm run build` | Builds the SPA to `apps/web/dist` |
| `npm start` | Gateway only, serving the built SPA |
| `npm test` | Unit tests (`node --test`) |
| `npm run typecheck` | `tsc` over every package |
| `npm run verify` | typecheck + test + build |
| `npm run db:setup` | Create/upgrade the local SQLite database and seed it (`db:migrate` + `db:seed`) |

## SQLite Local Database

SQLite holds **application-specific data that SAP has no field for** (custom metadata,
remarks, drafts, local configuration). **SAP stays the source of truth** for SAP transactions,
and the middleware keeps whatever it already owns. SQLite is a third backend beside them, used
only through the gateway: the browser never touches the database, and there is no generic SQL
or table route.

```
React -> @slc/api-client -> Fastify gateway -+-> SAP OData      service('fx'), service('ottk') ...
                                              +-> REST/middleware service('middleware')
                                              +-> SQLite          service('localdb') -> data/tsf-fx.db
```

| | |
|---|---|
| Database file | `./data/tsf-fx.db` (override with `SQLITE_PATH`; relative paths resolve from the repo root) |
| Schema | `database/migrations/NNN_name.sql`, applied in order, each once, each in a transaction |
| Seed data | `packages/gateway/src/sqlite/seed.ts` (idempotent upserts of static lookup values) |
| Code | `packages/gateway/src/sqlite/` (connection, migrations, repositories), `routes/localdb.ts` |

```
npm run db:setup     # first time: migrate + seed
npm run db:migrate   # apply new migration files only
npm run db:seed      # re-run the seed; safe to repeat
npm run db:seed:set-fx # migrate + seed only SET_FX, without reseeding other tables
```

`ZSGTSFTR_SET_FX` is the local copy of the supplied SET_FX Excel export: 54 rows for client
100, keyed by `(client, zmod_id, zd_map, zbs)`. Migration `009_zsgtsftr_set_fx.sql` follows
the supplied `SET_FX.json` DDIC schema (25 text columns). Codes retain leading zeroes;
dates/times use SAP `YYYYMMDD` / `HHMMSS`. The repeatable seed lives in
`database/seed/zsgtsftr_set_fx.json`. Reseeding upserts exported keys, restoring their
spreadsheet values while leaving other keys and clients intact. Settlement screens still
use their existing middleware SET_FX reads; this change adds SQLite storage and seeding.

To regenerate the seed from a replacement export before running `db:seed:set-fx`:

```powershell
node tools/import-set-fx.mjs 'C:\path\EXPORT_set_fx.XLSX' 'C:\path\SET_FX.json'
```

Change the schema by **adding a new migration file**, never by editing one already applied.
To reset a local dev database, stop the gateway, delete `data/tsf-fx.db*` and run
`npm run db:setup`. **Never commit `.db` files** (they are gitignored); the schema is the
migrations. Until `db:setup` has run, `/api/localdb/*` answers 503 and everything else works.

**Endpoints** (signed-in session required, like every `/api/*` route):

| | |
|---|---|
| `GET /api/localdb/deal-metadata` | `{ value: [...] }`, newest first |
| `GET /api/localdb/deal-metadata/:companyCode/:transactionId` | one row, or 404 |
| `POST /api/localdb/deal-metadata` | create, 201; 409 if the key exists; 400 on bad input |
| `PATCH /api/localdb/deal-metadata/:companyCode/:transactionId` | change the fields sent; `null` clears one |
| `DELETE /api/localdb/deal-metadata/:companyCode/:transactionId` | 204, or 404 |

Rows are keyed by the SAP business key `(companyCode, transactionId)`, never by SQLite's `id`.
Join them to the OData record in the screen, using `CompanyCode` + `FinancialTransaction`:

```ts
import { apiFetch, list, service } from '@slc/api-client'

const fxApi = service('fx')
const middlewareApi = service('middleware')
const localApi = service('localdb')

const [deals, entityStrings, metadata] = await Promise.all([
  list<FxTransaction>(fxApi('FxTransaction'), { filter: "CompanyCode eq '9990'" }), // SAP OData
  apiFetch(middlewareApi('data/entityString')),                                      // REST/middleware
  list<DealMetadata>(localApi('deal-metadata')),                                     // SQLite
])
const byKey = new Map(metadata.map((m) => [`${m.companyCode}-${m.transactionId}`, m]))
const rows = deals.map((d) => ({ ...d, meta: byKey.get(`${d.CompanyCode}-${d.FinancialTransaction}`) }))
```

## Layout

```
config/
  services.json     backend registry — odata | dyngw | rest
  apps.json         application registry — tile code -> route, status, backends
  menu.json         menu path tree, extracted verbatim from the legacy Menu Path.html
packages/
  gateway/          Node + Fastify: registry, auth, CSRF, proxy, static hosting
  api-client/       shared client — apiFetch, OData helpers, React hooks
  ui/               design tokens and shared React components
apps/web/           the SPA: login, the hub, and one lazy route per application
  src/menu/         the hub shell — sidebar, the nine sections, and its SVG charts
  src/features/     one folder per application
legacy/             the original single-file HTML apps, kept as the conversion reference
```

## Status

The framework is complete and verified end to end. `config/apps.json` is the registry of
record — it carries every application's route, status, legacy source and permitted
backends, so the list is not repeated here and this section does not drift as more land.

**21 applications are registered. Four are `ready`** — converted and exercised against the
gateway:

| Application | Route | Backends | Legacy source |
|---|---|---|---|
| Origination Ticket (OTTK) | `/apps/ottk` | `ottk`, `dttk` | `legacy/OTTK.html` |
| Distribution Ticket (DTTK) | `/apps/dttk` | `dttk`, `ottk` | `legacy/DTTK.html` |
| Deal ID Creation | `/apps/deal-id` | `dealid`, `ottk`, `dttk` | `legacy/Deal ID.html` |
| Trade Flow Upload | `/apps/tf-upload` | `tf` | `legacy/Uplaod TF.html` |

**The other 17 are `scaffold`** — ICL, SBLC, LC issuance, discounting loans, IRS,
prepayment, limits, Manage Trade Flows and Invoice. Their routes exist and render, and
several have their legacy screen substantially converted, but **not one is wired to a
backend yet**: every one of them has an empty `services` list, so they run on local data.

`Manage TF` and `Invoice` never called an API even in their legacy form — they ran on a
hard-coded `DUMMY_MASTER_DATA` literal, so their SAP contract has to be designed rather
than ported. See
[the Manage TF conversion design](docs/superpowers/specs/2026-09-16-tf-manage-conversion-design.md).

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how it works and why, and
[docs/ADDING-AN-APP.md](docs/ADDING-AN-APP.md) for the steps to add or convert one.

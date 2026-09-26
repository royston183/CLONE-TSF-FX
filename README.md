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

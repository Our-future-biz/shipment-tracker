# Shipment Tracker Dashboard

Internal logistics tooling for managing shipments, quotes, invoicing, warehouse
operations, document reading, and rule-based automations.

## Stack

- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui + wouter (hash routing)
- **Backend**: Express + Drizzle ORM + better-sqlite3
- **Single port**: server hosts both API (`/api/*`) and the Vite-built frontend on port 5000

## Run locally

```bash
npm install
npm run dev          # dev server with HMR on http://localhost:5000
```

## Build for production

```bash
npm run build        # outputs to dist/
NODE_ENV=production node dist/index.cjs
```

## Project layout

| Path | What's in it |
|---|---|
| `client/src/components/` | All React components (Shipments, Invoicing, Quote, Warehouse, Document Reading, Dashboard…) |
| `client/src/lib/` | Column config, dropdown values, conditional formatting, theme & shipment context |
| `client/src/pages/Home.tsx` | Tab shell |
| `shared/schema.ts` | Drizzle schema (14 tables incl. shipments edits, quotes, invoicing, warehouse, automations) |
| `server/routes.ts` | All Express routes incl. the 24-rule automation engine |
| `server/storage.ts` | Database access layer + lightweight ALTER TABLE migrations |
| `data.db` | Live SQLite database (users, shipments, quotes, invoicing, etc.) |

## Database

- Single-file SQLite at `data.db`
- Schema auto-migrates on boot via `safeAddColumn()` in `server/storage.ts`
- `data.db.recovery-needed-*` backups are NOT included in this ZIP — make your own
  with `cp data.db data.db.<label>` before risky changes.

## Users (shipped with the seed DB)

| Email | Password | Role |
|---|---|---|
| lukas@ourfuture.biz | Wjj7AkeRr-ICruJ%zaBuKx | admin |
| ad@ourfuture.biz | Zt8&hQw3LcY6bF | admin |
| martin@ourfuture.biz | Rw3&mZp8KxJ5Vn | user |
| marek@ourfuture.biz | Vx7#nKq4RwL9Tp | user |
| eva@ourfuture.biz | Kx9#vNp4RmW7eJ | user |
| monca@ourfuture.biz | Pj7$wNx3KrL8mQ | user |

## Major features

- **Shipments tab**: full CRUD + Dimensions popup + Master Job grouping + chat/attachments per CZ and MCZ
- **Quote tab**: CZQ quotes with cost rows feeding Invoicing via sub-line references (CZQ###-001, -002…)
- **Document Reading**: 3-phase pipeline (classification → manifest+MBL → HBL batch) with post-extraction normalisation (FCL→Full Load, IMP→Import, auto Sea Freight from vessel/container)
- **Invoicing**: per-job costs grid, additional charges, billing currency + ROE, "Load from Quote" with sub-line tracking, print to PDF
- **Warehouse**: standalone tab + integrated 5th sub-tab inside Shipment Detail Modal, with read-only sync from Shipments data (Container, Colli, Packing, Weight, Volume…)
- **Dashboard**: KPI tiles + deadlines (currently reads the legacy `SHIPMENTS` array — pending refactor to read from the live DB)
- **Automations**: 24-rule engine (5 General handoffs + 9 Import status + 10 Export status) — triggers on changes to Department, Shipment Status, Holiday Cover
- **Day/night mode**: full theme switch via `--surface-*` / `--brand-*` / `--tint-*` tokens

## Recent context

See `CONTEXT_SUMMARY.md` for the rolling change log.

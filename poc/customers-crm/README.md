# Customers CRM

A modern, full-stack freight-forwarding CRM built for logistics and freight operations.  
Covers customer management, quote lifecycle, sales pipeline, shipment tracking, Terms & Conditions, and a full Quote History with advanced filtering, saved views, and PDF export.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite 7, Wouter (hash routing) |
| UI Components | Radix UI, shadcn/ui, Tailwind CSS 3 |
| State / Data | TanStack React Query v5 |
| Backend | Express 5, Node.js (ESM) |
| Database | SQLite via `better-sqlite3` + Drizzle ORM |
| PDF | Browser Print API (custom `QuotePDF` component) |
| Czech Company Registry | ARES public REST API |
| Build | Vite (client) + esbuild (server) |

---

## System Requirements

- **Node.js** ≥ 20.x
- **npm** ≥ 10.x
- **OS:** Linux, macOS, or Windows (WSL2 recommended on Windows)

---

## Installation

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd customers-crm

# 2. Install dependencies
npm install
```

---

## Environment Setup

```bash
# Copy the example env file and fill in any values you need to change
cp .env.example .env
```

Minimum required variables for local development (defaults work out of the box):

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | Runtime environment |
| `PORT` | `5000` | HTTP server port |
| `DATABASE_URL` | `./customers.db` | SQLite file path |
| `SESSION_SECRET` | *(required)* | Express session secret – set to any random string |

No external services are required for local development.  
The Czech ARES company registry is a public API that needs no key.

---

## Development

```bash
# Start the full-stack dev server (hot-reload on client, tsx on server)
npm run dev
```

Open **http://localhost:5000** in your browser.

The dev server:
- Serves the React client through Vite's middleware (HMR enabled)
- Serves the Express API on the same port
- SQLite database file is created automatically on first run

---

## Database Setup

The database is **SQLite** and the file is created automatically at startup.  
All tables are created via raw SQL in `server/routes.ts` and `server/storage.ts`.

To inspect or migrate the schema using Drizzle Kit:

```bash
# Push schema changes to the database
npm run db:push
```

The schema is defined in `shared/schema.ts`.

### Tables

| Table | Description |
|---|---|
| `customers` | Company records (ARES lookup) |
| `contacts` | Contact persons per customer |
| `shipments` | Shipment tracking records |
| `quotes` | Legacy quote records |
| `invoices` | Invoice records |
| `documents` | Uploaded document references |
| `notes` | Free-text notes per customer |
| `sales_quotes` | Full quote lifecycle (main Sales module) |
| `terms_conditions` | Pre-seeded T&C templates (AIR/FCL/LCL Import/Export) |
| `user_preferences` | Persisted UI state (column picker, saved views) |

---

## Production Build

```bash
# Build both client (Vite) and server (esbuild)
npm run build

# Start the production server
npm start
```

> Note: the `public/` folder (ship photo, favicon, uploaded documents, logos) is
> served directly by Express in both dev and production — no manual copy step is
> needed after building.

The production build outputs:
- `dist/public/` – static frontend assets (served by Express)
- `dist/index.cjs` – bundled Express server

---

## Production Deployment

### Manual (VPS / bare metal)

```bash
# On the server
npm install
npm run build
NODE_ENV=production SESSION_SECRET=<secret> npm start
```

Use a process manager (PM2 recommended):

```bash
pm2 start "npm start" --name customers-crm
pm2 save
pm2 startup
```

### With PM2 (recommended)

```bash
pm2 start dist/index.cjs --name customers-crm --interpreter node
```

### Environment Variables in Production

Set these on your server (do **not** commit the real `.env`):

```
NODE_ENV=production
PORT=5000
SESSION_SECRET=<long-random-string>
DATABASE_URL=./customers.db   # or absolute path
```

---

## Project Structure

```
customers-crm/
├── client/
│   ├── index.html
│   └── src/
│       ├── App.tsx                  # Router + top-level layout
│       ├── main.tsx                 # React entry point
│       ├── index.css                # Global styles
│       ├── components/ui/           # shadcn/ui component library
│       ├── hooks/                   # Custom React hooks
│       ├── lib/
│       │   ├── queryClient.ts       # TanStack Query + apiRequest helper
│       │   └── utils.ts             # cn() and other utilities
│       └── pages/
│           ├── CustomerList.tsx     # Customer database page
│           ├── CustomerCard.tsx     # Customer detail card
│           ├── CustomerDetailSection.tsx
│           ├── CustomerProfileDetail.tsx
│           ├── SalesPage.tsx        # Sales module (Quote History, Dashboard, Pipeline…)
│           ├── NewQuoteWorkflow.tsx # Quote creation/editing (6-section accordion)
│           ├── NewQuoteModal.tsx    # Quote reference creation modal
│           ├── QuoteLifecycle.tsx   # Status dropdown, timeline, lifecycle bar
│           ├── TermsPage.tsx        # Terms & Conditions management
│           └── not-found.tsx        # 404 page
├── server/
│   ├── index.ts                     # Express app entry + server startup
│   ├── routes.ts                    # All API routes
│   ├── storage.ts                   # Drizzle ORM + SQLite setup
│   ├── logoService.ts               # Company logo fetching utility
│   ├── static.ts                    # Static file serving
│   └── vite.ts                      # Vite dev middleware integration
├── shared/
│   └── schema.ts                    # Drizzle ORM schema (shared between client & server)
├── script/
│   └── build.ts                     # Custom build script (Vite + esbuild)
├── public/
│   ├── msc-irene.jpg                # Ship photo asset
│   └── documents/                   # Uploaded customer documents
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── drizzle.config.ts
├── components.json                  # shadcn/ui config
├── .gitignore
├── .env.example
└── README.md
```

---

## Key Features

- **Customer Database** – ARES (Czech company registry) lookup only; no manual creation
- **Sales Module**
  - Quote History with column picker, drag-to-reorder, per-column filters, saved views, pagination, CSV export
  - Quote lifecycle (Draft → Ready to Send → Quoted → Feedback → Revised → Won/Lost/Expired)
  - Inline validity dot indicator (green = valid, red = expired)
  - Quote PDF generation (client-facing, no margin/profit shown)
  - Quote duplication with automatic versioning (`QCZ…-2`, `-3`, …)
  - Follow-up page showing all Quoted/Feedback quotes
- **Terms & Conditions** – Pre-seeded templates per service type, editable per quote
- **Shipment Tracker** – Separate module at `/warehouse-crm`

---

## External Services

| Service | Purpose | Auth Required |
|---|---|---|
| ARES (ares.gov.cz) | Czech company registry lookup | No – public REST API |
| Clearbit/Brandfetch | Company logo fetching (logoService) | Optional |

---

## Troubleshooting

**`better-sqlite3` fails to install / "No prebuilt binaries found"**
`better-sqlite3` is a native module. If no prebuilt binary matches your Node
version, node-gyp compiles it from source and needs the Node headers. If the
header download fails (offline/proxied environments), point node-gyp at your
local Node installation:

```bash
npm_config_nodedir=$(dirname $(dirname $(which node))) npm install
```

**Database looks empty after moving the app**
The SQLite file `customers.db` must sit in the working directory the server is
started from (or set `DATABASE_URL` to its absolute path). All tables and any
missing columns are auto-created/migrated at startup.

**Port already in use**
Set a different port: `PORT=5001 npm run dev`.

---

## Known Limitations

- SQLite is single-file; not recommended for high-concurrency production use. Migrate to PostgreSQL for scale.
- PDF generation uses the browser's `window.print()` API – formatting may vary by browser/OS.
- `public/documents/` uploads are stored on disk; move to object storage (S3/R2) for production.
- No authentication is implemented beyond session middleware stubs – add before exposing publicly.

---

## License

MIT

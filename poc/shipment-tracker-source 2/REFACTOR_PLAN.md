# Shipment Tracker — Refactor Plan & Coding Standards

> Living document. The plan in §7 is sequenced; the standards in §3–§6 apply to every line of code we write from here on.

---

## 1. Goal

Rewrite the existing Express + SQLite + Vite/React POC as:

- **Backend:** Encore.ts + Drizzle ORM + PostgreSQL
- **Frontend:** Next.js 15 (static export SPA) + React 19 + Ant Design + Tailwind
- **AI:** Anthropic Claude API (direct, behind a thin adapter)

This is a **POC**, not a production system.

**Feature parity is the hard rule.** Every feature in the current app ships in the new one — all six tabs, all 98 columns, all 24 automation rules, the 3-phase document pipeline, Master Job grouping, soft-delete, chat / attachments / tasks, day/night theme, PDF generation, the Quote → Booked → Shipment flow, the CZ / CZQ / MCZ number sequences, all of it. What we change is **implementation**: file layout, naming, ORM, UI library, the broken auth, the in-memory session map, the edit-log replay model, the duplicate Warehouse components. What we don't change is what a user can see or do.

The target repo is **standalone** — no Groupon monorepo packages, no ORR, no tribe configs, no `baseAuthMiddleware`, no `GROUPON_ENTITY`, no AI Gateway service. The architectural standards from the Encore standards docs apply; the Groupon-specific glue does not.

---

## 2. In Scope / Out of Scope

### In scope (port everything)

- Login + simple role-based auth (admin / user) with hashed passwords
- Shipments tab (the spreadsheet) with the core editing experience
- Quotes tab + Quote Detail modal
- Invoicing tab + per-job costs, billing, generated invoices, print to PDF
- Warehouse tab (single merged version — see §8)
- Document/Text Reading with the 3-phase Claude pipeline
- Automation engine (logic ported, email sending stubbed — see §8)
- Master Job grouping
- Comments, tasks, attachments per shipment
- Day/night theme

### Out of scope (explicit non-goals for the POC)

These are **non-user-facing** things we won't build for the POC. Every user-facing feature ships.

- Production object storage (attachments saved to local filesystem via Encore Bucket; same code works against R2/S3 later)
- Production deploy / CI / Sentry / observability beyond Encore defaults
- Mobile responsive layouts (desktop only — same as today)
- Outlook-specific email integration (replaced by a provider-agnostic email adapter, see §8 #3)

### Implementation changes (functionality unchanged)

These are the things that look different under the hood but do exactly what they did before:

- Edit-log replay → direct `shipment` state + write-only audit table. Editing and persisting cells still works; reading shipments stops getting slower over time.
- Two duplicated Warehouse components → one shared `<WarehouseTaskTable>` used in both places. Standalone Warehouse tab still exists. Warehouse sub-tab inside the Shipment Detail still exists.
- shadcn/ui primitives → antd primitives. Same dropdowns, same modals, same tables, same dialogs — drawn by a different library.
- In-memory `pipelineSessions` Map → Postgres-backed `document_session` table. Pipeline survives restarts; behaviour identical to user.
- Hardcoded `NOW = 2026-03-25` in DashboardTab → real `Date.now()`. Deadline logic identical.
- Empty `SHIPMENTS = []` array the dashboard reads → reads from the live DB. Restores functionality that's currently silently broken.
- `safeAddColumn` runtime migrations + raw `CREATE TABLE` in route handlers → real Drizzle migrations.
- Broken `claude_sonnet_4_6` model ID → current valid Sonnet model ID. Restores AI features that don't work today.

---

## 3. Universal Code Quality Standards

These apply to all code, frontend and backend.

1. Prefer the simplest design that meets the requirement. No abstractions ahead of need.
2. Pure functions and clear data flow over clever patterns and side effects.
3. No `any`. No silent catches. No `console.log` left in shipped code.
4. Strict TypeScript, strict ESLint. Code must pass both before commit.
5. No unused imports, variables, or dead code paths.
6. Remove `.bak` / `.recovery` files. Track real state in git.
7. Don't break business rules without explicit instruction. Don't change approved design patterns without approval.
8. Add new dependencies only when truly required, and prefer maintained, mainstream packages.
9. Tests accompany new logic; existing tests must keep passing.

---

## 4. Backend Standards (Encore + Drizzle + Postgres)

### 4.1 Three-layer architecture (non-negotiable)

Every Encore service is split into **Controller → Service → Repository**. Each layer has one job and one job only.

**Controller** (`controllers/*.controller.ts`)
- Receive request, validate structure (Encore validators or Zod)
- Check authorization
- Delegate to service
- Return response
- Throw `APIError`
- **Forbidden:** database queries, business logic, external API calls, loops over data

**Service** (`services/*.service.ts`, singleton class instance)
- Business logic and rules
- Orchestrate multiple operations
- Service-to-service calls
- Call repositories
- External API calls (e.g. Claude)
- Publish pub/sub events
- **Forbidden:** direct DB queries, HTTP parsing, setting status codes

**Repository** (`repositories/*.repository.ts`)
- Drizzle queries only (no raw SQL strings)
- Transaction management
- CRUD, batch ops, complex queries
- Handle soft deletes correctly
- Wrap DB errors and rethrow as `APIError.internal(...)`
- **Forbidden:** business logic, calling other services, publishing events

### 4.2 Interfaces everywhere

Every API request and response is a **named, exported interface**. No anonymous types.

```typescript
export interface ShipmentCreateRequest {
  jobNumber: string & MinLen<1>;
  shipper: string;
  consignee: string;
  // ...
}

export interface ShipmentCreateResponse {
  shipment: Shipment;
}
```

Naming: `{Model}{Operation}{Request|Response}` — e.g. `ShipmentCreateRequest`, `QuoteUpdateResponse`, `InvoiceListRequest`. Not `CreateShipmentReq`, not `ShipmentData`.

### 4.3 Validation

Use Encore validators or Zod. **Never** manual `if (!params.x) throw ...`.

```typescript
import type { IsEmail, MinLen, MaxLen } from "encore.dev/validate";

export interface LoginRequest {
  email: string & IsEmail;
  password: string & MinLen<8> & MaxLen<128>;
}
```

For complex shapes (nested objects, conditional fields), use Zod inside the controller and call `.safeParse()`.

### 4.4 Errors

Throw `APIError` only. Never `throw new Error(...)`. Never return `null` silently for not-found.

```typescript
import { APIError } from "encore.dev/api";

throw APIError.notFound("Shipment not found");
throw APIError.invalidArgument("Invalid currency");
throw APIError.permissionDenied("Admin role required");
throw APIError.alreadyExists("Job number already in use");
throw APIError.internal("Database error");
```

### 4.5 Public vs private APIs

| Type | `expose` | `auth` | File prefix | Endpoint name |
|---|---|---|---|---|
| Public | `true` | `true` | none | `userCreate` |
| Private (internal) | `false` | `false` | `_` | `_internalUserCreate` |

All public APIs **must** have `auth: true`. Sensitive operations **must** check role inside the controller before delegating.

### 4.6 Naming conventions

| Thing | Convention | Example |
|---|---|---|
| Controller file (public) | `camelCase.controller.ts` | `shipmentCreate.controller.ts` |
| Controller file (private) | `_camelCase.controller.ts` | `_shipmentInternalSync.controller.ts` |
| Service file | `snake_case.service.ts` | `shipment.service.ts` |
| Repository file | `snake_case.repository.ts` | `shipment.repository.ts` |
| Interfaces file | `interfaces.ts` | `interfaces.ts` |
| Schema file | `{model}.schema.ts` | `shipment.schema.ts` |
| Test file | `{filename}.test.ts` | `shipment.service.test.ts` |
| Interface / type | `PascalCase` | `ShipmentCreateRequest` |
| Class | `PascalCase` | `ShipmentService` |
| Function / variable | `camelCase` | `createShipment`, `jobNumber` |
| Constant | `UPPER_SNAKE_CASE` | `MAX_PAGE_SIZE` |
| Private class field | `#camelCase` | `#cache`, `#anthropic` |
| DB table | `snake_case`, singular | `shipment`, `invoice_cost` |
| DB column | `snake_case` | `created_at`, `job_number` |

### 4.7 Database (Drizzle + Postgres)

**Every table must have these columns:**

```typescript
import { pgTable, uuid, timestamp } from "drizzle-orm/pg-core";

export const shipment = pgTable("shipment", {
  id: uuid("id").primaryKey().defaultRandom(),
  // ... your fields ...
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }), // nullable → soft delete
});
```

Factor that into a `defaultTableColumns` helper so we don't repeat ourselves.

**Type rules:**
- Money → `numeric(14, 2)`, never `text`
- Dates → `date` for calendar dates, `timestamp({ withTimezone: true })` for points in time
- JSON blobs → `jsonb`, not `text`
- Currency → text enum (`'CZK' | 'USD' | 'EUR' | 'GBP' | 'CHF' | 'CNY' | 'JPY'`)
- Role → text enum (`'admin' | 'user'`)
- Status / trade direction → text enums in `lib/enums.ts` shared with the frontend

**Repository rules:**
- Drizzle only, no raw SQL strings
- Every method handles soft delete (`isNull(table.deletedAt)` by default, opt-in `includeDeleted` flag)
- Wrap DB errors:

```typescript
async findById(id: string): Promise<Shipment | null> {
  try {
    const [row] = await db.select().from(shipment)
      .where(and(eq(shipment.id, id), isNull(shipment.deletedAt)))
      .limit(1);
    return row ?? null;
  } catch (error) {
    log.error(error, "Database error in shipment.findById", { id });
    throw APIError.internal("Failed to fetch shipment");
  }
}
```

**Migrations:** Drizzle Kit, forward-only. Generated SQL in `db/migrations/`. Run on boot in dev, on deploy in prod. No `safeAddColumn` runtime hacks.

### 4.8 Security

- Passwords hashed with `argon2id` (`@node-rs/argon2`). Plaintext storage is grounds for immediate rejection.
- No secrets in source. Use Encore Secrets (`secret("anthropic_api_key")`).
- Authorization checked in the controller before delegating to the service.
- Never log passwords, API keys, tokens, PII.
- Inputs validated declaratively (§4.3).

### 4.9 Logging

```typescript
import log from "encore.dev/log";

log.info("Shipment created", { shipmentId: shipment.id, jobNumber: shipment.jobNumber });
log.error(error, "Failed to extract document", { fileName });
```

- Structured fields, never string concatenation.
- Log important operations (create, update, delete), authorization decisions, errors with context.
- Never log secrets or unnecessary PII.

### 4.10 Testing

- **Vitest** for unit + integration.
- Tests live in `tests/` directory **mirroring** the source structure — not co-located.

```
services/shipment/
├── controllers/shipmentCreate.controller.ts
├── services/shipment.service.ts
├── repositories/shipment.repository.ts
└── tests/
    ├── controllers/shipmentCreate.controller.test.ts
    ├── services/shipment.service.test.ts
    └── repositories/shipment.repository.test.ts
```

Minimum coverage targets for the POC: services 70%, repositories 60%, controllers 50%. We're not aiming for production thresholds, but the critical paths (auth, money math, invoice generation, AI extraction) get real tests.

### 4.11 AI integration (Anthropic, direct)

All Claude calls go through a single adapter, not scattered `new Anthropic()` calls across services.

```typescript
// services/_shared/ai/claude.adapter.ts
import Anthropic from "@anthropic-ai/sdk";
import { secret } from "encore.dev/config";

const apiKey = secret("anthropic_api_key");

class ClaudeAdapter {
  #client: Anthropic;

  constructor() {
    this.#client = new Anthropic({ apiKey: apiKey() });
  }

  async extractStructured<T>(opts: {
    systemPrompt: string;
    userContent: string | Array<{ type: "image"; source: { type: "base64"; media_type: string; data: string } } | { type: "text"; text: string }>;
    maxTokens?: number;
    model?: string;
  }): Promise<T> {
    // ... wraps messages.create, parses JSON, validates with zod, throws APIError on failure
  }
}

export const claude = new ClaudeAdapter();
```

- Model strings live in one place. Use the current valid model IDs (`claude-sonnet-4-5-20250929` or whatever current — never the broken `claude_sonnet_4_6` with underscores).
- The adapter is the only place that knows about `@anthropic-ai/sdk`. Services call `claude.extractStructured(...)`, never the SDK directly.
- Easy to swap for a different provider later by replacing this one file.

### 4.12 File structure (per service)

```
services/{service-name}/
├── controllers/
│   ├── shipmentCreate.controller.ts
│   ├── shipmentList.controller.ts
│   ├── shipmentUpdate.controller.ts
│   ├── shipmentDelete.controller.ts
│   └── _shipmentInternalGet.controller.ts
├── services/
│   └── shipment.service.ts
├── repositories/
│   └── shipment.repository.ts
├── interfaces/
│   └── interfaces.ts
├── schemas/
│   └── shipment.schema.ts
├── tests/
│   ├── controllers/
│   ├── services/
│   └── repositories/
├── encore.service.ts          ← Service() + middlewares
└── service.config.ts          ← secrets + service constants (when needed)
```

`encore.service.ts` wires the service and middleware only — no constants, no secrets. Put those in `service.config.ts` so callers never `import` the encore service file just to get a constant.

---

## 5. Frontend Standards (Next.js + Ant Design + Tailwind)

### 5.1 Architecture

- **Next.js 15** with App Router, configured for **static export** (`output: "export"`).
- **React 19**, all components are client components (the SPA has no SSR / RSC).
- **Ant Design** (`antd`) for UI primitives: Table, Form, Input, Select, DatePicker, Modal, Drawer, Tabs, Tag, Button, Spin, Tooltip, Popover, etc.
- **Tailwind** for layout, spacing, theme colours. No inline `style` blocks except for dynamic colours.
- **TanStack Query** for server state, with the Encore-generated client.
- **Zod** for client-side form validation when antd's built-in rules aren't enough.

### 5.2 Structure

```
src/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                ← redirects to /shipments or login
│   ├── login/page.tsx
│   ├── dashboard/page.tsx
│   ├── shipments/
│   │   ├── page.tsx
│   │   ├── shipmentsTable.tsx
│   │   ├── shipmentRow.tsx
│   │   ├── shipmentDetailDrawer.tsx
│   │   └── ...
│   ├── quotes/
│   ├── invoicing/
│   ├── warehouse/
│   └── documents/
├── lib/
│   ├── api/                    ← Encore-generated client wrapper
│   ├── auth/
│   ├── theme/
│   └── enums.ts                ← shared with backend
├── components/                 ← truly generic, used in 2+ features
└── styles/
    └── globals.css
```

- Default to **feature-local** placement under `src/app/<feature>/...`.
- Shared `components/` only for truly generic reusable pieces.
- **One component per file.** Split large components early.
- Feature-local components use a feature-prefix or live in the feature folder; no need to prefix when the path makes it clear.

### 5.3 Component style

```tsx
"use client";

interface ShipmentRowProps {
  shipment: Shipment;
  onEdit: (id: string) => void;
}

export const ShipmentRow = ({ shipment, onEdit }: ShipmentRowProps) => {
  if (!shipment) return null;

  const handleEditClick = () => {
    onEdit(shipment.id);
  };

  return (
    <tr
      tabIndex={0}
      aria-label={`Shipment ${shipment.jobNumber}`}
      onClick={handleEditClick}
      onKeyDown={(e) => { if (e.key === "Enter") handleEditClick(); }}
      className="hover:bg-slate-50 cursor-pointer"
    >
      {/* ... */}
    </tr>
  );
};
```

- Functional components only, no classes.
- `const ComponentName = () => {}` arrow form.
- TypeScript interface for props, named `{Component}Props`.
- **Early returns** for null/loading/error states.
- **Event handlers use `handle` prefix:** `handleClick`, `handleSubmit`, `handleKeyDown`.
- Tailwind classes for styling. No inline CSS unless it's a dynamic colour from a status map.
- Prefer `class:` style conditional class application (or `clsx`) over ternary chains.
- Interactive non-button elements need `tabIndex={0}`, `aria-label`, both `onClick` and `onKeyDown` handlers.

### 5.4 What replaces what

| Old (shadcn/ui + custom) | New (antd) |
|---|---|
| `<Table>` + bespoke virtualisation | `<Table>` with `virtual` + `scroll` props |
| `<Dialog>` | `<Modal>` |
| `<Sheet>` | `<Drawer>` |
| `<Form>` + react-hook-form | `<Form>` (antd) + Zod for cross-field validation |
| `<DropdownMenu>` | `<Dropdown>` |
| `<Toast>` | `App.useApp().message` |
| `<Tabs>` | `<Tabs>` (antd) |
| `<Calendar>` + `react-day-picker` | `<DatePicker>` |
| `<Popover>`, `<Tooltip>`, `<HoverCard>` | `<Popover>`, `<Tooltip>` |
| Wouter routing | Next.js App Router |

The whole `client/src/components/ui/` directory does not port over.

### 5.5 Theming

- Day / night handled by antd's `ConfigProvider` with custom theme tokens, plus Tailwind's `dark:` variant for utility classes.
- Status badge colours live in `lib/enums.ts` (single source of truth, shared with backend).

---

## 6. Tooling

- **Package manager:** pnpm
- **Workspace:** simple two-package monorepo or two separate repos — TBD in §8. Probably one repo, two packages: `apps/api/` (Encore) and `apps/web/` (Next.js).
- **Postgres:** local via `docker compose`. One container, one volume. `docker compose up -d` is the dev pre-req.
- **Node:** 20.x (matches `package.json` `@types/node` 20.x).
- **Lint:** ESLint with `@typescript-eslint`, `eslint-config-next` on web, plain TS config on api.
- **Format:** Prettier, 2-space indent, double quotes, semicolons, trailing commas where valid.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `refactor:`, `chore:`).
- **Branch:** `feature/<short-description>` for work, merge to `main`.

---

## 7. Refactor plan — phased

### Phase 0 — Decisions (now)

Confirm the four points in §8. Without these the schema and the spreadsheet rebuild can't start.

### Phase 1 — Scaffold (~half a day)

- Create the new repo / workspace
- `pnpm init`, workspace config, two packages (`api`, `web`)
- Encore app scaffold in `apps/api/`
  - One service: `shipments`
  - Drizzle + Postgres wired
  - `docker compose` file for local Postgres
  - One sample endpoint returning `[]`
- Next.js 15 scaffold in `apps/web/` with `output: "export"`
- Tailwind installed, antd installed, `ConfigProvider` set up
- Encore client generated into `apps/web/src/lib/api/`
- One round-trip: `apps/web` calls `GET /shipments` and renders the empty list
- ESLint + Prettier + tsconfig strict on both packages
- README with the dev pre-reqs and `pnpm dev` story

**Exit criteria:** typecheck passes on both packages, lint clean, `pnpm dev` boots Postgres + api + web and the SPA renders an empty table.

### Phase 2 — Auth + shared lib (~1 day)

- `services/auth/`
  - Schema: `user` table (uuid id, email unique, password_hash, display_name, role enum, standard timestamps)
  - Repository: `findByEmail`, `create`, `findById`
  - Service: `login` (compare argon2id hash), `register`
  - Controllers: `authLogin.controller.ts` (public), `authMe.controller.ts` (public, auth: true)
- Encore auth handler that validates a JWT/session token on `auth: true` endpoints
- `lib/enums.ts` shared between api and web (build-time copy or shared package): role, currency, shipment status, customs status, trade direction, etc.
- Seed script that creates the six users with hashed passwords
- Web: login page, `useAuth()` hook, protected layout

**Exit criteria:** can log in, refresh page and stay logged in, log out. Bad password → 401. Admin-only test endpoint rejects non-admin.

### Phase 3 — Data layer (~1 day)

Schema everything up front so backend services can be ported in any order.

Tables to create (with `defaultTableColumns` everywhere):

- `user` — done in Phase 2
- `shipment` — direct state (no edit log replay), all fields typed properly. Includes `master_job_id` nullable FK to `master_job`.
- `master_job` — id, mcz_number unique, standard cols
- `shipment_audit` — write-only history (user_id, shipment_id, field, old_value, new_value, changed_at)
- `quote` — id, quote_number unique, data jsonb, terms text, deletedAt for soft delete
- `invoice_cost` — one row per (shipment_id, category), money as numeric
- `invoice_additional_charge` — dynamic charges, sort_order int
- `billing_settings` — per shipment, currency enum, roe numeric, quote_ref
- `billing_override` — per (shipment_id, row_key), numeric
- `generated_invoice` — invoice_number unique, type enum, currency, total_amount numeric
- `shipment_comment` — author_id FK, message
- `shipment_task` — task_key, completed bool, completed_at, completed_by_id FK
- `shipment_attachment` — file_name, file_size bigint, file_type, storage_key (path in bucket)
- `automation_log` — rule_name, action, details jsonb, triggered_by_id FK
- `warehouse_task` — merged from `wh_tasks` + `wh_task_json_data`, all fields typed
- `quote_ref_sequence` — small helper for CZQ###-NNN sub-line numbers

Migrations generated via `drizzle-kit generate`, applied via `drizzle-kit migrate` on boot in dev.

Seed fixtures: 6 users, a handful of shipments, one quote, one master job — enough to exercise the UI.

**Exit criteria:** `pnpm db:migrate && pnpm db:seed` from a clean Postgres produces a working DB.

### Phase 4 — Backend services (~3–4 days)

Build in this order. Each service follows the three-layer pattern and gets at least service-layer tests.

1. **`shipments`** (largest, most central) — CRUD, list with filters, soft delete, master-job link/unlink
2. **`quotes`** — CRUD, soft delete via `deletedAt`, terms read/write, sub-line ref allocation
3. **`invoicing`** — costs upsert, additional charges CRUD, billing settings/overrides, invoice number generation (atomic via `INSERT ... RETURNING` on `quote_ref_sequence` or similar)
4. **`comments`** — list/add/delete per shipment
5. **`tasks`** — upsert checkbox state
6. **`attachments`** — Encore Bucket for blob storage, metadata in DB, signed-URL downloads
7. **`warehouse`** — merged tasks (see §8)
8. **`automation`** — 24-rule engine, ported with email sending stubbed (logs to `automation_log` with `action: "would_send"`)
9. **`documents`** — the three-phase Claude pipeline:
   - Session state in DB (a `document_session` table, not in-memory)
   - `documentPipelinePrepare.controller.ts` — upload, render pages to images, classify
   - `documentPipelineExtractMbl.controller.ts` — pull shared info from MBL pages
   - `documentPipelineExtractHblBatch.controller.ts` — batch HBL extraction
   - All AI calls go via the `claude` adapter

**Exit criteria:** every endpoint the frontend will call exists, is typed, has a generated client method, and has at least a happy-path test.

### Phase 5 — Frontend tabs (~5–7 days)

Build in this order — small tabs first to settle patterns, big spreadsheet last.

1. **App shell** — header, tab nav, theme toggle, logout (~half day)
2. **Login** — already wired in Phase 2, polish (~quick)
3. **Dashboard** — KPI tiles + deadlines reading from live data (no more empty `SHIPMENTS = []`) (~half day)
4. **Invoicing** — costs grid, additional charges, billing inputs, generate invoice + PDF (~1 day)
5. **Quote** — list table, detail Drawer with 4 tabs (Details, Costs, Documents, Terms) (~1.5 days)
6. **Warehouse** — single merged tab + the same UI embedded as a sub-tab in the Shipment detail (~1 day)
7. **Document/Text Reading** — upload UI, pipeline progress, review/validate flow (~1.5 days)
8. **Shipments / Full Sheet** — the big one. antd `<Table>` with `virtual`, frozen first 6 columns, inline editing via custom cells, column filters, Master Job grouping highlight, soft-delete confirmation, detail Drawer (~2 days)

**Exit criteria:** every tab renders real data, every CRUD action works end-to-end, no `console.error` in the browser during a 10-minute click-through.

### Phase 6 — Verify and clean up (~half day)

- `pnpm typecheck && pnpm lint && pnpm test` all green
- `pnpm build` produces a static `apps/web/out/` and a built Encore app
- Manual smoke test of all six tabs, all major flows
- Update README with run / build / deploy instructions
- Tag `v0.1.0`

**Total realistic estimate: 10–14 working days for one Claude-driven engineer working straight through.**

---

## 8. Decisions taken (defaults — flag if you want changed)

For the POC I've gone with the following defaults. Each can be revisited:

1. **Edit-log replay model → dropped.** `shipment` table stores current state directly. A separate write-only `shipment_audit` table captures per-field history if we want to read change history later. Replay logic disappears.
2. **Warehouse tabs → merged.** One `<WarehouseTaskTable>` component, used both as the standalone Warehouse tab and as a sub-tab inside the Shipment detail Drawer. ~3,400 lines of duplication collapse to ~800.
3. **Email automation → real, behind a provider-agnostic adapter; on/off via env var.** All 24 automation rules fire and log to `automation_log` exactly as today. Whether the email actually leaves the machine is one config switch. Default provider: **Resend** (free tier, simple SDK, same shape as the Claude adapter so one file is the only place the SDK is touched). Default `EMAIL_SEND=false` in dev so we don't spam during testing; flip to `true` with an API key to send for real. The current Outlook shell-out (`execSync('external-tool call outlook ...')`) goes away.
4. **File storage → Encore Bucket pointing at local filesystem in dev.** Same code works against R2/S3 in any future prod deploy.
5. **Workspace shape → monorepo with pnpm workspaces.** `apps/api/` (Encore) and `apps/web/` (Next.js). Shared types via a tiny `packages/shared/` if needed, otherwise build-time copy.
6. **Postgres → local docker only for POC.** No managed DB story until/unless we deploy.
7. **Run target → localhost.** No Encore Cloud, no Vercel, no deploy story for the POC. Static `apps/web/out/` can be served by any static host later.

---

## 9. Standards-check before any PR

Before any change is considered done, the author (me) confirms:

**Architecture**
- [ ] Controllers only validate, authorize, and delegate
- [ ] Services contain business logic, call repositories
- [ ] Repositories only do Drizzle queries
- [ ] Zero `any`, zero silent catches

**APIs**
- [ ] Public endpoints have `expose: true, auth: true`
- [ ] Private endpoints have `_` prefix and `expose: false`
- [ ] Sensitive operations check role inside the controller
- [ ] All inputs validated via Encore validators or Zod

**Types**
- [ ] Every request/response is a named exported interface
- [ ] Interface names follow `{Model}{Operation}{Request|Response}`

**Naming**
- [ ] Files match the table in §4.6
- [ ] camelCase / PascalCase / UPPER_SNAKE_CASE / snake_case applied correctly
- [ ] DB columns are snake_case

**Database**
- [ ] UUID primary keys
- [ ] `created_at` / `updated_at` / `deleted_at` (timestamptz)
- [ ] Soft delete handled in repositories
- [ ] Money is numeric, dates are date/timestamptz, JSON is jsonb

**Security**
- [ ] No secrets in source
- [ ] No sensitive data in logs
- [ ] Passwords hashed with argon2id
- [ ] AuthZ checks in place

**Frontend**
- [ ] One component per file
- [ ] Functional components, arrow form
- [ ] Props typed via `{Component}Props` interface
- [ ] Event handlers prefixed `handle`
- [ ] antd for primitives, Tailwind for layout
- [ ] Interactive elements have keyboard + aria support
- [ ] Early returns for null/loading/error

**Testing**
- [ ] Tests in `tests/` mirroring source structure
- [ ] Critical paths (auth, money, AI, invoice generation) have tests
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green

---

## 10. Things explicitly forbidden

The patterns from the old POC we will not carry forward:

- Storing passwords in plaintext
- Returning the full user object from `/login` with no session/token
- API endpoints with no auth check
- `text("amount")` for money
- `text("date")` for dates
- `ALTER TABLE ... ADD COLUMN` from app boot (`safeAddColumn`)
- Raw `CREATE TABLE` SQL inside route handlers (`wh_tasks` etc.)
- In-memory `Map` for cross-request session state (`pipelineSessions`)
- Replaying an append-only edit log on every page load
- `execSync` shelling out to system binaries from request handlers (use proper libs or Encore primitives)
- Single 1700-line `routes.ts`
- Files over ~400 lines without a really good reason — split them
- `.bak` and `.recovery` files in version control
- Hardcoded "today" dates in production code
- Broken model identifiers like `"claude_sonnet_4_6"` — use the real, current model ID, in one place
- Mixing two ORMs / two data access styles in one codebase
- Direct `Anthropic` SDK calls outside the `claude` adapter

---

## 11. Open questions to confirm before Phase 1

Quick yes/no from you, then I start:

1. **Defaults in §8 — OK to proceed with all seven?** (Direct shipment state + audit table, shared warehouse component, email adapter default-off, local-fs bucket, pnpm monorepo, local docker Postgres, localhost-only.)
2. **Repo: brand-new directory, or rewrite in place inside `shipment-tracker-source 2/`?** Recommend a new directory (`shipment-tracker-v2/` next to the existing one) so the old POC stays intact as a working reference while we build.
3. **Existing `data.db` — port the data, or start clean with seeded fixtures?** Current DB has 6 users, 220 shipment edits, 22 automation logs, no quotes / invoices / warehouse tasks. I can write a one-shot ETL to port it across (the audit table receives the 220 edits as history; shipments materialise to current state). Or start clean with ~5 fixture shipments and the 6 user accounts re-seeded with new argon2id hashes. Either way the user accounts and their passwords carry over.
4. **Claude model ID:** default to current Sonnet (`claude-sonnet-4-5-20250929`) unless you want a different one.
5. **Email provider:** Resend OK, or you have a preference (Postmark, SendGrid, your own SMTP)? Only matters when you flip `EMAIL_SEND=true`.

Once those are answered, I scaffold Phase 1.

# Database Standards

How tables, schemas and migrations are made in `apps/api` (Encore.ts + Drizzle ORM + Postgres).

> Related:
> - [Repository Patterns](./repository_patterns.md) - reading and writing rows
> - [API Pagination](./api_pagination_standards.md) - list endpoints
> - [Event Processing](./event_processing_patterns.md) - events, outboxes and cron jobs
> - [Local Drizzle Helpers](../LOCAL_DRIZZLE_HELPERS.md) - what `apps/api/lib/db` and `apps/api/lib/outbox` hold

---

## One database per service

Every service that stores data has its own Postgres database, declared in `services/<service>/db/db.ts`:

| Service folder | Database name |
|---|---|
| `auth` | `auth` |
| `automation` | `automation` |
| `customers` | `customers` |
| `fx` | `fx` |
| `holidays` | `holidays` |
| `invoicing` | `invoicing` |
| `quotes` | `quotes` |
| `sales` | `sales` |
| `shipments` | `shipments` |
| `tariffs` | `tariffs` |
| `trucking` | `trucking` |
| `warehouse` | `warehouse_basic` |
| `warehouseConcept` | `warehouse` |

(`extraction` has no database.)

Consequences:

- **No foreign keys across services.** A column that points at another service's row (a customer id on a shipment, `company_id` everywhere) is a bare `uuid`. When a row in one service goes away, the others hear of it by an event (for example `shipment-deleted`, see [Event Processing](./event_processing_patterns.md)).
- Foreign keys are fine **inside** one service's database (for example `shipment_event_outbox.shipment_id` → `shipment.id` with `onDelete("cascade")`).
- One service never reads another service's tables. It calls that service's endpoint through `~encore/clients`.

---

## Folder layout

```
apps/api/services/<service>/
├── db/
│   ├── db.ts                 # SQLDatabase + drizzle instance (+ the Tx type)
│   ├── drizzle.config.ts     # drizzle-kit config for this service
│   └── migrations/           # generated SQL + meta/ snapshots
├── schemas/
│   └── <model>.schema.ts     # one or a few related pgTable definitions
└── repositories/
    └── <model>.repository.ts
```

Shared helpers live in `apps/api/lib/db/` (columns, indexes, base repositories, text search, error checks, the pool) and `apps/api/lib/outbox/`.

---

## `db/db.ts`

Real example, shortened from `services/shipments/db/db.ts`:

```typescript
import { SQLDatabase } from "encore.dev/storage/sqldb";
import { drizzle } from "drizzle-orm/node-postgres";
import { servicePool } from "../../../lib/db/pool";
import * as shipmentSchema from "../schemas/shipment.schema";
import * as masterJobSchema from "../schemas/masterJob.schema";
// ... every schema file of the service

export const DB = new SQLDatabase("shipments", {
  migrations: { path: "migrations", source: "drizzle" },
});

const pool = servicePool(DB.connectionString);

export const db = drizzle(pool, {
  schema: { ...shipmentSchema, ...masterJobSchema /* , ... */ },
});

/** A transaction open on the shipments database (what db.transaction hands its callback). */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
```

- `source: "drizzle"` makes Encore apply the files drizzle-kit generates.
- Always open the pool with `servicePool()` (`lib/db/pool.ts`). It sets at most 10 connections, a 10 s wait for a free connection, a 60 s `statement_timeout` (a lock wait counts), a 60 s `idle_in_transaction_session_timeout`, and it logs a dropped idle connection instead of letting it crash the process.
- Import every schema file of the service and pass it as `schema`. A new schema file that is not added here works for plain queries but not for `db.query.*`.

## `db/drizzle.config.ts`

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./services/shipments/db/migrations",
  schema: "./services/shipments/schemas/*.schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: "postgresql://wvs8e:local@127.0.0.1:9500/shipments?sslmode=disable",
  },
});
```

The paths are relative to `apps/api`, so drizzle-kit is run from there. Every schema file must end in `.schema.ts` or drizzle-kit will not see it.

---

## Table design

Every table spreads the shared columns from `lib/db/defaults.ts`. A table that belongs to a company (nearly all of them) also spreads `tenantColumns`:

```typescript
import { sql } from "drizzle-orm";
import { index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

export const masterJobTable = pgTable(
  "master_job",
  {
    ...defaultTableColumns,   // id, created_at, updated_at, deleted_at
    ...tenantColumns,         // company_id uuid NOT NULL
    mczNumber: text("mcz_number").notNull(),
    shipper: text("shipper").notNull().default(""),
    // CRM customer ids (customers database), so no FK
    shipperId: uuid("shipper_id"),
    // ...
  },
  (table) => [
    ...defaultTableIndexes("master_job", table),
    tenantIndex("master_job", table),
    // MCZ numbers are unique per company among live rows.
    uniqueIndex("master_job_company_mcz_unique")
      .on(table.companyId, table.mczNumber)
      .where(sql`deleted_at IS NULL`),
    index("master_job_shipper_id_idx").on(table.companyId, table.shipperId),
  ],
);

export type MasterJobRecord = typeof masterJobTable.$inferSelect;
export type NewMasterJobRecord = typeof masterJobTable.$inferInsert;
```

### The shared columns

- `defaultTableColumns`: `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`, `created_at`, `updated_at` (both `timestamptz NOT NULL DEFAULT now()`), `deleted_at timestamptz` (null = live).
- `tenantColumns`: `company_id uuid NOT NULL`. It points at `auth.company.id` but has no foreign key (another database). The company always comes from the signed-in request, see [Repository Patterns](./repository_patterns.md#tenant-scoping).

### The shared indexes

- `tenantIndex(name, table)` makes `<table>_company_id_idx` on `(company_id, created_at)`. `company_id` leads every tenant query and lists are read newest first.
- `defaultTableIndexes(name, table)` makes `<table>_created_at_idx` **only for a table without `company_id`**. On a tenant table it adds nothing, because `tenantIndex` already covers it. Spread it anyway, so the table stays right if it changes.
- No table indexes `deleted_at` on its own: nearly every row has none, and every query also filters on something better.
- Add indexes for the lookups the repository really does, `company_id` first (for example `(company_id, shipper_id)` above).

### Soft delete

Rows are deleted by setting `deleted_at`, and every read filters on `deleted_at IS NULL`. The base repositories do this for you, see [Repository Patterns](./repository_patterns.md#soft-delete). A uniqueness rule that should hold among live rows only is a **partial unique index** with `.where(sql\`deleted_at IS NULL\`)`, as `master_job_company_mcz_unique` above. A few rows are really deleted, for example the line lists a shipment save replaces (containers, cargo lines) and expired login throttle rows.

### Column types we use

| Data | Column |
|---|---|
| Free text the user types | `text("x").notNull().default("")`. Empty string, not null, means "not filled". |
| A day | `date("x", { mode: "string" })`, nullable. The API sees `YYYY-MM-DD`. |
| An instant | `timestamp("x", { withTimezone: true })` |
| Money / amounts | `numeric("x", { precision: 14, scale: 2, mode: "number" })`, or without `mode` to keep it a decimal string in the API |
| A rate | `numeric("rate", { precision: 12, scale: 4 })` |
| A fixed set of values | `text` plus a `check(...)` constraint, for example `check("customer_status_check", sql\`${table.status} IN ('Active', 'Prospect', 'Inactive')\`)` |
| Structured payload | `jsonb("x").$type<SomeType>()` |
| Id of another service's row | `uuid("x")`, no FK |

The codebase uses `text` + `CHECK` for enumerations, not `pgEnum`.

### Things drizzle-kit cannot model

Some rules are written by hand into the generated migration and do not appear in the schema or the snapshot, so later `generate` runs leave them alone. Examples:

- `warehouse_dock_slot_no_overlap`, an `EXCLUDE USING gist` constraint, so that one dock door cannot have two overlapping live slots (warehouseConcept migration `0016`, with the `btree_gist` extension).
- The trucking tariff version overlap rule (trucking migration `0001`).

Write a comment next to the schema that names the constraint and its migration, as `warehouseRecords.schema.ts` does.

### Config callback

The third argument of `pgTable` returns an **array** (`(table) => [...]`), not an object.

### Exported types

Each schema exports `XRecord = typeof xTable.$inferSelect` and `NewXRecord = typeof xTable.$inferInsert`. These types stay in schemas, repositories and services. **Controllers never import them:** Encore's parser cannot resolve drizzle's generic types, so a controller declares its own plain request and response interfaces, and the service maps rows to them (`lib/db/serialize.ts` has `iso()` / `isoOrNull()` for dates).

---

## Naming

- Tables: singular, `snake_case`: `shipment`, `master_job`, `invoice_followup_outbox`, `warehouse_dock_slot`.
- Columns: `snake_case` in SQL, `camelCase` in TypeScript: `jobNumber: text("job_number")`.
- Indexes: `<table>_<columns>_idx`. Unique indexes: `<table>_<what>_unique`. Checks: `<table>_<what>_check`. Foreign keys: `<table>_<target>_fk`. Code matches unique violations by these names (see `constraintOf` in [Repository Patterns](./repository_patterns.md#database-errors)), so do not rename them casually.

---

## Migrations

### Making one

1. Change the schema file(s) under `services/<service>/schemas/`.
2. From `apps/api`, generate the migration:

   ```bash
   cd apps/api
   npx drizzle-kit generate --config=services/<service>/db/drizzle.config.ts --name=<what_changed>
   # or the package script, e.g.
   pnpm db:generate:shipments
   ```

   `--name` gives the file a readable name (`0082_shipment_event_outbox.sql`). Without it drizzle-kit picks a random one (`0015_nifty_polaris.sql`).
3. Read the generated SQL. Fix it by hand where drizzle-kit cannot know what to do (see below).
4. Restart the backend. Encore applies new migrations when the service starts, locally and on deploy. Never run `drizzle-kit migrate` or `push`.

Encore remembers applied migrations by **number** in `schema_migrations`. Editing a migration that already ran does not run it again. Make a new one.

### Editing a generated migration

It is fine to edit the generated file when drizzle-kit's SQL would not apply or cannot express the rule. Mark what you added with a `-- Hand-added:` comment that says why. Real cases:

- A type change that needs a conversion. drizzle-kit writes `ALTER COLUMN ... SET DATA TYPE date` with no `USING`, and Postgres refuses that for `text` → `date`/`numeric`. Drop the default, convert with `USING NULLIF(trim(col), '')::date` (or set the column to `NULL`), then add the default back.
- Constraints drizzle-kit cannot model (`EXCLUDE`, extensions).
- Backfills, for example giving existing dock slots their start and end instants in warehouseConcept `0016`.

Keep the end state equal to what the schema (and the snapshot in `meta/`) says, so the next `generate` stays clean.

### Dev data is disposable

The app is not in production use, so a migration may clear or rewrite data when that is the simple way to apply a change. For example, when `company_id NOT NULL` was added, the rows without a company were deleted (`auth` `0002` deletes `app_user`, `shipments` `0015` clears the shipment tables). Say so in a comment at the top of the migration. Reseed afterwards if needed: `pnpm db:seed` in `apps/api`, with `AUTH_DB_URL` and `SHIPMENTS_DB_URL` taken from `encore db conn-uri <db>` (see `scripts/seed.ts`).

### Drift check

Run the same generate command with no schema change. It must answer **"No schema changes, nothing to migrate"**. If it writes a new file instead, the schema and the migrations have drifted: either a schema change was not generated, or a migration was edited so that it no longer matches its snapshot.

### Rules

- Generate migrations with drizzle-kit. Never write a whole migration by hand, and never create tables from code.
- One migration per change, generated for the service whose schema changed.
- Never delete or renumber a migration that has been applied anywhere.
- Commit the SQL file and the `meta/` snapshot and journal together.

---

## Checklist for a new table

- [ ] `...defaultTableColumns` (and `...tenantColumns` when it belongs to a company)
- [ ] `...defaultTableIndexes(name, table)` and `tenantIndex(name, table)`
- [ ] Indexes for the real lookups, `company_id` first
- [ ] Partial unique indexes (`WHERE deleted_at IS NULL`) for rules among live rows
- [ ] `CHECK` constraints for fixed value sets
- [ ] No FK to another service's table
- [ ] `XRecord` / `NewXRecord` types exported; not imported by controllers
- [ ] Schema file added to the service's `db/db.ts`
- [ ] Migration generated with drizzle-kit, read, and the drift check is clean

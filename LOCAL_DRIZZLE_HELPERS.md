# Drizzle Helpers (`apps/api/lib/db`, `apps/api/lib/outbox`)

A reference to the shared database code every Shipment Tracker service builds on: what each file holds and how it is used. The rules for using it are in `engineering_basics/`:

- [Database Standards](engineering_basics/database_standards.md): tables, indexes, migrations
- [Repository Patterns](engineering_basics/repository_patterns.md): repositories, tenant scoping, transactions, locks
- [API Pagination](engineering_basics/api_pagination_standards.md): list endpoints
- [Event Processing](engineering_basics/event_processing_patterns.md): topics, outboxes, cron jobs

Imports are relative (`../../../lib/db/defaults` from `services/<service>/schemas/`). There is no `@/` path alias in the API, and no `src/` folder.

---

## `lib/db/`

```
apps/api/lib/db/
├── defaults.ts           defaultTableColumns, tenantColumns, defaultTableIndexes, tenantIndex
├── repository.ts         BaseRepository, TenantRepository, InsertForCompany, AnyDb
├── interface.ts          DrizzleBaseEntity, PaginationRequest, PaginatedResponse
├── pool.ts               servicePool(): the pg pool every service database uses
├── errors.ts             isUniqueViolation, constraintOf, isExclusionViolation, isDeadlock
├── textSearch.ts         containsAllWords, foldSql, foldDiacritics, escapeLike, searchTokens, joinedText
├── serialize.ts          iso(), isoOrNull(): Date → ISO string for API items
└── salesReferenceSql.ts  plainSalesReferenceSql(): a quote reference without its Freight Mode letters, in SQL
```

### `defaults.ts`

```typescript
export const defaultTableColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};

// company_id is a bare uuid (no cross-database FK) pointing at auth.company.id
export const tenantColumns = {
  companyId: uuid("company_id").notNull(),
};

// <table>_created_at_idx, only for a table WITHOUT company_id (a tenant table gets none here)
export const defaultTableIndexes = (tableName, table) =>
  "companyId" in table ? [] : [index(`${tableName}_created_at_idx`).on(table.createdAt)];

// <table>_company_id_idx on (company_id, created_at), or (company_id) when there is no created_at
export const tenantIndex = (tableName, table) => /* ... */;
```

Usage in a schema:

```typescript
export const masterJobTable = pgTable(
  "master_job",
  { ...defaultTableColumns, ...tenantColumns, mczNumber: text("mcz_number").notNull() /* , ... */ },
  (table) => [...defaultTableIndexes("master_job", table), tenantIndex("master_job", table) /* , ... */],
);
```

No helper indexes `deleted_at` on its own.

### `repository.ts`

`BaseRepository<TTable>`, for a table with `id`, `createdAt`, `updatedAt` and `deletedAt`. The constructor is `(db, table, tableName)`.

| Method | Notes |
|---|---|
| `create(data)` | insert … returning |
| `getById(id, { includeDeleted? })` | `null` when not found; skips deleted rows by default |
| `getByColumn(column, value, { includeDeleted? })` | first match or `null` |
| `getAll(limit = 100, { includeDeleted? })` | newest first |
| `getPaginated({ request, whereClauses?, defaultOrderBy, defaultMaxLimit, defaultLimit })` | `{ pagination: { total, offset, limit }, data }`; not used by any endpoint today (see API Pagination) |
| `update(id, data)` | live row only; sets `updatedAt`; returns the row or `null` |
| `softDelete(id)` | sets `deletedAt` on a live row; returns the row or `null` |

`TenantRepository<TTable>` extends it for tables that also have `companyId`, and every method takes the company:

| Method | Notes |
|---|---|
| `listForCompany(companyId, limit = 1000)` | live rows, newest first |
| `getByIdForCompany(id, companyId)` | |
| `getByColumnForCompany(column, value, companyId, { includeDeleted? })` | |
| `createForCompany(companyId, data: InsertForCompany<TTable>)` | the repository sets `companyId`; `data` has none |
| `updateForCompany(id, companyId, data)` | returns the row or `null` |
| `softDeleteForCompany(id, companyId)` | returns the row or `null` |

Both `update` methods pass `data` through `updatable()`, which drops `id`, `companyId`, `createdAt` and `deletedAt`, so a request passed straight through cannot move a row to another company or undelete it. None of the methods catches errors. A database error reaches the service, which maps it (see `errors.ts`).

`AnyDb` is `NodePgDatabase<any>`: any service's drizzle instance.

A repository:

```typescript
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { containerTable } from "../schemas/container.schema";

class ContainerRepository extends TenantRepository<typeof containerTable> {
  constructor() {
    super(db, containerTable, "container");
  }
  // the service's own queries, each with eq(companyId) and isNull(deletedAt)
}

export const containerRepository = new ContainerRepository();
```

### `interface.ts`

`DrizzleBaseEntity` (`id`, `createdAt`, `updatedAt`, `deletedAt`), `PaginationRequest` (`limit?`, `offset?`, `sortBy?`, `sortDirection?`) and `PaginatedResponse<T>` (`{ pagination: { total, offset, limit }, data: T[] }`).

### `pool.ts`

`servicePool(connectionString)` returns a `pg.Pool` with `max: 10`, `connectionTimeoutMillis: 10_000`, `idleTimeoutMillis: 30_000`, `statement_timeout: 60_000` and `idle_in_transaction_session_timeout: 60_000`. A dropped idle connection is logged instead of crashing the process. Every `db/db.ts` uses it.

### `errors.ts`

The Postgres SQLSTATE that drizzle puts on `cause` (or on the error itself):

- `isUniqueViolation(err)`: `23505`
- `constraintOf(err)`: the name of the refusing constraint or index
- `isExclusionViolation(err)`: `23P01` (an `EXCLUDE` constraint, such as the dock slots or the trucking tariff versions)
- `isDeadlock(err)`: `40P01`

### `textSearch.ts`

- `containsAllWords(columns, search, orWord?)`: an SQL condition that every typed word occurs in the joined columns, ignoring diacritics and case; `undefined` for an empty search. At most 5 words of at most 50 characters.
- `foldDiacritics(text)` (JavaScript) and `foldSql(sql)` (SQL) fold text the same way: NFD, combining marks removed, `đ ħ ı ł ø ŧ` replaced, lower case, `ς` → `σ`.
- `escapeLike`, `searchTokens`, and `joinedText(columns)`, which joins more than 90 columns in groups because of Postgres' 100-argument limit.

Used by the shipments, master jobs, customers, quotes, invoices and tariff lists.

### `serialize.ts`

`iso(date)` and `isoOrNull(date)`. Encore sends dates as ISO strings, so API interfaces type them as `string` and services map rows explicitly.

---

## `lib/outbox/`

```
apps/api/lib/outbox/
├── outbox.columns.ts     outboxColumns, outboxStatusCheck, OutboxStatus
├── outboxRepository.ts   OutboxRepository (extends TenantRepository): claim, settle, send again, health
├── outboxDelivery.ts     deliverOutboxRow, runOutboxDelivery (pure: no database, no Encore runtime)
├── outboxRetry.ts        OUTBOX_MAX_ATTEMPTS = 15, retryDelayMinutes, nextAttemptAt, outboxGivesUp
├── sendAgain.ts          sendFailedAgain(): requeue failed rows, resend rows of gone users as the service identity
├── serviceIdentity.ts    serviceActor(), goneUsers(): the per-company "Trucking (system)" user
└── shipmentUpdateAs.ts   sendShipmentUpdateAs(), actingAuthNow(): a ShipmentUpdate sent as the acting user
```

Outbox tables built on it: `shipment_event_outbox`, `quote_event_outbox`, `warehouse_gate_event_outbox`, `warehouse_shipment_outbox`, `trucking_outbox`, `invoice_followup_outbox`. How they are written, delivered and retried is in [Event Processing](engineering_basics/event_processing_patterns.md#through-a-transactional-outbox).

---

## Per-service files

```
apps/api/services/<service>/
├── db/db.ts              new SQLDatabase("<name>", { migrations: { path: "migrations", source: "drizzle" } });
│                         drizzle(servicePool(DB.connectionString), { schema: { ...every schema } }); export type Tx
├── db/drizzle.config.ts  out / schema paths relative to apps/api
├── db/migrations/        generated SQL + meta/
├── schemas/*.schema.ts
└── repositories/*.repository.ts
```

## Commands

Run from `apps/api`:

```bash
# generate a migration from schema changes
npx drizzle-kit generate --config=services/<service>/db/drizzle.config.ts --name=<what_changed>
pnpm db:generate:<service>        # the same, per service (package.json)

# drift check: the same command must answer "No schema changes, nothing to migrate"
npx drizzle-kit generate --config=services/<service>/db/drizzle.config.ts
```

Encore applies migrations when the service starts (`encore run`, deploys). Restart the backend after generating one. Do not run `drizzle-kit migrate` or `push`.

## Adding a table: recap

1. `schemas/<model>.schema.ts` with `defaultTableColumns`, `tenantColumns`, `defaultTableIndexes` and `tenantIndex`.
2. Add it to the `schema` object in `db/db.ts`.
3. Generate the migration, read it, run the drift check.
4. `repositories/<model>.repository.ts` extending `TenantRepository<typeof yourTable>`, exporting a singleton.
5. Use the repository from the service layer, passing the company from the signed-in request.

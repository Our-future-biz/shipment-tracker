# Local Drizzle Helpers

Reference implementations of the three Groupon-internal Drizzle helpers that the `encore-ts-standards.md` doc references but doesn't include the source for. We're in a standalone repo, so we write our own — same names, same contracts, lives in `apps/api/src/lib/db/`.

After this is in place, every schema and repository in the codebase follows the documented Groupon patterns 1:1.

---

## Where they live

```
apps/api/src/lib/db/
├── defaults.ts        ← defaultTableColumns, defaultTableIndexes
├── interface.ts       ← DrizzleBaseEntity, PaginationRequest, PaginatedResponse
└── repository.ts      ← BaseRepository<TTable>
```

Per-service Drizzle files live alongside the service, exactly as the standards doc describes:

```
apps/api/src/services/<service>/
├── schemas/<model>.schema.ts
├── db/
│   ├── db.ts
│   ├── drizzle.config.ts
│   └── migrations/
└── repositories/<model>.repository.ts
```

---

## `apps/api/src/lib/db/interface.ts`

```typescript
/**
 * Base entity returned from any repository.
 * Every row returned from a table that uses `defaultTableColumns`
 * is shape-compatible with this interface.
 */
export interface DrizzleBaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/**
 * Standard pagination request shape — used by `getPaginated()`.
 * Wire this into controller request interfaces when listing resources.
 */
export interface PaginationRequest {
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
}

/**
 * Standard pagination response shape returned from `getPaginated()`.
 */
export interface PaginatedResponse<T> {
  pagination: {
    total: number;
    offset: number;
    limit: number;
  };
  data: T[];
}
```

---

## `apps/api/src/lib/db/defaults.ts`

```typescript
import { uuid, timestamp, index, type PgColumn } from "drizzle-orm/pg-core";

/**
 * Standard columns every table in this repo MUST include.
 * Mirrors the contract from `encore-ts-standards.md` §Database Standards.
 *
 * Spread this into every `pgTable(...)` call:
 *   pgTable("shipment", { ...defaultTableColumns, jobNumber: text(...) }, ...)
 */
export const defaultTableColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};

/**
 * Standard indexes every table gets for free.
 * The primary key on `id` is already indexed by Postgres; we add
 * indexes for the two most common access patterns.
 *
 * Spread this into the `(table) => [...]` builder:
 *   (table) => [...defaultTableIndexes("shipment", table)]
 */
export const defaultTableIndexes = (
  tableName: string,
  table: { createdAt: PgColumn; deletedAt: PgColumn },
) => [
  index(`${tableName}_created_at_idx`).on(table.createdAt),
  index(`${tableName}_deleted_at_idx`).on(table.deletedAt),
];
```

---

## `apps/api/src/lib/db/repository.ts`

```typescript
import {
  eq,
  isNull,
  and,
  desc,
  asc,
  count as drizzleCount,
  type SQL,
  type InferSelectModel,
  type InferInsertModel,
} from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { APIError } from "encore.dev/api";
import log from "encore.dev/log";

import type { PaginatedResponse, PaginationRequest } from "./interface";

/**
 * Minimum shape a table must have to extend BaseRepository.
 * Every table built from `defaultTableColumns` automatically satisfies this.
 */
type TableWithDefaults = PgTable & {
  id: PgColumn;
  createdAt: PgColumn;
  updatedAt: PgColumn;
  deletedAt: PgColumn;
};

/**
 * Options accepted by `getPaginated()`.
 */
export interface PaginationOptions<TTable extends TableWithDefaults> {
  request: PaginationRequest;
  whereClauses?: SQL[];
  defaultOrderBy: PgColumn;
  defaultMaxLimit: number;
  defaultLimit: number;
}

/**
 * BaseRepository — Drizzle CRUD primitives shared by every model.
 *
 * Extend this per model and add custom queries on top.
 * Tables MUST use `defaultTableColumns` so the inherited methods
 * have `id`, `createdAt`, `updatedAt`, and `deletedAt` available.
 *
 * Notes:
 *  - Soft-delete is honoured by default in read methods (`isNull(deletedAt)`).
 *  - Pass `{ includeDeleted: true }` where supported to opt out.
 *  - All DB errors are wrapped as `APIError.internal(...)` and logged.
 */
export abstract class BaseRepository<TTable extends TableWithDefaults> {
  protected readonly db: NodePgDatabase<Record<string, never>>;
  protected readonly table: TTable;
  protected readonly tableName: string;

  constructor(
    db: NodePgDatabase<Record<string, never>>,
    table: TTable,
    tableName: string,
  ) {
    this.db = db;
    this.table = table;
    this.tableName = tableName;
  }

  // ─── Create ───────────────────────────────────────────────────────

  async create(
    data: InferInsertModel<TTable>,
  ): Promise<InferSelectModel<TTable>> {
    try {
      const [row] = await this.db
        .insert(this.table)
        .values(data as never)
        .returning();
      return row as InferSelectModel<TTable>;
    } catch (error) {
      log.error(error, `Database error in ${this.tableName}.create`);
      throw APIError.internal(`Failed to create ${this.tableName}`);
    }
  }

  // ─── Read ─────────────────────────────────────────────────────────

  async getById(
    id: string,
    opts: { includeDeleted?: boolean } = {},
  ): Promise<InferSelectModel<TTable> | null> {
    try {
      const conditions = opts.includeDeleted
        ? [eq(this.table.id, id)]
        : [eq(this.table.id, id), isNull(this.table.deletedAt)];

      const [row] = await this.db
        .select()
        .from(this.table as PgTable)
        .where(and(...conditions))
        .limit(1);

      return (row as InferSelectModel<TTable>) ?? null;
    } catch (error) {
      log.error(error, `Database error in ${this.tableName}.getById`, { id });
      throw APIError.internal(`Failed to fetch ${this.tableName}`);
    }
  }

  async getByColumn<TCol extends PgColumn>(
    column: TCol,
    value: unknown,
    opts: { includeDeleted?: boolean } = {},
  ): Promise<InferSelectModel<TTable> | null> {
    try {
      const conditions = opts.includeDeleted
        ? [eq(column, value)]
        : [eq(column, value), isNull(this.table.deletedAt)];

      const [row] = await this.db
        .select()
        .from(this.table as PgTable)
        .where(and(...conditions))
        .limit(1);

      return (row as InferSelectModel<TTable>) ?? null;
    } catch (error) {
      log.error(error, `Database error in ${this.tableName}.getByColumn`);
      throw APIError.internal(`Failed to fetch ${this.tableName}`);
    }
  }

  async getOneByQuery(
    where: SQL,
  ): Promise<InferSelectModel<TTable> | null> {
    try {
      const [row] = await this.db
        .select()
        .from(this.table as PgTable)
        .where(where)
        .limit(1);

      return (row as InferSelectModel<TTable>) ?? null;
    } catch (error) {
      log.error(error, `Database error in ${this.tableName}.getOneByQuery`);
      throw APIError.internal(`Failed to fetch ${this.tableName}`);
    }
  }

  async getAll(
    limit = 100,
    opts: { includeDeleted?: boolean } = {},
  ): Promise<InferSelectModel<TTable>[]> {
    try {
      const conditions = opts.includeDeleted
        ? []
        : [isNull(this.table.deletedAt)];

      const rows = await this.db
        .select()
        .from(this.table as PgTable)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(this.table.createdAt))
        .limit(limit);

      return rows as InferSelectModel<TTable>[];
    } catch (error) {
      log.error(error, `Database error in ${this.tableName}.getAll`);
      throw APIError.internal(`Failed to fetch ${this.tableName}`);
    }
  }

  async getPaginated(
    options: PaginationOptions<TTable>,
  ): Promise<PaginatedResponse<InferSelectModel<TTable>>> {
    const {
      request,
      whereClauses = [],
      defaultOrderBy,
      defaultMaxLimit,
      defaultLimit,
    } = options;

    const limit = Math.min(request.limit ?? defaultLimit, defaultMaxLimit);
    const offset = request.offset ?? 0;
    const direction = request.sortDirection === "asc" ? asc : desc;

    // Soft-delete filter is included by default.
    const where =
      whereClauses.length > 0
        ? and(isNull(this.table.deletedAt), ...whereClauses)
        : isNull(this.table.deletedAt);

    try {
      const [rows, [{ value: total }]] = await Promise.all([
        this.db
          .select()
          .from(this.table as PgTable)
          .where(where)
          .orderBy(direction(defaultOrderBy))
          .limit(limit)
          .offset(offset),
        this.db
          .select({ value: drizzleCount() })
          .from(this.table as PgTable)
          .where(where),
      ]);

      return {
        pagination: { total: Number(total), offset, limit },
        data: rows as InferSelectModel<TTable>[],
      };
    } catch (error) {
      log.error(error, `Database error in ${this.tableName}.getPaginated`);
      throw APIError.internal(`Failed to list ${this.tableName}`);
    }
  }

  // ─── Update ───────────────────────────────────────────────────────

  async update(
    id: string,
    data: Partial<InferInsertModel<TTable>>,
  ): Promise<InferSelectModel<TTable>> {
    try {
      const [row] = await this.db
        .update(this.table)
        .set({ ...data, updatedAt: new Date() } as never)
        .where(
          and(eq(this.table.id, id), isNull(this.table.deletedAt)),
        )
        .returning();

      if (!row) {
        throw APIError.notFound(`${this.tableName} not found`);
      }
      return row as InferSelectModel<TTable>;
    } catch (error) {
      if (error instanceof APIError) throw error;
      log.error(error, `Database error in ${this.tableName}.update`, { id });
      throw APIError.internal(`Failed to update ${this.tableName}`);
    }
  }

  async updateByColumn<TCol extends PgColumn>(
    column: TCol,
    value: unknown,
    data: Partial<InferInsertModel<TTable>>,
  ): Promise<InferSelectModel<TTable>> {
    try {
      const [row] = await this.db
        .update(this.table)
        .set({ ...data, updatedAt: new Date() } as never)
        .where(and(eq(column, value), isNull(this.table.deletedAt)))
        .returning();

      if (!row) {
        throw APIError.notFound(`${this.tableName} not found`);
      }
      return row as InferSelectModel<TTable>;
    } catch (error) {
      if (error instanceof APIError) throw error;
      log.error(error, `Database error in ${this.tableName}.updateByColumn`);
      throw APIError.internal(`Failed to update ${this.tableName}`);
    }
  }

  // ─── Delete ───────────────────────────────────────────────────────

  /** Hard delete. Prefer `softDelete` on the subclass. */
  async delete(id: string): Promise<void> {
    try {
      await this.db.delete(this.table).where(eq(this.table.id, id));
    } catch (error) {
      log.error(error, `Database error in ${this.tableName}.delete`, { id });
      throw APIError.internal(`Failed to delete ${this.tableName}`);
    }
  }

  /**
   * Soft delete — sets `deletedAt = now()`. Add a thin wrapper on the
   * subclass if you want a domain-specific method name; this is the
   * canonical implementation.
   */
  async softDelete(id: string): Promise<InferSelectModel<TTable>> {
    try {
      const [row] = await this.db
        .update(this.table)
        .set({ deletedAt: new Date(), updatedAt: new Date() } as never)
        .where(eq(this.table.id, id))
        .returning();

      if (!row) {
        throw APIError.notFound(`${this.tableName} not found`);
      }
      return row as InferSelectModel<TTable>;
    } catch (error) {
      if (error instanceof APIError) throw error;
      log.error(error, `Database error in ${this.tableName}.softDelete`, { id });
      throw APIError.internal(`Failed to soft-delete ${this.tableName}`);
    }
  }
}
```

---

## Per-service files

### `apps/api/src/services/<service>/db/db.ts`

```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import { Pool } from "pg";
import * as shipmentSchema from "../schemas/shipment.schema";
// import other schemas in this service here

// Encore provisions the Postgres DB and gives us a connection string.
const DB = new SQLDatabase("shipments", {
  migrations: { path: "migrations", source: "drizzle" },
});

const pool = new Pool({ connectionString: DB.connectionString });

// `schema` enables Drizzle's type-safe relational queries.
export const db = drizzle(pool, {
  schema: { ...shipmentSchema },
});
```

Notes:
- First argument to `new SQLDatabase(...)` is the service's database name. Match it to the service directory name (`shipments` for `services/shipments/`).
- `migrations.source: "drizzle"` tells Encore to read the migration files Drizzle Kit generates.
- Always pass `{ schema }` to `drizzle()` — that's what makes `db.query.shipment.findMany()` work with full types.

### `apps/api/src/services/<service>/db/drizzle.config.ts`

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "../schemas/*.schema.ts",
  out: "./migrations",
});
```

Per-service config. Drizzle Kit reads it via `--config=...` on the CLI.

### `apps/api/src/services/<service>/schemas/<model>.schema.ts`

```typescript
import { pgTable, text } from "drizzle-orm/pg-core";
import {
  defaultTableColumns,
  defaultTableIndexes,
} from "@/lib/db/defaults";

/**
 * Shipment table.
 * Inherits id / createdAt / updatedAt / deletedAt from defaultTableColumns.
 */
export const shipmentTable = pgTable(
  "shipment",
  {
    ...defaultTableColumns,

    jobNumber: text("job_number").notNull(),
    shipper: text("shipper").notNull().default(""),
    consignee: text("consignee").notNull().default(""),
    // ... rest of the columns
  },
  (table) => [...defaultTableIndexes("shipment", table)],
);
```

### `apps/api/src/services/<service>/repositories/<model>.repository.ts`

```typescript
import { eq } from "drizzle-orm";
import { APIError } from "encore.dev/api";

import { BaseRepository } from "@/lib/db/repository";
import { db } from "../db/db";
import { shipmentTable } from "../schemas/shipment.schema";

/**
 * Shipment Repository.
 * Inherits create / getById / getByColumn / getOneByQuery /
 * update / updateByColumn / delete / softDelete / getAll / getPaginated
 * from BaseRepository.
 *
 * Add domain-specific queries below.
 */
class ShipmentRepository extends BaseRepository<typeof shipmentTable> {
  constructor() {
    super(db, shipmentTable, "shipment");
  }

  /**
   * Domain query example — fetch shipments by master job.
   */
  async findByMasterJobId(masterJobId: string) {
    try {
      return await this.db
        .select()
        .from(this.table)
        .where(eq(this.table.masterJobId, masterJobId));
    } catch (error) {
      throw APIError.internal("Failed to fetch shipments by master job");
    }
  }
}

// Always export the singleton instance.
export const shipmentRepository = new ShipmentRepository();
```

---

## Commands

Run from `apps/api/`:

```bash
# Generate a new migration from schema changes
pnpm drizzle-kit generate --config=src/services/shipments/db/drizzle.config.ts

# Encore applies migrations automatically on service start in dev.
# In prod, they run on deploy. Don't run drizzle-kit migrate manually.
```

Convenience script in `apps/api/package.json`:

```json
{
  "scripts": {
    "db:generate": "pnpm drizzle-kit generate --config=src/services/$SERVICE/db/drizzle.config.ts"
  }
}
```

Then: `SERVICE=shipments pnpm db:generate`.

---

## Differences from the Groupon version

These are the only meaningful deltas. Same shape, same names, same behaviour.

| Thing | Groupon | Local |
|---|---|---|
| Import path for defaults / interface / repository | `@core/databases/drizzle/...` | `@/lib/db/...` |
| `defaultTableColumns` timestamps | `timestamp(...)` (no timezone shown in doc) | `timestamp(..., { withTimezone: true })` — explicit `timestamptz` |
| `defaultTableIndexes` extra index on `id` | Implied | Skipped — primary key is already indexed by Postgres |
| `BaseRepository` constructor signature | `super(db, table)` | `super(db, table, tableName)` — third arg used for log/error context |
| `softDelete` location | Custom per-repository | Provided by `BaseRepository`; subclasses can override |
| Logging | `encore.dev/log` | Same |
| Errors | `APIError` | Same |

---

## Adding new tables — recap

1. Create `schemas/<model>.schema.ts` using `defaultTableColumns` + `defaultTableIndexes`
2. Import the new schema into `db/db.ts` and add it to the `schema` object passed to `drizzle()`
3. Run `pnpm db:generate` to produce a migration SQL file
4. Create `repositories/<model>.repository.ts` extending `BaseRepository<typeof yourTable>`
5. Inject the singleton into your service layer

That's the whole cycle. No hand-written SQL, no `safeAddColumn` runtime hacks, no raw `CREATE TABLE` strings in route handlers.

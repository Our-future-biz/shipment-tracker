# Repository Patterns

How the repository layer of `apps/api` reads and writes rows: the base classes in `apps/api/lib/db/repository.ts`, tenant scoping, soft delete, transactions and locks, database errors and text search.

> Related:
> - [Database Standards](./database_standards.md) - tables and migrations
> - [API Pagination](./api_pagination_standards.md) - list endpoints
> - [Local Drizzle Helpers](../LOCAL_DRIZZLE_HELPERS.md) - reference for `lib/db` and `lib/outbox`

---

## What a repository does

A repository is the only layer that runs SQL against its service's database.

- It does: drizzle queries, transactions and locks, and returning rows (or small typed shapes) with explicit `Promise<...>` return types.
- It does not: read the signed-in user (`getAuthData`), check roles, call other services (`~encore/clients`), or decide business rules. The `companyId` is a parameter. The controller or service gets it from the signed-in request and passes it down.

Every repository file exports one singleton: `export const shipmentRepository = new ShipmentRepository();`.

---

## The base classes

### `TenantRepository` (almost every table)

For tables with `company_id` (see `tenantColumns` in [Database Standards](./database_standards.md#the-shared-columns)):

```typescript
import { TenantRepository } from "../../../lib/db/repository";
import { db, type Tx } from "../db/db";
import { containerTable, type ContainerRecord } from "../schemas/container.schema";

class ContainerRepository extends TenantRepository<typeof containerTable> {
  constructor() {
    super(db, containerTable, "container"); // db, table, table name
  }
  // the service's own queries ...
}

export const containerRepository = new ContainerRepository();
```

Methods it gives (every one is limited to one company and skips soft-deleted rows):

| Method | What it does |
|---|---|
| `listForCompany(companyId, limit = 1000)` | Live rows, newest first |
| `getByIdForCompany(id, companyId)` | The live row or `null` |
| `getByColumnForCompany(column, value, companyId, { includeDeleted? })` | The first matching row or `null` |
| `createForCompany(companyId, data)` | Inserts with `companyId` set by the repository. `data` has no `companyId` field (`InsertForCompany<T>`). |
| `updateForCompany(id, companyId, data)` | Updates the live row. Returns it, or `null` when there was none. |
| `softDeleteForCompany(id, companyId)` | Sets `deleted_at`. Returns the row, or `null` when it was already gone. |

On a tenant table, use these and never the unscoped methods inherited from `BaseRepository`.

### `BaseRepository` (tables without `company_id`)

`create`, `getById(id, { includeDeleted? })`, `getByColumn`, `getAll(limit = 100)`, `getPaginated`, `update(id, data)` and `softDelete(id)`. Reads skip soft-deleted rows unless `includeDeleted` is set. Today only `auth`'s `UserRepository` and `CompanyRepository` extend it directly.

### What an update never writes

`update` and `updateForCompany` pass `data` through `updatable()`, which drops `id`, `companyId`, `createdAt` and `deletedAt`, and they always set `updatedAt`. A request object passed straight through can therefore not move a row to another company or bring a deleted row back. Soft delete and restore have their own methods. This is tested in `lib/tests/repositoryUpdate.test.ts`.

### Repositories without a base class

Some repositories are plain classes, for example `fx`'s `CnbRateRepository` (exchange rates, not company data), `auth`'s `LoginThrottleRepository` and `invoicing`'s `MasterJobCostRepository`. They follow the same rules: filter by `company_id` and `deleted_at IS NULL` wherever the table has them.

---

## Tenant scoping

Every query on a tenant table has `eq(table.companyId, companyId)`, also in joins and subqueries. The `companyId` comes from the token:

```typescript
// controller
export const shipmentList = api(
  { expose: true, auth: true, method: "GET", path: "/shipments" },
  async (req: ShipmentListRequest): Promise<ShipmentListResponse> =>
    shipmentService.list(getAuthData()!.companyID, { /* ... */ }),
);
```

`requireRole(...)` (`lib/rbac.ts`) returns the same identity (`userID`, `companyID`, `role`) and checks the role. For a superadmin, the auth handler already sets `companyID` to the company chosen in the company switcher (`X-Acting-Company`), so repositories never handle that case themselves. A `companyId` is never read from the request body or the query string.

A custom query, from `ShipmentRepository.listFiltered`:

```typescript
async listFiltered(companyId: string, f: ShipmentListFilters) {
  const clauses = [eq(shipmentTable.companyId, companyId), isNull(shipmentTable.deletedAt)];
  if (f.customerId) clauses.push(eq(shipmentTable.customerId, f.customerId));
  if (f.masterJobMcz) {
    clauses.push(
      inArray(
        shipmentTable.masterJobId,
        this.db
          .select({ id: masterJobTable.id })
          .from(masterJobTable)
          // the subquery is scoped too
          .where(and(eq(masterJobTable.companyId, companyId), inArray(masterJobTable.mczNumber, masterJobNumberForms(f.masterJobMcz)), isNull(masterJobTable.deletedAt))),
      ),
    );
  }
  // ... more filters, then rows + count, see API Pagination
}
```

---

## Soft delete

- Deleting means setting `deleted_at` (`softDeleteForCompany`, or a custom method that also does what belongs with the delete).
- Every read adds `isNull(table.deletedAt)` unless it is meant to see deleted rows (a "deleted customers" list, a restore).
- Child rows of a deleted parent are retired by the service that owns them. Inside one database that happens in the same transaction. Across services it happens through an event (`shipment-deleted`, see [Event Processing](./event_processing_patterns.md)).

---

## Transactions

Use `db.transaction(async (tx) => ...)` when several writes must land together. A repository method that can be part of a bigger transaction takes the transaction as a parameter, using the `Tx` type from the service's `db/db.ts`:

```typescript
async listByShipmentIds(shipmentIds: string[], companyId: string, tx: Tx | typeof db = db) { ... }
```

or opens its own transaction when none is given. From `ShipmentRepository`:

```typescript
async softDeleteWithEvent(id: string, companyId: string, actor: { userId: string; role: string }, tx?: Tx): Promise<boolean> {
  if (!tx) return db.transaction((own) => this.softDeleteWithEvent(id, companyId, actor, own));
  const now = new Date();
  const [row] = await tx
    .update(shipmentTable)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(shipmentTable.id, id), eq(shipmentTable.companyId, companyId), isNull(shipmentTable.deletedAt)))
    .returning({ id: shipmentTable.id });
  if (!row) return false;
  // the event the delete owes, in the same transaction (transactional outbox)
  await tx.insert(shipmentEventOutboxTable).values({ /* ... */ });
  return true;
}
```

Keep remote calls out of transactions. The rare exception has to be bounded and commented (the shipment delete asks Invoicing inside its write turn, and the pool ends a transaction left idle for 60 s).

---

## Locks

Two writes of the same thing at the same moment must take turns. The codebase uses three tools.

**1. Advisory transaction locks** on a key, when there is no single row to lock or the rule spans several rows. The lock lasts until the transaction ends:

```typescript
await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`shipments-write:${companyId}:${shipmentId}`}))`);
```

Name the key `<what>:<companyId>:<id>`. Real ones:

- `ShipmentRepository.writeTurn(shipmentId, companyId, work)` holds `shipments-write:<company>:<shipment>` for the whole callback. Every shipment update, release and delete runs inside it, so audit entries, container and cargo lines, and the shipment row land all or nothing, and two saves of one shipment never interleave.
- `quote-ref:<company>`, `warehouse-ref:<company>`: allocating the next reference number.
- `warehouse_dock:<company>:<dock>` (`lockDock` in `warehouseRecords.repository.ts`): bookings of one dock door check for overlap and write one after the other. A trip that takes several doors takes them in the docks' order, so two transactions never wait on each other in a circle.

**2. Row locks** with `SELECT ... FOR UPDATE` (`.for("update")`), when the thing is one row:

```typescript
/** The trip row locked FOR UPDATE until the caller's transaction ends (its legs are about to change). */
async lock(tx: Tx, companyId: string, id: string): Promise<TruckingTripRecord | null> {
  const [row] = await tx.select().from(t).where(and(eq(t.companyId, companyId), eq(t.id, id), isNull(t.deletedAt))).for("update");
  return row ?? null;
}
```

**3. `FOR UPDATE SKIP LOCKED`** to share out queue rows between parallel workers. The outbox claim uses it (`lib/outbox/outboxRepository.ts`).

Constraints remain the guarantee. A lock makes the friendly check before the write give the right answer, and the unique index or the `EXCLUDE` constraint still refuses whatever slips past.

---

## Database errors

`lib/db/errors.ts` reads the Postgres error code that drizzle wraps:

| Helper | Meaning |
|---|---|
| `isUniqueViolation(err)` | `23505`: a unique constraint or index refused the write |
| `constraintOf(err)` | The name of the constraint that refused it, or `undefined` |
| `isExclusionViolation(err)` | `23P01`: an `EXCLUDE` constraint refused it (two dock bookings at once, overlapping tariff versions) |
| `isDeadlock(err)` | `40P01`: Postgres broke a deadlock by aborting this statement |

The service turns them into an `APIError` that says what clashed. From `customer.service.ts`:

```typescript
try {
  return await customerRepository.restoreWithChildren(id, companyId, as);
} catch (err) {
  if (isUniqueViolation(err) && constraintOf(err) === CUSTOMER_ICO_UNIQUE) {
    throw APIError.alreadyExists("A customer with this registration number already exists");
  }
  throw err;
}
```

Never return the raw database message to the client, and do not match on its text.

---

## Searching lists

Server-side search uses `lib/db/textSearch.ts`, so that every list compares the same way:

```typescript
import { containsAllWords } from "../../../lib/db/textSearch";

// every typed word must occur somewhere in these columns, ignoring diacritics and case
const match = containsAllWords([railRateTable.place, railRateTable.postcode, railRateTable.region, railRateTable.note], filter.search);
if (match) clauses.push(match);
```

- `containsAllWords(columns, search, orWord?)` returns `undefined` for an empty search. Columns may be SQL expressions (a subquery of a related table, like the shipment's container numbers). `orWord` gives a word a second way to match (a job number found by its digits).
- Words are folded with `foldDiacritics` in JavaScript and `foldSql` in SQL (no diacritics, lower case; "sanghaj" finds "Šanghaj"). At most 5 words of at most 50 characters each are looked for. `%` and `_` typed by the user are literal (`escapeLike`).
- Use `foldSql` / `foldDiacritics` for an exact comparison without diacritics (`tariff.repository.ts` matches a place name this way).

---

## Mapping rows out

Repositories return drizzle rows (`XRecord`). The service maps them to the API's plain interfaces field by field: no `as unknown as`, and dates through `iso()` / `isoOrNull()` from `lib/db/serialize.ts`. That way only the declared fields leave the service.

---

## Testing repositories

- **SQL shape without a database:** mock `../../db/db` with a stand-in that records the `where` it gets, and render it with `new PgDialect().sqlToQuery(where)` (`customers/tests/repositories/customerListFiltered.repository.test.ts`).
- **Real rows, locks and races:** DB tests under `services/<service>/tests/db/` (for example `shipments/tests/db/writeTurns.db.test.ts`). They need the Encore test database, see [Testing Standards](./testing_standards.md#database-tests).

---

## Checklist

- [ ] Extends `TenantRepository` (tenant table) and passes `(db, table, "table_name")`
- [ ] Exports a singleton
- [ ] Every query filters `company_id` and `deleted_at IS NULL`, including subqueries
- [ ] `companyId` is a parameter; no `getAuthData`, no `~encore/clients`
- [ ] Writes that belong together share one transaction; methods that join a caller's transaction take `tx`
- [ ] Concurrent writes of the same thing take a lock (advisory key or `FOR UPDATE`), and a constraint still guarantees the rule
- [ ] Unique and exclusion violations are mapped to an `APIError` by constraint name
- [ ] Search uses `containsAllWords`
- [ ] Explicit return types

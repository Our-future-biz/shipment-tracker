# API Pagination Standards

How list endpoints in `apps/api` limit, page and count what they return. Three shapes are in use, and each fits a different kind of screen.

> Related:
> - [Repository Patterns](./repository_patterns.md) - tenant scoping, search
> - [Database Standards](./database_standards.md) - indexes

---

## 1. Paged lists: `{ pagination, data }`

For big lists the user pages, sorts and filters on the server: shipments, sales quotes, sales follow-up tasks.

```typescript
interface ShipmentListResponse {
  pagination: {
    total: number;   // how many rows match the filters in all
    offset: number;  // as used
    limit: number;   // as used (after clamping)
  };
  data: ShipmentItem[];
}
```

The same shape is declared as `PaginatedResponse<T>` in `lib/db/interface.ts`.

### Request

- `limit?` and `offset?`, plus `sortDirection?: "asc" | "desc"` and, where the list can sort by several things, `sortBy?`.
- The server **clamps** them and never refuses them:

  ```typescript
  // shipmentList.controller.ts: 100 by default, 1 to 200
  limit: Math.min(Math.max(req.limit ?? 100, 1), 200),
  offset: Math.max(req.offset ?? 0, 0),
  sortDirection: req.sortDirection ?? "desc",
  ```

  or declares the bounds with Encore validators, which refuse values out of range:

  ```typescript
  interface SalesQuoteListRequest {
    /** Rows per page: 50 when left out, at most 200. */
    limit?: number & Min<1> & Max<200>;
    offset?: number & Min<0>;
    sortBy?: string & MaxLen<40>;
    // ...
  }
  ```

- An unknown `sortBy` falls back to the default sort (`createdAt`). An old link or saved view should not fail the request.

Current limits:

| Endpoint | Default | Max |
|---|---|---|
| `GET /shipments` | 100 | 200 |
| `GET /sales-quotes` | 50 | 200 |
| `GET /sales/followup-tasks` | 50 | 200 |

The sales pipeline (`GET /sales/pipeline`) is a board rather than a list. `limit` (100 by default, at most 500) cuts each column, `stage` + `offset` fetch more of one column, and `totals` count whole columns.

### Repository

The rows and the count come from the **same** `where`, run in parallel. The order always ends with `id`, so rows that sort equal keep one order and pages never overlap. From `ShipmentRepository.listFiltered`:

```typescript
const where = and(...clauses); // company_id, deleted_at IS NULL, filters, search
const direction = f.sortDirection === "asc" ? asc : desc;

const [rows, [{ value: total }]] = await Promise.all([
  this.db.select().from(shipmentTable).where(where)
    .orderBy(direction(shipmentTable.createdAt), direction(shipmentTable.id))
    .limit(f.limit).offset(f.offset),
  this.db.select({ value: count() }).from(shipmentTable).where(where),
]);
return { data: rows, total: Number(total) };
```

The service then enriches the page in a few queries for the whole page, never one per row (`shipmentService.list` reads containers, cargo lines, documents and the last tracking event for all ids at once). It returns `{ pagination: { total, offset, limit }, data }`.

### Loading a whole list: `afterId`

Walking a list by `offset` skips a row when an earlier one is deleted in the meantime, and repeats one when a row is created. A screen that needs **all** rows walks by id instead. `GET /sales-quotes` and the follow-up task list take `afterId`:

- `afterId` = the id of the last row already loaded (the nil id `00000000-0000-0000-0000-000000000000` for the first page).
- With `afterId`, rows come in id order and `offset` and `sortBy` are ignored. `total` still counts the whole filter, so it stays the same during the walk.
- A page shorter than `limit` is the last one.

The web does this with `fetchAllPages()` (`apps/web/src/lib/fetchAllPages.ts`): pages of 200, progress reported as `loaded / total`. One failed page fails the whole load, so part of a list is never shown as all of it.

```typescript
// repository: keyset page or sorted page
const rows = page.afterId
  ? db.select().from(quoteTable).where(and(where, gt(quoteTable.id, page.afterId))).orderBy(asc(quoteTable.id)).limit(page.limit)
  : db.select().from(quoteTable).where(where)
      .orderBy(sql`${order(sortKey(page.sortBy, moment.today, owners))} nulls last`, order(quoteTable.id))
      .limit(page.limit).offset(page.offset);
```

---

## 2. Capped lists with `truncated`

For work lists that the screen filters further in the browser, the server reads the newest N rows of the filter, counts all of them, and says when it stopped short. Trucking trips, consignments and haulier invoices read at most 1,000 (`MAX_LIST` in their repositories):

```typescript
interface TruckingTripListResponse {
  trips: TripListItem[];
  /** How many of the newest trips of the status were read (at most 1000), before the search */
  listed: number;
  /** How many trips the status matches, listed or not */
  total: number;
  /** More trips match than were read: the oldest are not listed */
  truncated: boolean;
  /** The work queues over every trip, not only those listed */
  counts: TripQueueCounts;
}
// service: truncated: total > trips.length
```

The Invoicing queue (`GET /invoicing/queue`) returns `truncated` too ("More shipments match than are listed - narrow it with the search"). The web shows a notice when `truncated` is true. Counts that drive tiles and tabs are always counted by the server over every row, never from the capped list.

---

## 3. Main search: `{ items, total }`

The top-bar search asks each owning service's `GET /search/<kind>` (shipments, master jobs, customers, quotes, invoices). They share `lib/mainSearch.ts`:

- `mainSearchInput(q, limit)` trims the text. Fewer than 2 characters gives no search, and the endpoint answers `{ items: [], total: 0 }`. The limit is 5 by default and is clamped to 1..50.
- The response is `{ items, total }`: the newest `limit` matches and how many match in all.

---

## Rules for any list endpoint

- Every list is bounded. There is a `limit` (clamped) or a fixed cap with `truncated`. Never return an unbounded `select()`.
- The where clause always holds `company_id = <the caller's company>` and `deleted_at IS NULL` (see [Repository Patterns](./repository_patterns.md#tenant-scoping)).
- `total` is counted over the same where clause as the rows.
- Sort with an `id` tiebreaker.
- Search on the server with `containsAllWords` (`lib/db/textSearch.ts`).
- List endpoints are `GET` with the filters as query parameters.
- Indexes lead with `company_id` (`tenantIndex` gives `(company_id, created_at)`, which serves "newest first").

### About `BaseRepository.getPaginated()`

`lib/db/repository.ts` has a generic `getPaginated({ request, whereClauses, defaultOrderBy, defaultLimit, defaultMaxLimit })` that returns the `PaginatedResponse` shape. No endpoint uses it today. Its sort has no `id` tiebreaker and it is not company-scoped by itself. The lists above build their query in their own repository. If you use it, pass the company clause in `whereClauses` and an order that is unique.

---

## Checklist

- [ ] The shape fits the screen: paged (`pagination` + `data`), capped (`truncated`), or search (`items` + `total`)
- [ ] `limit` has a default and a maximum; `offset` ≥ 0
- [ ] Unknown `sortBy` falls back to the default
- [ ] The order ends with `id`
- [ ] Rows and `total` from the same where clause, in `Promise.all`
- [ ] `company_id` and `deleted_at IS NULL` in the where clause
- [ ] The page is enriched with one query per related table, not one per row
- [ ] A screen that needs every row uses `afterId` (`fetchAllPages`), not offsets

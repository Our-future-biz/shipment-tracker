# Database & Repository Standards

The entry page for everything about data in `apps/api`. The details are in these documents:

| Document | Read it when you |
|---|---|
| [Database Standards](database_standards.md) | add or change a table, an index or a constraint; make a migration |
| [Repository Patterns](repository_patterns.md) | write a repository method; need a transaction, a lock, search, or to map a database error |
| [API Pagination Standards](api_pagination_standards.md) | build or change a list endpoint |
| [Event Processing Patterns](event_processing_patterns.md) | need another service to learn about a change (events, outboxes, cron jobs) |
| [Testing Standards](testing_standards.md) | test any of the above, including the DB tests |
| [Local Drizzle Helpers](../LOCAL_DRIZZLE_HELPERS.md) | want to know what `lib/db` and `lib/outbox` export |

---

## The rules in short

1. **One Postgres database per service**, through Drizzle. No foreign keys and no reads across services. Another service's data comes through its endpoint, and changes arrive as events.
2. **Repositories are the only layer that runs SQL.** Controller → service → repository. Controllers never import drizzle types.
3. **Every tenant table has `company_id`**, and every query filters on it. The company comes from the signed-in request (`getAuthData()` / `requireRole()`), never from the client. Use `TenantRepository`.
4. **Soft delete** with `deleted_at`. Reads filter `deleted_at IS NULL`, and live-only uniqueness is a partial unique index.
5. **Shared columns and indexes** from `lib/db/defaults.ts`: `defaultTableColumns`, `tenantColumns`, `defaultTableIndexes`, `tenantIndex`.
6. **Writes that belong together share a transaction.** Concurrent writes of one thing take a lock (advisory key or `FOR UPDATE`), and a constraint still guarantees the rule.
7. **Every list is bounded**: `limit` / `offset` with `total`, a cap with `truncated`, or `afterId` to load everything.
8. **Migrations are generated** with `drizzle-kit generate --config=services/<service>/db/drizzle.config.ts`, read, and edited only where drizzle-kit cannot know better. Dev data is disposable.
9. **What must reach another service goes through an outbox** written in the same transaction and retried by a cron.

---

## Quick start: a new table

1. Write `services/<service>/schemas/<model>.schema.ts` with `...defaultTableColumns`, `...tenantColumns`, `...defaultTableIndexes(name, table)` and `tenantIndex(name, table)`. See [Database Standards - Table design](database_standards.md#table-design).
2. Add the schema to the service's `db/db.ts`.
3. From `apps/api`, run `npx drizzle-kit generate --config=services/<service>/db/drizzle.config.ts --name=<what>` and read the SQL. See [Migrations](database_standards.md#migrations).
4. Write `repositories/<model>.repository.ts` extending `TenantRepository` and export the singleton. See [Repository Patterns](repository_patterns.md#the-base-classes).
5. Restart the backend. Encore applies the migration on start.
6. Run the drift check (the same generate command must say "No schema changes").

## Quick start: a new list endpoint

1. Choose the shape: paged (`{ pagination: { total, offset, limit }, data }`), capped (`truncated`), or search (`{ items, total }`). See [API Pagination](api_pagination_standards.md).
2. Clamp `limit` and `offset` in the controller or service, and fall back to the default sort for an unknown `sortBy`.
3. In the repository: company and `deleted_at` in the where clause, search with `containsAllWords`, an `id` tiebreaker in the order, and rows plus count in `Promise.all`.
4. Enrich the page with one query per related table, never one per row.

---

## Drizzle operators you will see

`eq`, `ne`, `and`, `or`, `inArray`, `notInArray`, `isNull`, `isNotNull`, `gt`, `gte`, `lt`, `lte`, `asc`, `desc`, `count`, `max`, `sql`, plus `getTableColumns` (all from `drizzle-orm`), and `.for("update")` for row locks. Use `sql\`...\`` for what has no operator (subqueries, `pg_advisory_xact_lock`, `nulls last`). Values always go in as parameters (`${value}`), never by string concatenation.

---

## Related

- [Controllers & API Endpoints](controllers_api_endpoints.md)
- [Naming Conventions](naming_convention.md)
- [Service Architecture Patterns](service_architecture_patterns.md)

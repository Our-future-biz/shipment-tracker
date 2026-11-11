# Shipment Tracker Engineering Docs

Shipment Tracker is the freight-forwarding app of a small Czech forwarder: shipments, quotes, customers, invoicing, trucking, the warehouse and exchange rates. One backend serves several companies (multi-tenant), and every row belongs to exactly one company.

It is a pnpm monorepo:

- **`apps/api`**: the Encore.ts backend. It has 14 services, each with its own Postgres database through Drizzle ORM. A service lives in `apps/api/services/<service>/` (controllers, services, repositories, schemas, interfaces, db/migrations, lib, tests). Shared code is in `apps/api/lib`.
- **`apps/web`**: the Next 15 single-page app (React 19, antd 5, Tailwind v4, @tanstack/react-query). Its API client is `apps/web/src/lib/api/client.ts`, which Encore generated once and which is now edited by hand.

These docs describe how this codebase is written. Each one is checked against the code; when the code and a doc disagree, fix the doc.

---

## Start here

1. [How Encore Works Here](encore_how_its_working.md): what Encore provides, how a request runs, running it locally.
2. [Code Standards in Encore](code_standards_in_encore.md): the rules: layers, company scoping, roles, plain interfaces, validation, errors.
3. [Service Architecture & Patterns](service_architecture_patterns.md): services, their databases, calls between them, events, outboxes, transactions, cron jobs.
4. [Request Flow Layers](request_flow_layers/README.md): one request from the browser to the database.

## API layer

- [Controllers & API Endpoints](controllers_api_endpoints.md): kinds of endpoints, paths, parameters, templates.
- [DTO: Request and Response Types](dto.md): where API types live, validation, rows to responses.
- [Error Handling](errors.md): `APIError` codes and when to use each, messages, database errors.
- [API Pagination Standards](api_pagination_standards.md)

## Data layer

- [Database Standards](database_standards.md)
- [Database & Repository Standards](database_repository_standards.md)
- [Repository Patterns](repository_patterns.md)
- [Local Drizzle Helpers](../LOCAL_DRIZZLE_HELPERS.md): the shared helpers in `apps/api/lib/db`

## Events and background work

- [Event Processing Patterns](event_processing_patterns.md)

## Configuration and service lifecycle

- [Secrets and Configuration](secrets_environment_management.md)
- [Start-up](service_startup_handler_onstart.md)
- [Shutdown](graceful_shutdown_handler.md)

## Testing

- [Testing Standards](testing_standards.md)
- [How to Add New API Tests](how_to_add_new_api_tests.md)

## Operations

- [Debugging](debugging_production_services.md)
- [Incident Checklist](encore_cloud_incident_runbook.md)
- [Databases, Backups and Scheduled Jobs](encore_db_monitoring_operations.md)

## Layout and names

- [Folder Structure](folder_structure_and_naming.md): the repository, a service's folders, `apps/api/lib`, where new code goes.
- [Naming Convention](naming_convention.md): files, TypeScript, database objects, Encore resources, paths.

## Rules

- [Encore TS Standards](../rules/encore-ts-standards.md): backend rules
- [Frontend (web)](../rules/frontend-web.md): `apps/web` rules
- [Code Quality](../rules/code-quality.md): rules for all code

---

## Quick reference

### Layers

```
controller   reads the actor (requireRole / getAuthData), passes companyID on
   ↓
service      rules, APIError, ~encore/clients, topics/outbox, transactions
   ↓
repository   Drizzle queries, every one filtered by company_id (TenantRepository)
   ↓
the service's own Postgres database
```

- Queries belong in repositories. A service may open a transaction and hand its `tx` to repository methods.
- Controllers and `interfaces/` never import Drizzle types.
- Another service's data comes only through `~encore/clients`.

### Commands

```bash
./run-local.sh                                   # start web (:3001) and API (:4001) locally
pnpm dev                                         # both apps, without the checks
pnpm typecheck && pnpm test                      # all packages
cd apps/api && encore gen wrappers && npx tsc --noEmit   # API type check with fresh encore.gen
pnpm --filter api db:generate:<service>          # migration from the Drizzle schema
encore db conn-uri <database>                    # connection string of a local database
SHIPMENTS_DB_TESTS=1 encore test services/shipments/tests/db   # database tests (see Testing Standards)
```

### Roles

`superadmin` (platform, works as any company through the company switcher), `admin`, `manager`, `user`. Checked with `requireRole(...)` from `apps/api/lib/rbac.ts`.

---

## External documentation

- Encore.ts: https://encore.dev/docs/ts
- Drizzle ORM: https://orm.drizzle.team/
- Vitest: https://vitest.dev/
- Next.js: https://nextjs.org/docs
- Ant Design: https://ant.design/
- TanStack Query: https://tanstack.com/query/latest

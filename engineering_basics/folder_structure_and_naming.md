# Folder Structure

Where code lives in this repository, and where new code goes. File and symbol names are covered in [Naming Convention](naming_convention.md).

---

## The repository

```
shipment-tracker/
├── apps/
│   ├── api/                 Encore.ts backend (pnpm package "api")
│   └── web/                 Next 15 web app (pnpm package "web")
├── engineering_basics/      these docs
├── rules/                   coding rules (encore-ts-standards.md, frontend-web.md, code-quality.md)
├── docs/                    working notes and mock-ups
├── LOCAL_DRIZZLE_HELPERS.md the shared Drizzle helpers in apps/api/lib/db
├── run-local.sh             starts the app locally (web :3001, API :4001); also seed, admin
└── zaloha.sh                backs up local data
```

It is a pnpm workspace (`pnpm-workspace.yaml`: `apps/*`). The root `package.json` runs both apps: `pnpm dev`, `pnpm backend`, `pnpm frontend`, `pnpm typecheck`, `pnpm test`.

---

## apps/api

```
apps/api/
├── encore.app            Encore app id, build settings, global CORS
├── package.json          scripts: dev, test, typecheck, db:generate:<service>, db:seed, gen:client
├── tsconfig.json
├── vitest.config.ts      also decides which database tests run
├── eslint.config.mjs
├── lib/                  code shared by every service (below)
├── scripts/              seed.ts, provision-company.ts, provision-superadmin.ts
└── services/             one folder per Encore service
```

There is no `src/` folder: Encore finds services directly under `apps/api/services/`.

### The services

| Service | Holds |
|---|---|
| `auth` | users, companies, login, departments, branches, countries and locations, announcements, column templates |
| `customers` | the Customer Database: customers, contacts, addresses, sites, documents, notes, invoices, supplier approval and ratings, company registration links, ARES look-ups |
| `shipments` | shipments, master jobs, tasks, comments, attachments, tracking, customer links, import instructions |
| `quotes` | sales quotes, their chat and attachments, the tariff check |
| `sales` | follow-up tasks, terms and conditions, pipeline, managers' cockpit, sales preferences, e-mail templates |
| `invoicing` | costs breakdown (buying and selling costs), invoices and their PDFs, customs invoicing, job profit report |
| `trucking` | consignments, trips, hauliers, haulier invoices, the haulier portal and transport orders |
| `tariffs` | ocean, rail and collection tariffs read from supplier files |
| `fx` | ČNB exchange rates, a job's locked rates, FX alerts |
| `holidays` | the company's public holiday list |
| `warehouse` | a shipment's warehouse task and sections (database `warehouse_basic`) |
| `warehouseConcept` | the warehouse: gate movements, containers, stock, positions, dock slots, KPIs (database `warehouse`) |
| `automation` | automation rules log |
| `extraction` | reading documents with AI (Anthropic); no database |

### Inside a service

Every service uses the same layout. A large service has more files in the same folders, not sub-modules. Shipments as the example:

```
services/shipments/
├── encore.service.ts       export default new Service("shipments")
├── topics.ts               Pub/Sub topics this service publishes
├── controllers/            endpoints, mostly one per file (shipmentGet.controller.ts, _internal….controller.ts, _cron….controller.ts)
├── services/               business logic (shipment.service.ts, …)
├── repositories/           Drizzle queries (shipment.repository.ts, …)
├── schemas/                Drizzle tables (shipment.schema.ts, …)
├── interfaces/             plain API types (interfaces.ts, importInstructions.ts)
├── db/
│   ├── db.ts               SQLDatabase + drizzle instance (+ the Tx type)
│   ├── drizzle.config.ts   for drizzle-kit generate
│   └── migrations/         generated SQL migrations
├── lib/                    pure helpers of this service
├── subscriptions/          handlers of other services' topics (customerChanged.subscription.ts, …)
├── crons/                  CronJob definitions (shipmentEventOutbox.cron.ts, …)
├── storage/                object storage buckets (attachmentBucket.ts, …)
└── tests/                  Vitest tests (lib/, services/, repositories/, db/)
```

Which optional folders each service has:

| Folder | Services |
|---|---|
| `topics.ts` | customers, quotes, shipments, warehouseConcept |
| `subscriptions/` | customers, fx, invoicing, quotes, sales, shipments, trucking, warehouse, warehouseConcept |
| `crons/` | fx, invoicing, shipments, trucking, warehouseConcept (quotes defines its two cron jobs in the controller files) |
| `storage/` | invoicing, quotes, shipments, tariffs, trucking, warehouseConcept |
| `utils/` | invoicing, quotes, sales (pure helpers named `*.utils.ts`; elsewhere they go in `lib/`) |
| `db/` | every service except extraction |

### Folder rules

- **`controllers/`**: only endpoint definitions and their request/response interfaces. No schema or Drizzle imports (see [Code Standards §4](code_standards_in_encore.md#4-plain-interfaces-at-the-api-boundary)).
- **`services/`**: classes exported as a singleton (`export const holidaysService = new HolidaysService()`), plus helper modules that belong to the business logic (`fxScheduler.ts`, `houses.ts`).
- **`repositories/`**: one class per table or aggregate, exported as a singleton (`export const publicHolidayRepository = new PublicHolidayRepository()`). Usually it extends `TenantRepository`.
- **`schemas/`**: `pgTable` definitions and their `XxxRecord`/`NewXxxRecord` types. drizzle-kit reads every `schemas/*.schema.ts` (`db/drizzle.config.ts`). `db/db.ts` passes the schemas to `drizzle(pool, { schema })`, but not every service lists all of its schema files there.
- **`db/migrations/`**: produced by `pnpm --filter api db:generate:<service>` (drizzle-kit) and applied by Encore on start. Do not write them from scratch; edit a generated one only when the data needs a transform drizzle-kit cannot infer.
- **`lib/` and `utils/`**: pure functions with no database and no Encore runtime, so they can be unit tested.
- **`tests/`**: never next to the source. Database tests sit in `tests/db/` (shipments, quotes, sales, trucking) or make up all of `tests/` (warehouseConcept). They are skipped unless their database is given: the shipments, trucking and warehouseConcept ones run under `encore test` with `SHIPMENTS_DB_TESTS=1`, `TRUCKING_DB_TESTS=1` or `WAREHOUSE_DB_TESTS=1`, and the quotes and sales ones with `QUOTES_DB_URL` or `SALES_DB_URL` set (see the top of each test file).

---

## apps/api/lib: shared code

| Path | What |
|---|---|
| `auth.handler.ts` | the auth handler and `Gateway`: token, then `AuthData` (`userID`, `companyID`, `role`, `homeCompanyID`, `appWrite`), with the superadmin's `X-Acting-Company` |
| `rbac.ts` | `requireRole`, `ROLES`, `isAdminLevel`, `isCompanyRole` |
| `internalCall.ts` | `asCompany(companyId)`: call options for internal calls without a user (crons, subscribers) |
| `db/defaults.ts` | `defaultTableColumns`, `tenantColumns`, `defaultTableIndexes`, `tenantIndex` |
| `db/repository.ts` | `BaseRepository`, `TenantRepository`, `InsertForCompany` |
| `db/pool.ts` | `servicePool`: each service's pg pool with its time limits |
| `db/errors.ts` | `isUniqueViolation`, `constraintOf`, `isExclusionViolation`, `isDeadlock` |
| `db/serialize.ts` | `iso`, `isoOrNull` |
| `db/textSearch.ts` | accent-insensitive list search |
| `db/interface.ts` | `PaginationRequest`, `PaginatedResponse` |
| `outbox/` | the transactional outbox: columns, repository base, delivery loop, retry rules, "Send again", service identity, `shipmentUpdateAs` |
| `geo/` | countries, airports, terminals, subdivisions |
| `signedUrl.ts`, `fileContent.ts`, `fileType.ts` | signed file links and serving files |
| `email.ts` | outgoing e-mail (currently disabled) |
| `appUrl.ts` | links to the web app (`APP_URL`) |
| `workingDays.ts`, `businessDate.ts` | Czech working days and date helpers |
| `jobNumber.ts`, `shipmentRefs.ts`, `salesReference.ts`, `chargeCodes.ts`, … | domain helpers used by several services |
| `tests/` | tests of `lib/`, and the `encore.dev/api` stub (`encoreApi.stub.ts`) |

Put code here only when two or more services use it. It must not import a service's repository, schema or `db`. (`auth.handler.ts` is the exception: it uses `authService` to check the token.)

---

## apps/web

```
apps/web/src/
├── app/          routes (shipments/, customers/, quotes/, invoicing/, trucking/, warehouse-concept/, platform/, …)
├── components/   shared components (AppModal, CompanySwitcher, …)
├── hooks/        react-query hooks per area (useCustomers.ts, useShipments…)
├── lib/          helpers; lib/api/ holds the API client (client.ts) and its setup (index.ts)
└── styles/       globals.css, ui.ts (the shared Tailwind class constants)
```

See [rules/frontend-web.md](../rules/frontend-web.md).

---

## Where new code goes

| You are adding | Put it in |
|---|---|
| An endpoint | `services/<service>/controllers/<name>.controller.ts` |
| Its shared response item | `services/<service>/interfaces/interfaces.ts` |
| Business logic | `services/<service>/services/<entity>.service.ts` |
| A query | `services/<service>/repositories/<entity>.repository.ts` |
| A table or column | `services/<service>/schemas/<entity>.schema.ts`, then `pnpm --filter api db:generate:<service>` |
| A pure calculation | `services/<service>/lib/<name>.ts` with a test in `services/<service>/tests/` |
| An event other services react to | the publisher's `topics.ts`; subscribers in their `subscriptions/` |
| A scheduled job | `_cron<Name>.controller.ts` + `crons/<name>.cron.ts` |
| A file bucket | `services/<service>/storage/<name>Bucket.ts` |
| Something two services need | `apps/api/lib/` |
| A new service | `services/<name>/` with `encore.service.ts`, `db/` (if it stores data), and a `db:generate:<name>` script in `apps/api/package.json` |

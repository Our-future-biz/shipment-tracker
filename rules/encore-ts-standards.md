# Encore TypeScript Standards (apps/api)

How the Shipment Tracker backend is built. Shipment Tracker is the freight-forwarding app of a
small Czech forwarder, and it is multi-tenant: every company sees only its own data. Each rule
below describes what the code in `apps/api` does now. When you write new code, follow the code
around it. When this file and the code disagree, the code wins, so fix this file.

---

## Stack

- **Encore.ts** (`encore.dev`). Endpoints are `api()`, plus Pub/Sub `Topic`/`Subscription`,
  `CronJob`, `Bucket`, `secret()` and the auth handler.
- **PostgreSQL, one database per service**, through **Drizzle ORM** (`drizzle-orm/node-postgres`,
  `drizzle-kit` for migrations).
- **Vitest** for tests, TypeScript `strict`, ESLint (`no-explicit-any`, `no-unused-vars` and
  `no-console` are errors).

---

## Layout

```
apps/api/
├── lib/                      # shared code, imported by relative path (../../../lib/...)
│   ├── auth.handler.ts       # the auth handler and Gateway (AuthData)
│   ├── rbac.ts               # roles, requireRole(), isAdminLevel()
│   ├── internalCall.ts       # asCompany(): call options for a call with no user behind it
│   ├── db/                   # defaults (columns, indexes), BaseRepository / TenantRepository,
│   │                         # servicePool, Postgres error helpers, iso(), text search
│   ├── outbox/               # transactional outbox: columns, repository, delivery, retry
│   ├── tests/                # tests of lib + encoreApi.stub.ts
│   └── *.ts                  # pure domain helpers (jobNumber, salesPolicy, signedUrl, geo/, …)
├── services/<service>/
│   ├── encore.service.ts     # export default new Service("<service>")
│   ├── controllers/          # endpoints, one file per endpoint as a rule
│   ├── services/             # business logic
│   ├── repositories/         # data access
│   ├── schemas/              # Drizzle tables, one file per table
│   ├── interfaces/           # plain API types (interfaces.ts, sometimes split further)
│   ├── db/db.ts, db/drizzle.config.ts, db/migrations/
│   ├── lib/ or utils/        # pure helpers of the service (mappers, rules, formatting)
│   ├── topics.ts             # Pub/Sub topics the service publishes
│   ├── subscriptions/        # <topic>.subscription.ts
│   ├── crons/                # <name>.cron.ts
│   ├── storage/              # <name>Bucket.ts (object storage)
│   └── tests/                # unit tests; repositories/, services/, db/ subfolders
└── scripts/                  # seed and provisioning (seed.ts, provision-company.ts, provision-superadmin.ts)
```

Not every service has every folder. `extraction` has no database.

Services: `auth` (sign-in, users, companies, departments and branches, places, announcements),
`customers` (customer and supplier database), `shipments` (shipments, master jobs, tracking,
customer links), `quotes` (sales quotes), `sales` (follow-up tasks, pipeline, managers' cockpit),
`invoicing`, `fx` (ČNB exchange rates), `tariffs` (ocean, rail and collection tariffs),
`trucking` (road transport by subcontracted hauliers, haulier portal), `warehouse`,
`warehouseConcept` (gate log, warehouse tasks), `holidays`, `automation`, `extraction` (AI reading
of documents).

`encore.service.ts` holds only the `Service` and, where needed, start-up code (for example
`configureAppEnvironment(appMeta().environment)` in customers, shipments and trucking). No
service registers middleware.

---

## Layers

| Layer | Does | Does not |
|---|---|---|
| Controller | Declares the endpoint and its request/response interfaces, reads the actor (`getAuthData()` or `requireRole()`), calls one service method | query the database, hold business rules |
| Service | Business rules, permission rules that depend on data, orchestration, calls to other services, mapping rows to API items, throwing `APIError` | read headers, call `getAuthData()` (the actor arrives as arguments) |
| Repository | Drizzle queries and transactions, always scoped by `companyId` | business rules |

The actor is read in the controller and passed down explicitly: `companyId`, `role` and `userId`,
or the `Actor` from `lib/rbac`. Services and repositories do not call `getAuthData()`. Two service
files still do (`invoicing/services/invoiceDocument.service.ts`, `warehouseConcept/services/offline.ts`).

Queries live in repositories. A few services (some of the warehouseConcept gate services and
trucking) still use `db` directly, and so do some subscriptions. Do not add more.

---

## Controllers

### Kinds of endpoint

| Kind | Options | File / name | Path |
|---|---|---|---|
| App endpoint | `expose: true, auth: true` | `customerCreate.controller.ts` / `customerCreate` | `/customers`, `/shipments/:id`, … |
| Internal (service to service) | `expose: false, auth: true` (usually) | `_internalCustomerRefs.controller.ts` / `_internalCustomerRefs` | `/internal/<service>/…` |
| Cron target | `expose: false, auth: false`, `POST` | `_cronQuoteEventOutbox.controller.ts` / `_cronQuoteEventOutbox` | `/internal/<service>/…` |
| Public link (token in the URL) | `expose: true, auth: false, sensitive: true` | e.g. `customerLink.controller.ts` | `/public/<what>/:token` |
| File bytes a browser opens | `api.raw`, `expose: true, auth: false` | e.g. `attachmentContent.controller.ts` | `…/:id/content?t=<token>` |

- An internal endpoint keeps `auth: true`. Encore passes the caller's auth data along on a call
  made inside a request. When no user is behind the call (a subscription or a cron), pass
  `asCompany(companyId)` from `lib/internalCall.ts`. A few internal endpoints are `auth: false`
  and take the company from the request; they are reachable only from other services.
- A raw file endpoint has no auth header to read, because the browser opens it as a plain link.
  It accepts only a short-lived signed token (`lib/signedUrl.ts`) that names the file and the
  company. The API returns the link as `contentUrl`.
- `sensitive: true` keeps the request and response out of traces. Use it on public token
  endpoints and on login.

### Request and response interfaces

- Declare them in the controller file, above the endpoint, as plain non-exported `interface`s.
  The web client gets them from Encore under the `controllers` namespace.
- **Never import Drizzle types (`$inferSelect`, `$inferInsert`, `...Record` row types, tables)
  into a controller.** Encore's parser cannot resolve Drizzle's generic chain. Shared item types
  go in `interfaces/interfaces.ts` as plain interfaces.
- Validate input with Encore's type validators: `MaxLen`, `MinLen`, `Min`, `Max` and
  `MatchesRegexp` from `encore.dev/validate`. Query parameters use `Query<…>` from
  `encore.dev/api`, headers use `Header<…>`. Free text and id lists that can grow carry a
  `MaxLen` (`customerIds: string[] & MaxLen<2000>`). Write a closed set as a literal union, so
  Encore refuses other values.
- Comment fields that are not obvious with `/** … */`; the comment shows up in the client.

```typescript
// services/customers/controllers/customerDelete.controller.ts
import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { customerService } from "../services/customer.service";

interface CustomerDeleteRequest {
  id: string;
}

interface CustomerDeleteResponse {
  ok: boolean;
}

// Hides the customer with its contacts, addresses, notes, documents and invoices (soft delete:
// the rows stay in the database and can be restored). Superadmins only.
export const customerDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/customers/:id" },
  async (req: CustomerDeleteRequest): Promise<CustomerDeleteResponse> => {
    const actor = requireRole("superadmin");
    await customerService.softDelete(req.id, actor.companyID);
    return { ok: true };
  },
);
```

```typescript
// services/customers/controllers/customerCreate.controller.ts (shortened)
interface CustomerCreateRequest {
  /** IČO: exactly 8 digits */
  ico: string & MatchesRegexp<"^\\d{8}$">;
  roles?: CustomerRole[];
  fromQuote?: string & MaxLen<40>;
  contact: CustomerContactRequest;
}

export const customerCreate = api(
  { expose: true, auth: true, method: "POST", path: "/customers" },
  async (req: CustomerCreateRequest): Promise<CustomerCreateResponse> => {
    const { companyID, role, userID } = getAuthData()!;
    return { customer: await customerService.createFromAres(companyID, role, req.ico, req.contact, req.roles, supplierRequestOf(userID, req.fromQuote)) };
  },
);
```

A controller file usually holds one endpoint. Some files hold a group of related ones (for
example `auth/controllers/orgUnit.controller.ts` or `customers/controllers/companyRegistration.controller.ts`).

---

## API types (`interfaces/`)

- Plain interfaces only. The file says so at the top: *"Never import Drizzle table types here —
  Encore's parser cannot resolve the $inferSelect generic chain."*
- Dates go out as ISO strings, so API types declare them as `string`. Services map rows to items
  explicitly with `iso()` / `isoOrNull()` from `lib/db/serialize.ts`, and send only the declared
  fields: no `companyId` and no `deletedAt`, unless the item needs them.
- Closed sets that the database enforces with a `CHECK` constraint are spelled out as literal
  unions here (`CustomerStatus`, `NoteType`, …), so requests are validated against them too.

```typescript
// services/customers/lib/mappers.ts
export const toNoteItem = (r: CustomerNoteRecord): NoteItem => ({
  id: r.id,
  customerId: r.customerId,
  type: r.type,
  content: r.content,
  author: r.author,
  colleagues: r.colleagues,
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt),
});
```

Another service may import types from a service's `interfaces/`. For example, quotes uses
trucking's road-pricing types and trucking uses quotes' types.

---

## Services

- A class with an exported singleton (`class NoteService { … }` and
  `export const noteService = new NoteService()`), or plain exported functions. Both are used.
- Take the tenant and the actor as arguments (`companyId`, `role`, `userId`, or an `Actor`). Never
  take them from the request body.
- Enforce business and permission rules here, and throw `APIError` with a message the user can
  read. Role rules that are used in several places live in one pure module, for example
  `lib/salesPolicy.ts` (*"THE ONE PLACE with role logic for it"*), so a unit test covers them.
- Call other services only through `~encore/clients`.

```typescript
// services/customers/services/note.service.ts (shortened)
class NoteService {
  async create(companyId: string, customerId: string, userId: string, input: NoteInput): Promise<NoteItem> {
    await customerService.requireLive(customerId, companyId);
    const type = input.type ?? "Note";
    if (type !== "Visit" && (input.colleagues ?? []).some((value) => value.trim())) {
      throw APIError.invalidArgument("Colleagues: only a visit names colleagues");
    }
    const author = await userEmailOf(userId);
    const row = await customerNoteRepository.createForCompany(companyId, { customerId, type, content: input.content, author, colleagues: await colleaguesOf(input.colleagues ?? [], author) });
    return toNoteItem(row);
  }

  async softDelete(id: string, companyId: string): Promise<void> {
    if (!(await customerNoteRepository.softDeleteForCompany(id, companyId))) throw APIError.notFound("Note not found");
  }
}

export const noteService = new NoteService();
```

---

## Multi-tenancy (`company_id`)

- Every tenant table spreads `tenantColumns`, which gives `company_id uuid NOT NULL`. There is no
  cross-database foreign key; the application enforces it. The table gets a `tenantIndex`, an
  index on `(company_id, created_at)`.
- **Every query on a tenant table filters by `companyId`**, including custom repository methods,
  counts, updates and deletes.
- `companyId` always comes from `getAuthData().companyID`, never from the client. For a
  superadmin it is the company picked in the switcher. The web sends it in `X-Acting-Company`, and
  the auth handler ignores that header for everybody else.
- Tables without `company_id` hold data shared by all companies (for example fx `cnb_rate`, the
  ČNB fixing) or are the tenant registry itself (`auth` `company`). Jobs that walk every company on
  purpose (reconcile crons, outbox delivery) go company by company.
- `BaseRepository.update` / `TenantRepository.updateForCompany` never write `id`, `companyId`,
  `createdAt` or `deletedAt`, so a request object passed straight through cannot move a row to
  another company.

---

## Authentication and roles

- `lib/auth.handler.ts` reads `Authorization: Bearer <token>` and the optional `X-Acting-Company`,
  checks the user (still live, same token version), and returns `AuthData`:
  `{ userID, companyID, role, homeCompanyID?, appWrite? }`.
  - `companyID` is the company the request works on. `homeCompanyID` is the user's own company.
  - `appWrite` is set only by the app's own service-to-service calls (an outbox sending an update
    on behalf of the user who caused it). No browser request can set it.
- Roles (`lib/rbac.ts`): `superadmin` (platform operator, works across companies), `admin`,
  `manager`, `user`. `COMPANY_ROLES` are the ones a company admin can assign. `isAdminLevel(role)`
  is true for admin and superadmin.
- `requireRole(...roles)` returns the actor or throws `unauthenticated` / `permissionDenied`.
  Use it in the controller when the whole endpoint is limited to some roles. Pass the role on
  when the rule depends on the data.
- The web hides what a user may not do, but the API decides. Every write checks permissions on the
  server.

---

## Repositories

- One file per table or aggregate: `repositories/<name>.repository.ts`, a class with an exported
  singleton.
- Repositories of tenant tables usually extend `TenantRepository` from `lib/db/repository.ts`,
  and outbox tables extend `OutboxRepository` from `lib/outbox`. These give `listForCompany`,
  `getByIdForCompany`, `getByColumnForCompany`, `createForCompany` (injects `companyId`),
  `updateForCompany` and `softDeleteForCompany`. Every method ignores soft-deleted rows. Use them,
  not the unscoped `BaseRepository` methods, on tenant tables.
- Some repositories are plain classes with their own queries. The same rule applies: filter by
  `companyId` and `deletedAt IS NULL`.
- Transactions (`this.db.transaction(...)`) belong in the repository.
- Postgres errors: `isUniqueViolation`, `constraintOf`, `isExclusionViolation` and `isDeadlock`
  from `lib/db/errors.ts`. The service turns them into an `APIError` that names the problem.

```typescript
// services/customers/repositories/customerNote.repository.ts (shortened)
class CustomerNoteRepository extends TenantRepository<typeof customerNoteTable> {
  constructor() {
    super(db, customerNoteTable, "customer_note");
  }

  async findByCustomer(customerId: string, companyId: string) {
    return this.db
      .select()
      .from(customerNoteTable)
      .where(and(
        eq(customerNoteTable.companyId, companyId),
        eq(customerNoteTable.customerId, customerId),
        isNull(customerNoteTable.deletedAt),
      ))
      .orderBy(desc(customerNoteTable.createdAt));
  }
}

export const customerNoteRepository = new CustomerNoteRepository();
```

---

## Database

### Schema

- `schemas/<name>.schema.ts`, one table per file. The table constant is `<name>Table`, and the row
  types next to it are `<Name>Record` (`$inferSelect`) and `New<Name>Record` (`$inferInsert`).
  These row types are for repositories and services only.
- Table and column names are snake_case. Table names are singular (`customer`, `customer_note`).
- Spread `defaultTableColumns` (`id` uuid, `created_at`, `updated_at`, `deleted_at`, all
  timestamptz) and, for tenant tables, `tenantColumns`. Rows are soft-deleted (`deleted_at`).
- Indexes and constraints go in the array form `(table) => [...]`: `defaultTableIndexes(...)`,
  which adds nothing on tenant tables, `tenantIndex(...)`, and named `index`, `uniqueIndex` and
  `check`. A closed set of values is a `CHECK` constraint plus `$type<Union>()` on the column.

```typescript
// services/customers/schemas/customerNote.schema.ts (shortened)
export const customerNoteTable = pgTable(
  "customer_note",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    customerId: uuid("customer_id").notNull().references(() => customerTable.id, { onDelete: "cascade" }),
    type: text("type").$type<NoteType>().notNull().default("Note"),
    content: text("content").notNull(),
  },
  (table) => [
    ...defaultTableIndexes("customer_note", table),
    tenantIndex("customer_note", table),
    index("customer_note_customer_id_idx").on(table.customerId),
    check("customer_note_type_check", sql`${table.type} IN ('Note', 'Email', 'Call', 'Follow-up', 'Visit')`),
  ],
);

export type CustomerNoteRecord = typeof customerNoteTable.$inferSelect;
export type NewCustomerNoteRecord = typeof customerNoteTable.$inferInsert;
```

### Connection (`db/db.ts`)

```typescript
export const DB = new SQLDatabase("customers", {
  migrations: { path: "migrations", source: "drizzle" },
});

const pool = servicePool(DB.connectionString);   // lib/db/pool.ts: limits + idle-error handling

export const db = drizzle(pool, { schema: { ...customerSchema, ...contactSchema /* … */ } });
```

Always create the pool with `servicePool` (10 connections, 10 s connect timeout, 60 s statement
timeout). It also logs a dropped idle connection instead of letting it end the process.

### Migrations

- Generate them, from `apps/api`:
  `drizzle-kit generate --config=services/<service>/db/drizzle.config.ts`. There is a script per
  service: `pnpm db:generate:<service>`. Do not hand-write a migration from scratch.
- A generated migration may be edited when drizzle-kit cannot infer a data change, for example
  converting text to `date`. Dev data is disposable, so a migration may clear values it cannot
  convert. The end state must still match the snapshot in `migrations/meta`.
- Encore applies migrations when the backend starts, so restart it after generating one. Encore
  records only the migration number, so editing a migration that has already run does not run it
  again. Make a new one.

---

## Calling other services

- Use only `~encore/clients`: `import { customers, invoicing } from "~encore/clients"`. Each
  service has its own database, so importing another service's `repositories/`, `services/` or
  `db` would run its queries on the wrong database.
- Another service's `topics.ts` (to subscribe) and its `interfaces/` (types) may be imported.
- A call made inside a request carries the user's auth data. A call from a subscription or a cron
  passes `asCompany(companyId)`:

```typescript
// services/shipments/services/partyLinks.service.ts
return customers._internalCustomerRefs({ customerIds: [customerId] }, asCompany(companyId));
```

- When a screen needs data of a related entity (a shipment's warehouse plates, a quote's sales
  person, a customer's name), **enrich the response on the backend**. Either the owning service is
  asked while the list or detail is built (for example `shipment.service.ts` calls
  `warehouse._internalPickupPlates` for a page of shipments), or a copy is stored next to the id
  and kept current by events. The web then makes no extra request.

---

## Pub/Sub

- Topics live in the publishing service's `topics.ts`. Each one has an exported event interface
  that always carries `companyId`, and `deliveryGuarantee: "at-least-once"`.
- Subscriptions live in the subscribing service's `subscriptions/<topic>.subscription.ts`. The
  subscription name is the subscriber plus the topic (`"customers-quote-renamed"`). Handlers must
  be **idempotent**, because a message can come twice.
- The topics in use: `customer-changed` and `contact-changed` (customers), `quote-renamed`
  (quotes), `shipment-deleted` and `shipment-parties-changed` (shipments), and
  `warehouse-gate-stamped` (warehouseConcept). Services that keep copies of names or references (a shipment's customer, a
  copy of a quote reference) rewrite those copies when the event comes.

```typescript
// services/quotes/topics.ts
export interface QuoteRenamedEvent {
  companyId: string;
  from: string;
  to: string;
}
export const quoteRenamed = new Topic<QuoteRenamedEvent>("quote-renamed", { deliveryGuarantee: "at-least-once" });

// services/customers/subscriptions/quoteRenamed.subscription.ts
export const customersQuoteRenamed = new Subscription(quoteRenamed, "customers-quote-renamed", {
  handler: async ({ companyId, from, to }) => { /* rewrite the copies that hold `from`, for this company */ },
});
```

### Transactional outbox (`lib/outbox`)

When an event or a call to another service must not be lost, the write and an outbox row are
committed in one transaction. The row is then delivered straight after the commit, and a cron
retries what failed.

- The service's own outbox table spreads `outboxColumns` (acting user and role, `status`,
  `attempts`, `next_attempt_at`, `locked_until`, `last_error`, `sent_at`) and `outboxStatusCheck`.
- Its repository extends `OutboxRepository`. `claimDueRows` uses `SKIP LOCKED`, keeps rows of one
  order key in order, and treats `attempts` as the claim token.
- Delivery uses `runOutboxDelivery` + `deliverOutboxRow` with handlers (`send`, `errorText`,
  `onSent`, `onRetry`, `onFailed`). Retries back off from 2 minutes up to 1 hour, and a row gives
  up after 15 attempts or on a permanent error (`not_found`, `invalid_argument`,
  `permission_denied`, …).
- An update to another service is sent as the user who caused it (`shipmentUpdateAs.ts`, with
  `appWrite: true`). Rows of a user who has left go out as the company's service identity
  (`serviceIdentity.ts`). "Send again" for failed rows is `sendFailedAgain`.
- Examples: `quotes/services/quoteEvents.service.ts` and the outboxes of shipments, trucking and
  warehouseConcept.

---

## Cron jobs

```typescript
// services/fx/crons/fxImport.cron.ts
export const fxCnbImport = new CronJob("fx-cnb-import", {
  title: "Import ČNB exchange rates",
  schedule: "0,30 13-15 * * 1-5",   // cron schedules are UTC
  endpoint: _cronFxImport,
});
```

- The cron's endpoint is a `_cron<Name>` controller: `expose: false`, `POST`, taking no input,
  calling one service function and returning what it did (counts), or nothing.
- The job ID is kebab-case and starts with the service's area (`quotes-event-outbox`,
  `fx-cnb-import`, `warehouse-customs-follow`). The definition
  lives in `crons/<name>.cron.ts`, or next to its endpoint in the controller file (quotes does
  this).
- **Cron jobs do not fire under `encore run`.** Jobs that must run locally also start a minute
  timer from the service, skipped under tests. Make the job idempotent, because both the cron and
  the timer can run it.

```typescript
export function startQuoteEventTimer(): void {
  if (started || process.env.VITEST) return;
  started = true;
  setInterval(() => void deliverQuoteEvents(), TICK_MS).unref();
}
```

---

## Object storage

- A bucket is declared in `storage/<name>Bucket.ts`, for example
  `new Bucket("shipment-attachments")`. The bucket holds the bytes under a `storageKey`, and a
  table holds the metadata.
- No bucket is public. Files reach the browser through an `api.raw` content endpoint with a
  signed token (see Controllers).

---

## Secrets and configuration

- Declare a secret in the module that uses it: `const jwtSecret = secret("JWT_SECRET")` from
  `encore.dev/config`. The secrets in use are `JWT_SECRET` and `ANTHROPIC_API_KEY`.
- Locally they come from `apps/api/.secrets.local.cue`, which is gitignored and never committed.
  `run-local.sh` creates a default one. In the cloud, use `encore secret set`.
- `APP_URL` (the base of the links the app sends out) is read by `lib/appUrl.ts`. When it is
  missing, local development and tests use `http://localhost:3001`, and every other environment
  falls back to the production web app, never localhost. Trucking logs a warning when the value
  is unusable.
- Never commit secrets, and never put real values in code.

---

## Errors

- Throw `APIError` from `encore.dev/api`. The codes in use are `invalidArgument` (bad input),
  `failedPrecondition` (not allowed in the record's current state), `notFound`,
  `permissionDenied`, `aborted` (a concurrent change won: "reload and save again"),
  `alreadyExists`, `unavailable` (another service or an outside source could not be reached),
  `unauthenticated`, `resourceExhausted` and, rarely, `internal`.
- **The message is shown to the user as written.** The web displays `apiErrorMessage(err)`. Write
  a full, specific sentence ("A customer with this IČO already exists"), not a code or a stack
  trace, and never pass on another system's raw error text.
- Do not swallow errors. Catch only to translate them (a unique violation becomes
  `alreadyExists`) or to degrade on purpose with a `log.warn`.

---

## Logging

```typescript
import log from "encore.dev/log";

log.info("customer seats normalized", { companyId, checked: plan.checked, changed });
log.warn(err, "Trucking's copy of a haulier's terms could not be read; the page shows the Customer Database's", { customerId });
log.error(err, "contact delete not published", { companyId, customerId, contactId });
```

- Use Encore's logger only. `console` fails lint, except in `scripts/`.
- Write a plain message plus structured fields (ids, counts). Never log passwords, tokens or file
  contents.

---

## Naming

| What | Pattern | Example |
|---|---|---|
| Endpoint file / export | `<model><Operation>.controller.ts` / `<model><Operation>` | `customerCreate` |
| Internal endpoint | `_internal<Name>` | `_internalCustomerRefs` |
| Cron endpoint | `_cron<Name>` | `_cronFxImport` |
| Service | `<name>.service.ts`, `<name>Service` | `noteService` |
| Repository | `<name>.repository.ts`, `<name>Repository` | `customerNoteRepository` |
| Schema | `<name>.schema.ts`, `<name>Table`, `<Name>Record` | `customerNoteTable` |
| Subscription | `subscriptions/<topic>.subscription.ts` | `quoteRenamed.subscription.ts` |
| Cron | `crons/<name>.cron.ts` | `fxImport.cron.ts` |
| Bucket | `storage/<name>Bucket.ts` | `attachmentBucket.ts` |
| Tests | `<name>.test.ts`, `<name>.service.test.ts`, `<name>.repository.test.ts`, `<name>.db.test.ts` | |
| Paths | kebab-case, prefixed with the area | `/customers/:id`, `/sales-quotes`, `/internal/customers/refs` |

---

## Testing

- Tests live in `services/<service>/tests/` (with `repositories/`, `services/` and `db/` subfolders
  where useful) and in `lib/tests/`.
- **Unit tests** (`pnpm --filter api test`, or `npx vitest run` in `apps/api`) run without the
  Encore runtime. Mock what loads it:

```typescript
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/config", () => ({ secret: () => () => "test-secret" }));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
vi.mock("~encore/clients", () => ({ auth: { userLookup, usersList } }));
vi.mock("../repositories/customerNote.repository", () => ({ customerNoteRepository: notes }));
```

  Pure helpers (`lib/*.ts`, `services/<service>/lib/*.ts`) are tested directly. Repository tests
  without a database mock `../../db/db` and check the query that is built.
- **Database tests** (`tests/db/*.db.test.ts` in shipments and trucking, and the
  `warehouseConcept/tests`) run only under `encore test` with their flag. A plain `vitest run`
  skips them:

```bash
cd apps/api
SHIPMENTS_DB_TESTS=1 WAREHOUSE_DB_TESTS=1 TRUCKING_DB_TESTS=1 \
  encore test services/shipments/tests/db services/warehouseConcept/tests services/trucking/tests/db
```

- Name a test by the behaviour ("is refused, not saved without an author, when the user can't be
  looked up"). Test the rule, the tenant scoping and the error code.
- Typecheck: run `encore gen wrappers` in `apps/api` first (`encore.gen` is gitignored and goes
  stale), then `pnpm --filter api typecheck`.

---

## Checklist

- [ ] The controller only declares, reads the actor and calls a service. It has plain interfaces,
      no Drizzle types and validators on the input.
- [ ] Every query on a tenant table filters by `companyId`, taken from the auth data.
- [ ] Role rules are checked on the server (`requireRole` or a policy function).
- [ ] Other services are reached only through `~encore/clients`, and related data is enriched on
      the backend.
- [ ] Errors are `APIError`s with a sentence the user can act on.
- [ ] A schema change comes with a generated migration (`drizzle-kit generate --config=…`).
- [ ] Events and outbox handlers are idempotent, and crons also run locally (timer).
- [ ] Unit tests pass, and the database tests too when repositories of shipments, trucking or
      warehouseConcept changed. The web client (`apps/web/src/lib/api/client.ts`) is updated by
      hand when an endpoint changed (see `rules/frontend-web.md`).

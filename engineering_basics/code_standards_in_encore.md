# Code Standards in Encore

These are the rules the backend in `apps/api` follows. Each one describes how the code is written today. Where the code has known exceptions, they are named, so a reviewer can tell an exception that already exists from a new deviation.

Related: [Service Architecture](service_architecture_patterns.md), [Controllers](controllers_api_endpoints.md), [Errors](errors.md), [Naming](naming_convention.md), [Folder Structure](folder_structure_and_naming.md).

---

## 1. Three layers: controller, service, repository

Every service under `apps/api/services/<service>/` splits a request into three layers.

| Layer | Folder | Does | Does not |
|---|---|---|---|
| Controller | `controllers/` | Declares the endpoint with `api()`, its request and response interfaces, reads the actor (`requireRole(...)` or `getAuthData()!`), passes the actor's `companyID` (and `userID`/`role` when needed) to a service, returns the result | Run queries, hold business rules |
| Service | `services/` | Business rules, checks that need data, throws `APIError`, calls other services through `~encore/clients`, publishes topics or writes outbox rows, opens transactions, maps rows to API items | Read HTTP headers or the token (it gets the company, user and role as arguments) |
| Repository | `repositories/` | Drizzle queries, each tenant query filtered by `company_id` | Business rules, calls to other services |

Pure helpers with no database access live in `lib/` (in invoicing, quotes and sales also `utils/`, files named `*.utils.ts`). They are what the unit tests cover most.

A real request, end to end (holidays service):

```typescript
// services/holidays/controllers/holidayDelete.controller.ts
export const holidayDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/holidays/:id" },
  async (req: HolidayDeleteRequest): Promise<HolidayDeleteResponse> => {
    // Managers only: the company's holidays move every lead time in Trucking.
    await holidaysService.remove(req.id, requireRole("superadmin", "admin", "manager").companyID);
    return { ok: true };
  },
);

// services/holidays/services/holidays.service.ts
async remove(id: string, companyId: string): Promise<void> {
  const row = await publicHolidayRepository.softDeleteForCompany(id, companyId);
  if (!row) throw APIError.notFound("Holiday not found");
}
```

`softDeleteForCompany` comes from `TenantRepository` (`apps/api/lib/db/repository.ts`).

Known exceptions:
- A few small internal reads call a repository straight from the controller, with no service in between: `quotes/_internalQuoteReferenceNow`, `quotes/salesGuardrails`, `tariffs/_quoteTariffs`, `trucking/_internalTruckingVersionsValid`.
- Many services in trucking and warehouseConcept (and two in shipments) import their own `db` to open a transaction (`db.transaction`, or trucking's `inTx`), and pass `tx` to repository methods. A few warehouseConcept services also run a statement on `tx` themselves, mostly to take an advisory lock (`pg_advisory_xact_lock`).
- Some subscription handlers update their own tables directly (for example `customers/subscriptions/quoteRenamed.subscription.ts`).
- Two service files read `getAuthData()` themselves: `invoicing/services/invoiceDocument.service.ts` and `warehouseConcept/services/offline.ts`.

---

## 2. Every query is scoped by company

The app is multi-tenant: one backend serves several forwarding companies.

- A tenant table spreads `tenantColumns` (`company_id uuid not null`) from `apps/api/lib/db/defaults.ts`, and indexes it with `tenantIndex(...)`.
- A repository on a tenant table extends `TenantRepository` and uses its `*ForCompany` methods: `listForCompany`, `getByIdForCompany`, `getByColumnForCompany`, `createForCompany`, `updateForCompany`, `softDeleteForCompany`. Its own queries filter on `eq(table.companyId, companyId)` too.
- The company comes from the signed token: `requireRole(...).companyID` or `getAuthData()!.companyID` in the controller. A request body does not name the company it writes to. The exceptions are superadmin-only endpoints, gated by `requireRole("superadmin")`, that manage a company by its id: the Platform pages (`/companies`, `/companies/:companyId/users`) and `POST /customers/supplier-terms/copy-from-trucking`.
- `updateForCompany` and `update` never write `id`, `companyId`, `createdAt` or `deletedAt`, whatever the data they are given holds. A request object passed straight through cannot move a row to another company or bring it back from deletion.
- A superadmin works as another company by sending the `X-Acting-Company` header (the web's company switcher). The auth handler (`apps/api/lib/auth.handler.ts`) makes that company the request's `companyID`, and keeps the superadmin's own company as `homeCompanyID`. Tenant data is never read across companies: superadmin tools act on the company chosen in the switcher.

Not every repository extends `TenantRepository`. Many are plain classes with their own queries (for example `trucking/repositories/trip.repository.ts`). They take `companyId` as an argument and filter on it all the same.

---

## 3. Authentication and roles

- Endpoints use `auth: true`, which runs the auth handler on every request. `AuthData` holds `userID`, `companyID`, `role`, `homeCompanyID`, and `appWrite`, which is set only on the app's own service-to-service writes.
- `requireRole(...allowed)` from `apps/api/lib/rbac.ts` returns the actor, or throws `permissionDenied`. Called with no roles (`requireRole()`), it only requires a signed-in user.
- Roles: `superadmin` (platform operators, cross-company), `admin`, `manager`, `user`. `isAdminLevel(role)` is true for admin and superadmin.
- When a rule depends on the role, the controller passes the role to the service, as in `customerService.detail(req.id, actor.companyID, actor.role)`.
- Endpoints with `auth: false` are the few a browser opens without the app's session. Each one checks something else:
  - login (`/auth/login`), and `/auth/me`, which verifies the token itself;
  - file endpoints (`.../content`, a customer's logo image) that a link or an `<img>` opens without the auth header, checked by the short-lived signed token in the URL (`apps/api/lib/signedUrl.ts`);
  - the `/public/...` pages a customer or haulier opens from a link (company registration, shipment status, import instructions, transport orders), checked by the token in the link;
  - the haulier portal (`/portal/...`), which has its own login and checks its own session header (`X-Portal-Session`).
- Cron endpoints are `expose: false` and take no login.

---

## 4. Plain interfaces at the API boundary

- Every request and response is a named interface. A controller declares its own `{Name}Request`/`{Name}Response` in the controller file, and imports the shared item types from `interfaces/interfaces.ts`.
- **Controllers and `interfaces/` never import Drizzle types** (`$inferSelect`, `$inferInsert`, table types or schema files). Encore's parser reads every type reachable from an API definition, and it cannot resolve Drizzle's generic chain. The `customers` and `trucking` interface files say so at the top. Drizzle types stay in schemas, repositories, services and `lib/`.
- Services map rows to these interfaces explicitly. Dates go out as ISO strings, through `iso()`/`isoOrNull()` from `apps/api/lib/db/serialize.ts`, so only the declared fields leave the service.

See [DTO](dto.md).

---

## 5. Validation

- The request's shape is checked by Encore. Use the validators from `encore.dev/validate` on request fields (`MinLen`, `MaxLen`, `Min`, `Max`, `MatchesRegexp`), and literal unions for closed sets (for example `ContactRole` in `customers/interfaces/interfaces.ts`, which matches the table's CHECK constraint).
- Rules that need data, or that span several fields, are checked in the service, which throws `APIError.invalidArgument` with a sentence the user can act on. Example: `holidaysService.czNationalDates` refuses dates that are not real days.
- zod is used only to check what the AI proposes for a tariff layout: `tariffs/lib/layoutSchema.ts` and the `*Layout.ts` files next to it.

---

## 6. Errors

Throw `APIError` from `encore.dev/api`, mostly in services. The message is shown to the user as is: the web's `apiErrorMessage` (`apps/web/src/lib/api/index.ts`) displays `err.message`. So write a sentence the user understands, not a stack-level description. Details are in [Errors](errors.md).

---

## 7. Services talk through Encore clients, never another service's database

- Each service owns its own Postgres database (`db/db.ts`). Another service's data is reached only through its endpoints, via `import { customers, shipments } from "~encore/clients"`.
- Cross-service imports are limited to types and topics: `../../customers/topics` to subscribe, and `../../quotes/interfaces/interfaces` or `../../trucking/interfaces/interfaces` for shared types. No service imports another service's repository, schema or `db`.
- There are no foreign keys across databases. When a shipment is deleted, the `shipment-deleted` topic lets fx, invoicing, trucking, warehouse and warehouseConcept retire their rows. Copied names (a customer's name on a shipment, a quote's reference) are kept current by the `customer-changed`, `contact-changed` and `quote-renamed` topics.

See [Service Architecture](service_architecture_patterns.md).

---

## 8. Logging

```typescript
import log from "encore.dev/log";

log.warn("trucking: APP_URL unusable, links use the fallback", { problem, fallback });
log.error(err, "shipments: shipment-deleted not published for good", { outboxId: row.id, shipmentId: row.shipmentId });
```

- Pass structured fields, not concatenated strings. `log.error` takes the error first.
- Many messages start with the service name (`"shipments: …"`, `"trucking: …"`).
- Never log tokens, passwords, the JWT secret or API keys.

---

## 9. Tests

Vitest. Tests live in `services/<service>/tests/`, never next to the source. Database tests are skipped by a plain `vitest run`. The shipments, trucking and warehouseConcept ones run under `encore test` with `SHIPMENTS_DB_TESTS=1`, `TRUCKING_DB_TESTS=1` or `WAREHOUSE_DB_TESTS=1` (see `apps/api/vitest.config.ts`). The quotes and sales ones run when `QUOTES_DB_URL` or `SALES_DB_URL` names a database. See [Testing Standards](testing_standards.md).

---

## Review checklist

- [ ] The controller reads the actor and delegates; queries are in a repository.
- [ ] Every tenant query filters on the company from the token; nothing takes a company id from the request.
- [ ] The endpoint has `auth: true`, or a stated reason and its own check (signed token, link token).
- [ ] The role check is `requireRole(...)` with the roles the feature needs.
- [ ] Request and response are named plain interfaces; nothing in `controllers/` or `interfaces/` imports a schema or Drizzle type.
- [ ] Shape limits are Encore validators; rule checks throw `APIError.invalidArgument` with a user-readable sentence.
- [ ] Another service's data comes through `~encore/clients`, not its database.
- [ ] A cross-service copy of data has an event or outbox that keeps it current.
- [ ] Tests are in `tests/`; a change to queries is covered by the service's database tests where it has them.

# Controllers & API Endpoints

A controller declares an Encore endpoint and hands the work to a service. Controllers live in `apps/api/services/<service>/controllers/`. There are about 320 controller files across 14 services.

Related: [Code Standards](code_standards_in_encore.md), [DTO](dto.md), [Errors](errors.md), [API Pagination](api_pagination_standards.md), [Naming](naming_convention.md).

---

## What a controller does

1. Declares the request and response interfaces, as plain types.
2. Reads the actor: `requireRole(...)` from `apps/api/lib/rbac.ts` when only some roles may call it, otherwise `getAuthData()!` from `~encore/auth`.
3. Calls one service method, passing the actor's `companyID` (and `userID`/`role` when the service needs them).
4. Returns the result.

It does not run queries, hold business rules, or import schemas or Drizzle types. See [Code Standards](code_standards_in_encore.md) for the few controllers that read a repository directly.

---

## Kinds of endpoints

| Kind | Config | Name and file | Path | Called by |
|---|---|---|---|---|
| App endpoint | `expose: true, auth: true` | `customerGet` in `customerGet.controller.ts` | `/customers/:id` | The web app |
| Internal | `expose: false, auth: true` | `_internalCustomerRefs` in `_internalCustomerRefs.controller.ts` | `/internal/customers/refs` | Other services, through `~encore/clients` |
| Cron | `expose: false` (no login) | `_cronFxImport` in `_cronFxImport.controller.ts` | `/fx/cron/import` | A `CronJob` |
| Public link page | `expose: true, auth: false` | `publicTransportOrderGet`, `portalSetPassword` | `/public/...`, `/portal/...` | A customer or haulier from a link |

Notes:
- `auth: true` on an internal endpoint means it runs as a user. A call made inside a request carries that request's user automatically. A Pub/Sub handler or a cron, which has no user, passes the company explicitly: `asCompany(companyId)` from `apps/api/lib/internalCall.ts`, or `{ authData }`.
- Internal endpoints are named `_internal…`. The exceptions are tariffs' `_quoteTariffOffers` and `_quoteTariffRefs`, and a few with no prefix: `customerActivate`, `customerRollupsUpdate`, `invoiceMarkCredited` (customers), `openInvoiceCount` (invoicing), `adminContacts`, `placeLookup`, `userLookup` (auth).
- Internal paths mostly start with `/internal/<area>/` (the auth service uses `/auth/internal/...`). Cron paths are `/<service>/cron/...` or `/internal/<service>/.../deliver`.
- `auth: false` endpoints must check something else (signed file token, link token, portal session). See [Code Standards §3](code_standards_in_encore.md#3-authentication-and-roles).

---

## Endpoint options in use

```typescript
api(
  {
    expose: true,            // reachable from outside Encore
    auth: true,              // runs the auth handler (lib/auth.handler.ts)
    method: "POST",
    path: "/holidays/read",
    sensitive: true,         // optional: payload left out of Encore's traces (login, user passwords, link tokens)
    bodyLimit: 50 * 1024 * 1024, // optional: raised for base64 file uploads (extraction, attachments)
  },
  handler,
);
```

`api.raw(...)` is used for endpoints that stream file bytes (for example `shipments/controllers/attachmentContent.controller.ts`, which uses `writeFileResponse` from `apps/api/lib/fileContent.ts`).

---

## Paths and methods

- Paths use kebab-case resource nouns, mostly plural, with the id as a path parameter: `/shipments/:shipmentId`, `/customers/:id`, `/customer-contacts/:id`, `/master-jobs/:masterJobId`, `/sales-quotes/:quoteNumber`, `/trucking/trips`, `/warehouse-concept/gate/...`.
- Actions that are not plain create/update use POST to a verb path: `POST /holidays/import`, `POST /holidays/read`.
- Methods, roughly by use: POST (create and actions, about 325), GET (reads, 221), DELETE (soft deletes, 52), PATCH (partial updates, 45), PUT (set or replace a whole value, 28).

---

## Parameters

- **Path parameters** are fields of the request interface with the same name (`id` for `:id`).
- **Query string** on GET endpoints: `Query<...>` from `encore.dev/api`.
- **Headers**: `Header<"...">`. Used by the auth handler (`Authorization`, `X-Acting-Company`), `/auth/me`, and the haulier portal (`X-Portal-Session`).
- Validators go on the field type, including query fields:

```typescript
// services/fx/controllers/fxRead.controller.ts
currencies?: Query<string & MatchesRegexp<"^([A-Za-z]{3}(,[A-Za-z]{3}){0,49})?$">>;
base?: Query<string & MatchesRegexp<"^[A-Za-z]{3}$">>;
```

---

## Templates from the code

### List for the company

```typescript
// services/holidays/controllers/holidayList.controller.ts
interface HolidayListResponse {
  holidays: HolidayItem[];
}

export const holidayList = api(
  { expose: true, auth: true, method: "GET", path: "/holidays" },
  async (): Promise<HolidayListResponse> => {
    return { holidays: await holidaysService.list(getAuthData()!.companyID) };
  },
);
```

### Partial update with validators

```typescript
// services/customers/controllers/contactUpdate.controller.ts
interface ContactUpdateRequest {
  id: string;
  firstName?: string & MinLen<1> & MaxLen<100>;
  lastName?: string & MinLen<1> & MaxLen<100>;
  email?: string & MaxLen<320>;
  phone?: string & MaxLen<50>;
  role?: ContactRole;
  isMain?: boolean;
}

export const contactUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/customer-contacts/:id" },
  async ({ id, customerId: _ignored, ...input }: ContactUpdateRequest): Promise<ContactUpdateResponse> => {
    return { contact: await contactService.update(id, getAuthData()!.companyID, input) };
  },
);
```

### Role-gated action

```typescript
// services/shipments/controllers/shipmentDelete.controller.ts
export const shipmentDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/shipments/:shipmentId" },
  async (req: ShipmentDeleteRequest): Promise<ShipmentDeleteResponse> => {
    const auth = requireRole("superadmin", "admin", "manager");
    await shipmentService.softDelete(req.shipmentId, auth.companyID, auth.userID, auth.role);
    return { ok: true };
  },
);
```

### Internal endpoint for other services

```typescript
// services/holidays/controllers/_internalHolidaysCzNational.controller.ts
export const _internalHolidaysCzNational = api(
  { expose: false, auth: true, method: "GET", path: "/internal/holidays/cz-national" },
  async (req: HolidaysCzNationalRequest): Promise<HolidaysCzNationalResponse> => {
    return { dates: await holidaysService.czNationalDates(getAuthData()!.companyID, req.from, req.to) };
  },
);

// called from services/trucking/lib/czHolidays.ts
const { dates } = await holidays._internalHolidaysCzNational({ from, to }, { authData });
```

### Cron endpoint

```typescript
// services/fx/controllers/_cronFxImport.controller.ts
export const _cronFxImport = api(
  { expose: false, method: "POST", path: "/fx/cron/import" },
  async (): Promise<void> => {
    await pullTick();
  },
);

// services/fx/crons/fxImport.cron.ts
export const fxCnbImport = new CronJob("fx-cnb-import", {
  title: "Import ČNB exchange rates",
  schedule: "0,30 13-15 * * 1-5",
  endpoint: _cronFxImport,
});
```

Cron jobs do not fire under `encore run`. Locally, a minute timer in the service does the same job (for example `fxScheduler`, `startShipmentEventTimer`).

---

## Responses

- Most endpoints return an object: `{ ok: true }`, `{ holidays: [...] }`, `{ contact }`. Some actions return nothing (`Promise<void>`).
- The web app imports response types by name from `apps/web/src/lib/api/client.ts`. So a response interface keeps its name even when it only wraps a shared type: `interface CustomerGetResponse extends CustomerDetail {}`.
- Some long lists are capped and say so (the trucking lists return the newest 1000 with a `truncated` flag). See [API Pagination](api_pagination_standards.md).

---

## Changing an endpoint

`apps/web/src/lib/api/client.ts` was generated by Encore once (`pnpm gen`, which runs `encore gen client`) and has since been edited by hand. When you add or change an endpoint, update the matching method and types in that file too.

---

## Checklist

- [ ] The request and response are named plain interfaces; there are no schema imports.
- [ ] The actor comes from `requireRole(...)` or `getAuthData()!`, and its `companyID` is passed to the service.
- [ ] The name and file follow the kind: `entityAction`, `_internal…`, `_cron…`.
- [ ] Field limits are Encore validators.
- [ ] `sensitive: true` is set when the payload holds a password or a link token.
- [ ] `bodyLimit` is set only when the request carries files.
- [ ] The web client in `apps/web/src/lib/api/client.ts` is updated.

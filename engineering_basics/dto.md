# DTO: Request and Response Types

The types an endpoint takes and returns are its contract with the web app (`apps/web/src/lib/api/client.ts`) and with other services (`~encore/clients`). This page covers where they live, how they are validated, and how rows become responses.

Related: [Controllers](controllers_api_endpoints.md), [Code Standards](code_standards_in_encore.md), [Errors](errors.md).

---

## Where they live

- **In the controller file:** the endpoint's own `{Name}Request` and `{Name}Response`. They are not exported unless something else needs them.
- **In `interfaces/interfaces.ts`:** the items a service returns and several endpoints share (`HolidayItem`, `ContactItem`, `CustomerDetail`), and literal unions such as `ContactRole` or `CustomerStatus`.
- **Next to it, when a service has many:** `customers/interfaces/requests.ts` (request parts reused by several endpoints), `customers/interfaces/registration.ts`, `shipments/interfaces/importInstructions.ts`, and in trucking and warehouseConcept `{area}.interfaces.ts` (`portal.interfaces.ts`, `gate.interfaces.ts`, …).
- Another service may import these types (for example `quotes` imports from `../../trucking/interfaces/interfaces`). Types only, never code.

---

## Plain types only

Request and response types are plain TypeScript interfaces. **They never use Drizzle types** (`$inferSelect`, `$inferInsert`, table types). Encore's parser resolves every type reachable from an endpoint, and it cannot resolve Drizzle's generic chain, so the build fails. The rule is written at the top of `customers/interfaces/interfaces.ts`:

```typescript
// Plain interfaces for controllers. Never import Drizzle table types here —
// Encore's parser cannot resolve the $inferSelect generic chain.
```

Drizzle row types (`CustomerRecord`, `NewCustomerRecord`, …) are declared in `schemas/*.schema.ts`. They are used only in repositories, services and `lib/`.

---

## Validation on the type

Encore checks a request against its type before the handler runs. Put the limits on the fields with `encore.dev/validate`:

```typescript
// services/customers/interfaces/requests.ts
export interface CustomerContactRequest {
  firstName: string & MinLen<1> & MaxLen<100>;
  lastName: string & MinLen<1> & MaxLen<100>;
  email?: string & MaxLen<320>;
  phone?: string & MaxLen<50>;
  role?: ContactRole;
}
```

- Validators in use: `MaxLen`, `MinLen`, `Min`, `Max`, `MatchesRegexp`.
- Closed sets are literal unions that match the table's CHECK constraint. Encore then refuses any other value, and the web client gets the same union.
- What a type cannot express (a real calendar date, one field depending on another, a rule that needs the database) is checked in the service, which throws `APIError.invalidArgument` with a sentence for the user.
- zod is not used for requests. It checks only the tariff layouts the AI proposes (`tariffs/lib/layoutSchema.ts`).

---

## Rows to responses

Services map database rows to the interface explicitly, so only the declared fields go out. Encore sends JSON, so the types follow what JSON carries:

- **Timestamps** become ISO strings through `iso()` and `isoOrNull()` from `apps/api/lib/db/serialize.ts`. The interface types them as `string` or `string | null`.
- **`date` columns** use `mode: "string"` in the schema and travel as `YYYY-MM-DD`.
- **`numeric` columns** keep the type the schema reads them in: `mode: "number"` gives `number` (a customer's `creditLimit`), and Drizzle's default gives `string` (a shipment's `selling` and `buying`). The interface says which.
- A nullable column is `| null` in the response. An optional request field is `?`.

Larger services keep the mapping in one place, for example `customers/lib/mappers.ts`, which turns `CustomerRecord`, `ContactRecord` and the rest into `CustomerItem`, `ContactItem` and so on.

---

## Updates take only what is sent

PATCH requests list every field as optional, and the service passes on only what came. `updateForCompany` never writes `id`, `companyId`, `createdAt` or `deletedAt`, even if a request object reaches it whole (see `apps/api/lib/db/repository.ts`).

---

## Keep names stable

The web app imports response types by name from `apps/web/src/lib/api/client.ts`, which is now maintained by hand. Renaming a response interface or a field breaks the web app until the client is changed with it. When a response is only a shared item, wrap it rather than rename it:

```typescript
// The response keeps its name: the web app reads it as CustomerGetResponse.
interface CustomerGetResponse extends CustomerDetail {}
```

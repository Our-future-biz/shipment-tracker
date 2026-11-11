# Error Handling

How the API refuses a request, and how the web app shows it.

Related: [Code Standards](code_standards_in_encore.md), [Controllers](controllers_api_endpoints.md), [DTO](dto.md).

---

## The rule

Refuse a request by throwing `APIError` from `encore.dev/api`:

```typescript
import { APIError } from "encore.dev/api";

throw APIError.notFound("Holiday not found");
```

Encore turns it into the HTTP status of its code, with a JSON body of `code`, `message` and optional `details`. Anything else that escapes a handler (a plain `Error`, a driver error) reaches the client as `internal` (500).

The web app shows the message to the user as is. `apiErrorMessage(err)` in `apps/web/src/lib/api/index.ts` returns `err.message`, or "the server could not be reached" when no answer came from the API. So:

- **Write the message for the user.** Name the thing and, where possible, say what to do: "This supplier was changed while it was saved: reload it and save again".
- **Do not pass on internal or upstream text** (SQL, a provider's error body, a stack trace). The outbox handlers say this explicitly: what users see of a failed delivery is "own wording, never upstream text" (`apps/api/lib/outbox/outboxDelivery.ts`).

---

## Where errors are thrown

| Layer | What it does |
|---|---|
| Service | Throws nearly all of them (about 1,260 throw sites): not found, rule broken, wrong state, conflict |
| Controller | Rarely throws; `requireRole` throws `unauthenticated`/`permissionDenied` for it |
| Repository | Lets database errors through. A few throw `APIError` themselves: `resourceExhausted` when a yearly reference sequence is used up (trucking, warehouseConcept), `notFound` when a locked row is gone (tariffs) |
| `lib/` (pure helpers) | Throw `APIError.invalidArgument` for bad input (`tariffs/lib/layoutSchema.ts`). Plain `Error` only for a broken invariant ("cannot happen") |

---

## The codes we use

Counts are throw sites in `apps/api` (tests excluded) at the time of writing.

| Code | HTTP | Use it when | Example from the code |
|---|---|---|---|
| `invalidArgument` (512) | 400 | The input itself is wrong | `"From and to must be real dates (YYYY-MM-DD)"` (holidays) |
| `failedPrecondition` (369) | 400 | The input is fine, but the current state does not allow it | `"This link was used or cancelled already"` |
| `notFound` (224) | 404 | No such row for this company | `"Holiday not found"` |
| `permissionDenied` (86) | 403 | The user's role may not do this | `requireRole(...)`: `"You do not have permission to perform this action"` |
| `aborted` (82) | 409 | Someone else changed it at the same time; reload and try again | `"the template was changed by someone else - load the latest version"` |
| `alreadyExists` (38) | 409 | A unique rule would be broken | `"A customer with this registration number already exists"` |
| `unavailable` (24) | 503 | Another system or service is not answering just now | `"ARES registry is not answering, try again later"` |
| `unauthenticated` (10) | 401 | No valid session | auth handler: `"Missing authorization header"` |
| `resourceExhausted` (9) | 429 | Too many calls, or a number range is used up | `"Too many registry searches — wait a minute and try again"` |
| `internal` (8) | 500 | Misconfiguration or an answer we cannot read | `"JWT_SECRET is not configured"` |
| `deadlineExceeded` (1) | 504 | The outcome is unknown after a timeout | a supplier e-mail that may have gone out (warehouseConcept) |

A row of another company is not found: tenant queries filter by `company_id` (`getByIdForCompany` returns `null`), so the service answers `notFound`, as for an id that does not exist.

### Pick the code carefully: the outbox reads it

An outbox row whose delivery failed with `not_found`, `invalid_argument`, `permission_denied`, `unauthenticated` or `failed_precondition` is treated as permanent and is not retried (`apps/api/lib/outbox/outboxRetry.ts`). Anything else is retried, with a back-off up to an hour, for at most 15 attempts. So a temporary problem must be `unavailable` or `aborted`, not `failedPrecondition`.

---

## Details for the screen

Add `.withDetails({...})` when the web app needs data to react, not just a sentence:

```typescript
// services/shipments/services/shipment.service.ts
throw APIError.alreadyExists(`shipment ${jobNumber} was already created from quote ${reference}`)
  .withDetails({ shipmentId: id, jobNumber });

// services/trucking/services/haulierInvoice.service.ts
throw APIError.failedPrecondition(`Payment cannot be approved (Czech VAT joint liability): ${blockReasons.join("; ")}`)
  .withDetails({ blockReasons });
```

---

## Database errors

Repositories do not wrap queries in try/catch. The service that knows what a constraint means translates the error, using `apps/api/lib/db/errors.ts`:

- `isUniqueViolation(err)`: a unique constraint or unique index refused the write (SQLSTATE 23505).
- `constraintOf(err)`: which constraint, by its name in the schema.
- `isExclusionViolation(err)`: an EXCLUDE constraint refused it (23P01), for example two bookings of one dock at once.
- `isDeadlock(err)`: Postgres aborted this statement to break a deadlock (40P01).

```typescript
// services/customers/services/customer.service.ts
} catch (err) {
  if (isUniqueViolation(err) && constraintOf(err) === "customer_address_one_billing") {
    throw APIError.failedPrecondition(`${deleted.companyName} can't be restored: two of its addresses are its billing address`);
  }
  if (isUniqueViolation(err) && constraintOf(err) === CUSTOMER_ICO_UNIQUE) {
    throw APIError.alreadyExists("A customer with this registration number already exists");
  }
  throw err;
}
```

Rethrow what you do not recognise; do not swallow it.

---

## Errors from another service

A failed call through `~encore/clients` throws an `APIError` with the other service's code and message. Check the code, and reword the message when it would not make sense to the user here:

```typescript
// services/shipments/services/shipment.service.ts
if (err instanceof APIError && err.code === ErrCode.NotFound) throw APIError.invalidArgument(`quote ${quoteNumber} not found`);
```

When a lookup the request depends on fails (for example the users list from the auth service), throw `unavailable` with a sentence that tells the user to try again: `USER_LOOKUP_UNAVAILABLE` in `apps/api/lib/companyUsers.ts`.

---

## Logging

Refusals the user can fix are just thrown, not logged. Log what someone has to look at: an outbox row that gave up, an import that failed, a provider that keeps failing.

```typescript
log.error(err, "shipments: shipment-deleted not published for good", { outboxId: row.id, shipmentId: row.shipmentId });
```

---

## Testing errors

Assert on the code:

```typescript
await expect(service.createLink(actor, { roles: ["customer"] })).rejects.toMatchObject({ code: "failed_precondition" });
```

(`services/customers/tests/services/companyRegistration.service.test.ts`)

---

## Checklist

- [ ] An `APIError` with the code from the table above.
- [ ] A message the user understands, with no internal or upstream text.
- [ ] `.withDetails` only when the web app uses the data.
- [ ] A database error is translated by constraint name; anything else is rethrown.
- [ ] A temporary failure uses `unavailable` or `aborted`, so outbox retries still work.

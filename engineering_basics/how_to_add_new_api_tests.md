# How to Add Tests for an API Endpoint

A step-by-step guide to testing a new or changed endpoint in `apps/api`. There is no test suite that calls a running server over HTTP. Endpoints are tested with Vitest at the layer where the behaviour lives, and against the Encore test database when SQL, locks or races are the point.

The general rules (commands, mocks, DB test flags, the `encore.app` id) are in [Testing Standards](./testing_standards.md). This page is the recipe.

---

## Step 1: Decide what needs proving, and where

| What the change does | Test it in | Example |
|---|---|---|
| Who may call it (roles), and that the company comes from the token | a **controller** test | `services/customers/tests/deletePermissions.test.ts` |
| Business rules, refusals, what gets written, published or sent | a **service** test | `services/customers/tests/customer.service.test.ts` |
| The SQL a repository builds (filters, company scope, search) | a **repository** test with a stand-in db | `services/customers/tests/repositories/customerListFiltered.repository.test.ts` |
| Real rows: constraints, locks, two requests at once, outbox claims | a **DB test** under `tests/db/` | `services/shipments/tests/db/writeTurns.db.test.ts` |
| A calculation or parser | a **pure helper** test | `lib/tests/outbox.test.ts`, `services/shipments/tests/jobNumber.test.ts` |

Most changes need a service test. Add a controller test when the change touches roles or the endpoint's wiring, and a DB test when it touches concurrency or a constraint.

## Step 2: Create the file

- `apps/api/services/<service>/tests/<subject>.test.ts` (or under `tests/repositories/`, `tests/services/`, or `tests/db/<subject>.db.test.ts`).
- Shared code in `apps/api/lib` is tested in `apps/api/lib/tests/`.

## Step 3: Mock what the code touches, then import it

Vitest hoists `vi.mock` calls above the imports. Values a mock factory uses are created with `vi.hoisted`. Import the code under test **after** the mocks.

### Controller test template

Encore's `api()` is replaced by a function that returns the handler, so the endpoint can be called directly. The signed-in user comes from a stubbed `getAuthData`, which `requireRole` reads.

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ role: "superadmin" }));
vi.mock("encore.dev/api", () => ({
  api: (_opts: unknown, handler: unknown) => handler,
  APIError: {
    permissionDenied: (msg: string) => Object.assign(new Error(msg), { code: "permission_denied" }),
    unauthenticated: (msg: string) => new Error(msg),
  },
}));
vi.mock("~encore/auth", () => ({ getAuthData: () => ({ userID: "u1", companyID: "c1", role: auth.role }) }));

const softDelete = vi.hoisted(() => vi.fn());
vi.mock("../services/customer.service", () => ({ customerService: { softDelete } }));

import { customerDelete } from "../controllers/customerDelete.controller";

type Handler = (req: { id: string }) => Promise<{ ok: boolean }>;
const call = customerDelete as unknown as Handler;

describe("deleting a customer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lets a superadmin hide it, in their own company", async () => {
    auth.role = "superadmin";
    await expect(call({ id: "x1" })).resolves.toEqual({ ok: true });
    expect(softDelete).toHaveBeenCalledWith("x1", "c1"); // the company from the token
  });

  it("refuses everyone else", async () => {
    for (const role of ["admin", "manager", "user"]) {
      auth.role = role;
      await expect(call({ id: "x1" })).rejects.toMatchObject({ code: "permission_denied" });
    }
    expect(softDelete).not.toHaveBeenCalled();
  });
});
```

### Service test template

Mock the repositories, the other services (`~encore/clients`), the topics, the log and the `APIError` factories the service uses:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const customers = vi.hoisted(() => ({ getByIdForCompany: vi.fn() }));
const contacts = vi.hoisted(() => ({ createInCustomer: vi.fn(), getByIdForCompany: vi.fn(), updateInCustomer: vi.fn() }));
vi.mock("../repositories/customer.repository", () => ({ customerRepository: customers }));
vi.mock("../repositories/contact.repository", () => ({ contactRepository: contacts }));
vi.mock("../topics", () => ({ customerChanged: { publish: vi.fn() }, contactChanged: { publish: vi.fn() } }));
vi.mock("~encore/clients", () => ({ auth: { userLookup: vi.fn() } }));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("encore.dev/api", () => ({
  APIError: {
    notFound: (msg: string) => new Error(msg),
    aborted: (msg: string) => Object.assign(new Error(msg), { code: "aborted" }),
  },
}));

import { contactService } from "../services/contact.service";

const COMPANY = "00000000-0000-0000-0000-000000000001";

beforeEach(() => vi.clearAllMocks());

it("can't add a contact under a customer that isn't live in the company", async () => {
  customers.getByIdForCompany.mockResolvedValue(null);
  await expect(contactService.create(COMPANY, "other-company-customer", { firstName: "X", lastName: "Y" })).rejects.toThrow("Customer not found");
  expect(contacts.createInCustomer).not.toHaveBeenCalled();
});
```

To test how the service handles a refused write, reject the repository mock with the error drizzle would give. The SQLSTATE goes on `cause`, which `lib/db/errors.ts` reads:

```typescript
const oneMain = Object.assign(new Error("duplicate key"), { cause: { code: "23505", constraint: "contact_one_main_per_customer" } });
contacts.createInCustomer.mockRejectedValueOnce(oneMain);
```

The real `customer.service.test.ts` mocks a few more modules (`encore.dev/config` for a secret, the ARES lookup). Mock whatever the module imports that needs the Encore runtime.

### Repository test template

Stand in for the database, record what the repository asks for, and render the condition to SQL:

```typescript
import { expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const fake = vi.hoisted(() => {
  const state = { wheres: [] as unknown[] };
  const db = {
    select: () => ({
      from: () => ({
        where: (where: unknown) => {
          state.wheres.push(where);
          // the rows (ordered, limited) or, awaited as it is, the count
          return { orderBy: () => ({ limit: async () => [] }), then: (resolve: (rows: { value: number }[]) => unknown) => resolve([{ value: 0 }]) };
        },
      }),
    }),
  };
  return { state, db };
});
vi.mock("../../db/db", () => ({ db: fake.db }));

import { customerRepository } from "../../repositories/customer.repository";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const lastWhere = () => new PgDialect().sqlToQuery(fake.state.wheres.at(-1) as SQL);

it("keeps the companies whose roles include the one asked for, within the company", async () => {
  await customerRepository.listFiltered(COMPANY, { role: "haulier" });
  const { sql, params } = lastWhere();
  expect(sql).toBe('("customer"."company_id" = $1 and "customer"."deleted_at" is null and "customer"."roles" @> $2)');
  expect(params).toEqual([COMPANY, '{"haulier"}']);
});
```

Shape the stand-in after the drizzle calls the method really makes. It only has to answer those.

### DB test template

```typescript
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

// What two requests at the same moment leave behind. Runs only under `encore test`
// (SHIPMENTS_DB_TESTS=1 encore test services/shipments/tests/db).
vi.mock("~encore/clients", () => ({ /* the services the code calls, faked */ }));
vi.mock("../../topics", () => ({ shipmentDeleted: { publish: vi.fn() }, shipmentPartiesChanged: { publish: vi.fn() } }));

import { db } from "../../db/db";
import { shipmentService } from "../../services/shipment.service";

describe("two House BoL releases at once", () => {
  it("stamp the shipment once", async () => {
    const companyId = randomUUID(); // a company of its own: no other test's rows
    // ... insert the rows the test needs with db.insert(...)
    const outcomes = await Promise.allSettled([/* call A */, /* call B */]);
    // ... assert on outcomes and on what db.select() finds stored
  });
});
```

Put the file under a folder that is already wired to a flag (see the table in [Testing Standards](./testing_standards.md#database-tests)). For a new service, add its folder and flag to `apps/api/vitest.config.ts` the same way, or skip in the file with `describe.skipIf(!process.env.<FLAG>)` as the quotes DB tests do.

## Step 4: Write the cases

For an endpoint, cover at least:

- the success path, and what it returns (no `companyId` or `deletedAt` in API items);
- each refusal: not found (also when the row belongs to another company), invalid input, wrong role, a conflict;
- what is written, published or sent. Assert the arguments, not just that a call happened;
- for a list: filters, the `limit` clamp, the company scope (see [API Pagination](./api_pagination_standards.md)).

Name the cases in plain sentences that state the rule: `it("can't be added under a customer that isn't live in the company", ...)`.

## Step 5: Run it

```bash
cd apps/api
npx vitest run services/customers/tests/deletePermissions.test.ts   # the new file
npx vitest run                                                     # everything
encore gen wrappers && npx tsc --noEmit -p .                       # types

# DB tests, with their flag (see Testing Standards for the encore.app id note)
SHIPMENTS_DB_TESTS=1 encore test services/shipments/tests/db
```

## Checklist

- [ ] The test is at the layer where the behaviour lives
- [ ] Mocks come before the import of the code under test; shared values via `vi.hoisted`
- [ ] Roles: allowed and refused both tested; the company comes from the token
- [ ] Refusals assert the error (`code` or message), and that nothing was written
- [ ] A test that needs a database is a `*.db.test.ts` under `tests/db/`, behind its flag, with its own company
- [ ] `npx vitest run` and `npx tsc --noEmit -p .` pass; DB tests run if they apply
- [ ] `apps/api/encore.app` is unchanged

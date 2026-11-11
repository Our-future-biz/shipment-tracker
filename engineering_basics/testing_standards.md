# Testing Standards

How `apps/api` and `apps/web` are tested. Both use **Vitest**.

> Related:
> - [How to add tests for an API endpoint](./how_to_add_new_api_tests.md) - step by step, with templates
> - [Repository Patterns](./repository_patterns.md#testing-repositories)
> - [Event Processing](./event_processing_patterns.md#testing)

---

## Commands

```bash
# API unit tests (no database, no Encore runtime)
cd apps/api && npx vitest run            # or: pnpm test  (vitest run --passWithNoTests)
npx vitest run services/shipments/tests/jobNumber.test.ts   # one file
npx vitest run services/customers                           # one folder

# Web tests
cd apps/web && pnpm test                 # vitest run, picks up src/**/*.test.ts

# Both apps
pnpm test                                # from the repo root (pnpm -r test)
```

Typecheck before you push:

```bash
cd apps/api && encore gen wrappers && npx tsc --noEmit -p .
cd apps/web && pnpm typecheck
```

`apps/api/encore.gen` is gitignored and goes stale. Without `encore gen wrappers` first, `tsc` reports hundreds of errors about `~encore/...` types that are not real. In the web, errors under `.next/types/` are stale build output and can be ignored.

---

## Where tests live

**API**

- `apps/api/services/<service>/tests/`, mostly flat, sometimes grouped in `repositories/`, `services/`, `utils/` or `db/`.
- `apps/api/lib/tests/` for the shared code in `apps/api/lib` (outbox, repository update, text folding, job numbers, …).
- Names: `<subject>.test.ts` (`jobNumber.test.ts`, `customer.service.test.ts`, `customerListFiltered.repository.test.ts`). Tests that need a database: `<subject>.db.test.ts` under `tests/db/`.

**Web**

- Next to the module they test, as `src/**/<name>.test.ts`, for example `src/hooks/useShipments.test.ts` and `src/lib/fetchAllPages.test.ts`. Only `.test.ts` files are collected.

---

## API unit tests

The Encore runtime is not loaded under a plain `vitest run`. A test therefore mocks the Encore modules the code touches, and the module's own dependencies (repositories, other services, topics). It then imports the code under test. Mocks that the factory needs are created with `vi.hoisted`.

Common mocks, from real tests:

```typescript
// api() hands back the handler, so a controller can be called like a function
vi.mock("encore.dev/api", () => ({
  api: (_opts: unknown, handler: unknown) => handler,
  APIError: {
    notFound: (msg: string) => Object.assign(new Error(msg), { code: "not_found" }),
    permissionDenied: (msg: string) => Object.assign(new Error(msg), { code: "permission_denied" }),
    failedPrecondition: (msg: string) => Object.assign(new Error(msg), { code: "failed_precondition" }),
  },
}));

// the signed-in user
const auth = vi.hoisted(() => ({ role: "admin" }));
vi.mock("~encore/auth", () => ({ getAuthData: () => ({ userID: "u1", companyID: "c1", role: auth.role }) }));

// other services
const userLookup = vi.hoisted(() => vi.fn());
vi.mock("~encore/clients", () => ({ auth: { userLookup } }));

// the service's own pieces
const customers = vi.hoisted(() => ({ getByIdForCompany: vi.fn(), updateForCompany: vi.fn() }));
vi.mock("../repositories/customer.repository", () => ({ customerRepository: customers }));
vi.mock("../topics", () => ({ customerChanged: { publish: vi.fn() }, contactChanged: { publish: vi.fn() } }));

// logging and secrets
vi.mock("encore.dev/log", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("encore.dev/config", () => ({ secret: () => () => "test-secret" }));

import { customerService } from "../services/customer.service";
```

`apps/api/vitest.config.ts` maps `~encore` to `./encore.gen`, the same way the app resolves it.

What to test at each layer:

- **Controllers**: who may call (the roles `requireRole` lets through and the ones it refuses), that the company comes from the token, and what is passed to the service. Example: `services/customers/tests/deletePermissions.test.ts`.
- **Services**: business rules, refusals (which `APIError` with which message), what is written, published or sent to other services. Repositories and clients are mocked. Example: `services/customers/tests/customer.service.test.ts`.
- **Repositories**: the SQL they build. Mock `../../db/db` with a stand-in that records the `where`, and render it with `new PgDialect().sqlToQuery(...)`. Example: `services/customers/tests/repositories/customerListFiltered.repository.test.ts`.
- **Pure helpers** (`lib/`, `services/<service>/lib/`, `utils/`): plain input → output tests, and the most of them.

Keep logic in pure functions where you can (`lib/outbox/outboxDelivery.ts`, `outboxRetry.ts` and `textSearch.ts` are built that way) so that it is tested without mocks.

---

## Database tests

Some behaviour only shows against real Postgres: tenant scoping in real SQL, locks and two requests at once, outbox claims, partial unique indexes, `EXCLUDE` constraints. These tests are **skipped by a plain `vitest run`**, so a branch can pass the unit tests with them broken. Run them when you touch the code they cover.

### Under `encore test` (the Encore runtime opens the test database)

`apps/api/vitest.config.ts` excludes these folders unless their flag is set, and runs the files one after another when a flag is set (they share tables, the outboxes above all):

| Flag | Tests |
|---|---|
| `SHIPMENTS_DB_TESTS=1` | `services/shipments/tests/db/` |
| `WAREHOUSE_DB_TESTS=1` | `services/warehouseConcept/tests/` (the whole folder) |
| `TRUCKING_DB_TESTS=1` | `services/trucking/tests/db/` |
| `QUOTES_DB_TESTS=1` | `services/quotes/tests/db/quoteRename.db.test.ts`, `quoteNumberIndexes.db.test.ts` (they skip themselves with `describe.skipIf`) |

```bash
cd apps/api
SHIPMENTS_DB_TESTS=1 WAREHOUSE_DB_TESTS=1 TRUCKING_DB_TESTS=1 \
  encore test services/shipments/tests/db services/warehouseConcept/tests services/trucking/tests/db

QUOTES_DB_TESTS=1 encore test services/quotes/tests/db/quoteRename.db.test.ts
```

### With a connection string (plain vitest against the Encore test database)

The customer-link tests of quotes and sales open their own connection and skip unless the URL is set:

```bash
cd apps/api
QUOTES_DB_URL=$(encore db conn-uri quotes --test --write) npx vitest run services/quotes/tests/db
SALES_DB_URL=$(encore db conn-uri sales --test --write) npx vitest run services/sales/tests/db
```

They run each test in a transaction that is rolled back, or delete their rows afterwards.

### Running them on this machine: the app id

With the app id in `apps/api/encore.app` (`shipment-tracker-ysci`), `encore test` (like `encore run`) asks Encore Cloud for the app's secrets. When the Encore CLI is not signed in to the account that owns the app, it fails with "access denied". To run locally anyway:

1. Set `"id": ""` in `apps/api/encore.app` (local-only mode). This change is temporary.
2. If `encore test` still says "access denied", restart the daemon with `encore daemon` (only when no `encore run` is up), because it caches the cloud id.
3. Run the tests.
4. **Restore the file at once:** `git checkout apps/api/encore.app`.

**Never commit `encore.app` with an empty id.** Deploys need `"id": "shipment-tracker-ysci"`.

### Writing one

- Give every test its own company: `const companyId = randomUUID()`. Rows of different tests then never meet, and the tenant filter is exercised.
- Still mock what leaves the service (`~encore/clients`, `../../topics`, the service identity), as in `services/shipments/tests/db/writeTurns.db.test.ts`.
- For races, start both calls before awaiting either (`Promise.allSettled([a(), b()])`) and assert what is stored afterwards.
- Put the comment that says how to run the file at its top, as the existing ones do.

---

## Web tests

The web has **no React testing library and no DOM** (no jsdom). Components are not rendered in tests. Logic is tested as pure helpers:

- Move the logic out of the component or hook into an exported function: how a grid filters or sorts, what a write invalidates, how a value is formatted or parsed, and how a page of results is merged.
- Test that function. Hooks' helpers that work on react-query can be given a real `QueryClient` and checked with spies, as `src/hooks/useShipments.test.ts` does:

```typescript
import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { invalidateAfterShipmentUpdate } from "./useShipments";

function invalidatedBy(write: (queryClient: QueryClient) => unknown): unknown[] {
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
  write(queryClient);
  return invalidate.mock.calls.map(([filters]) => filters?.queryKey);
}

it("an edit: the Invoicing queue too", () => {
  const keys = invalidatedBy((queryClient) => invalidateAfterShipmentUpdate(queryClient, { status: "Arrived [IMP]" }));
  expect(keys).toEqual(expect.arrayContaining([["shipments"], ["invoice-queue"]]));
});
```

`apps/web/vitest.config.ts` compiles JSX (automatic runtime), so a module that also holds JSX, such as column definitions, can still be imported for its helpers.

Check what a screen looks like by running the app (`pnpm dev`) and looking at it. A unit test does not cover that.

---

## Style

- Name tests in plain sentences that state the behaviour: `it("refuses everyone else to delete a %s", ...)`, `describe("two House BoL releases at once", ...)`.
- Fixed dates (`new Date("2026-11-10T12:00:00Z")`) or `vi.useFakeTimers()`. Never depend on today.
- `beforeEach(() => vi.clearAllMocks())` when mocks are shared between tests. Restore spies (`vi.restoreAllMocks()`).
- One behaviour per `it`; `it.each` for the same rule over several inputs.
- No network and no real external services in unit tests.
- A bug fix comes with the test that would have caught it.

---

## Checklist

- [ ] `npx vitest run` in `apps/api` and `pnpm test` in `apps/web` pass
- [ ] `encore gen wrappers && npx tsc --noEmit -p .` in `apps/api` and `pnpm typecheck` in `apps/web` are clean
- [ ] Changed repository SQL, locks or outboxes: the matching DB tests were run with their flag or URL
- [ ] `apps/api/encore.app` is unchanged (`"id": "shipment-tracker-ysci"`)
- [ ] New logic in the web is in a tested helper, not only inside a component

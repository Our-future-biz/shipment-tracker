# How Encore Works Here

The backend in `apps/api` is an [Encore.ts](https://encore.dev/docs/ts) app (package `encore.dev` 1.58). Encore reads the code to find out what infrastructure the app needs, and provides it: locally with `encore run`, and in Encore Cloud for the deployed environments. This page explains what that means for this codebase.

Related: [Service Architecture](service_architecture_patterns.md), [Code Standards](code_standards_in_encore.md), [Secrets and Configuration](secrets_environment_management.md).

---

## What Encore provides, and where we use it

| Encore primitive | Import | In this app |
|---|---|---|
| Service | `new Service("…")` from `encore.dev/service` | 14 services, one `encore.service.ts` each in `apps/api/services/<name>/` |
| API endpoint | `api(...)`, `api.raw(...)` from `encore.dev/api` | about 320 controller files |
| Auth handler + gateway | `authHandler`, `Gateway` | `apps/api/lib/auth.handler.ts` |
| SQL database | `new SQLDatabase("…")` from `encore.dev/storage/sqldb` | one per service (13; extraction has none), used through Drizzle |
| Pub/Sub | `Topic`, `Subscription` from `encore.dev/pubsub` | 6 topics, 18 subscriptions |
| Cron | `CronJob` from `encore.dev/cron` | 10 jobs |
| Object storage | `Bucket` from `encore.dev/storage/objects` | 8 buckets in `storage/` folders |
| Secrets | `secret("…")` from `encore.dev/config` | `JWT_SECRET`, `ANTHROPIC_API_KEY` |
| Logging | `log` from `encore.dev/log` | everywhere |
| Request validation | `MinLen`, `MaxLen`, `Min`, `Max`, `MatchesRegexp` from `encore.dev/validate` | on request interfaces |
| Service clients | `~encore/clients` | every call between services |
| Auth data | `getAuthData()` from `~encore/auth` | controllers (and `requireRole`) |

`~encore/clients` and `~encore/auth` are generated into `apps/api/encore.gen/`, which is gitignored. Tests resolve `~encore` to that folder through the alias in `apps/api/vitest.config.ts`.

---

## Encore reads the code

Encore's parser walks the code to find services, endpoints, databases, topics, subscriptions, cron jobs, buckets and secrets, and the types every endpoint takes and returns. From that it builds the app's wiring and the generated clients.

Two consequences matter day to day:

- **Declarations must be static.** A `Topic`, `CronJob`, `Bucket`, `SQLDatabase` or `secret()` is created at the top level of a module, with literal names. Look at any `topics.ts` or `crons/*.cron.ts`.
- **Endpoint types must be plain.** The parser resolves every type reachable from an endpoint. It cannot resolve Drizzle's `$inferSelect`/`$inferInsert` generics, so controllers and `interfaces/` never import schema types (see [DTO](dto.md)). Also: there is no `src/` folder (services sit directly under `apps/api/services/`), and `pg` is imported as a default import (`import pg from "pg"`, see `apps/api/lib/db/pool.ts`).

---

## A request

1. The browser calls the API with `Authorization: Bearer <token>`. A superadmin also sends `X-Acting-Company`.
2. Encore's gateway runs the auth handler (`apps/api/lib/auth.handler.ts`). It verifies the token, checks that the user is still live, and returns `AuthData { userID, companyID, role, homeCompanyID }`. For a superadmin, `companyID` is the company chosen in the header.
3. Encore validates the request body, path and query against the endpoint's request type, and refuses a bad one with `invalid_argument` before any of our code runs.
4. The endpoint runs. `getAuthData()` returns the `AuthData` from step 2.
5. A thrown `APIError` becomes the matching HTTP status and a `{ code, message, details }` body (see [Errors](errors.md)).

Endpoints with `auth: false` skip step 2 and check their own token (see [Code Standards §3](code_standards_in_encore.md#3-authentication-and-roles)).

---

## Calls between services

```typescript
import { holidays } from "~encore/clients";

const { dates } = await holidays._internalHolidaysCzNational({ from, to }, { authData });
```

The call is typed from the target endpoint's request and response, and goes over Encore's internal network, not the public gateway. An `expose: false` endpoint can only be reached this way. Inside a request, the caller's `AuthData` travels with the call. Without one (a cron, a subscriber), pass `{ authData }` or `asCompany(companyId)` (`apps/api/lib/internalCall.ts`).

---

## Databases and migrations

- Each `new SQLDatabase("<name>", { migrations: { path: "migrations", source: "drizzle" } })` is a separate Postgres database. Encore creates it, and applies the SQL files in `db/migrations/` when the app starts (locally, on `encore run`).
- Migrations are generated from the Drizzle schema with `pnpm --filter api db:generate:<service>` (drizzle-kit, configured in each `db/drizzle.config.ts`). Encore records applied migrations by number only, so editing a migration that already ran does not run it again.
- `encore db conn-uri <database>` prints a database's connection string, and `encore db shell <database>` opens a SQL shell.

---

## Pub/Sub and cron

- A `Topic` is published with `await topic.publish(event)`, and a `Subscription` handler is called for each event, at least once. Subscriptions are named `<subscriber>-<topic>`, for example `"fx-shipment-deleted"`.
- A `CronJob` calls an endpoint on a schedule (`every: "1m"` or `schedule: "<cron>"`, in UTC). **Cron jobs do not fire under `encore run`.** So the services start local timers that do the same work (`startShipmentEventTimer`, `startQuoteEventTimer`, `startOutboxTimer`, `startFxScheduler`, `startFollowupTimer`, `startCustomsFollowTimer`, `startStorageSettledTimer`, `startLocalTariffCheck`). Most of them stay off under Vitest. The hourly `shipments-quote-links-reconcile` has no timer; locally a manager runs it with `POST /shipment-quote-links/sync`.

---

## Running it locally

```bash
./run-local.sh           # checks encore, Docker and pnpm, then starts web :3001 and API :4001
pnpm dev                 # the same without the checks: both apps in parallel
pnpm backend             # API only (encore run --port=4001)
pnpm frontend            # web only (next dev --port 3001)
./run-local.sh seed      # sample data, while the app runs
```

- Encore runs the databases in Docker, so Docker Desktop must be running.
- Before `npx tsc --noEmit` in `apps/api`, run `encore gen wrappers`. A stale `encore.gen/` gives hundreds of false errors.
- `encore test` runs Vitest with the Encore runtime and test databases. The database test suites need their flags (see [Testing Standards](testing_standards.md)).
- The committed app id in `apps/api/encore.app` is `shipment-tracker-ysci`. With it, `encore run` reads secrets from Encore Cloud, which fails unless the CLI is signed in to the account that owns the app. To run locally anyway, set `"id": ""` in your working copy only (never commit it), put `JWT_SECRET` in `apps/api/.secrets.local.cue` (gitignored), and seed the empty local databases.

---

## Deployed environments

- Encore Cloud builds the app from `apps/api/encore.app`. The build bundles the source in Docker, and its prebuild hook runs `pnpm install`.
- Environment URLs follow `https://<env>-shipment-tracker-ysci.encr.app` (see `Environment()` in `apps/web/src/lib/api/client.ts`).
- `global_cors` in `encore.app` allows the web app's origins and the `X-Acting-Company` header.
- Secrets are set per environment with `encore secret set` (see [Secrets and Configuration](secrets_environment_management.md)). Encore refuses to deploy while a declared secret has no value. That is why `lib/email.ts` declares no e-mail secret yet.

---

## The web client

`apps/web/src/lib/api/client.ts` was generated by Encore (`pnpm gen`, which runs `encore gen client --lang=typescript`) and is now edited by hand. Regenerating it would overwrite those edits. When an endpoint changes, change the client to match. `apps/web/src/lib/api/index.ts` wraps it: the session token, the acting company header, and `apiErrorMessage`.

---

## Further reading

- Encore.ts docs: https://encore.dev/docs/ts
- Drizzle ORM: https://orm.drizzle.team/

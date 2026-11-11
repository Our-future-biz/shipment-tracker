# Start-up

The API has no on-start handler and no "deployment complete" endpoint. This is what happens when it starts.

## 1. Migrations

Each service declares its database with:

```ts
new SQLDatabase("<name>", { migrations: { path: "migrations", source: "drizzle" } })
```

- Encore applies new migration files before the services start: locally when `encore run` starts, in the cloud as part of a deploy.
- The versions already applied are recorded in each database's `schema_migrations` table, by number only. Editing a migration that has already run does not run it again; write a new one.
- Migrations are generated with drizzle-kit: `pnpm --filter api db:generate:<service>` (see `apps/api/package.json`).

## 2. Code that runs when a module is imported

- `services/shipments/encore.service.ts`, `services/customers/encore.service.ts` and `services/trucking/encore.service.ts` pass `appMeta().environment` to `lib/appUrl.ts`. Trucking also logs once when `APP_URL` can't be used, and then uses the fallback.
- The cron controllers start their timers when imported. Encore does not run cron jobs under `encore run`, and the timers do the same work:
  - `startShipmentEventTimer`, `startQuoteEventTimer`, `startOutboxTimer` (trucking, and the warehouse gate), `startFollowupTimer` (invoicing), `startCustomsFollowTimer` and `startStorageSettledTimer`. They run locally and in the cloud. Rows are claimed with `SKIP LOCKED`, so the timer and the cron never take the same row.
  - `startFxScheduler` (`services/fx/controllers/fxRead.controller.ts`) runs locally only. Five seconds after start it fills in the ČNB rates missed while the app was off (an import run with trigger `startup`), then checks every minute. In the cloud the `fx-cnb-import` cron does the pulls.
  - `startLocalTariffCheck` (quotes) runs locally only, once a day between 03:00 and 03:05 Prague time. In the cloud the `quotes-tariff-check` cron runs it.
- Every timer has a `started` guard, does nothing under Vitest (`process.env.VITEST`) and calls `.unref()`.
- The database pools open their connections on the first query, not at start-up.

The full list of cron jobs is in [Databases, Backups and Scheduled Jobs](encore_db_monitoring_operations.md#scheduled-jobs).

## Rules for start-up code

- Never throw for a missing or bad setting. Log it and fall back, as `APP_URL` does. A throw at import stops the whole service.
- Never wait on a network call (ČNB, Anthropic, another service) at start-up. Schedule it with `setTimeout(...).unref()`, as fx does.
- Work that must happen once per deploy, such as a data clean-up, belongs in a migration, not in start-up code.

## Locally

`./run-local.sh` treats the API as up once `http://localhost:4001/auth/me` answers; the daily backup waits for that. After you change the database or the API, use `Restart Shipment Tracker.command`, so that migrations run and the timers start again.

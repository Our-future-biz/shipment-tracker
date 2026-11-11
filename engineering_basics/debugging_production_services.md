# Debugging

Where to look when something misbehaves, on your machine and in Encore Cloud.

## On your machine

### Starting and restarting

You can start the app in either of two ways:

- **`./run-local.sh`.** It checks for `encore` and `docker`, starts Docker Desktop when it is not running, turns on pnpm through corepack, and frees ports 3001 and 4001. Then it runs `pnpm install` and creates `apps/api/.secrets.local.cue` if it is missing. It starts the daily backup in the background and finally runs `pnpm dev`, which starts `encore run --port=4001` (API) and `next dev --port 3001` (web) together. Keep the window open; closing it stops the app.
- **Double-clicking `Spustit Shipment Tracker.command`.** It runs `./run-local.sh` and opens http://localhost:3001 once the web app answers.

Other commands:

| Command | What it does |
|---|---|
| `./run-local.sh stav` | Shows whether Docker is running and whether something listens on 3001 and 4001. |
| `Restart Shipment Tracker.command` | Stops whatever holds 3001/4001 (and leftover `encore run` / `next dev --port 3001` processes), then starts the app again. Use it after a database or API change. |
| `./run-local.sh seed` | Fills an empty local database while the app runs. Set `SEED_SUPERADMIN_PASSWORD` to also create the superadmins. |
| `./run-local.sh admin <email> <password> ["Name"]` | Creates a superadmin. |

### Tools

- **Encore's development dashboard.** `encore run` prints its address, by default http://localhost:9400. It has an API explorer, a trace of every request (with its logs, database queries and calls to other services) and a map of the services. A failed request's trace is the fastest way to see why it failed.
- **Logs.** They appear in the terminal that runs `encore run`. For more detail, run `encore run --port=4001 --level=debug` from `apps/api` instead of `pnpm dev`.
- **Database.** From `apps/api`, run `encore db shell <db>` (psql) or `encore db conn-uri <db>`. The database names are listed in [Databases, Backups and Scheduled Jobs](encore_db_monitoring_operations.md). Take a backup with `./zaloha.sh` before any risky change.
- **Cron jobs.** Encore does not run them under `encore run`; timers do the same work (see [Start-up](service_startup_handler_onstart.md)).

### Common local problems

| Symptom | Cause / fix |
|---|---|
| `access denied: you do not have access to the app shipment-tracker-ysci` | The Encore CLI is not signed in to the account that owns the app. See [Secrets and Configuration](secrets_environment_management.md#local-runs). |
| "Docker se nerozjel do 2 minut" | Docker Desktop did not start by itself. Start it by hand and run again. |
| Port 3001 or 4001 busy | `./run-local.sh` frees them; `Restart Shipment Tracker.command` also stops leftovers. |
| The web app loads but every call fails | The API is not up on 4001 (look at the terminal), or `NEXT_PUBLIC_API_URL` points somewhere else. |
| AI document reading fails | `ANTHROPIC_API_KEY` in `.secrets.local.cue` is still the placeholder. |
| `tsc` errors about `encore.gen` | `encore.gen` is generated and goes stale. Run `encore gen wrappers` in `apps/api`. In `apps/web`, ignore errors under `.next/types`. |
| Database tests seem to pass but never ran | A plain `vitest run` skips them. Run them with `encore test` and `SHIPMENTS_DB_TESTS=1 WAREHOUSE_DB_TESTS=1 TRUCKING_DB_TESTS=1` (see `apps/api/vitest.config.ts`). |

## In Encore Cloud

Sign in at https://app.encore.cloud with the account that owns `shipment-tracker-ysci`, open the app and pick the environment.

- **Traces.** Every API call, every cron run (a cron run is a call to its endpoint, for example `_cronFxImport`) and every Pub/Sub delivery has a trace, with its logs, database queries and calls to other services. Filter them by service, endpoint, status and duration.
- **Logs.** Run `encore logs --env=<environment>` from `apps/api` to stream live logs (add `--json` for raw JSON). Our log messages start with the service name, so search for `fx:`, `trucking:`, `warehouse:`, `invoicing:`, `shipments:`, `quotes:` or `extraction:`.
- **Deploys.** The dashboard lists each deploy with its build output. Encore refuses to deploy while a declared secret has no value in that environment.
- **Database.** These commands take `--env=<environment>`:
  - `encore db shell <db>` opens psql. It connects read-only unless you add `--write` (or `--admin`); add `--write` only for a fix you have written down first.
  - `encore db conn-uri <db>` prints a connection string for a database client.
  - `encore db proxy` opens a local tunnel.

## How our errors look

- Endpoints throw `APIError` from `encore.dev/api`. The codes we use most are: `unauthenticated`, `permission_denied`, `invalid_argument`, `not_found`, `unavailable` (the AI or another service did not answer) and `resource_exhausted` (the AI reading budget). See [errors.md](errors.md).
- When a user reports a problem, ask for the time, the screen and the company. For a superadmin, ask which company the switcher was set to: it is sent as `X-Acting-Company`, and every request is scoped to that company. Then find the request by endpoint and time in the traces.

## Common cases

1. **An endpoint returns 500.** Open its trace and find the error log line in it. Then reproduce the problem locally with similar data.
2. **Works locally, fails in the cloud.** Check, in this order:
   - Is the secret set for that environment type (`encore secret list`)?
   - Did the deploy and its migration go through?
   - Is the web app served from an origin that `global_cors` in `apps/api/encore.app` allows?
   - Do the links point to production? Then `APP_URL` is not set, and the code fell back to the production web app.
3. **Slow, or timeouts.** The trace shows the slow query or call. Each service's pool allows 10 connections and waits at most 10 s for a free one ("timeout exceeded when trying to connect"). A statement runs at most 60 s ("canceling statement due to statement timeout").

See also the [Incident Checklist](encore_cloud_incident_runbook.md).

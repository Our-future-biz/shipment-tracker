# Databases, Backups and Scheduled Jobs

## Databases

Each service has its own Postgres database, declared with `new SQLDatabase("<name>", …)` in `apps/api/services/<service>/db/db.ts`. The `extraction` service has none.

| Database | Service directory |
|---|---|
| `auth` | `auth` (companies, users, login throttle, notices) |
| `automation` | `automation` |
| `customers` | `customers` |
| `fx` | `fx` (ČNB rates, import runs, alerts) |
| `holidays` | `holidays` |
| `invoicing` | `invoicing` |
| `quotes` | `quotes` |
| `sales` | `sales` |
| `shipments` | `shipments` |
| `tariffs` | `tariffs` |
| `trucking` | `trucking` |
| `warehouse` | `warehouseConcept` (Warehouse Concept) |
| `warehouse_basic` | `warehouse` (the normal Warehouse) |

How to connect, from `apps/api` (add `--env=<environment>` for the cloud):

- `encore db shell <db>` opens psql. In the cloud it is read-only unless you add `--write`.
- `encore db conn-uri <db>` prints a connection string.
- `encore db proxy` opens a local tunnel.

The connection pool (`lib/db/pool.ts`) has these limits:

- At most 10 connections per service, and a request waits at most 10 s for a free one.
- A statement runs at most 60 s, and a transaction left idle for 60 s is ended by the server.
- When Postgres drops an idle connection (for example after Docker or the machine slept), the pool logs "an idle database connection was dropped…" and opens a new one. This is harmless.

Migrations:

- Generate them with `pnpm --filter api db:generate:<service>`.
- The files live in `services/<service>/db/migrations`. Encore applies them at start-up or deploy and records them in `schema_migrations`.

Uploaded files are not in Postgres. They are kept in Encore object storage buckets (`new Bucket(…)` under `services/*/storage`).

`docker-compose.yml` starts a separate Postgres 16 container (`shipment-tracker-db`, port 5432). Nothing in the app or the scripts uses it: `encore run` starts its own databases in Docker.

## Local backups: `zaloha.sh`

| Command | What it does |
|---|---|
| `./zaloha.sh` | Dumps each database to `~/Documents/Shipment Tracker/zalohy/<YYYY-MM-DD_HH-MM>/<db>.sql`, one file per database. |
| `./zaloha.sh seznam` | Lists the backups, with the number of files and the size of each. |
| `./zaloha.sh obnov <folder>` | Restores a backup with `psql`. It **overwrites** every database and asks you to type `ano` first. Reload the browser afterwards. |

- The dump uses `pg_dump --clean --if-exists --no-owner --no-privileges`. It ends with "Hotovo: N z 13".
- The app must be running, because the script asks `encore db conn-uri` for each database. It also needs `pg_dump` (`brew install libpq`; the script adds Homebrew's libpq to `PATH` itself).
- `./run-local.sh` makes one backup a day automatically, once the API answers. It skips the backup when one from today already exists. The log is `/tmp/shipment-zaloha.log`.
- It saves the 13 databases listed in `DBS` in the script, and only the local ones. When you add a database, add its name to `DBS`.
- It does **not** save uploaded files (the buckets) or `.secrets.local.cue`.
- Backups of the cloud databases are not set up in this repo. Check what Encore Cloud provides for the environment in its dashboard.

## Scheduled jobs

Cron jobs are declared with `new CronJob(...)` from `encore.dev/cron`. Their schedules are in UTC.

| Cron job | Service | Runs | What it does | Locally |
|---|---|---|---|---|
| `shipments-event-outbox` | shipments | every 1 min | Publishes shipment-deleted events not yet published | Timer |
| `shipments-quote-links-reconcile` | shipments | every 1 h | Repairs links between sales quotes and shipments | None: `POST /shipment-quote-links/sync`, or the Shipments list starts it |
| `quotes-event-outbox` | quotes | every 1 min | Publishes quote-renamed events not yet published | Timer |
| `quotes-tariff-check` | quotes | `0 2 * * *` (02:00 UTC) | Checks the tariffs of quotes not yet sent | Timer, 03:00 Prague |
| `fx-cnb-import` | fx | `0,30 13-15 * * 1-5` | ČNB pull at 15:00, 15:30 and 16:00 Prague time (the code picks the slot that is due) | Timer |
| `trucking-shipment-outbox` | trucking | every 1 min | Sends what consignments and trips owe their jobs, with retries | Timer |
| `warehouse-shipment-outbox` | warehouseConcept | every 1 min | Sends shipment updates from gate stamps, and publishes gate-stamped events | Timer |
| `warehouse-customs-follow` | warehouseConcept | every 5 min | Reads the customs status of linked, open gate records from Shipments | Timer |
| `warehouse-storage-settled` | warehouseConcept | every 1 h | Sets "Storage settled" back to Pending when storage becomes chargeable | Timer |
| `invoicing-followups` | invoicing | every 1 min | Sends what issued invoices and credit notes owe the customers and shipments services | Timer |

- Encore does not run cron jobs under `encore run`; the timers listed in [Start-up](service_startup_handler_onstart.md) do that work.
- Apart from fx and the tariff check, the timers also run in the cloud, next to the cron. Rows are claimed with `SKIP LOCKED`, so the two never take the same row.

### Checking them

- **In the cloud:** each cron run is a call to its endpoint (`_cronShipmentEventOutbox`, `_cronQuoteLinksReconcile`, `_cronQuoteEventOutbox`, `_cronTariffCheck`, `_cronFxImport`, `_cronTruckingOutbox`, `_cronShipmentOutbox`, `_cronCustomsFollow`, `_cronStorageSettled`, `_cronInvoiceFollowups`). Filter the traces in the Encore Cloud dashboard by that endpoint to see the recent runs and their errors.
- **Outbox tables:**

  | Database | Tables |
  |---|---|
  | `shipments` | `shipment_event_outbox` |
  | `quotes` | `quote_event_outbox` |
  | `trucking` | `trucking_outbox` |
  | `warehouse` | `warehouse_shipment_outbox`, `warehouse_gate_event_outbox` |
  | `invoicing` | `invoice_followup_outbox` |

  ```sql
  SELECT status, count(*) AS rows, min(next_attempt_at) AS oldest_due, max(attempts) AS most_attempts
  FROM trucking_outbox WHERE deleted_at IS NULL GROUP BY status;

  SELECT id, attempts, next_attempt_at, last_error
  FROM trucking_outbox WHERE status = 'failed' AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 20;
  ```

  The statuses (`lib/outbox`) are:

  - `pending`: waiting or retrying. The wait between tries is 2, 4, 8 … minutes, up to 1 hour.
  - `sent`
  - `failed`: a permanent error, or all 15 attempts used. A manager can **Send again** where the screen offers it.
  - `cancelled`

  A `pending` row whose `next_attempt_at` is well in the past, and whose `locked_until` is empty, means no delivery is running.
- **ČNB import:**

  ```sql
  SELECT started_at, trigger, status, rows_added, latest_valid_date, error
  FROM cnb_import_run ORDER BY started_at DESC LIMIT 10;

  SELECT fixing_date, reason, raised_at FROM fx_alert WHERE resolved_at IS NULL;
  ```

  The same runs are shown on the Exchange page (Import log tab).

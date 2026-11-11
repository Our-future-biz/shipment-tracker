# Service Architecture & Patterns

How the backend in `apps/api` is put together: services, their databases, how they call each other, events, outboxes, transactions and scheduled jobs.

Related: [How Encore Works Here](encore_how_its_working.md), [Code Standards](code_standards_in_encore.md), [Request Flow Layers](request_flow_layers/README.md), [Event Processing](event_processing_patterns.md), [Folder Structure](folder_structure_and_naming.md).

---

## The big picture

```
apps/web (Next, browser)
      │  HTTPS, Authorization: Bearer <token>, X-Acting-Company (superadmin)
      ▼
Encore gateway ── auth handler (lib/auth.handler.ts) ── AuthData { userID, companyID, role, ... }
      │
      ▼
14 Encore services  (auth, customers, shipments, quotes, sales, invoicing, trucking, tariffs,
                     fx, holidays, warehouse, warehouseConcept, automation, extraction)
      │   each: controllers → services → repositories → its own Postgres database
      │
      ├── calls each other through ~encore/clients (typed, internal, carries the user)
      ├── publishes and subscribes to Pub/Sub topics
      ├── runs CronJobs
      └── keeps files in object storage buckets
```

Each service is one folder in `apps/api/services/`. All of them use the same layered layout (see [Folder Structure](folder_structure_and_naming.md)).

---

## Layers

Controller → service → repository. The rules are in [Code Standards §1](code_standards_in_encore.md#1-three-layers-controller-service-repository) and [Request Flow Layers](request_flow_layers/README.md). In short:

- A **controller** reads the actor and passes `companyID` (and `userID`/`role`) on.
- A **service** owns the rules, the calls to other services, the events and the transactions.
- A **repository** owns the queries, each one scoped by `company_id`.

---

## A service and its database

`encore.service.ts` only declares the service:

```typescript
// services/holidays/encore.service.ts
import { Service } from "encore.dev/service";

export default new Service("holidays");
```

Some services also run start-up code at load: shipments, customers and trucking call `configureAppEnvironment(appMeta().environment)` from `apps/api/lib/appUrl.ts`, and trucking logs when `APP_URL` is unusable. Secrets are not declared here: each one is declared with `secret("...")` in the file that uses it (see [Secrets and Configuration](secrets_environment_management.md)).

Every service except extraction has its own database in `db/db.ts`:

```typescript
// services/shipments/db/db.ts (abridged)
export const DB = new SQLDatabase("shipments", {
  migrations: { path: "migrations", source: "drizzle" },
});

const pool = servicePool(DB.connectionString);   // lib/db/pool.ts: time limits, dropped-connection handling

export const db = drizzle(pool, { schema: { ...shipmentSchema, ...masterJobSchema /* … */ } });

/** A transaction open on the shipments database (what db.transaction hands its callback). */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
```

No service opens another service's database, and there are no foreign keys between databases. Foreign keys are used inside one database (for example `shipment_audit.shipment_id` references `shipment.id`).

---

## Calling another service

Calls go through Encore's generated clients:

```typescript
import { customers, fx, invoicing, shipments } from "~encore/clients";

// services/customers/services/shipmentFinancials.service.ts
const { shipmentIds: own } = await shipments._internalCustomerShipmentIds({ customerId, shipmentIds: [...new Set(shipmentIds)] });
const { jobs, unreadable } = await fx._internalFxJobRatesBatch({ shipmentIds: own });
```

- **Who the call runs as.** Inside a request, Encore passes the caller's `AuthData` on, so the internal endpoint (`expose: false, auth: true`) sees the same user and company. A Pub/Sub handler or a cron has no user. It passes the company: `asCompany(companyId)` from `apps/api/lib/internalCall.ts`, or `{ authData }`.
- **Writes the app makes on a user's behalf** (a gate stamp updating a shipment, a trucking date) are sent as that user, with `appWrite` set (`apps/api/lib/outbox/shipmentUpdateAs.ts`). What the system or a haulier causes (a haulier's stamp or POD, a deleted job's re-settled trips) is sent as the company's service identity, "Trucking (system)" (`apps/api/lib/outbox/serviceIdentity.ts`). "Send again" also uses that identity for failed rows whose user is no longer there.
- **Batching.** Look-ups by many ids are sent in chunks (for example `REFS_CHUNK` in shipments' `partyLinks.service.ts`), not one call per row.
- **What may be imported across services:** another service's `topics.ts` (to subscribe) and its `interfaces/` types. Never its repositories, schemas or `db`.
- **Prefer enriching a response on the server** over making the web app fetch related data itself. For example, `customers` collects a customer's shipment figures from shipments, fx and invoicing in `shipmentFinancials.service.ts`.

---

## Events (Pub/Sub)

Topics are declared in the publishing service's `topics.ts`. All use `deliveryGuarantee: "at-least-once"`, so every subscriber must be idempotent.

| Topic | Published by | Subscribed by | Why |
|---|---|---|---|
| `shipment-deleted` | shipments (through its outbox) | fx, invoicing, trucking, warehouse, warehouseConcept | retire the rows they keep for that shipment |
| `shipment-parties-changed` | shipments | warehouseConcept | its gate record copies the Customer and Customer's PIC |
| `customer-changed` | customers | quotes, sales, shipments, trucking | rewrite copied customer names |
| `contact-changed` | customers | quotes, shipments | rewrite copied contact names |
| `quote-renamed` | quotes (through its outbox) | customers, invoicing, sales, shipments, trucking | move copies of a quote reference to the new one |
| `warehouse-gate-stamped` | warehouseConcept (through its outbox) | trucking | move LTL consignments on gate-in/gate-out |

```typescript
// services/fx/subscriptions/shipmentDeleted.subscription.ts
export const fxShipmentDeleted = new Subscription(shipmentDeleted, "fx-shipment-deleted", {
  handler: async ({ shipmentId, companyId }) => {
    await jobRateRepository.softDeleteForShipment(companyId, shipmentId);
  },
});
```

**An event is a signal, not the value.** A subscriber that copies data asks the owner what it says now, so a late or repeated event never writes an older value. Examples: the `quote-renamed` subscribers call `quoteReferenceNow` (`apps/api/lib/quoteReferenceNow.ts`, which uses quotes' `_internalQuoteReferenceNow`), and trucking's `customerLinksService.customerChanged` writes "the name the Customer Database holds now".

See [Event Processing](event_processing_patterns.md).

---

## Transactional outbox

When a change must reach a topic or another service even if that is down right now, the service writes what it owes as an outbox row, in the same transaction as the change. It sends the row after the commit. A one-minute cron job retries what could not be sent.

| Outbox table | Owes | Cron job |
|---|---|---|
| `shipment_event_outbox` | `shipment-deleted` events | `shipments-event-outbox` |
| `quote_event_outbox` | `quote-renamed` events | `quotes-event-outbox` |
| `warehouse_gate_event_outbox` | `warehouse-gate-stamped` events | `warehouse-shipment-outbox` (the same run delivers both) |
| `warehouse_shipment_outbox` | gate dates written to the shipment | `warehouse-shipment-outbox` |
| `trucking_outbox` | pick-up and delivery dates, plates, and the move to Billing written to the job | `trucking-shipment-outbox` |
| `invoice_followup_outbox` | an issued invoice's follow-ups (customer invoice list, shipment status) | `invoicing-followups` |

The shared pieces are in `apps/api/lib/outbox/`:

- `outbox.columns.ts`: the bookkeeping columns every outbox table spreads (status, attempts, next attempt, lock, last error, acting user).
- `outboxRepository.ts`: claiming due rows with `SKIP LOCKED`, and settling them.
- `outboxDelivery.ts`: the delivery loop.
- `outboxRetry.ts`: back-off and which error codes are permanent (see [Errors](errors.md#pick-the-code-carefully-the-outbox-reads-it)).
- `sendAgain.ts`: a manager's "Send again" for failed rows.

Cron jobs do not fire under `encore run`, so each outbox service also starts a minute timer locally (`startShipmentEventTimer`, `startQuoteEventTimer`, …). In the cloud both run, and `SKIP LOCKED` keeps them from taking the same row.

Not every publish goes through an outbox: customers publishes `customer-changed` and `contact-changed` directly after the write, and shipments publishes `shipment-parties-changed` directly.

---

## Transactions and concurrency

- A repository method that needs several statements opens a transaction itself, or joins the caller's when given one. For example, `shipmentRepository.softDeleteWithEvent(id, companyId, actor, tx?)` writes the delete and its outbox row together.
- When a service has to combine several repositories in one transaction, it opens it (`db.transaction(async (tx) => …)`, or trucking's `inTx`) and passes `tx` to repository methods that take it as their first argument (`tripRepository.insert(tx, …)`).
- Postgres advisory locks (`pg_advisory_xact_lock`) serialise work that has no single row to lock, such as allocating a warehouse reference.
- Reference numbers per company and year come from counter tables (`shipment_ref_counter`, `trucking_ref_counter`, `warehouse_ref_counter`, `quote_ref_sequence`).
- Concurrent edits are refused, not merged. Some tables carry a `version` column (trucking trips), and a write that lost the race throws `APIError.aborted` (trucking's `TRIP_CONFLICT`).
- Each pool limits a statement to 60 s, and an idle open transaction to 60 s (`apps/api/lib/db/pool.ts`).

---

## Scheduled jobs

A cron job is a `CronJob` that calls an `expose: false` endpoint named `_cron…`.

| Job | Service | When |
|---|---|---|
| `fx-cnb-import` | fx | weekdays, every 30 min 13:00–15:30 UTC (the 15:00/15:30/16:00 Prague pulls) |
| `shipments-event-outbox`, `quotes-event-outbox`, `trucking-shipment-outbox`, `warehouse-shipment-outbox`, `invoicing-followups` | outboxes | every minute |
| `warehouse-customs-follow` | warehouseConcept | every 5 min |
| `shipments-quote-links-reconcile`, `warehouse-storage-settled` | shipments, warehouseConcept | hourly |
| `quotes-tariff-check` | quotes | daily 02:00 UTC |

Cron endpoints take no input and are idempotent: a run that finds nothing due does nothing.

---

## Files

Uploaded and generated files are kept in Encore object storage buckets declared in `storage/`: `shipment-attachments`, `master-job-documents`, `quote-attachments`, `invoice-documents`, `tariff-files`, `trucking-documents`, `trucking-tariff-files`, `warehouse-gate-files`. A browser opens a file through an `auth: false` content endpoint with a signed, short-lived token (`apps/api/lib/signedUrl.ts`).

---

## Outside systems

| System | Used by | Where |
|---|---|---|
| ČNB exchange rates | fx | `services/fx/lib/cnb.ts` |
| ARES company registry | customers | `services/customers/services/ares.service.ts` |
| Anthropic (AI document reading) | extraction, tariffs, holidays | `services/extraction/lib/anthropic.ts`, `services/tariffs/lib/anthropic.ts`, `services/holidays/services/holidayReader.service.ts` (secret `ANTHROPIC_API_KEY`) |
| E-mail (Resend) | fx alerts, warehouse supplier e-mails | `apps/api/lib/email.ts`; disabled for now, messages are logged and reported as not sent |

A provider that does not answer becomes `APIError.unavailable` with a sentence for the user. Its own error text is not passed on.

---

## New service checklist

- [ ] `services/<name>/encore.service.ts` with `new Service("<name>")`.
- [ ] If it stores data: `db/db.ts` (`SQLDatabase` + `servicePool` + `drizzle`), `db/drizzle.config.ts`, and a `db:generate:<name>` script in `apps/api/package.json`.
- [ ] Tenant tables spread `defaultTableColumns` and `tenantColumns`, with `tenantIndex`; repositories extend `TenantRepository`.
- [ ] Controllers, services, repositories, schemas and interfaces in their folders; tests in `tests/`.
- [ ] Other services reach it through `_internal…` endpoints; it reaches them through `~encore/clients`.
- [ ] Data it copies from another service is kept current by that service's topic.

# Event Processing Patterns

How `apps/api` services tell each other what happened. The tools are Encore Pub/Sub (`Topic` / `Subscription`), transactional outboxes in `apps/api/lib/outbox`, and Encore `CronJob`s.

> Related:
> - [Database Standards](./database_standards.md) - why there are no foreign keys between services
> - [Repository Patterns](./repository_patterns.md) - transactions and `FOR UPDATE SKIP LOCKED`
> - [Testing Standards](./testing_standards.md)

---

## Why events

Each service has its own database, so nothing joins or cascades across services. Two needs follow:

- **Copies stay current.** Services keep copies of other services' text next to the id (a shipment shows its customer's name, an open quote too) so that their lists can be searched and exported. When the owner changes the text, it publishes an event and the copies are rewritten.
- **Deletes reach the other services.** When a shipment is deleted, invoicing, trucking, warehouse, warehouseConcept and fx retire their own rows for it.

---

## Topics

Each publishing service declares its topics in `services/<service>/topics.ts`, with the event interface next to them:

| Service | Topic | Published when |
|---|---|---|
| `customers` | `customer-changed` | a customer is edited, deleted or restored |
| `customers` | `contact-changed` | a contact person is edited or deleted |
| `shipments` | `shipment-deleted` | a shipment is soft-deleted (through the outbox) |
| `shipments` | `shipment-parties-changed` | a shipment's Customer or Customer's PIC text changed |
| `quotes` | `quote-renamed` | a sales quote's reference changed (through the outbox) |
| `warehouseConcept` | `warehouse-gate-stamped` | a gate stamp moved cargo in or out, or was voided (through the outbox) |

```typescript
import { Topic } from "encore.dev/pubsub";

export interface ShipmentDeletedEvent {
  shipmentId: string;
  companyId: string;
}

// Published when a shipment is (soft-)deleted, so services that keep rows for it (invoicing,
// warehouse, …) can retire them too: there are no foreign keys across service databases.
export const shipmentDeleted = new Topic<ShipmentDeletedEvent>("shipment-deleted", {
  deliveryGuarantee: "at-least-once",
});
```

Rules:

- Topic names are kebab-case and in the past tense (`customer-changed`, `quote-renamed`).
- Every topic is `at-least-once`, so every subscriber must be idempotent.
- Every event carries `companyId`. A subscriber runs without a signed-in user, and the event is how it knows which company the work belongs to.
- An event carries the ids and the values the subscribers copy (`companyName`, `label`, `deleted` on `customer-changed`; `from` / `to` on `quote-renamed`). Write the contract in the comment above the interface, including what subscribers must do.

---

## Subscriptions

One file per subscription in `services/<service>/subscriptions/<event>.subscription.ts`. The subscription name is `<service>-<event>`. The handler calls the subscribing service's own service or repository directly:

```typescript
import { Subscription } from "encore.dev/pubsub";
import { shipmentDeleted } from "../../shipments/topics";
import { jobRateRepository } from "../repositories/jobRate.repository";

// No foreign keys cross service databases: a deleted shipment's rate lock is retired here.
export const fxShipmentDeleted = new Subscription(shipmentDeleted, "fx-shipment-deleted", {
  handler: async ({ shipmentId, companyId }) => {
    await jobRateRepository.softDeleteForShipment(companyId, shipmentId);
  },
});
```

- **Throw to retry.** A handler that throws gets the message again later (Encore's retry; no subscription sets its own `retryPolicy`). Don't catch and swallow errors that a retry could fix.
- **Be idempotent.** Write the new value instead of applying a change ("set the name to X", "soft-delete where still live"), so a second delivery does nothing new.
- **Read the owner's current state when order matters.** Deliveries can come out of order. `shipments`' `partyLinksService.customerChanged` takes the customer's name as the Customer Database holds it *now*, not the possibly older name in the event.
- **Know a redelivery.** `isRedelivery()` (`services/shipments/lib/delivery.ts`) is true when Encore's `currentRequest().deliveryAttempt > 1`. The shipments party-links handler then re-announces every affected shipment, because it cannot know what the failed attempt already wrote.

Subscriptions currently in use: customers (`quote-renamed`), sales (`customer-changed`, `quote-renamed`), quotes (`customer-changed`, `contact-changed`), shipments (`customer-changed`, `contact-changed`, `quote-renamed`), trucking (`customer-changed`, `quote-renamed`, `shipment-deleted`, `warehouse-gate-stamped`), warehouse (`shipment-deleted`), warehouseConcept (`shipment-deleted`, `shipment-parties-changed`), invoicing (`shipment-deleted`, `quote-renamed`), fx (`shipment-deleted`).

---

## Publishing: directly or through an outbox

### Directly, after the write

`topic.publish(event)` after the database write has committed, outside its transaction. Use it when a lost event can be repaired. `customers` publishes `customer-changed` like this:

- For an edit, a failed publish fails the request, so the user sees it and saves again.
- For a delete or restore (which cannot simply be repeated), a failed publish is only logged.
- Copies that missed an event are repaired by the superadmin "links normalize" backfills in shipments, quotes, sales, trucking and warehouseConcept.

### Through a transactional outbox

Use an outbox when the event or call must never be lost and must never go out for a write that rolled back. The pattern:

1. In the **same transaction** as the change, insert a row into the service's outbox table. Either both commit or neither does.
2. **After the commit**, deliver that row straight away (for example `deliverShipmentEvents(shipmentId)` at the end of `shipmentService` delete).
3. Whatever could not be delivered then, a **cron job** retries every minute, with backoff.

The outbox tables:

| Table (service) | Delivers |
|---|---|
| `shipment_event_outbox` (shipments) | publishes `shipment-deleted` |
| `quote_event_outbox` (quotes) | publishes `quote-renamed` |
| `warehouse_gate_event_outbox` (warehouseConcept) | publishes `warehouse-gate-stamped` |
| `warehouse_shipment_outbox` (warehouseConcept) | calls Shipments: received / released dates and plates from gate stamps |
| `trucking_outbox` (trucking) | calls Shipments, Invoicing and the warehouse: planned dates and plates, delivered date, Billing, Trucking cost lines, POD files, expected arrivals |
| `invoice_followup_outbox` (invoicing) | calls Customers and Shipments after an invoice or credit note is issued: the customer's invoice list, the Credited mark, the shipment's statuses |

An outbox that calls another service makes the call **as the user who caused it** (`actingUserId` / `actingRole` on the row), passed as `authData` on the internal call. Shipment updates go through `sendShipmentUpdateAs()` (`lib/outbox/shipmentUpdateAs.ts`), which checks the user's role as it is now and marks the update `appWrite: true`.

### The shared outbox code (`apps/api/lib/outbox`)

- **`outbox.columns.ts`**: `outboxColumns` (`acting_user_id`, `acting_role`, `status`, `attempts`, `next_attempt_at`, `locked_until`, `last_error`, `sent_at`) and `outboxStatusCheck` (`status IN ('pending', 'sent', 'failed', 'cancelled')`). An outbox table also spreads `defaultTableColumns` and `tenantColumns`, and has its own target and payload columns.
- **`outboxRepository.ts`**: `OutboxRepository` (extends `TenantRepository`). Construct it with `{ orderKey, sentAfterCancelNote, wholeValueKinds? }`.
  - `claimDueRows(limit, scope?)` takes due `pending` rows with `FOR UPDATE SKIP LOCKED`, holds them for 2 minutes and adds one to `attempts`. The claim count is the token: only the run holding the latest claim can settle a row. Rows of one `orderKey` (for example one `shipment_id`) go out in creation order, one at a time. A row that failed for good does not hold the later ones back.
  - `markSent`, `markRetry`, `markFailed`.
  - `failedWhere` and `requeueFailed` (for "Send again"). `wholeValueKinds` cancels a failed row instead of resending it when a newer value of the same kind was sent since.
  - `unsentHealth`, `stalePending` (for warnings and the warehouse managers' cockpit).
- **`outboxDelivery.ts`**: pure delivery logic, with no database and no Encore runtime. `deliverOutboxRow(row, handlers)` sends one row and settles it as `sent`, `retry` or `failed`. `runOutboxDelivery({ claim, deliver, onError })` runs up to 5 rounds of 20 rows and never throws.
- **`outboxRetry.ts`**: `OUTBOX_MAX_ATTEMPTS = 15`; the next try after 2, 4, 8 … minutes, never more than 60. Error codes that a retry cannot fix (`not_found`, `invalid_argument`, `permission_denied`, `unauthenticated`, `failed_precondition`) fail the row at once.
- **`sendAgain.ts` / `serviceIdentity.ts`**: "Send again" requeues failed rows. A row written by a user who is no longer there is resent as the company's service identity ("Trucking (system)"), which can never sign in.

### A service's delivery code

From `services/shipments/services/shipmentEvents.service.ts`:

```typescript
const handlers: OutboxHandlers<ShipmentEventOutboxRecord> = {
  async send(row) {
    await shipmentDeleted.publish(row.event);
  },
  errorText: () => "The shipment's delete could not be published", // our own words, never upstream text
  async onFailed(row, error, err) {
    await shipmentEventOutboxRepository.markFailed(row.id, row.attempts, error);
    log.error(err, "shipments: shipment-deleted not published for good", { outboxId: row.id, shipmentId: row.shipmentId });
  },
  async onRetry(row, error, nextAttemptAt, err) {
    await shipmentEventOutboxRepository.markRetry(row.id, row.attempts, error, nextAttemptAt);
  },
  async onSent(row) {
    await shipmentEventOutboxRepository.markSent(row.id, row.attempts);
  },
};

/** Publishes what is due (with a shipment id, only that shipment's events). Never throws. */
export async function deliverShipmentEvents(shipmentId?: string) {
  return runOutboxDelivery({
    claim: (limit) => shipmentEventOutboxRepository.claimDue(limit, shipmentId),
    deliver: (row) => deliverOutboxRow(row, handlers),
    onError: (err) => log.error(err, "shipments: shipment event publish run failed"),
  });
}
```

---

## Cron jobs

A cron job calls an internal endpoint. The endpoint's name starts with `_cron`, and it is `expose: false` and `auth: false`, because the cron runs without a login:

```typescript
// controllers/_cronShipmentEventOutbox.controller.ts
startShipmentEventTimer();

export const _cronShipmentEventOutbox = api(
  { expose: false, auth: false, method: "POST", path: "/internal/shipments/event-outbox/deliver" },
  async (): Promise<ShipmentEventOutboxResponse> => deliverShipmentEvents(),
);

// crons/shipmentEventOutbox.cron.ts
export const shipmentEventOutbox = new CronJob("shipments-event-outbox", {
  title: "Publish shipment deletes",
  every: "1m",
  endpoint: _cronShipmentEventOutbox,
});
```

**Encore cron jobs do not fire under `encore run`.** Every outbox therefore also starts a one-minute `setInterval` timer (`startShipmentEventTimer()` and its siblings). The timer is started once, is `unref()`'d, and is skipped under vitest (`process.env.VITEST`). In the cloud both the cron and the timer run, and `SKIP LOCKED` claims keep them apart.

The cron jobs today:

| Cron | Schedule | Title (what it does) |
|---|---|---|
| `shipments-event-outbox` | every 1m | Publish shipment deletes (`shipment_event_outbox`) |
| `shipments-quote-links-reconcile` | every 1h | Reconcile quote ↔ shipment links |
| `quotes-event-outbox` | every 1m | Publish quote renames (`quote_event_outbox`) |
| `quotes-tariff-check` | `0 2 * * *` | Check the tariffs of quotes not yet sent |
| `fx-cnb-import` | `0,30 13-15 * * 1-5` | Import ČNB exchange rates |
| `trucking-shipment-outbox` | every 1m | Retry job updates from Trucking (`trucking_outbox`) |
| `warehouse-shipment-outbox` | every 1m | Retry shipment updates from the gate (`warehouse_shipment_outbox`, and publishes `warehouse_gate_event_outbox`) |
| `warehouse-storage-settled` | every 1h | Reopen Storage settled when storage becomes chargeable |
| `warehouse-customs-follow` | every 5m | Read customs status from Shipments for the gate |
| `invoicing-followups` | every 1m | Send invoice follow-ups (`invoice_followup_outbox`) |

Jobs that are not outboxes have local timers too (the ČNB import, the quotes tariff check, the warehouse storage and customs jobs), for the same reason.

Cron files live in `services/<service>/crons/<name>.cron.ts`. The quotes service declares its crons in the `_cron…` controller file itself.

---

## Testing

- Pure delivery and retry rules: `lib/tests/outbox.test.ts`.
- Services that publish: mock the topics module, for example `vi.mock("../topics", () => ({ customerChanged: { publish: vi.fn() }, contactChanged: { publish: vi.fn() } }))`, and assert what was published.
- Outboxes against a real database, including the claim, the ordering and concurrent runs: `services/shipments/tests/db/shipmentEvents.db.test.ts` and `services/trucking/tests/db/truckingOutbox.db.test.ts`. See [Testing Standards](./testing_standards.md#database-tests).

---

## Checklist

- [ ] Topic in `topics.ts`, kebab-case past tense, `at-least-once`, event has `companyId`, contract commented
- [ ] Subscription in `subscriptions/<event>.subscription.ts`, named `<service>-<event>`
- [ ] Handler is idempotent, throws to retry, and reads the owner's current state when order matters
- [ ] If losing the event is not acceptable: outbox row in the write's transaction, delivered after commit, retried by a cron
- [ ] Outbox table spreads `defaultTableColumns`, `tenantColumns`, `outboxColumns` and has `outboxStatusCheck`
- [ ] Repository extends `OutboxRepository` with the right `orderKey`
- [ ] `_cron…` endpoint is `expose: false, auth: false`; local minute timer started and skipped under vitest
- [ ] `errorText` and `last_error` are in our own words

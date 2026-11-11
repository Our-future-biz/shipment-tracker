# Naming Convention

How files, code, database objects and Encore resources are named in `apps/api`. Every example is a real name from the code. Folder layout is in [Folder Structure](folder_structure_and_naming.md).

---

## Files

All file names are camelCase, with a suffix that says what the file is.

| What | Pattern | Examples |
|---|---|---|
| Endpoint | `{entity}{Action}.controller.ts` | `customerGet.controller.ts`, `contactUpdate.controller.ts`, `holidayDelete.controller.ts`, `shipmentDelete.controller.ts` |
| Group of endpoints on one area | `{area}.controller.ts` | `orgUnit.controller.ts`, `tracking.controller.ts`, `gateMovement.controller.ts` |
| Internal endpoint | `_internal{What}.controller.ts` | `_internalCustomerRefs.controller.ts`, `_internalHolidaysCzNational.controller.ts` |
| Cron endpoint | `_cron{What}.controller.ts` | `_cronFxImport.controller.ts`, `_cronShipmentEventOutbox.controller.ts` |
| Service | `{entity}.service.ts` | `customer.service.ts`, `customerAddress.service.ts`, `shipmentFinancials.service.ts` |
| Service helper module | `{name}.ts` in `services/` | `fxScheduler.ts`, `houses.ts`, `ltlTrips.ts` |
| Repository | `{entity}.repository.ts` | `publicHoliday.repository.ts`, `shipment.repository.ts` |
| Table | `{entity}.schema.ts` | `publicHoliday.schema.ts`, `shipmentAudit.schema.ts` |
| Shared API types | `interfaces/interfaces.ts`, `interfaces/{area}.interfaces.ts` | `trucking/interfaces/portal.interfaces.ts`, `warehouseConcept/interfaces/gate.interfaces.ts` |
| Topics | `topics.ts` | `shipments/topics.ts` |
| Subscription | `subscriptions/{topic}.subscription.ts` | `shipmentDeleted.subscription.ts`, `quoteRenamed.subscription.ts` |
| Cron job | `crons/{job}.cron.ts` | `fxImport.cron.ts`, `invoiceFollowups.cron.ts` |
| Bucket | `storage/{name}Bucket.ts` | `attachmentBucket.ts`, `invoiceBucket.ts` |
| Pure helper | `lib/{name}.ts`, or `utils/{name}.utils.ts` in invoicing, quotes and sales | `invoiceCalc.ts`, `estimateCopy.utils.ts` |
| Test | `tests/…/{name}.test.ts`; database tests `{name}.db.test.ts` | `holidays.service.test.ts`, `truckingOutbox.db.test.ts` |

The endpoint's exported name matches its file: `customerGet` in `customerGet.controller.ts`, `_internalCustomerRefs` in `_internalCustomerRefs.controller.ts`. A few older internal endpoints have no prefix (see [Controllers](controllers_api_endpoints.md#kinds-of-endpoints)).

---

## TypeScript

| What | Style | Examples |
|---|---|---|
| Interface, type | PascalCase | `HolidayItem`, `ContactRole`, `AuthData`, `OutboxStatus` |
| Class | PascalCase | `HolidaysService`, `PublicHolidayRepository`, `TenantRepository` |
| Singleton instance | camelCase | `holidaysService`, `publicHolidayRepository` |
| Function, variable | camelCase | `requireRole`, `deliverShipmentEvents`, `companyId` |
| Constant | UPPER_SNAKE_CASE | `OUTBOX_MAX_ATTEMPTS`, `TICK_MS`, `REFS_CHUNK`, `USER_LOOKUP_UNAVAILABLE` |
| Boolean | `is…`/`has…`, or an adjective | `isUniqueViolation`, `isAdminLevel`, `includeDeleted` |

### Interface suffixes

| Suffix | Meaning | Examples |
|---|---|---|
| `…Request` / `…Response` | An endpoint's own input and output, named after the endpoint | `HolidayDeleteRequest`, `ContactUpdateResponse`, `CustomerGetResponse` |
| `…Item` | One row as the API returns it in a list | `HolidayItem`, `ContactItem`, `CustomerItem` |
| `…Detail` | One record with everything a detail page needs | `CustomerDetail` |
| `…Input` | What a service takes for a create or update | `HolidayRowInput`, `ContactInput` |
| `…Result` | What an action reports back | `HolidayImportResult`, `HolidayReadResult` |
| `…Event` | A Pub/Sub message | `ShipmentDeletedEvent`, `CustomerChangedEvent` |
| `…Record` / `New…Record` | A Drizzle row (select / insert); only in schemas, repositories, services and `lib/` | `PublicHolidayRecord`, `NewPublicHolidayRecord` |

### Closed sets

The code uses literal unions, not TypeScript `enum` (there are none). The database column is `text` with a CHECK constraint that allows the same values:

```typescript
export type CustomerStatus = "Active" | "Prospect" | "Inactive";
```

### Private members

Most classes use the `private` keyword (`private assertLookup(…)`). `#name` members appear in a few files (`#createToken(…)`). Either is fine; match the file you are in.

---

## Database

| What | Style | Examples |
|---|---|---|
| Table | snake_case, singular | `shipment`, `customer_address`, `public_holiday`, `app_user` |
| Tables of trucking and the warehouse | prefixed with the area | `trucking_trip`, `trucking_haulier_invoice`, `warehouse_gate_movement` |
| Column | snake_case; the TypeScript property is camelCase | `company_id` / `companyId`, `national_start` / `nationalStart` |
| Table constant | `{entity}Table` | `publicHolidayTable`, `shipmentAuditTable` |
| Index | `{table}_{columns}_idx` | `public_holiday_national_start_idx`, `shipment_audit_shipment_id_idx` |
| Tenant index | `{table}_company_id_idx` (from `tenantIndex`) | `public_holiday_company_id_idx` |
| Created-at index (non-tenant table) | `{table}_created_at_idx` (from `defaultTableIndexes`) | |
| Unique index | `{table}_{columns}_unique` mostly; a few say what they guarantee | `customer_address_one_billing`, `contact_one_main_per_customer` |
| CHECK constraint | `{table}_{column}_check`; a few say what they guarantee | `contact_role_check`, `customer_invoice_status_check`, `cnb_rate_rate_positive` |
| Database | the service's name | `new SQLDatabase("shipments")`. The `warehouse` service's is `warehouse_basic`; `warehouseConcept`'s is `warehouse` |

The table for users is `app_user`, because `user` is a reserved word in Postgres.

---

## Encore resources

| What | Style | Examples |
|---|---|---|
| Service | the folder name | `new Service("shipments")`, `new Service("warehouseConcept")` |
| Topic | kebab-case, past tense; constant camelCase | `new Topic<ShipmentDeletedEvent>("shipment-deleted")` as `shipmentDeleted` |
| Subscription | `{subscriber}-{topic}`; constant `{subscriber}{Topic}` | `"fx-shipment-deleted"` as `fxShipmentDeleted`, `"trucking-customer-changed"` as `truckingCustomerChanged` |
| Cron job | `{service}-{job}` | `"fx-cnb-import"`, `"shipments-event-outbox"`, `"invoicing-followups"` |
| Bucket | kebab-case; constant `{name}Bucket` | `new Bucket("shipment-attachments")` as `attachmentBucket` |
| Secret | UPPER_SNAKE_CASE | `secret("JWT_SECRET")`, `secret("ANTHROPIC_API_KEY")` |

---

## API paths

- kebab-case resource nouns, mostly plural: `/customer-contacts/:id`, `/master-jobs/:masterJobId`, `/sales-quotes/:quoteNumber`, `/warehouse-concept/...`.
- The path parameter is named after what it holds: `:shipmentId`, `:quoteNumber`, `:token`.
- Internal: `/internal/{area}/...` (auth: `/auth/internal/...`). Link pages: `/public/...`. Haulier portal: `/portal/...`.

---

## Words

Use the business's own words, as the screens show them: job number, master job, quote reference, Costs Breakdown, haulier, consignment, trip, gate movement. Where the trade uses a Czech word, the code keeps it (`avizace.interfaces.ts`; the visit kind `"výdej"`).

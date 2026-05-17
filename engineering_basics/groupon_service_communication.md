# Groupon Service Communication (GRPNService)

## Overview

Encore services communicate with **existing Groupon services** (non-Encore, legacy) using the `GRPNService` class from the `@grpn/service` package. This is fundamentally different from Encore-to-Encore communication which uses type-safe generated clients (`~encore/clients`).

### When to Use What

| Communication type | Tool | Example |
|-|-|-|
| Encore → Encore | `~encore/clients` | `await user._internalUserCreate(...)` |
| Encore → Legacy Groupon service | `GRPNService` | `await grpnService.request().setEndpoint("v2/deals/...").execute()` |
| Encore → Legacy event bus | MBUS bridge | See [MBUS in Encore](../advance_functions/mbus_groupon_legacy.md) |
| Frontend → Encore | Generated client | See [Groupon Clients for Frontends](../monorepo-and-config/distributed-clients-package.md) |

---

## How Routing Works

`GRPNService` automatically selects the correct routing strategy based on the runtime environment. Developers do not need to configure this — it happens transparently at request time.

### Routing Decision

```
Is this a local environment?
├── YES → Route via Edge Proxy
└── NO (deployed)
    └── Is this a cross-cluster request?
        ├── YES → Route via Edge Proxy
        └── NO (same cluster) → Direct service-to-service
```

### Local Development — Edge Proxy

In local development, all requests go through the **edge proxy**. The proxy routes the request to the correct service in the target environment.

```
URL pattern:
  http://edge-proxy--{environment}--default.{apiEnv}.{location}.groupondev.com/{endpoint}

Example (staging, US):
  http://edge-proxy--staging--default.stable.us-central1.gcp.groupondev.com/v2/deals/abc

Headers:
  Host: deal-management-api.staging.service    ← tells the proxy which service to reach
```

The `Host` header is critical — the edge proxy uses it to route the request to the correct backend service.

### Deployed Environments — Direct Connection (Same Cluster)

When the Encore service runs in a deployed environment (staging, production) and the target service is in the **same cluster**, requests go directly to the service via internal DNS.

```
URL pattern:
  http://{serviceName}.{environment}.service/{endpoint}

Example:
  http://deal-management-api.staging.service/v2/deals/abc
```

No `Host` header is set — the URL itself resolves to the correct service. This is faster and avoids the proxy hop.

### Deployed Environments — Edge Proxy (Cross-Cluster)

When the Encore service and the target service are in **different clusters**, requests fall back to the edge proxy even in deployed environments. This happens in two scenarios:

1. **Explicit cross-region call** — e.g. US service calling EU service with `location: Location.EU_WEST_1`
2. **Cross-cloud EU call** — e.g. staging EU (GCP) calling production EU (AWS), because they are in different clusters

---

## Cluster Topology

Understanding the cluster layout is essential for cross-cluster routing:

| Encore Environment Name | Cloud | Location | Cluster |
|-|-|-|-|
| `staging-us-central1` | GCP | `us-central1.gcp` | US |
| `prod-us-central1` | GCP | `us-central1.gcp` | US |
| `staging-europe-west1` | GCP | `europe-west1.gcp` | EU Staging |
| `production-europe-west1` | AWS | `eu-west-1.aws` | EU Production |

Key insight: **In the US**, staging and production share the same cluster (GCP `us-central1`). **In the EU**, staging (GCP) and production (AWS) are in **different clusters and different cloud providers**. This means:

- US staging → US production = **same cluster** → direct connection
- EU staging → EU staging = **same cluster** → direct connection
- EU staging → EU production = **cross-cluster** → edge proxy
- EU production → EU staging = **cross-cluster** → edge proxy

`GRPNService` handles this automatically — the `isCrossCluster` check dynamically resolves the target location based on the runtime environment and the target environment.

---

## Basic Usage

### Simple Service (GET with clientId)

```typescript
import { GRPNService } from "@grpn/service";

class DealCatalogService {
  #dc: GRPNService;

  constructor() {
    this.#dc = new GRPNService({
      serviceName: "deal-catalog",
      clientId: {
        production: "f7b4ccaa2c70afd3-encore",
        staging: "f7b4ccaa2c70afd3-encore",
      },
    });
  }

  async searchDeals(categoryIds: string[], regionCodes: string[]) {
    return this.#dc
      .request()
      .setEndpoint("deal_catalog/v2/deals/search")
      .setGet()
      .setParam("categoryIds", categoryIds.join(","))
      .setParam("distributionRegionCodes", regionCodes.join(","))
      .execute();
  }
}
```

### Service with mTLS Certificates

Some Groupon services require certificate-based authentication. See [Certificate Management for Conveyor](certificates_for_conveyor.md) for how to generate and store certificates.

```typescript
import { GRPNService } from "@grpn/service";
import { secret } from "encore.dev/config";

const ENCORE_SERVICE_CERT = secret("ENCORE_SERVICE_CERT");
const ENCORE_SERVICE_CERT_KEY = secret("ENCORE_SERVICE_CERT_KEY");

class JanusService {
  #janus: GRPNService;

  constructor() {
    this.#janus = new GRPNService({
      serviceName: "janus-web-cloud",
      clientId: {
        production: "encore",
        staging: "encore",
      },
      cert: ENCORE_SERVICE_CERT(),
      key: ENCORE_SERVICE_CERT_KEY(),
      rejectUnauthorized: false,
    });
  }

  async fetchAvroSchema(schemaVersion: string) {
    return this.#janus
      .request()
      .setEndpoint("janus/api/v2/avro")
      .setGet()
      .setParam("schema_version", schemaVersion)
      .execute<{ schema: string }>();
  }
}
```

### POST with Headers and Body

```typescript
async createRedemptionTemplate(merchantId: string, dealId: string, payload: object) {
  return this.#metroDraft
    .request()
    .setEndpoint(`draft/merchants/${merchantId}/deals/${dealId}/redemption/instruction/template`)
    .setPost()
    .setHeaders({
      "x-api-key": API_KEY,
      "x-user-type": "internal",
      "X-USER-ID": USER_ID,
    })
    .setBody(payload)
    .execute<{ instructions: string[] }>();
}
```

---

## Regional / Cross-Cluster Communication

### Explicit Location (NA + EMEA clients)

When a service needs to reach the same Groupon service in different regions, create separate clients with the `location` option:

```typescript
import { GRPNService } from "@grpn/service";
import { Location } from "@grpn/interfaces";
import { isProduction } from "@core/runtime_utils/utils";

class GrpnUserService {
  #grpnUserNA: GRPNService;
  #grpnUserEMEA: GRPNService;

  constructor() {
    this.#grpnUserNA = new GRPNService({
      serviceName: "users-service",
      cert: ENCORE_SERVICE_CERT(),
      key: ENCORE_SERVICE_CERT_KEY(),
      rejectUnauthorized: false,
    });

    this.#grpnUserEMEA = new GRPNService({
      serviceName: "users-service",
      cert: ENCORE_SERVICE_CERT(),
      key: ENCORE_SERVICE_CERT_KEY(),
      rejectUnauthorized: false,
      location: isProduction() ? Location.EU_WEST_1 : Location.EUROPE_WEST1,
    });
  }
}
```

Note the EU location difference: production uses **AWS** (`EU_WEST_1`) while staging uses **GCP** (`EUROPE_WEST1`).

### Dynamic Location by Country

```typescript
import { Location } from "@grpn/interfaces";
import { isProduction } from "@core/runtime_utils/utils";

#getOrCreateClient(country: string = "US"): GRPNService {
  const intlLocation = isProduction() ? Location.EU_WEST_1 : Location.EUROPE_WEST1;
  const location = isINTL(country) ? intlLocation : Location.US_CENTRAL1;

  const cacheKey = `${country}-${location}`;

  if (!this.#clients.has(cacheKey)) {
    this.#clients.set(cacheKey, new GRPNService({
      serviceName: "api-lazlo",
      location,
    }));
  }

  return this.#clients.get(cacheKey)!;
}
```

---

## Dual-Environment Clients (Staging + Production)

Some services need to reach both staging and production simultaneously (e.g. for data comparison or migration). Use `setStaging()` / `setProduction()` after construction:

```typescript
class AttributionService {
  #stagingClient: GRPNService;
  #productionClient: GRPNService;

  constructor() {
    const config = {
      serviceName: "gpn-data-api",
      cert: ENCORE_SERVICE_CERT(),
      key: ENCORE_SERVICE_CERT_KEY(),
      rejectUnauthorized: false,
      clientId: { production: CLIENT_ID, staging: CLIENT_ID },
    };

    this.#stagingClient = new GRPNService(config);
    this.#stagingClient.setStaging();

    this.#productionClient = new GRPNService(config);
    this.#productionClient.setProduction();
  }
}
```

---

## Request Builder API Reference

Each call to `service.request()` creates a new isolated `GRPNRequestBuilder`. Requests are fully independent — concurrent requests never share state.

### Chaining Methods

| Method | Description |
|-|-|
| `.setEndpoint("path/to/api")` | Set the API endpoint (strips leading/trailing slashes) |
| `.setGet()` / `.setPost()` / `.setPut()` / `.setDelete()` / `.setPatch()` | Set HTTP method |
| `.setHeader("key", "value")` | Set a single header |
| `.setHeaders({ ... })` | Set multiple headers |
| `.setParam("key", "value")` | Add a query parameter (supports multiple values per key) |
| `.setBody({ ... })` | Set JSON request body |
| `.setFormData(formData)` | Set multipart form data |
| `.setValidStatusCodes([200, 201])` | Define which status codes are treated as success (default: `[200]`) |
| `.skipBodyForValidStatus()` | Return `{ status: "success" }` without parsing body |
| `.withRetry({ maxRetries: 5 })` | Configure retry behavior |
| `.withoutRetry()` | Disable retries for this request |
| `.execute<T>()` | Execute the request and return typed response |

### Constructor Options

| Option | Type | Description |
|-|-|-|
| `serviceName` | `string` | **Required.** Target Groupon service name (used in DNS hostname) |
| `environment` | `EnvironmentType` | Target environment. Default: auto-detected from runtime |
| `clientId` | `{ production?, staging? }` | Client ID appended as `?clientId=` query param |
| `location` | `LocationType` | Force target location for cross-cluster routing |
| `cert` / `key` | `Buffer \| string` | mTLS client certificate and key |
| `ca` | `Buffer \| string \| Array` | Custom CA certificate(s) |
| `rejectUnauthorized` | `boolean` | TLS verification (default: `true`) |
| `maxRetries` | `number` | Default retry count for all requests |
| `maxResponseSize` | `number` | Max response size in bytes (default: 20MB) |
| `errorInterceptor` | `Function` | Custom error handler for non-success responses |

### Retry Behavior

By default, `GRPNService` retries up to 3 times with exponential backoff (1s base, 8s max) on:
- 5xx status codes
- Transient network errors (ECONNRESET, ETIMEDOUT, etc.)
- Undici-specific timeout/socket errors

```typescript
// Custom retry configuration
await service.request()
  .setEndpoint("fragile/endpoint")
  .withRetry({ maxRetries: 5, baseDelayMs: 2000, maxDelayMs: 15000 })
  .execute();

// Disable retries for a specific request
await service.request()
  .setEndpoint("idempotent/endpoint")
  .withoutRetry()
  .execute();
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Encore Service (Runtime)                         │
│                                                                     │
│  GRPNService                                                        │
│  ├── serviceName: "deal-management-api"                             │
│  ├── environment: "staging" | "production"                          │
│  └── location?: forced target cluster                               │
│                                                                     │
│  request().setEndpoint("v2/deals/abc").execute()                    │
│       │                                                             │
│       ▼                                                             │
│  ┌──────────────────────────────────┐                               │
│  │     Routing Decision             │                               │
│  │  isLocal? → edge proxy           │                               │
│  │  isCrossCluster? → edge proxy    │                               │
│  │  otherwise → direct connection   │                               │
│  └──────────────────────────────────┘                               │
└─────────────┬────────────────────────────────┬──────────────────────┘
              │                                │
     LOCAL / CROSS-CLUSTER              SAME-CLUSTER DEPLOYED
              │                                │
              ▼                                ▼
┌──────────────────────────┐    ┌──────────────────────────────┐
│      Edge Proxy          │    │   Direct Internal DNS        │
│                          │    │                              │
│  edge-proxy--staging--   │    │  deal-management-api         │
│  default.stable.         │    │    .staging.service          │
│  us-central1.gcp.        │    │                              │
│  groupondev.com          │    │  http://deal-management-api  │
│                          │    │    .staging.service/          │
│  Host: deal-management-  │    │    v2/deals/abc              │
│  api.staging.service     │    │                              │
└──────────┬───────────────┘    └──────────────┬───────────────┘
           │                                   │
           ▼                                   ▼
┌─────────────────────────────────────────────────────────────┐
│              Target Groupon Service                          │
│              (deal-management-api)                            │
└─────────────────────────────────────────────────────────────┘
```

---

## Troubleshooting

### Request fails with DNS resolution error in deployed EU environment

The target service hostname (e.g. `deal-management-api.production.service`) only resolves **within the same cluster**. If you're in EU staging (GCP) calling EU production (AWS), these are different clusters. `GRPNService` handles this automatically via the `isCrossCluster` check, but if you're manually constructing URLs or have an older version, the request will fail.

### Request works locally but fails in deployed environment (or vice versa)

Local development always uses the edge proxy, which routes correctly regardless of cluster. Deployed environments use direct connections when possible. Check:
- Is the target service reachable via internal DNS from your cluster?
- Are certificates configured correctly for the target environment?

### HTTPS vs HTTP

- **Direct connections** (same-cluster deployed) use `http://` — internal traffic within the cluster does not require TLS.
- **Edge proxy** connections respect the `isUsingHttps` setting (auto-enabled when certificates are configured).
- To force HTTPS: call `service.useHttps()`.

---

## Related Documentation

- [Service Architecture & Patterns](service_architecture_patterns.md) — Encore-to-Encore internal communication via `~encore/clients`
- [Certificate Management for Conveyor](certificates_for_conveyor.md) — generating and storing mTLS certificates for `GRPNService`
- [MBUS in Encore](../advance_functions/mbus_groupon_legacy.md) — legacy event bus integration
- [Secrets & Environment Management](secrets_environment_management.md) — managing Encore secrets (certs, API keys)

---

## Source Code

The `GRPNService` implementation lives at:
- **Service class:** `apps/encore-ts/libs/grpn/service.ts`
- **Interfaces:** `apps/encore-ts/libs/grpn/interfaces.ts`
- **Tests:** `apps/encore-ts/libs/grpn/service.test.ts`
- **Package alias:** `@grpn/service` / `@grpn/interfaces`

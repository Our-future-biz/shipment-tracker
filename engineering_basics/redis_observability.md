# Redis Observability — Monitoring, Metrics, and Alerting

This monorepo has **two completely separate Redis systems**. They share nothing except the name "Redis." Understanding which one you're dealing with is the first step to any monitoring or debugging task.

## Table of contents

1. [Two Redis systems at a glance](#two-redis-systems-at-a-glance)
2. [Encore Cache (recommended)](#encore-cache-recommended)
   - [How it works](#how-it-works)
   - [Built-in observability](#built-in-observability)
   - [Grafana dashboards for Encore Cache](#grafana-dashboards-for-encore-cache)
   - [Alerting for Encore Cache](#alerting-for-encore-cache)
3. [Practical examples](#practical-examples)
4. [Debugging checklist](#debugging-checklist)
5. [Groupon Redis (legacy — being phased out)](#groupon-redis-legacy--being-phased-out)
6. [Related docs](#related-docs)

---

## Two Redis systems at a glance

| | Encore Cache | Groupon Redis (legacy) |
|---|---|---|
| **Implementation** | `encore.dev/storage/cache` — typed keyspaces via `CacheCluster` | `@core/databases/redis/redis.service.ts` — direct ioredis wrapper |
| **Managed by** | Encore Cloud (automatic provisioning, scaling, failover) | Manual deployment by infra team (Memorystore or VM-based) |
| **Used by** | 20+ TypeScript services via `appCache` | A handful of older services, pub/sub, distributed locks |
| **Observability** | Automatic traces in Encore Cloud + Prometheus metrics | Connection-level logging only (no metrics) |
| **For new services** | **Yes — always use this** | **No — do not adopt for new work** |
| **Infrastructure cost** | Included in Encore Cloud; no separate provisioning | Requires manual provisioning, monitoring, patching, scaling |

**Rule: all new caching work uses Encore Cache.** The Groupon Redis layer is documented here for operational awareness only — it is legacy infrastructure that we are gradually migrating away from.

---

## Encore Cache (recommended)

### How it works

Encore Cache is the native caching primitive from the Encore framework (`encore.dev/storage/cache`). It provides typed keyspaces with compile-time key validation, automatic serialization, and atomic operations — all backed by a Redis instance that Encore provisions and manages per environment.

**Key characteristics:**
- **Fully managed by Encore Cloud:** Provisioning, TLS, connection pooling, failover, and scaling are handled automatically — no hostnames, no secrets, no infra tickets
- **Local (`encore run`):** In-memory simulation (~100 keys, LRU eviction) — no external Redis needed
- **Staging / Production:** Encore provisions and manages the Redis instance per environment transparently
- **Single shared cluster:** One `app-cache` cluster for all services; keys isolated by `keyPattern` prefix per service
- **Eviction policy:** `allkeys-lru` — any key can be evicted under memory pressure regardless of TTL
- **Type-safe:** Every keyspace has a typed key and value — no string manipulation or JSON.parse at the call site

For the full usage guide (keyspace types, patterns, testing, anti-patterns), see [Caching — Encore CacheCluster & Keyspaces](../core-libraries-and-functions/caching.md).

### Built-in observability

Encore Cache operations are **automatically traced** in Encore Cloud. Each keyspace `get`/`set`/`increment` creates a traced span with:

- Operation type and key pattern
- Duration
- Cache hit/miss result
- Error (if any)

**To view:** Encore Cloud dashboard > Traces > filter by service name. Zero configuration needed.

Encore also exposes cache metrics via its Prometheus-compatible `/metrics` endpoint on each Cloud Run instance:

| Metric | Type | Description |
|--------|------|-------------|
| `cache_operation_duration_seconds` | Histogram | Latency per operation (get, set, delete, etc.) |
| `cache_operations_total` | Counter | Total operations by type and result (hit/miss/error) |

These are scrapeable by Grafana's Prometheus data source.

Additionally, Go services (`lrapi`, `autocomplete`) have custom production-proven metrics:

```go
// metrics/redis_metrics.go (Go services only)
var RedisLatency = metrics.NewGauge[float64]("lrapi_redis_duration_ms", metrics.GaugeConfig{})
var RedisRequests = metrics.NewCounterGroup[bool, uint64]("lrapi_redis_requests", metrics.CounterConfig{})
```

### Grafana dashboards for Encore Cache

A Redis health dashboard should include these panels:

| Panel | Query source | Why |
|-------|-------------|-----|
| **Cache hit rate** | `cache_operations_total{result="hit"} / cache_operations_total` | Dropping hit rate = stale keyspaces or eviction pressure |
| **Operation latency (p50/p95/p99)** | `cache_operation_duration_seconds` histogram | Latency spikes = Redis overloaded or network issues |
| **Operations per second** | `rate(cache_operations_total[5m])` | Traffic baseline; detect anomalies |
| **Error rate** | `cache_operations_total{result="error"}` | Any errors = connectivity or timeout issues |
| **Memory usage** | GCP Memorystore metrics or `INFO memory` | Approaching max = eviction storm imminent |
| **Connected clients** | GCP Memorystore metrics | Pool exhaustion detection |
| **Evicted keys/sec** | GCP Memorystore `evicted_keys` | High eviction = insufficient memory or hot keys |

If the Encore-managed Redis runs as GCP Memorystore, these native metrics are available in Cloud Monitoring:

- `redis.googleapis.com/stats/memory/usage_ratio`
- `redis.googleapis.com/stats/connected_clients`
- `redis.googleapis.com/stats/evicted_keys`
- `redis.googleapis.com/stats/cache_hit_ratio`
- `redis.googleapis.com/stats/commands_processed`

### Alerting for Encore Cache

| Alert | Condition | Severity | Action |
|-------|-----------|----------|--------|
| **Cache hit rate drop** | Hit rate below 50% for > 15 min | Warning | Check if keyspaces are misconfigured or keys expiring too fast |
| **High latency** | p95 > 50ms sustained for 5 min | Warning | Check Redis CPU, network, client count |
| **High eviction rate** | `evicted_keys` > 100/min for 10 min | Warning | Review memory allocation; consider requesting Encore increase instance size |
| **Error rate spike** | `cache_operations_total{result="error"}` > 1% of total for 5 min | Critical | Check Encore Cloud status, Cloud Run logs |

**Current state:** No automated alerts configured yet. Encore Cloud traces provide reactive debugging but no proactive alerting.

---

## Practical examples

### Using Encore Cache in a service

Add a typed keyspace to your service's `keyspaces.ts`:

```typescript
// apps/encore-ts/services/_tribe_b2b/my_service/keyspaces.ts
import { StructKeyspace, IntKeyspace, expireInMinutes, expireInHours } from "encore.dev/storage/cache";
import { appCache } from "@core/caching";

/**
 * Cached deal summary — avoids repeated DB lookups.
 * Pattern: "my_service:deal_summary/:dealId"
 * Expiry: 1 hour (sliding)
 */
export const dealSummaryKeyspace = new StructKeyspace<{ dealId: string }, { title: string; status: string }>(appCache, {
  keyPattern: "my_service:deal_summary/:dealId",
  defaultExpiry: expireInHours(1),
});

/**
 * Rate limit counter per user.
 * Pattern: "my_service:rate_limit/:userId"
 * Expiry: 5 minutes (sliding)
 */
export const rateLimitKeyspace = new IntKeyspace<{ userId: string }>(appCache, {
  keyPattern: "my_service:rate_limit/:userId",
  defaultExpiry: expireInMinutes(5),
});
```

Use it in a service method:

```typescript
import { dealSummaryKeyspace, rateLimitKeyspace } from "./keyspaces";

// Read-through cache pattern
async function getDealSummary(dealId: string) {
  const cached = await dealSummaryKeyspace.get({ dealId });
  if (cached) return cached;

  const fresh = await fetchFromDatabase(dealId);
  await dealSummaryKeyspace.set({ dealId }, fresh);
  return fresh;
}

// Atomic rate limiting (single Redis INCRBY — no race condition)
async function checkRateLimit(userId: string, limit: number) {
  const current = await rateLimitKeyspace.increment({ userId }, 1);
  return { allowed: current <= limit, current, limit };
}
```

For the full keyspace type reference, atomic operations, and testing patterns, see [Caching — Encore CacheCluster & Keyspaces](../core-libraries-and-functions/caching.md).

### Inspecting production Redis

Use the `redis-production-inspection` agent skill or run commands manually. **VPN required.**

```bash
# Connect to production Encore Redis
redis-cli -h encore.us-central1.caches.prod.gcp.groupondev.com -p 6379

# Quick health check
INFO memory          # memory usage, fragmentation ratio
INFO stats           # hit/miss counts, evicted keys
DBSIZE               # total key count

# Count keys for a specific service
redis-cli -h encore.us-central1.caches.prod.gcp.groupondev.com -p 6379 \
  --scan --pattern "my_service:*" | wc -l

# Sample values for a key pattern
redis-cli -h encore.us-central1.caches.prod.gcp.groupondev.com -p 6379 \
  --scan --pattern "feature_flags:flag/*" --count 10
```

The cache catalog (source of truth for hostnames) is at:
[`https://pages.github.groupondev.com/gds/gcp-caches/catalog-web/`](https://pages.github.groupondev.com/gds/gcp-caches/catalog-web/)

For the full inspection guide including scripted inspectors, TTL distribution analysis, and NDJSON streaming dumps, see the [redis-production-inspection skill](../../.agents/skills/redis-production-inspection/SKILL.md).

---

## Debugging checklist

When Redis/cache issues are suspected, first determine **which system** is involved:

### Encore Cache issues

1. **Check Encore Cloud traces** — filter by service, look for cache spans with errors
2. **Check key pattern** — verify the service's `keyspaces.ts` has correct `keyPattern` and TTL
3. **NoopCluster errors** — if cache operations silently return undefined, the service may not be registered as a CacheCluster consumer. See the [caching guide](../core-libraries-and-functions/caching.md) § "Why the split"
4. **Eviction pressure** — run `INFO memory` and `INFO stats` against the managed instance (see [production inspection guide](./redis_production_inspection.md))
5. **Key count baseline** — `DBSIZE` returns total keys; compare against expected baseline

### Groupon Redis (legacy) issues

1. **Check connection logs** — filter Cloud Logging for `"Redis"` or `"redis"` messages from the affected service
2. **Verify VPN** (staging) — local `redis-cli` should connect to `*.caches.stable.gcp.groupondev.com:6379`
3. **Check Encore secrets** — verify the secret format is `host::port::username::password::tls` with exactly 5 `::` separated parts
4. **Check the instance** — is the Memorystore instance running? Check GCP Console > Memorystore
5. **Check specific keys** — use `SCAN` with a pattern matching your service's key prefix

---

> **Everything below this line is about the legacy Groupon Redis layer that we are actively phasing out. Do not use it for new work. It is documented here only for operational reference when debugging existing services that still depend on it.**

---

## Groupon Redis (legacy — being phased out)

### Why it exists

Before Encore Cache existed, the monorepo used a manually deployed Redis infrastructure — the `RedisService` class (`apps/encore-ts/libs/core/databases/redis/redis.service.ts`). This is a direct ioredis wrapper that connects to Groupon-managed Redis instances (Memorystore or VM-based) via credentials stored in Encore secrets.

A handful of services still use it for:
- **Pub/sub** between services (Encore Cache does not support pub/sub)
- **Distributed locking** via `SET NX EX` pattern (`getLock()` method)
- **List operations** (`lrange`, `lpush`, `ltrim`) not available in Encore CacheCluster keyspaces
- **Legacy services** that predate Encore Cache adoption

### Why we decided not to use it

**The Groupon Redis infrastructure requires expensive manual operations:**

- **Manual provisioning** — someone must request and configure a Memorystore instance (or VM) per environment. Encore Cache provisions automatically.
- **Manual scaling** — when memory or connections are exhausted, an infra ticket is needed. Encore handles this transparently.
- **Manual TLS and credential rotation** — secrets are in the format `host::port::username::password::tls` and must be updated manually when instances change. Encore manages TLS end-to-end.
- **Manual monitoring** — the `RedisService` class has no metrics. You only learn about problems from connection error logs or user reports. Encore Cache has automatic tracing.
- **Manual patching** — Redis version upgrades and security patches require coordinated downtime. Encore patches its managed instances automatically.
- **No test infrastructure** — unlike Encore Cache which provides miniredis automatically in tests, the legacy layer requires either mocking or a running Redis instance.

**Bottom line:** every hour spent operating Groupon Redis is an hour not spent on product work. Encore Cache eliminates this entire category of toil.

### Current observability state

The `RedisService` class logs connection events but emits **no metrics**:

| Event | Log level | Meaning |
|-------|-----------|---------|
| `connect` | info | TCP connection initiated |
| `ready` | info | Redis ready for commands (`isConnected = true`) |
| `error` | error | Connection error (includes VPN hint for local dev) |
| `end` | warn | Connection closed (`isConnected = false`); reconnect in 10s |

Not tracked: operation latency, hit/miss rates, connection pool state, error rates per operation type.

### Connection health and retry strategy

| Setting | Local | Production |
|---------|-------|------------|
| Max retries per request | 1 | 20 |
| Reconnect interval | 10s | 10s |
| Offline queue | Disabled | Enabled |
| TLS | Disabled | Enabled |

Local fails fast intentionally — if VPN is disconnected, you get immediate feedback rather than 200s of retries.

**Secret format:**

```
host::port::username::password::tls
```

Example: `xxxxxx.caches.stable.gcp.groupondev.com::6379::null::null::{}`

The parser validates 5 parts, converts port to number, handles `"null"` as undefined. Empty TLS object `{}` means no TLS config.

---

## Related docs

- [Caching — Encore CacheCluster & Keyspaces](../core-libraries-and-functions/caching.md) — how to use Encore Cache (the recommended system): keyspace patterns, atomic ops, testing
- [Production Redis Read-Only Inspection](./redis_production_inspection.md) — hands-on inspection recipes for both systems
- [Encore PostgreSQL — Monitoring & Operations](./encore_db_monitoring_operations.md) — analogous monitoring guide for Postgres
- [Cloud Run Scaling & Concurrency Tuning](./cloud_run_scaling_tuning.md) — sizing the host service
- [Encore Cloud Incident Runbook](./encore_cloud_incident_runbook.md) — caching section for incident response

# 🎚️ Cloud Run Scaling & Concurrency Tuning

**The right knob is rarely the obvious one.** When a Cloud Run service starts queueing or rejecting traffic, this guide is the mental model + recipe to use. Read it once before tuning anything; refer back during incidents.

## Table of Contents

- [When to Read This](#when-to-read-this)
- [The Mental Model](#the-mental-model)
- [Knob Comparison](#knob-comparison)
- [The Decision Rule (Memorize This One)](#the-decision-rule-memorize-this-one)
- [Diagnostic Checklist](#diagnostic-checklist)
- [Tuning Recipe](#tuning-recipe)
- [Don't Lower the Platform Default to Fix One Service](#dont-lower-the-platform-default-to-fix-one-service)
- [Anti-Patterns](#anti-patterns)
- [Case Study: umapi-metrics, 2026-05-01](#case-study-umapi-metrics-2026-05-01)
- [Related Documentation](#related-documentation)

---

## When to Read This

- A `pending_request_count` alert fires on a Cloud Run service.
- A service is returning 503s (Cloud Run frontend rejection) or 504s (request-timeout overflows).
- A service's CPU or memory is sustained-high and you're considering bumping concurrency.
- You're standing up a new high-traffic service and trying to pick reasonable defaults.

If you're not sure whether to bump concurrency or instances, this is the doc.

---

## The Mental Model

A Cloud Run service's steady-state throughput is bounded by:

```text
throughput (req/s) ≈ max-instances × container-concurrency × (1 / avg-slot-time)
```

Three knobs, three different things:

- **`max-instances`** raises the *parallelism ceiling*. Each instance is its own 1 vCPU + memory budget. More instances = more total CPU/memory available.
- **`container-concurrency`** raises the *per-instance density*. More concurrent requests share the same 1 vCPU. Helps if the service is I/O-bound and CPU-idle; hurts if the service is already CPU-pinned.
- **`request-timeout`** caps the *slot occupancy*. A 5s timeout means each slot churns at most 1/5s = 0.2 req/s. A 1s timeout makes the same slot churn 5× faster.

Inbound demand `λ` matters too. When `λ > capacity`, requests pile up in Cloud Run's pending queue. When the pending queue exceeds Cloud Run's internal threshold (and the alert fires at our configured trigger, typically 100 pending), new requests get **503**. Slow responses then cap at the request timeout and emit **504**. Unhealthy upstreams emit **502**. The status-code distribution itself tells you which layer is failing.

---

## Knob Comparison

| Knob | What it changes | When it helps | When it hurts | Cost |
|------|----------------|---------------|---------------|------|
| `max-instances ↑` | More CPU + memory in parallel | CPU or memory sustained > 80% under load | Cold starts add tail latency on quiet→peak transitions | $$ — pay per instance-second |
| `container-concurrency ↑` | More requests share each instance's vCPU | Service is I/O-bound and CPU < 50% under load | Single vCPU saturates → all in-flight requests slow down → GC pressure → OOM risk | Free, but masks the real bottleneck if used wrong |
| `request-timeout ↓` | Faster slot churn | Upstream is slow / failing → slots wasted waiting | Cuts off legitimate slow responses → user-facing 504s | Free if upstream P99 < new timeout |
| `min-instances ↑` (≥ 1) | No cold start on first burst | Always-on traffic with quiet windows that go to 0 | Pays even when idle | $ — small; ~1 instance-month per `min=1` |
| `cpu-always-on` | CPU available outside requests | Background work / streams / cron that runs between requests | Pays for CPU when idle | $$ |

---

## The Decision Rule (Memorize This One)

> **If CPU > 85% sustained under load, scale instances. If CPU < 50% under load, you can scale concurrency.**

The corollary: **never bump concurrency on a CPU-pinned service.** It doesn't add capacity — it just means each request gets less CPU time, which makes every individual request slower, which makes slot occupancy *longer*, which reduces effective throughput. Concurrency is a negative-feedback knob in that regime.

---

## Diagnostic Checklist

When an alert fires, walk through these in order. Each step takes < 2 minutes via gcloud or the GCP console.

### Step 1 — Confirm the alert is real and pull status distribution

```bash
gcloud logging read \
  'resource.type="cloud_run_revision"
   AND resource.labels.service_name="<service>"
   AND httpRequest.status>=500' \
  --project=<project> --freshness=15m --limit=200 --format=json \
  | jq -r '[.[].httpRequest.status] | group_by(.) | map({s:.[0],n:length}) | sort_by(-.n) | .[]'
```

Read the layers:

| Dominant status | What it tells you |
|---|---|
| **Mostly 503s** | Cloud Run frontend is rejecting (capacity overflow at the front door) |
| **Mostly 504s** | Requests are reaching instances but hitting the request timeout (upstream slow or hung) |
| **Mostly 502s** | Upstream is erroring on connection or returning bad data |
| **Mix dominated by 503** | Cascading failure — the trickle that gets through hits 504/502 |

### Step 2 — Pull CPU + memory + instance count

The `gcloud monitoring` subcommand has no `time-series` reader — use the Cloud Monitoring REST API directly:

```bash
TOKEN=$(gcloud auth print-access-token)
END=$(date -u +%Y-%m-%dT%H:%M:%SZ)
START=$(date -u -v-30M +%Y-%m-%dT%H:%M:%SZ)

for METRIC in container/cpu/utilizations container/memory/utilizations; do
  echo "=== $METRIC ==="
  curl -s -H "Authorization: Bearer $TOKEN" \
    "https://monitoring.googleapis.com/v3/projects/<project>/timeSeries?\
filter=metric.type%3D%22run.googleapis.com%2F${METRIC//\//%2F}%22+\
AND+resource.labels.service_name%3D%22<service>%22\
&interval.startTime=$START\
&interval.endTime=$END\
&aggregation.alignmentPeriod=60s\
&aggregation.perSeriesAligner=ALIGN_PERCENTILE_99\
&aggregation.crossSeriesReducer=REDUCE_MAX" \
    | jq '.timeSeries[0].points | map(.value.doubleValue) | {min:min,max:max,avg:(add/length)}'
done
```

Read the numbers like a doctor:

| Reading | Verdict |
|---|---|
| **CPU max ≥ 90%** | Instance-bound. Bumping concurrency makes it worse. Add instances. |
| **CPU max 50–85%** | Healthy headroom. If queueing, the bottleneck is elsewhere (timeout, upstream, network). |
| **Memory max ≥ 85%** | Close to OOM. Bump memory before adding concurrency. Concurrent requests hold buffers + Node closures. |
| **Active instance avg ≈ max-instances cap** | Autoscaler wants to scale further but can't. Bump max-instances. |

### Step 3 — Measure the slot occupancy

Compute current capacity:

```text
capacity ≈ max_instances × container_concurrency / avg_request_latency_seconds
```

Compare to observed `λ` (req/s in). If `capacity < λ`, you have a structural deficit that no amount of CPU headroom will fix.

The fastest way to recover capacity in that regime: **drop the request timeout** if upstreams are timing out. A 5s → 1s drop multiplies effective slot throughput 5× without any cost increase.

### Step 4 — Check for hidden CPU sources

If CPU is high but the service code looks I/O-light, the cost is probably structural:

- **Dual TLS** (terminate inbound + originate outbound on every request) — pure proxies pay this twice per request.
- **GC pressure** from holding many concurrent request/response object graphs across long timeouts.
- **Connection-pool churn** (e.g., undici agent recreation every N requests for memory hygiene) — small but periodic CPU spikes.
- **Pipelining + keep-alive bookkeeping** at high concurrency.

These are not bugs. They're inherent costs of certain service shapes (proxies, fan-out clients, services with long upstream waits). The fix is to *give the service more CPU* (more instances), not to mask it with more concurrency.

---

## Tuning Recipe

Apply in this order. Stop when CPU drops below 75% under load and the queue clears.

1. **Drop request timeout** to ≤ p99 upstream latency + 200ms buffer. If upstream P99 is 800ms, set timeout to 1s. **Highest-leverage change for slot churn.**
2. **Bump `max-instances`** so peak CPU under load lands at 60–75%. Rule of thumb: if current CPU is at 96% with N instances, you need ⌈N × 96/72⌉ instances for headroom.
3. **Bump memory** if memory max > 85%. Cloud Run memory tiers are cheap relative to CPU; jump 1024 → 2048 MiB before fighting concurrency.
4. **Set `min-instances ≥ 1`** if quiet-period cold starts cause first-burst alerts. Cost is roughly 1 instance-month per unit.
5. **Reduce `container-concurrency`** if CPU is still > 85% after the above. Drop to whatever level keeps CPU at 70% under load — typically 50–70 for I/O-heavy proxies on 1 vCPU.
6. **Only then consider raising concurrency** if CPU is consistently < 50% under load. This is the rarest case in practice.

---

## Don't Lower the Platform Default to Fix One Service

Encore-TS / Cloud Run's per-service default of **100 concurrency** is reasonable for the majority of services in this monorepo. Most do some work, then await Postgres / Redis briefly, then return JSON — CPU-light, async, well-suited to high concurrency.

A small number of services (TLS-heavy proxies, fan-out clients) need lower concurrency. **Tune those individually rather than dropping the platform default.** A blanket 100 → 70 change cuts capacity 30% on services that don't need it while not actually fixing the ones that do — if 70 still saturates CPU, you'd just need 50.

The right platform-level change instead: **a Grafana panel that lists every service with its rolling p99 CPU utilization**, sorted descending. Anything sustained above 85% gets a per-service review. That's a one-day project and catches future umapi-metrics-shaped services before the alert fires.

---

## Anti-Patterns

- **Bumping concurrency on a CPU-pinned service.** Negative-feedback knob; reduces effective throughput.
- **Bumping max-instances without dropping the request timeout** when upstream is the bottleneck. You'll just buy more saturated instances.
- **Lowering platform default concurrency to "fix" one outlier.** Penalizes everyone.
- **Treating the 503 as the symptom to chase.** The 503 is Cloud Run's pressure-relief valve. The root cause is usually one of: CPU, memory, request timeout, or the upstream the proxy talks to.
- **Ignoring the success-rate trickle.** If the alert says "all 503", look harder — the trickle of 504/502 tells you whether the bottleneck is in front of the instance (503-only) or behind it (504/502).

---

## Case Study: umapi-metrics, 2026-05-01

Concrete numbers from a real incident — included so the reasoning above isn't abstract.

**Symptom:** Encore gateway pending-queue alert fires (peak 408 pending requests).

**Root cause via cross-service correlation:** `umapi-metrics-2c4fb0aa` (a TLS-terminating proxy from the Merchant Center frontend to `mx-merchant-api`) had its own pending queue at 1095 — almost 3× the gateway's. The gateway alert was downstream pressure, not a gateway bug.

**Config at incident:**

| Knob | Value |
|---|---|
| max-instances | 3 |
| container-concurrency | 80 |
| request-timeout | 5s |
| memory | 1024 MiB |
| min-instances | 0 |

**Observed metrics over 30 min during incident:**

| Metric | Value | Verdict |
|---|---|---|
| Inbound rate | 254 req/s sustained | Demand |
| Status distribution | 503: 99.997%, 504: 12, 502: 4, 200: 0 | Capacity collapse |
| Container CPU p99 | **96% peak, 66% avg** | CPU-pinned |
| Container memory p99 | **91% peak, 82% avg** | Near OOM |
| Active instances | 2.07 avg, 3 peak (= max) | Wanted to scale further, capped |
| Slot churn capacity | 3 × 80 / 5s = **48 req/s** | Demand 5× over capacity |

**Why almost everything was 503.** The 16 non-503 responses in 30 minutes split into 12 × 504 (each at exactly 5.000s — Cloud Run timing out requests that did get a slot but were waiting on slow upstream `mx-merchant-api`) and 4 × 502 (upstream errors). The instances that DID receive requests held slots for the full 5s timeout, so capacity dropped to 48 req/s while demand was 254 req/s — a permanently growing queue. 503 won because it's emitted *before* any instance work happens (20 ms decision time vs. 5000 ms slot occupancy).

**The fix, in two layers:**

1. **Demand side** — Merchant Center OTel client was running with no sampler (`AlwaysOnSampler`), 5s `BatchSpanProcessor` flush, and cumulative metric temporality. ~1000 active merchant browsers × default flush rate = ~250 export requests/sec. Fixes shipped via merchant-center-web PR #964:
   - `ParentBasedSampler(TraceIdRatioBasedSampler(0.05))` — 95% volume cut
   - `OTLPMetricExporter` switched to `DELTA` temporality
   - Metric export interval 60s → 120s
   - `merchant.id` added as Resource attribute (so backend can bucket by merchant — was previously invisible)
   - `FetchInstrumentation.ignoreUrls` includes the OTLP endpoints (avoid recursive tracing)

2. **Supply side** — umapi-metrics Cloud Run config:
   - `request-timeout` 5s → 1s (fastest single change; 5× slot churn improvement)
   - `max-instances` 3 → 4 (33% more CPU/memory budget)
   - `container-concurrency` held at 80 (the right move was *not* bumping to 90; CPU was already pinned, so concurrency was the wrong knob)
   - Recommended next: `memory` 1024 → 2048, `min-instances` 0 → 1, drop concurrency to 65 once stable

**Lessons embedded above** in this runbook — that's how this document got written.

---

## Related Documentation

- [Debugging Production Services](debugging_production_services.md) — broader catalogue of debugging tools (GCP Logging, Encore Cloud, Grafana). Use this for the discovery phase before tuning.
- [Encore Cloud Incident Runbook](encore_cloud_incident_runbook.md) — when to escalate to Encore support vs. self-serve; severity classification.
- [Setting up GCP Alerts with JSM](gcp-alerts-jsm-setup.md) — how to add new alert policies (and where the `pending_request_count` alert that motivated this runbook is configured).
- [Encore PostgreSQL — Monitoring & Operations](encore_db_monitoring_operations.md) — companion guidance for DB-backed services that may also need tuning.

---

**Authors:** Zev Blut & Encore on-call rotation. Updates welcome — file a PR if a new incident teaches us something this runbook misses.

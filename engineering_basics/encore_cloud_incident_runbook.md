# 🚨 Encore Cloud Platform — Incident Runbook

> **Groupon must fully triage and investigate before contacting Encore support.** This runbook exists to help Groupon engineers exhaust all self-service options first. The Encore incident contact is a last resort for platform-level failures that Groupon cannot resolve — not a first call when something looks broken.

## Table of Contents

- [Who Can Escalate](#who-can-escalate)
- [Step 1: Triage — Encore Cloud or Groupon?](#step-1-triage--encore-cloud-or-groupon)
- [Step 2: Severity Classification](#step-2-severity-classification)
- [Step 3: Escalation Contact Template](#step-3-escalation-contact-template)
- [Logging & Metrics](#logging--metrics)
- [Infrastructure](#infrastructure)
- [Deploy Status](#deploy-status)
- [Databases](#databases)
- [Caching](#caching)
- [PubSub](#pubsub)
- [Post-Incident Steps](#post-incident-steps)
- [Quick Reference Links](#quick-reference-links)

---

## Who Can Escalate

**Encore incident contact: `incident@encore.cloud`**

> ⚠️ This email pages Encore's on-call engineers directly. It should only be used after Groupon has fully triaged the issue and confirmed it is an Encore Cloud platform failure — not a Groupon application bug, misconfiguration, or bad deploy. Misuse wastes Encore engineering resources and damages the relationship.

Only these roles may contact Encore's incident channel:

| Role | When to escalate |
|------|-----------------|
| **Encore Team Lead / Staff Engineer** | Confirmed Encore Cloud infrastructure failure affecting production, after full Groupon triage |
| **IMOC (Incident Manager On-Call)** | When Encore Team Lead is unavailable and the incident is confirmed critical |
| **Groupon SRE / Oncall (Encore-aware)** | Only after completing the triage checklist below and ruling out all Groupon causes |

All other team members must raise the issue internally first:
- **Groupon Encore Hub (internal):** [#Encore Groupon Hub](https://chat.google.com/room/AAQAQEAUoTo?cls=7)
- **Shared Groupon–Encore channel:** [Groupon × Encore](https://chat.google.com/room/AAAAGWyKLWA?cls=7) *(Groupon + Encore employees — use this for cross-team escalation before paging)*

---

## Step 1: Triage — Encore Cloud or Groupon?

**Complete this checklist before escalating.** Every item must be investigated. If any Groupon-side cause is plausible, investigate and rule it out first.

### Groupon-side checks (do these first)

- [ ] Review recent deploys — did anything merge or deploy in the last 2 hours?
- [ ] Check for recent config or secret changes in Encore Cloud
- [ ] Verify the issue affects more than one unrelated service (single-service failures are almost always our code)
- [ ] Check Groupon application logs in GCP for stack traces or error patterns pointing to our code
- [ ] Test whether the issue is reproducible in a preview environment (rules out infra if preview is fine)
- [ ] Verify the issue is not a known Groupon bug or a feature flag problem

### Encore Cloud-side indicators (escalate only if these are true)

| Signal | What it means |
|--------|--------------|
| Multiple unrelated services failing with no recent Groupon changes | Likely platform-level |
| Encore Cloud dashboard itself is degraded or unreachable | Platform issue |
| Deploy failing at **infrastructure provisioning** (not build or test) | Platform issue |
| Database/cache unreachable from **all** services simultaneously | Platform issue |
| [Encore's status page](https://status.encore.dev) shows an active incident | Confirmed platform issue |

**If all Groupon-side causes are ruled out and Encore Cloud indicators are present → proceed to severity classification.**

If uncertain, post findings in the [Groupon × Encore](https://chat.google.com/room/AAAAGWyKLWA?cls=7) shared channel and ask before escalating.

---

## Step 2: Severity Classification

| Severity | Criteria | Response |
|----------|----------|----------|
| **P0 — Critical** | Production fully down; all services unreachable; data loss risk; no Groupon action can restore service | Contact Encore incident channel immediately after completing triage |
| **P1 — High** | Core functionality severely degraded or blocked; Groupon has exhausted all recovery options (rollback attempted, no config fix available); DB or deploy pipeline unavailable for > 30 min with no Groupon-side resolution path | Contact Encore incident channel if unresolved after 15 min of Groupon investigation |
| **P2 — Medium** | Non-critical services degraded; trace/metric ingestion broken; Groupon can partially work around | File an Encore support ticket; monitor for escalation |
| **P3 — Low** | Cosmetic dashboard issues; non-production environment only | File an Encore support ticket; no escalation needed |

> **P1 clarification:** P1 requires that Groupon has already attempted recovery (e.g., rolled back the last deploy, checked secrets, verified code) and the problem persists with no available Groupon-side fix. A P1 is blocked — not just slow or degraded.

---

## Step 3: Escalation Contact Template

Before sending, confirm:
- [ ] Triage checklist in Step 1 is complete
- [ ] All Groupon-side causes have been ruled out
- [ ] A team lead or IMOC has approved the escalation

Use this format and be precise — Encore's oncall needs enough context to act immediately.

```text
To: incident@encore.cloud
Subject: [P0/P1] GROUPON — <one-line description>

App ID: groupon-encore-83x2
Environment: prod-us-central1
Time detected: <ISO 8601 UTC timestamp, e.g. 2026-04-08T14:23:00Z>
Severity: P0 / P1

IMPACT
<Describe what is broken and user/business impact.
E.g., "All API calls returning 503 since 14:23 UTC. ~50k req/min affected.">

SYMPTOMS
- <Symptom 1>
- <Symptom 2>

GROUPON INVESTIGATION DONE
- Checked recent deploys: <last deploy SHA, time, any changes>
- Attempted rollback: <yes/no — outcome>
- Checked Encore Cloud dashboard: <findings>
- Checked Encore status page: <any active incidents>
- Logs show: <relevant error messages or trace IDs>
- Ruled out Groupon cause because: <explanation>

TIMELINE
- HH:MM UTC — First alert / user report
- HH:MM UTC — <Steps taken>
- HH:MM UTC — Current state

CONTACT
<Your name> — <Google Chat handle or email>
```

**After sending:** Post a summary in the [Groupon × Encore](https://chat.google.com/room/AAAAGWyKLWA?cls=7) shared channel with the email thread link and current status.

---

## Logging & Metrics

### Encore Trace Explorer

**URL:** `https://app.encore.cloud/groupon-encore-83x2/envs/prod-us-central1/trace-explorer?range=24h&groupBy=service`

- Shows distributed traces across all services
- Filter by status code, service name, duration, or trace ID
- Cross-reference with logs for full context

See the [Debugging Production Services](./debugging_production_services.md) guide for detailed trace analysis steps.

### GCP Cloud Logging

**URL:** `https://console.cloud.google.com/logs/query?project=prj-grp-encore-prod-f7b9`

Useful queries:
```text
# All errors from a service
resource.type="cloud_run_revision"
resource.labels.service_name="<service>"
severity="ERROR"

# Find by trace ID
trace="projects/prj-grp-encore-prod-f7b9/traces/<trace-id>"
```

### Grafana Metrics

**URL:** `https://prod-grafana.us-central1.logging.prod.gcp.groupondev.com/goto/FtUx9gFDR?orgId=1`

> Access requires Groupon SSO. If the link doesn't resolve, ensure you're on VPN or have an active SSO session.

Check `e_requests_total` (by error code) and `cloud.run/request_latencies` for error rate spikes.

---

## Infrastructure

### Checking Service & Infrastructure Health

**Encore Cloud dashboard:** `https://app.encore.cloud/groupon-encore-83x2/envs/prod-us-central1`

1. Navigate to the **Infrastructure** tab
2. Look for services in `degraded`, `stopped`, or `error` state
3. Click a service to see its Cloud Run instance metrics

**From Encore, link directly to GCP:**
- Infrastructure → Cloud Run Instances → click the arrow icon next to a service → opens GCP monitoring for that service

### Updating Infrastructure Settings

| What | How |
|------|-----|
| Scaling / resource limits | Defined in `encore.app` — requires a redeploy |
| Secrets | Update via Encore Cloud UI at `/settings/app/secrets` — no deploy needed |
| Tracing sample rate | Update at `/settings/app/tracing` — no deploy needed |

> ⚠️ Do not make infrastructure changes during an active incident without first confirming with the Encore team — changes can mask the root cause.

---

## Deploy Status

### Checking Recent Deploys

**URL:** `https://app.encore.cloud/groupon-encore-83x2/envs/prod-us-central1/deploys`

Lists all deploys with status, commit SHA, and logs. Failed deploys show detailed error output.

### Investigating a Failed Deploy

1. Open the failed deploy entry and read the full log
2. Distinguish the failure type:
   - **Build failure** (TypeScript/Go compile error, test failure) → fix in monorepo — this is a Groupon issue
   - **Infrastructure provisioning failure** (resource creation error, platform error) → possible Encore Cloud issue
3. If provisioning failure: check the [Encore status page](https://status.encore.dev) and post in [Groupon × Encore](https://chat.google.com/room/AAAAGWyKLWA?cls=7) before escalating

For automated log extraction, use the `encore-deployment-debugging` skill in Claude Code.

---

## Databases

### Checking Database Health

**URL:** `https://app.encore.cloud/groupon-encore-83x2/envs/prod-us-central1/infrastructure`

- Lists all PostgreSQL instances managed by Encore Cloud
- Check connection count, CPU utilization, and disk usage
- For deeper CloudSQL insights: `https://console.cloud.google.com/sql/instances/groupon-encore-8-11e7762e/overview?project=prj-grp-encore-prod-f7b9`

### Emergency DB Inspection (Read-Only)

Use the Encore MCP tools in Claude Code for diagnostic queries only:

```text
mcp__encore-mcp__get_databases       — list all databases and status
mcp__encore-mcp__query_database      — run a SQL query (read-only for diagnostics)
```

> ⛔ Never run `DELETE`, `DROP`, or `UPDATE` in production without a full rollback plan and explicit approval from the team lead.

### DB Connection Issues Checklist

1. Verify the DB shows `running` in Encore Cloud infrastructure view
2. Check active connection count — if at limit, services will queue/fail
3. Look for connection pool exhaustion errors in GCP logs
4. Check whether a recent Groupon deploy introduced a connection leak
5. If DB is confirmed down with no Groupon-side cause → document findings and escalate via the Encore incident contact

---

## Caching

> For ad-hoc read-only inspection of cache contents (key counts, slug distributions, sentinel checks) without admin access, see [Production Redis Read-Only Inspection](./redis_production_inspection.md).

### Cache Instance Health

**URL:** `https://app.encore.cloud/groupon-encore-83x2/envs/prod-us-central1/infrastructure`

Redis/Valkey instances are listed under infrastructure. Check:
- Memory usage (high → eviction → stale reads)
- Connection count
- Error/eviction rate

List all cache keyspaces defined in the app:
```text
mcp__encore-mcp__get_cache_keyspaces
```

### Cache Failure Response

1. If cache is unreachable, verify services degrade gracefully rather than crashing
2. Check whether a Groupon code change broke cache usage or connection handling
3. If cache is confirmed fully down at the infrastructure level with no Groupon-side cause → document and escalate via the Encore incident contact

Do not manually flush production cache without first understanding root cause.

---

## PubSub

### Checking PubSub Health

```text
mcp__encore-mcp__get_pubsub   — lists topics and subscriptions with current state
```

Warning signs:
- Subscriptions with high error counts
- Growing message backlog (producer running, consumer dead)
- Zero throughput on an active subscription

Check whether subscription errors point to Groupon handler code before assuming a platform issue.

---

## Post-Incident Steps

1. **Stabilize** — confirm all services healthy and error rates back to baseline
2. **Preserve evidence** — save relevant traces, GCP logs, and timeline notes before they expire
3. **Notify team** — post resolution summary in [Groupon × Encore](https://chat.google.com/room/AAAAGWyKLWA?cls=7) and [Encore Groupon Hub](https://chat.google.com/room/AAQAQEAUoTo?cls=7)
4. **Update Jira** — add timeline and resolution to the incident ticket
5. **Draft post-mortem** — what happened, timeline, root cause, action items
6. **Review escalation** — was the Encore incident contact used appropriately? Document in post-mortem
7. **Update this runbook** — if a new scenario is discovered, add it here

---

## Quick Reference Links

| Resource | URL |
|----------|-----|
| Encore Cloud production | `https://app.encore.cloud/groupon-encore-83x2/envs/prod-us-central1` |
| Trace explorer | `https://app.encore.cloud/groupon-encore-83x2/envs/prod-us-central1/trace-explorer?range=24h&groupBy=service` |
| Deploy history | `https://app.encore.cloud/groupon-encore-83x2/envs/prod-us-central1/deploys` |
| Infrastructure view | `https://app.encore.cloud/groupon-encore-83x2/envs/prod-us-central1/infrastructure` |
| Secrets management | `https://app.encore.cloud/groupon-encore-83x2/settings/app/secrets` |
| Tracing settings | `https://app.encore.cloud/groupon-encore-83x2/settings/app/tracing` |
| GCP logs (prod) | `https://console.cloud.google.com/logs/query?project=prj-grp-encore-prod-f7b9` |
| GCP CloudSQL insights | `https://console.cloud.google.com/sql/instances/groupon-encore-8-11e7762e/overview?project=prj-grp-encore-prod-f7b9` |
| Grafana Encore dashboard | `https://prod-grafana.us-central1.logging.prod.gcp.groupondev.com/goto/FtUx9gFDR?orgId=1` |
| Encore public status | `https://status.encore.dev` |
| Encore official docs | `https://encore.groupondev.com/` |
| Encore incident contact | `incident@encore.cloud` (authorized roles only — see above) |
| Internal Google Chat | [Encore Groupon Hub](https://chat.google.com/room/AAQAQEAUoTo?cls=7) |
| Shared Groupon–Encore channel | [Groupon × Encore](https://chat.google.com/room/AAAAGWyKLWA?cls=7) |

---

## Related Documentation

- [Debugging Production Services](./debugging_production_services.md) — traces, GCP logs, Grafana, common scenarios
- [Secrets & Environment Management](./secrets_environment_management.md)
- [GitHub Workflows & Branch-as-Environment](../monorepo-and-config/github-workflows-and-branching.md)

---

*Maintained by the Encore Core team. To suggest changes, open a PR or comment on [ENC-3484](https://groupondev.atlassian.net/browse/ENC-3484).*

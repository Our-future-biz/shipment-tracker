# 🛢️ Encore PostgreSQL — Monitoring & Operations

This page documents the operational dashboards and scheduled cron jobs used for monitoring, maintenance, and cost tracking of **Encore PostgreSQL databases** hosted on GCP.

All cron jobs are scheduled on the monitoring host under the user **`chyadav`**.

## Table of Contents

- [Dashboards](#dashboards)
  - [Backup Dashboard](#backup-dashboard)
  - [pgBadger Report Dashboard](#pgbadger-report-dashboard)
  - [Cost Monitoring Dashboard](#cost-monitoring-dashboard)
  - [Grafana Monitoring Dashboard](#grafana-monitoring-dashboard)
- [Scheduled Cron Jobs](#scheduled-cron-jobs)
  - [Bloat Monitoring](#bloat-monitoring)
  - [Cost Monitoring Data Collector](#cost-monitoring-data-collector)
  - [Sequence Utilisation Monitor](#sequence-utilisation-monitor)
  - [Invalid Index Checker](#invalid-index-checker)
  - [Inactive Replication Slot Monitor](#inactive-replication-slot-monitor)
  - [Replication Slot Size Monitor](#replication-slot-size-monitor)
  - [Monthly Backup](#monthly-backup)
- [Cron Schedule Summary](#cron-schedule-summary)

---

## Dashboards

### Backup Dashboard

| Field | Value |
|-------|-------|
| **URL** | [Backup Dashboard](http://db-catalog-dashboard.gds.prod.gcp.groupondev.com:5000/backups?engine=PG_ENCORE) |
| **Refresh Cadence** | Monthly (post-backup execution) |

Provides a consolidated view of all **monthly manual backups** taken for Encore PostgreSQL databases, including the corresponding backup location on the GCP Cloud Storage bucket. This is the single source of truth for backup audit and recovery reference.

---

### pgBadger Report Dashboard

| Field | Value |
|-------|-------|
| **URL** | [pgBadger Dashboard](http://db-catalog-dashboard.gds.prod.gcp.groupondev.com/pgbadger/encore/) |
| **Refresh Cadence** | Monthly |

Hosts **pgBadger** analysis reports generated monthly for all Encore database instances. Reports provide detailed query performance insights — including slow queries, query distributions, wait events, and lock statistics — to aid in **query optimisation and performance tuning**.

---

### Cost Monitoring Dashboard

| Field | Value |
|-------|-------|
| **URL** | [Cost Monitoring Dashboard](http://db-catalog-dashboard.gds.prod.gcp.groupondev.com:5010/costs) |
| **Refresh Cadence** | Daily |

Tracks and displays the **daily cost** of Encore database instances on GCP. Provides both an **aggregate cost summary** across all instances and a **per-instance cost breakdown**, enabling cost attribution, trend analysis, and budget forecasting.

---

### Grafana Monitoring Dashboard

| Field | Value |
|-------|-------|
| **URL** | [PostgreSQL Encore Grafana Dashboard](https://prod-grafana.us-central1.logging.prod.gcp.groupondev.com/d/df40dtj6ancaoc/postgresql-encore-dashboard?orgId=1&refresh=30s) |
| **Refresh Cadence** | Auto-refresh every 30 seconds (configurable) |

Provides **real-time and historical observability** into the health and performance of all Encore PostgreSQL instances. Surfaces key metrics including:

- CPU utilisation & memory usage
- Active connections & replication lag
- Transactions per second (TPS)
- Cache hit ratios & disk I/O
- WAL generation rate

This is the **primary operational dashboard** for on-call engineers and DBAs to detect anomalies, troubleshoot performance degradation, and validate the impact of configuration changes.

---

## Scheduled Cron Jobs

### Bloat Monitoring

| Field | Value |
|-------|-------|
| **Schedule** | `11 18 7 * *` — 7th of every month at 18:11 UTC |
| **Script** | `/var/groupon/data/pg_scripts/encore/pg_encore_bloat.sh` |

Detects **table and index bloat** across all Encore PostgreSQL instances. Bloat occurs when dead tuples accumulate due to `UPDATE`/`DELETE` operations and are not reclaimed efficiently by autovacuum. Left unchecked, excessive bloat degrades query performance, increases storage consumption, and leads to index inefficiency. This job identifies candidates for `VACUUM FULL` or `pg_repack`.

---

### Cost Monitoring Data Collector

| Field | Value |
|-------|-------|
| **Schedule** | `30 7 * * *` — Daily at 07:30 UTC |
| **Script** | `/var/groupon/data/pg_scripts/encore_dashboard/gcloud_cost_collector.py` |

Fetches daily billing and cost data from the **GCP Billing API** for all Encore database instances and persists it for the [Cost Monitoring Dashboard](#cost-monitoring-dashboard). Enables historical cost tracking and daily spend visibility.

---

### Sequence Utilisation Monitor

| Field | Value |
|-------|-------|
| **Schedule** | `30 6 * * *` — Daily at 06:30 UTC |
| **Script** | `/var/groupon/data/pg_scripts/encore/pg_encore_sequence_util.sh` |

Monitors the **utilisation percentage of all PostgreSQL sequences** across Encore instances. Sequences approaching their `max_value` cause application-level insert failures. This job provides early warning so sequences can be resized or cycled proactively before exhaustion.

---

### Invalid Index Checker

| Field | Value |
|-------|-------|
| **Schedule** | `30 7 * * *` — Daily at 07:30 UTC |
| **Script** | `/var/groupon/data/pg_scripts/encore/PG_ENCORE_Invalid_Index_Checker.sh` |

Scans all Encore instances for indexes marked as `INVALID` in `pg_index`. Indexes can become invalid due to failed `CREATE INDEX CONCURRENTLY` or `REINDEX` operations. Invalid indexes are not used by the query planner but still consume storage and incur write overhead. Corrective action: `REINDEX CONCURRENTLY` or `DROP INDEX`.

---

### Inactive Replication Slot Monitor

| Field | Value |
|-------|-------|
| **Schedule** | `*/30 * * * *` — Every 30 minutes |
| **Scripts** | `inactive_rep_slot_enocore_na_v1.sh` (NA) / `inactive_rep_slot_enocore_emea_v1.sh` (EMEA) |

Checks for **inactive replication slots** across both NA (`us-central1`) and EMEA (`europe-west1`) regions. An inactive replication slot prevents PostgreSQL from recycling WAL segments, which can lead to **unbounded WAL accumulation**, disk exhaustion, and ultimately instance downtime. High-frequency check ensures early detection and alerting.

---

### Replication Slot Size Monitor

| Field | Value |
|-------|-------|
| **Schedule** | `*/30 * * * *` — Every 30 minutes |
| **Scripts** | `slot_size_final_v1_na.sh` (NA) / `slot_size_final_v1_emea.sh` (EMEA) |

Monitors the **retained WAL size per replication slot** in both NA and EMEA regions. Even active slots can accumulate significant WAL if a subscriber falls behind. Tracks slot lag in bytes retained and triggers alerts when thresholds are breached, helping prevent disk pressure on the primary instance.

---

### Monthly Backup

| Field | Value |
|-------|-------|
| **Schedule** | `16 11 4 * *` — 4th of every month at 11:16 UTC |
| **Script** | `/var/groupon/data/pg_scripts/encore/pg_encore_backup.sh` |

Executes a **full logical/physical backup** of all Encore PostgreSQL databases and uploads the backup artifacts to a GCP Cloud Storage bucket. Backup metadata is reflected on the [Backup Dashboard](#backup-dashboard). This monthly backup is a **point-in-time recovery safeguard** supplementing GCP's automated backups.

---

## Cron Schedule Summary

| # | Job | Cron Schedule | Frequency | Region |
|---|-----|--------------|-----------|--------|
| 3.1 | Bloat Monitoring | `11 18 7 * *` | Monthly (7th) | All |
| 3.2 | Cost Data Collector | `30 7 * * *` | Daily | All |
| 3.3 | Sequence Utilisation | `30 6 * * *` | Daily | All |
| 3.4 | Invalid Index Checker | `30 7 * * *` | Daily | All |
| 3.5 | Inactive Replication Slot | `*/30 * * * *` | Every 30 min | NA / EMEA |
| 3.6 | Replication Slot Size | `*/30 * * * *` | Every 30 min | NA / EMEA |
| 3.7 | Monthly Backup | `16 11 4 * *` | Monthly (4th) | All |

---

> **Maintained by:** [GDS (Global Database Services)](https://chat.google.com/room/AAAAIGlgIi0?cls=7) — reach out on GChat for questions or escalations.

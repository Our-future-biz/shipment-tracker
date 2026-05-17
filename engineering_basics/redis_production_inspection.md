# 🔍 Production Redis Read-Only Inspection

How to inspect a production Redis instance from a developer laptop — count keys, sample values, check sentinel state, verify cache contents.

The canonical procedure lives as an agent skill at
[`.agents/skills/redis-production-inspection/SKILL.md`](../../.agents/skills/redis-production-inspection/SKILL.md).

The skill is the single source of truth and is auto-invoked by Claude / Cursor / similar agents when the user asks to inspect production Redis. Read it directly when you want to perform the inspection by hand — it covers:

- **Discovery** — finding the host:port via the internal cache catalog, no admin access needed.
- **Connection prerequisites** — VPN, no-auth nature of our shared caches, sanity-check commands.
- **Cheap O(1) recipes** — `INFO memory / stats / keyspace`, `DBSIZE`, sentinel `GET`, `MEMORY USAGE`.
- **Heavier read-only recipes** — `SCAN` cursor + `COUNT` + sleep; sampled `MGET` for value distribution; pipelined `TTL` for TTL distribution; full streaming dump to NDJSON.
- **Anti-patterns** — `KEYS`, `FLUSHDB`, `MONITOR`, embedded credentials, etc.
- **Sample scripts** — copy-paste-ready inspector, pattern counter, streaming dumper.

## Related

- [Cloud Run Scaling & Concurrency Tuning](./cloud_run_scaling_tuning.md) — adjacent topic for sizing the host service that backs a cache.
- [Encore Cloud Incident Runbook](./encore_cloud_incident_runbook.md) — Caching section cross-links the skill.
- [Temporal Platform Architecture](../temporal/platform_architecture.md) — cache-related secrets (`REDIS_COMMON_ENCORE`) are referenced here.

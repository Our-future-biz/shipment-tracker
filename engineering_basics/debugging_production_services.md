# 🔍 Debugging Production Services

**Ship fast, debug faster.** This guide shows you how to investigate issues in local, preview, and production environments.

## Table of Contents

- [Quick Start: Which Tool Do I Need?](#quick-start-which-tool-do-i-need)
- [Tools Overview](#tools-overview)
- [Local Development Debugging](#local-development-debugging)
- [Production & Staging Debugging with Encore Cloud Dashboard](#production--staging-debugging-with-encore-cloud-dashboard)
- [GCP Cloud Logging](#gcp-cloud-logging)
- [GCP Monitoring & Alerts](#gcp-monitoring--alerts)
- [Langfuse (LLM Tracing)](#langfuse-llm-tracing)
- [Common Debugging Scenarios](#common-debugging-scenarios)
- [Related Documentation](#related-documentation)
- [Need Help?](#need-help)

## Quick Start: Which Tool Do I Need?

```text
Is it working locally?
├─ NO → Check Local Development section below
└─ YES → Is it in preview  staging or production?
    ├─ Preview → Use Encore Cloud Dashboard
    └─ Production & Staging → Start here:
        ├─ TypeScript/Go service → Encore Cloud Dashboard
        ├─ LLM/AI issue → Langfuse/LiteLLM
        └─ Infrastructure/alerts → GCP Monitoring & Grafana
```

## Tools Overview

| Tool | Use For | Access | Auth Required |
|------|---------|--------|---------------|
| **Encore Cloud Dashboard** | TS/Go service traces, API calls, errors | [app.encore.dev](https://app.encore.cloud/groupon-encore-83x2) | GitHub SSO |
| **Grafana Encore Dashboard** | TS/Go custom metrics | [Grafana Encore](https://prod-grafana.us-central1.logging.prod.gcp.groupondev.com/goto/FtUx9gFDR?orgId=1) | SSO |
| **GCP Cloud Logging** | All service logs, raw log search | [GCP logs](https://console.cloud.google.com/logs/query;duration=PT30M?inv=1&invt=Ab4VTA&project=prj-grp-encore-prod-f7b9) | GCP ARQ |
| **GCP Monitoring** | Metrics, alerts, dashboards, uptime | [GCP monitoring](https://console.cloud.google.com/monitoring/metrics-explorer?inv=1&invt=Ab4VTA&project=prj-grp-encore-prod-f7b9) | GCP ARQ |
| **GCP Encore DB Inspection** | For Encore managed databases we can use GCP for deeper insights | [CloudSql Insights](https://console.cloud.google.com/sql/instances/groupon-encore-8-11e7762e/overview?inv=1&invt=Ab4VTA&project=prj-grp-encore-prod-f7b9) | GCP ARQ |
| **Local Encore Dev Dashboard** | Local API testing & debugging | [localhost:9400](http://localhost:9400) | None |
| **Langfuse** | LLM traces, prompt debugging, AI metrics | [Langfuse](https://langfuse.groupondev.com/) | Team access |
| **LiteLLM** | LLM proxy to our various supported LLM models | [LiteLLM](https://litellm.groupondev.com/) | Team access |


---

## Local Development Debugging

### Encore Dev Dashboard (localhost:9400)

When you run `encore run`, Encore automatically starts a local development dashboard at `http://localhost:9400`.

**What you can do:**
- 🔍 View all API endpoints in your app
- 🧪 Test endpoints with an interactive API explorer
- 📊 See request/response traces in real-time
- 🐛 Debug errors with full stack traces
- 📈 Monitor local performance

**How to use it:**

1. **Start your service locally:**
```bash
encore run
```

2. **Open the dashboard:**
Navigate to `http://localhost:9400` in your browser
![Encore Local Dev Dashboard](../.gitbook/assets/debugging/encore_local_dev_dashboard.png)

3. **Test an endpoint:**
- Click on any API endpoint in the list
- Use the API Explorer to send test requests
- Modify request parameters and body
- See responses immediately

4. **Debug a request:**
- Click on any request in the trace view
- Expand the trace tree to see all function calls
- View timing information for each step
- Check logs and errors inline

![Local Trace View](../.gitbook/assets/debugging/encore_local_dev_dashboard.png)

### Common Local Issues

#### "Service won't start"

**Symptoms:** `encore run` fails or service crashes immediately

**Debug steps:**
1. Check for compilation errors in terminal output
2. Verify all environment variables are set (check `encore.app`)
3. Check for port conflicts: `lsof -i :9400`
4. Ensure dependencies are installed: `npm install` or `pip install -r requirements.txt`
5. Check database migrations are up to date

#### "Endpoint returns error locally"

**Symptoms:** API returns 500 or unexpected error

**Debug steps:**
1. Open `http://localhost:9400`
2. Find the failed request in the trace view
3. Expand the trace to see which function failed
4. Check error message and stack trace
5. Add more logging if needed and restart service
6. Test again with API Explorer

#### "Can't connect to local database"

**Symptoms:** Database connection errors

**Debug steps:**
```bash
# Check if database is running
encore db proxy --env=local

# Connect to inspect
psql <connection-string-from-above>

# Check migrations
encore db migrations list
```

---

## Preview Environment Debugging

Preview environments are created automatically for each pull request.

### Accessing Preview Environments

**Via PR comment:**
Every PR automatically gets a comment with:
- 🔗 Preview URL (e.g., `pr123-groupon-encore-83x2.encr.app`)
- 🔗 Preview URL for Custom Frontend (e.g., `https://pr-2074-admin-react-fe-zknkp.ondigitalocean.app/`)
- 🔗 Encore Dashboard link for that preview
- 🚀 Deploy status

![GitHub PR Comment](../.gitbook/assets/debugging/github_pr_deploy_links.png )

**Via Encore Dashboard:**
1. Go to [app.encore.dev](https://app.encore.dev)
2. Select your application
3. Click "Environments" in sidebar
4. Find your preview environment (named after PR number)


### Debugging Preview Issues

**"Works locally, fails in preview"**

Common causes:
- ❌ Missing environment variables (not in `encore.app`)
- ❌ Database migration not applied
- ❌ External service configuration (wrong API keys)
- ❌ CORS or authentication differences

**Debug steps:**
1. Click the Encore Dashboard link from PR comment
2. Find the failing request in traces
3. Compare environment variables with local
4. Check logs for configuration errors
5. Verify database state with `encore db shell --env=pr123`

![Encore PR Dash](../.gitbook/assets/debugging/encore_pr_deploy_overview.png)


---

## Production & Staging Debugging with Encore Cloud Dashboard

### Accessing Encore Cloud Dashboard

1. Go to [app.encore.dev](https://app.encore.dev)
2. Sign in with GitHub SSO
3. Select your application
4. Switch to **Production** environment (top-left dropdown)

![Encore PR Dash](../.gitbook/assets/debugging/encore_env_selector.png)


### Understanding the Encore Dashboard

**Main sections:**

**Service Explorer:**
- Lists all services and endpoints
- Shows recent request volume
- Color-coded health status

**Traces:**
- Every API request gets a trace ID (Note: we sample traces, so not all traces may be recorded)
- Distributed tracing across service boundaries
- Timing information for each step
- Logs attached to specific trace spans

**Flow Chart:**
- Visual service dependency map
- See which services call which
- Helps understand request flow

![Encore PR Dash](../.gitbook/assets/debugging/encore_flow.png)


### Finding a Specific Request

**Option 1: Search by trace ID**

If you have a trace ID (from logs, http response header or user report):

1. Go to Traces tab
2. Paste trace ID in search box
3. View full distributed trace

**Option 2: Search by endpoint**

1. Go to Service Explorer
2. Find your service and endpoint
3. Click endpoint to see recent requests
4. Filter by status code, time range, or error

![Encore Trace Explorer](../.gitbook/assets/debugging/trace_explorer.png)

**Option 3: Search by time range**

1. Go to Traces tab
2. Set time range filter (top-right)
3. Add filters:
   - Status code (500, 404, etc.)
   - Service name
   - Endpoint path
   - Duration (slow requests)

### Analyzing a Trace

When you open a trace, you'll see:

**Trace Tree:**
- Hierarchical view of all operations
- Shows parent/child relationships
- Timing for each span (function/operation)

**Logs:**
- All log statements from this request
- Attached to specific spans
- Filterable by severity

**Request/Response:**
- Full request headers and body
- Response status and body
- Authentication info

![Encore Trace Details](../.gitbook/assets/debugging/trace_details.png)

Look for:
- ⚠️ Long-running operations (>100ms)
- 🔴 Failed operations (red indicators)
- 🔄 Repeated calls (N+1 queries)

### Common Encore Queries

**Find all errors in last hour:**
```text
Environment: Production
Time: Last 1 hour
Status: 500-599
```

**Find slow requests:**
```text
Environment: Production
Duration: >1000ms
Time: Last 24 hours
```

**Find requests from specific user:**
```text
Environment: Production
Search: user_id=12345
```

---

## GCP Cloud Logging

For logs not captured by Encore, or for raw log searching across all services.

### Accessing GCP Logs

1. Go to [console.cloud.google.com/logs](https://console.cloud.google.com/logs/query;duration=PT1H?inv=1&invt=Ab4VTA&project=prj-grp-encore-prod-f7b9)
2. Select project: `prj-grp-encore-prod`
3. Use the Logs Explorer interface

![GCP Logs Explorer](../.gitbook/assets/debugging/gcp_logs.png)


### Building Log Queries

**GCP uses a query language similar to SQL.**

**Basic structure:**
```text
resource.type="[RESOURCE]"
severity="[LEVEL]"
timestamp>="[TIME]"
jsonPayload.[FIELD]="[VALUE]"
```

### Common GCP Log Queries

**All errors from a service:**
```text
resource.type="cloud_run_revision"
resource.labels.service_name="your-service"
severity="ERROR"
timestamp>="2024-01-20T00:00:00Z"
```

**Find logs with specific trace ID:**
```text
trace="projects/groupon-production-12345/traces/abc123def456"
```

**Find logs with specific text:**
```text
resource.labels.service_name="your-service"
jsonPayload.message=~"database connection failed"
```

Or just type in `database connection failed` for a global search

**Find logs from specific user request:**
```text
jsonPayload.user_id="12345"
timestamp>="2024-01-20T10:00:00Z"
timestamp<="2024-01-20T11:00:00Z"
```

### Advanced Filtering

**Use the query builder UI:**
1. Click "Show query" to toggle between UI and text mode
2. Add filters with dropdowns:
   - Resource type
   - Log name
   - Severity
   - Time range
3. Switch to text mode for complex queries

**Useful operators:**

| Operator | Example | Description |
|----------|---------|-------------|
| `=` | `severity="ERROR"` | Exact match |
| `=~` | `message=~"timeout"` | Regex match |
| `:` | `"connection error"` | Contains |
| `>`, `<` | `timestamp>="..."` | Comparison |
| `AND` | `severity="ERROR" AND service="api"` | Logical AND |
| `OR` | `severity="ERROR" OR severity="CRITICAL"` | Logical OR |

### Exporting Logs

**For analysis or sharing:**

1. Run your query
2. Click "Actions" → "Download logs"
3. Choose format: JSON or CSV
4. Set row limit


---

## GCP Monitoring & Alerts

For infrastructure metrics, uptime monitoring, and alert management.

### Accessing GCP Monitoring from Encore

1. From the Encore Dashboard go to **Infrastructure**
2. Select **Cloud Run Instances**
3. Find the service you want
4. Click on the box with the arrow beside the service name to go straight to GCP monitoring dashboard for the service


![Encore Cloud Run Instances Action](../.gitbook/assets/debugging/encore_cloudrun_infra_gcp_link.png)

Clicking the circled button takes you here
![Encore GCP Metrics Dash](../.gitbook/assets/debugging/encore_gcp_service_metrics_dash.png)


### Accessing GCP Monitoring from GCP Directly

If you are in GCP already you can explore the metrics this way too:

1. Go to [console.cloud.google.com/monitoring](https://console.cloud.google.com/monitoring)
2. Select project: `prj-grp-encore-prod`
3. Use the Monitoring Console

### Key Monitoring Views

**Dashboards:**
- Pre-built dashboards for Cloud Run, databases, etc.
- Custom dashboards for service-specific metrics
- Real-time and historical data

**Metrics Explorer:**
- Ad-hoc metric queries
- Compare metrics across resources
- Create custom charts

**Alerting:**
- View fired alerts
- Alert history
- Configure alert policies

**Uptime Checks:**
- HTTP/HTTPS endpoint monitoring
- SSL certificate expiration
- Response time tracking

![Encore GCP Metrics Dash](../.gitbook/assets/debugging/encore_gcp_service_metrics_dash.png)

### Common Metrics to Check

**Service health:**
```text
Metric: cloud.run/request_count
Filter: service_name="your-service"
Group by: response_code_class
```

**Response times:**
```text
Metric: cloud.run/request_latencies
Filter: service_name="your-service"
Aggregator: 95th percentile
```

**Error rates:**
```text
Metric: cloud.run/request_count
Filter:
  service_name="your-service"
  response_code_class="5xx"
Aggregator: rate
```

**Database connections:**
```text
Metric: cloudsql.database/connections
Filter: database_id="your-db"
```

**Memory usage:**
```text
Metric: cloud.run/memory/utilizations
Filter: service_name="your-service"
Aggregator: mean
```

---

## Grafana Metrics

Encore sends custom metrics that are not part of GCP Cloud tooling to Grafana.

Whenever you use Encore’s Custom Metrics API, those metrics (including Encore-generated metrics) are sent to Grafana.
We have a default dashboard you can use here: [Grafana Encore](https://prod-grafana.us-central1.logging.prod.gcp.groupondev.com/goto/FtUx9gFDR?orgId=1)

![Encore Grafana Dash](../.gitbook/assets/debugging/grafana_dash.png)

From there, you can build custom dashboards and set alerts using our standard JSM + Grafana workflow.

### Encore's Framework Metrics
#### API Metrics

1. **`e_requests_total`** (Counter)
   - **Description:** Total number of API endpoint requests
   - **Labels:**
     - `service` - Service name (automatically added)
     - `endpoint` - Endpoint name
     - `code` - HTTP status code or error code (e.g., "ok", "invalid_argument", "internal")
   - **Runtime:** All (Go, TypeScript, Rust)

#### System Metrics (Go Runtime)

2. **`e_sys_memory_heap_objects_bytes`** (Gauge)
   - **Description:** Total bytes in heap objects (Go runtime memory)
   - **Labels:** `service` (automatically added)
   - **Runtime:** Go only

3. **`e_sys_sched_goroutines`** (Gauge)
   - **Description:** Current number of goroutines
   - **Labels:** `service` (automatically added)
   - **Runtime:** Go only

#### System Metrics (TypeScript/Rust Runtime)

4. **`e_sys_memory_used_bytes`** (Gauge)
   - **Description:** System memory usage in bytes
   - **Labels:** `service` (automatically added)
   - **Runtime:** TypeScript/Rust


---

## Langfuse (LLM Tracing)

For debugging AI/LLM features, prompt quality, and response issues.

### Accessing Langfuse

1. Go to [Langfuse](https://langfuse.groupondev.com/)
2. Sign in with provided credentials
3. Select the appropriate project

![Encore Grafana Dash](../.gitbook/assets/debugging/langfuse_dash.png)

### Understanding LLM Traces

Each LLM request creates a trace with:

**Trace information:**
- Request ID and timestamp
- User ID (if available)
- Session ID (for conversations)
- Total cost and token usage

**Span information:**
- Prompt sent to LLM
- Model used (GPT-4, Claude, etc.)
- Temperature and other parameters
- Response received
- Latency and token counts

![Encore Grafana Dash](../.gitbook/assets/debugging/langfuse_trace_details.png)

### Debugging LLM Issues

**"AI response is wrong/bad quality"**

**Debug steps:**
1. Find the trace by request ID or time range
2. Check the **actual prompt** sent to LLM
3. Verify prompt includes all necessary context
4. Check if context was truncated (token limits)
5. Review the raw LLM response
6. Check model parameters (temperature, max_tokens)

**Common issues:**
- ❌ Prompt missing user context
- ❌ Context truncated due to token limits
- ❌ Wrong model version used
- ❌ Temperature too high/low for use case

**"AI responses are slow"**

**Debug steps:**
1. Check trace latency breakdown
2. Look for:
   - Prompt token count (too many?)
   - Model used (GPT-4 is slower than GPT-3.5)
   - Sequential vs parallel calls
   - Retry logic firing
3. Check if streaming is enabled but not used


### Common Langfuse Queries

**Find all failed LLM requests:**
```text
Filter: status = "error"
Time: Last 24 hours
```

**Find expensive traces:**
```text
Sort by: Total cost (descending)
Threshold: >$0.10
```

**Find slow responses:**
```text
Filter: duration > 5000ms
Time: Last 7 days
```

**Find traces for specific user:**
```text
Filter: user_id = "12345"
Time: Custom range
```

---

## Common Debugging Scenarios

### Scenario 1: "My API Returns 500 Error"

**Symptoms:**
- API endpoint returns 500 status code
- May be intermittent or consistent
- Works locally or used to work

**Debug steps:**

1. **Get the trace ID** (if available)
   - From error response
   - From HTTP response headers
   - From user report
   - From monitoring alert

2. **Open Encore Dashboard**
   - Go to [app.encore.dev](https://app.encore.dev)
   - Switch to Production environment
   - Search for trace ID or filter by endpoint + time

3. **Analyze the trace**
   - Find which service/function threw the error
   - Check the error message and stack trace
   - Look at timing – did something time out?

4. **Check related logs**
   - Click "View in GCP Logs" from trace
   - Look for additional context around the error
   - Check for database errors, external API failures

5. **Common causes and fixes:**

| Cause | How to Identify | How to Fix |
|-------|----------------|------------|
| Database timeout | Slow db_query span | Optimize query, add index |
| External API down | Failed HTTP span | Add retry logic, fallback |
| Null pointer error | Stack trace shows nil access | Add null checks, validation |
| Out of memory | No trace, service crashed | Check memory limits, optimize |
| Bad input data | Error on validation | Improve input validation |

6. **Verify the fix**
   - Deploy to preview environment first
   - Test with same inputs that caused error
   - Monitor for 24 hours in production

### Scenario 2: "Service is Slow"

**Symptoms:**
- API takes >2 seconds to respond
- Users reporting slowness
- High p95/p99 latencies in monitoring

**Debug steps:**

1. **Confirm the slowness**
   - Go to GCP Monitoring
   - Check `request_latencies` metric
   - Identify which percentile is affected (p50, p95, p99)
   - Note when slowness started

2. **Find a slow trace**
   - Go to Encore Dashboard
   - Filter by duration: >2000ms
   - Open a representative trace

3. **Analyze the waterfall**
   - Look for long-running spans
   - Common culprits:
     - 🐢 Database queries (>100ms)
     - 🐢 External API calls (>500ms)
     - 🐢 Large data processing
     - 🐢 N+1 query patterns

4. **Investigate the bottleneck**

**If database is slow:**
```sql
-- Check query plan
EXPLAIN ANALYZE [your-query];

-- Look for:
-- - Sequential scans (need index)
-- - High cost estimates
-- - Long execution time
```

**If external API is slow:**
- Check if it's always slow or intermittent
- Consider caching responses
- Add timeout to fail fast
- Run calls in parallel if possible

**If processing is slow:**
- Check data volume – is it growing?
- Profile code for hot paths
- Consider async processing for heavy work
- Cache expensive computations

5. **Common optimizations:**

✅ **DO:**
```typescript
// Fetch data in parallel
const [users, orders] = await Promise.all([
  getUsers(),
  getOrders(),
]);

// Use database indexes
CREATE INDEX idx_user_email ON users(email);

// Cache expensive operations
const cached = await cache.get(key);
if (cached) return cached;
```

❌ **DON'T:**
```typescript
// Sequential fetching (slow)
const users = await getUsers();
const orders = await getOrders();

// N+1 queries (VERY slow)
for (const user of users) {
  const orders = await getOrdersForUser(user.id);
}

// No caching (repeated work)
const result = await expensiveCalculation();
```

### Scenario 3: "Feature Works Locally, Fails in Production"

**Symptoms:**
- Feature works in `encore run`
- Works in preview environment
- Fails in production

**Debug steps:**

1. **Check environment differences**

**Compare configurations:**
- Environment variables (Encore dashboard → Settings)
- Database state (different data)
- External service endpoints (sandbox vs production)
- Feature flags

2. **Check for deployment issues**
```bash
# What's deployed?
git log --oneline origin/production -10

# Is my code there?
git log --oneline --grep="my-feature"
```

3. **Check for infrastructure differences**
- Scaling: local = 1 instance, production = many
- Concurrency: race conditions?
- Network: timeouts, firewalls, latency
- Resources: memory/CPU limits

4. **Compare traces**
- Run same request locally (check localhost:9400)
- Find same request in production (Encore dashboard)
- Compare trace trees side-by-side
- Look for missing spans, errors, timing differences

5. **Common causes:**

| Issue | How to Identify | Solution |
|-------|----------------|----------|
| Missing env var | Error mentions config | Add to `encore.app` |
| Wrong API key | 401/403 from external API | Update secrets in Encore |
| Database migration | SQL errors, missing columns | Apply migration |
| Caching issues | Stale data returned | Clear cache, fix TTL |
| Race condition | Intermittent failures | Add locking, use transactions |

---

## Related Documentation

- [Cloud Run Scaling & Concurrency Tuning](./cloud_run_scaling_tuning.md) - When a `pending_request_count` alert fires or you're picking instance/concurrency/timeout values
- [Encore Cloud Incident Runbook](./encore_cloud_incident_runbook.md) - When to escalate to Encore support
- [Error Handling Guide](./errors.md) - How to structure errors in code
- [Testing Standards](./testing_standards.md) - Prevent bugs with good tests
- [Code Standards](./code_standards_in_encore.md) - Write debuggable code
- [Onboarding Guide](../encore_first_steps/onboarding_new_developers.md) - Get access to debugging tools

---

## Need Help?

**Can't find what you need?**

1. Check existing logs for similar issues
2. Ask in [#Encore Groupon Hub](https://chat.google.com/room/AAQAQEAUoTo?cls=7) Google space
3. Tag @oncall for production incidents
4. Update this doc if you find a common pattern!

**Remember:** The best debugging tool is clear, structured logging. Future you will thank present you. 🙏

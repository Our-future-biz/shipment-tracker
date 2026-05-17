# 🔔 Setting up GCP Alerts with JSM

This guide walks you through creating a GCP Cloud Monitoring alert policy that fires notifications to **JSM (Jira Service Management)** and/or **Google Chat**. It also covers how to set up those notification channels from scratch.

## Table of Contents

- [Part 1: Creating a GCP Alert Policy](#part-1-creating-a-gcp-alert-policy)
- [Part 2: Setting up Notification Connectors](#part-2-setting-up-notification-connectors)
  - [Google Chat](#google-chat-connector)
  - [JSM](#jsm-jira-service-management-connector)

---

## Part 1: Creating a GCP Alert Policy

### Step 1 — Navigate to the Infrastructure page

Go to the Encore infrastructure page for the production environment:

[https://app.encore.cloud/groupon-encore-83x2/envs/prod-us-central1/infra](https://app.encore.cloud/groupon-encore-83x2/envs/prod-us-central1/infra)

### Step 2 — Find your service

In the **Cloud Run Instances** list, locate your service by name.

### Step 3 — Open the GCP metrics dashboard

Click the external link icon (arrow-in-box) next to your service name. This takes you directly to the GCP metrics dashboard for that service.

![Encore infra link to GCP metrics](../.gitbook/assets/gcp-alerts/gcp_alerts_infra_link.png)

### Step 4 — Create an alert policy

Hover over any chart in the GCP metrics dashboard. A **"Create alert policy"** button will appear in the chart header.

Click it to open the alert policy creation flow.

![Create alert policy button on chart hover](../.gitbook/assets/gcp-alerts/gcp_alerts_create_policy_hover.png)

### Step 5 — Add service-specific filters

In the **Filters** section, add filters to scope the alert to your service only. At minimum, add:

```
resource.labels.service_name = <your-service-name>
```

Add any additional filters relevant to the metric you are alerting on (e.g. `response_code_class = "5xx"`).

![Alert policy filters](../.gitbook/assets/gcp-alerts/gcp_alerts_filters.png)

### Step 6 — Set a threshold and alert name

Set an appropriate threshold value for the metric. Then name the alert policy using this convention:

```
[service-name][env] <alert description>
```

**Examples:**
- `[deal-reviews][prod] High 5xx Error Rate`
- `[workflow-core-deal-reviews][prod] Request Latency P95 > 5s`

![Alert threshold and name](../.gitbook/assets/gcp-alerts/gcp_alerts_threshold.png)

### Step 7 — Select notification channels

Click **"Manage Notification Channels"** and select the appropriate channels for your service. For example:

- A **Google Chat** space for your team
- A **JSM** webhook for incident management

See [Part 2](#part-2-setting-up-notification-connectors) if you need to set these channels up first.

After selecting channels:
- Add a **Notification subject line** that describes the alert clearly.
- Optionally enable **"Notify on autoclose"** to get a resolution notification.
- Configure an **autoclose duration** if desired.

![Notification channel selection](../.gitbook/assets/gcp-alerts/gcp_alerts_notification_channels.png)

### Step 8 — Add labels, runbook, and severity

In the **Labels** section, add the following:

| Label | Required | Example |
|-------|----------|---------|
| `service_name` | Yes | `deal-reviews` |
| `environment` | Yes | `prod` |
| `api_name` | If alert is API-scoped | `_generateAISummary` |

In the **Documentation** section, paste a link to your team's runbook on Confluence. If you don't have one yet, create it first — a runbook should describe what the alert means, initial triage steps, and escalation path.

Set an appropriate **Severity** level:

| Severity | When to use |
|----------|-------------|
| Critical | Service is down or data is at risk |
| Error | Significant degradation, users impacted |
| Warning | Early warning, not yet user-impacting |
| Info | Informational, no action required |

![Labels, runbook link, and severity](../.gitbook/assets/gcp-alerts/gcp_alerts_labels_severity.png)

### Step 9 — Name, review, and create

Give the alert policy its final name (same as Step 6 convention), review all settings, and click **"Create Policy"**.

---

## Part 2: Setting up Notification Connectors

You only need to do this once per channel. After a channel is set up, it is available to all alert policies in the project.

### Google Chat Connector

1. **Create a Google Chat space** for your team's alerts (e.g. `#team-alerts-prod`).
2. **Add the Google Cloud Monitoring app** to the space:
   - Open the space → click the space name → **Apps & integrations** → search for **"Google Cloud Monitoring"** → add it.
3. **Copy the Space ID** from the space URL (the alphanumeric string after `/room/`).
4. In GCP → **Monitoring** → **Notification Channels** → add a new **Google Chat** channel → paste the Space ID.

![Google Chat space with Cloud Monitoring app added](../.gitbook/assets/gcp-alerts/gcp_alerts_gchat_setup.png)

### JSM (Jira Service Management) Connector

1. **Navigate to your team's Operations Home** → **Integrations** tab. The URL looks like:
   ```
   https://groupondev.atlassian.net/jira/ops/teams/<your-team-id>/integrations
   ```

2. Click **"Add integration"**, then search for and select **"Google Cloud's operations suite"**.

   ![JSM integrations — add Google Cloud's operations suite](../.gitbook/assets/gcp-alerts/gcp_alerts_jsm_integration.png)

3. JSM will generate an **API key** (requires the appropriate JSM permissions).

4. In GCP → **Monitoring** → **Notification Channels** → add a new **Webhook** channel with the URL:
   ```
   https://api.atlassian.com/jsm/ops/integration/v1/json/googlestackdriver?apiKey=<YOUR_API_KEY>
   ```

   ![JSM webhook URL in GCP Notification Channels](../.gitbook/assets/gcp-alerts/gcp_alerts_jsm_webhook.png)

The channel is now available to select in any alert policy.

---

## Related Documentation

- [Debugging Production Services](./debugging_production_services.md) — GCP Monitoring metrics reference and common queries
- [Encore Cloud Incident Runbook](./encore_cloud_incident_runbook.md) — What to do when an alert fires

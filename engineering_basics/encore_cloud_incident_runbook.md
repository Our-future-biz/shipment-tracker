# Incident Checklist

For a small team, where one person checks, fixes or rolls back, and tells the users. The tools are described in [Debugging](debugging_production_services.md). The SQL and the cron list are in [Databases, Backups and Scheduled Jobs](encore_db_monitoring_operations.md).

## 1. Scope it

- One user, one company, or everyone? Superadmins work as the company chosen in the switcher.
- Since when? Did it start with a deploy? See the deploy list in the Encore Cloud dashboard.
- Is it the web app, or the API? If the page loads but every call fails, look at the API, CORS and auth.

## 2. Check, in this order

### Auth

| Symptom | Likely cause |
|---|---|
| Everyone is signed out, or "Invalid or expired token" | `JWT_SECRET` was changed, or is missing (`JWT_SECRET is not configured` in the logs). See [Secrets and Configuration](secrets_environment_management.md). |
| One person: "Too many failed sign-ins" | The login throttle (`services/auth/services/auth.service.ts`). See the note below the table. |
| A deactivation or role change "doesn't work" | It reaches every instance within 30 s (the session cache). |
| A superadmin sees the wrong company's data | Check the company switcher (`X-Acting-Company`). |

The login throttle works like this:

- **Per IP address:** 30 failures in 15 minutes lock that address for 15 minutes, doubling up to 24 hours.
- **Per e-mail:** 10 failures in 15 minutes lock that e-mail for 15 minutes, doubling up to 1 hour.

The state is in `login_throttle` in the `auth` database. The keys are `ip:<ip>`, `mail:<email>` and `ipmail:<ip>|<email>`. Deleting the row unlocks it, which needs `--write`.

### Outbox crons

Symptoms:

- A trucking date, plate, Billing or Costs line does not reach the job.
- A gate stamp does not update the shipment.
- An issued invoice's status does not reach the customer or the shipment.
- A deleted shipment or a renamed quote is still seen in other services.

To check:

- Search the logs for `failed for good`, `waiting longer than expected` or `delivery run failed`.
- Count the outbox rows by status (SQL in the database doc). A `pending` row whose `next_attempt_at` is long past means no delivery is running.
- Consignments show "Not sent to the job" under Needs attention. A manager can use **Send again** on a consignment, a trip or a gate record.

### ČNB exchange rates

Symptoms: admins see "ČNB rates missing" under the bell, a job says it has no rate for a currency, or a master job's EUR check figures are left out.

To check:

- Look at the Import log tab on the Exchange page, or at `cnb_import_run` (the `status` and `error` columns), and at the open `fx_alert` rows.
- The pulls run at 15:00, 15:30 and 16:00 Prague time on fixing days. An alert is raised only after the last one. No fixing on a weekend or holiday is not an incident.

To fix: **Sync now** on the Exchange page (admin or manager, `POST /fx/sync`). The alert closes by itself once the rates are in.

### AI document reading

| Message | Meaning |
|---|---|
| "The AI could not read the document just now" | Anthropic was unreachable, timed out, was overloaded or refused the request, or the key is missing or wrong (logs: `extraction: the AI did not answer`). Check that `ANTHROPIC_API_KEY` is set (`encore secret list`), and check the Anthropic account's credit and rate limits. |
| "Reading limit reached: at most 400 pages an hour per user" | The budget in `services/extraction/lib/readingBudget.ts`. It frees up as the hour rolls on. |
| "A pre-alert can have at most 200 pages" | Read the pre-alert in smaller batches. |
| "Pipeline session not found or expired" | Sessions last 30 minutes and are lost when the API restarts or redeploys. Upload again. |

### Outside services

The API calls ČNB (`api.cnb.cz`), ARES (`ares.gov.cz`, company lookup) and Anthropic. When one of them is down, only its own feature fails.

### Database

Look for pool errors ("timeout exceeded when trying to connect", "canceling statement due to statement timeout") in the traces. Connect read-only with `encore db shell <db> --env=<environment>`.

### Not incidents

"E-mail sending is disabled": e-mail is switched off on purpose (`apps/api/lib/email.ts`).

## 3. Fix or roll back

- **A bad change:** revert the commit and deploy again. A revert does not undo a migration that already ran. Write a new migration instead.
- **A data fix:** write the SQL first, run it in a transaction, and try it on a local copy before you run it in the cloud.
- **Encore Cloud itself looks down** (the dashboard, deploys, or every service at once, without a deploy of ours): check Encore's status and support channels.

## 4. Afterwards

- Tell the users, for example on the Dashboard notice board.
- Write down in a few lines what happened, when, the cause and the fix. If a code bug caused it, add a test that would have caught it.

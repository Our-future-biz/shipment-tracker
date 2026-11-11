# Secrets and Configuration

How the API (`apps/api`, Encore app `shipment-tracker-ysci`) and the web app (`apps/web`) get their secrets and settings.

## Secrets the API declares

A secret is declared once per file with `secret("NAME")` from `encore.dev/config`, at module level, and read by calling it (`jwtSecret()`). The API declares two:

| Secret | Declared in | Used for |
|---|---|---|
| `JWT_SECRET` | `services/auth/services/auth.service.ts` | Signs and checks login tokens (valid 24 hours). |
| | `services/shipments/lib/contentToken.ts`, `services/quotes/lib/chatFileToken.ts`, `services/customers/lib/logoUrl.ts` | Signs the short-lived tokens in file download and logo links, which the browser opens without the auth header. |
| | `services/warehouseConcept/services/pinKey.ts` | Key of the pick-up PIN HMAC. It reuses `JWT_SECRET` on purpose, so that no new secret blocks deploys. |
| `ANTHROPIC_API_KEY` | `services/extraction/lib/anthropic.ts`, `services/tariffs/lib/anthropic.ts`, `services/holidays/services/holidayReader.service.ts` | The Claude API: reading documents and pre-alerts, the layout of tariff files, and holiday lists. |

Auth, extraction, tariffs and holidays fall back to `process.env.JWT_SECRET` / `process.env.ANTHROPIC_API_KEY` when the secret is empty, which helps only in local runs.

When a secret is missing:

- `JWT_SECRET`: sign-in and every authenticated request fail with `JWT_SECRET is not configured`.
- `ANTHROPIC_API_KEY`: the AI features fail. Document reading answers "The AI could not read the document just now" and logs `extraction: the AI did not answer`.

`RESEND_API_KEY` is **not** declared. E-mail sending is switched off (see the comment at the top of `apps/api/lib/email.ts`): every message is logged and reported as not sent. Encore refuses to deploy while a declared secret has no value, so declare it only when e-mail is turned on and the value is set.

## Local runs

- Local values live in `apps/api/.secrets.local.cue`. It is gitignored and must never be committed. Each line is `NAME: "value"`.
- `./run-local.sh` creates the file when it is missing, with a placeholder `JWT_SECRET` and a placeholder `ANTHROPIC_API_KEY`. Document reading needs a real key there. Restart the app after you edit it.
- Because `apps/api/encore.app` names the cloud app, `encore run` also asks Encore Cloud for the app. If the CLI is not signed in to the Encore account that owns `shipment-tracker-ysci`, it stops with "access denied". Check with `encore auth whoami` and sign in with `encore auth login`. If you cannot sign in, you can run locally only by setting `"id": ""` in `apps/api/encore.app` for the time being. Never commit that change (`git checkout apps/api/encore.app` puts it back). After such a switch, `encore test` may need the daemon restarted (`encore daemon`).

## Cloud environments

Run these from `apps/api`, signed in to the account that owns the app:

```bash
encore secret list                                # which secrets have values, per environment type (never the values)
encore secret set --type prod,dev JWT_SECRET      # asks for the value
encore secret set --type prod,dev ANTHROPIC_API_KEY < key.txt   # or read it from a file
```

- The `--type` values are `prod`, `dev`, `pr` (preview) and `local`. `--env <name>` sets the value for one environment only.
- The CLI asks for the value, or reads it from stdin, so the value never ends up in your shell history.
- To make a new random `JWT_SECRET` without ever seeing it: `encore rand bytes 32 -f base64 | encore secret set --type prod JWT_SECRET`.
- To add a new secret: declare it in code, then set it for every environment type you deploy to **before** the deploy.

### Changing `JWT_SECRET`

- Every user is signed out and has to sign in again.
- File and logo links that are already open stop working. Lists hand out new links when they are reloaded.
- Pick-up PINs already issued no longer match. Operations generate a new one in Shipments (Warehouse tab, Pick-up).

So change it only when it leaked, and at a quiet time.

## Plain environment variables

Our code assumes Encore Cloud gives no plain environment variables (see `lib/appUrl.ts`). These variables therefore matter for local runs, and the code has a safe default for the cloud:

| Variable | Default | Read by |
|---|---|---|
| `APP_URL` | `http://localhost:3001` locally, `https://shipment-tracker-web.vercel.app` elsewhere | `lib/appUrl.ts`: links in e-mails and printed documents. Trucking logs `trucking: APP_URL unusable, links use the fallback` once at start-up when the value can't be used. |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` | The three AI clients above. |
| `EMAIL_FROM` | `Shipment Tracker <onboarding@resend.dev>` | `lib/email.ts` (only matters once e-mail is on). |
| `WAREHOUSE_EMAIL_SIGNATURE` | empty | Warehouse supplier e-mails. |

The scripts in `apps/api/scripts` read these (local only):

- `AUTH_DB_URL` and `SHIPMENTS_DB_URL`: from `encore db conn-uri auth` / `encore db conn-uri shipments`. `./run-local.sh seed` and `./run-local.sh admin` set them for you.
- `SEED_USERS`: a JSON list of users.
- `SEED_SUPERADMIN_PASSWORD`: without it the seed skips the superadmins.
- `SEED_COMPANY_NAME` and `SEED_COMPANY_SLUG`: default "Demo Company" / `demo`.

### Web app

- `NEXT_PUBLIC_API_URL` is the API's base URL. It defaults to `http://localhost:4001` (`apps/web/src/lib/api/index.ts`) and is also written into the Content-Security-Policy in `apps/web/next.config.ts`. Next.js puts `NEXT_PUBLIC_*` values into the build, so a change needs a new build.
- The API allows the web app's origins in `global_cors` in `apps/api/encore.app`: `https://shipment-tracker-web.vercel.app` and `https://*.vercel.app`, with credentials. It also allows the `X-Acting-Company` header, which the superadmin company switcher sends.

## Rules

- Never commit a secret value, and never paste one into docs, issues, chat or logs. `.secrets.local.cue`, `.env` and `.env.local` are gitignored.
- Never log a secret, a login token or a signed link.
- Tests need no real secrets: they mock `encore.dev/config` (for example `services/customers/tests/logoUrl.test.ts`).

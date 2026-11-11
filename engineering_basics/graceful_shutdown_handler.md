# Shutdown

The API has no shutdown handler, and today it needs none. Nothing in `apps/api` listens for `SIGTERM` or `SIGINT`. Encore's runtime owns the process: it stops the process when `encore run` ends (Ctrl+C, closing the terminal window, `Restart Shipment Tracker.command`) and when Encore Cloud replaces an instance during a deploy.

## Why a sudden stop is safe

- **Timers.** The background timers (see [Start-up](service_startup_handler_onstart.md)) are `setInterval(...).unref()`. They never keep the process alive and hold nothing that has to be written out.
- **Outboxes.** Work that must reach another service is written to that service's outbox table in the same transaction as the change. A delivery run claims rows for 2 minutes (`locked_until`, see `lib/outbox/outboxRepository.ts`). If the process stops in the middle of a run, the claim runs out and the next run (a cron job or a timer) takes the row again. A row that was delivered but not yet marked sent is delivered again, so whatever an outbox sends must be safe to receive twice.
- **Database.** When a connection drops, Postgres rolls back any transaction that was open on it. The pool in `lib/db/pool.ts` also has the server end a transaction left idle for 60 s.
- **Pub/Sub.** Encore delivers a message again when its subscription handler did not finish.

## What a restart loses

These live only in the process's memory:

- Pre-alert reading sessions (`services/extraction/services/pipeline.service.ts`). The user uploads the pre-alert again.
- The AI reading budget of 400 pages per user per hour (`services/extraction/lib/readingBudget.ts`). It starts again from zero.
- The auth session cache (30 s) and the ČNB pull's record of which pulls already ran today. The next import finds today's rates stored and does nothing.

The login throttle is kept in the database (`login_throttle`), so a restart does not clear it.

## If you add something that must finish before exit

Write it to the database first (the outbox pattern above) rather than adding a shutdown hook.

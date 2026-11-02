import pg from "pg";
import log from "encore.dev/log";

/**
 * The Postgres pool of a service's database, with limits so a stuck query or transaction fails
 * instead of holding the service: at most 10 connections (pg's default, written out); a request
 * that finds none free waits at most 10 s; one statement runs at most 60 s (a lock wait counts);
 * a transaction left open without a statement for 60 s is ended by the server.
 *
 * An idle connection the database drops (Postgres restarted, Docker or the machine slept) is an
 * "error" the pool raises with nobody waiting on it: unheard, Node ends the whole process and
 * every service with it. It is logged instead - the pool has thrown the connection away already
 * and opens a new one for the next query.
 */
export function servicePool(connectionString: string): pg.Pool {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 60_000,
    idle_in_transaction_session_timeout: 60_000,
  });
  pool.on("error", (err) => log.warn(err, "an idle database connection was dropped; a new one is opened for the next query"));
  return pool;
}

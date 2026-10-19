import pg from "pg";

/**
 * The Postgres pool of a service's database, with limits so a stuck query or transaction fails
 * instead of holding the service: at most 10 connections (pg's default, written out); a request
 * that finds none free waits at most 10 s; one statement runs at most 60 s (a lock wait counts);
 * a transaction left open without a statement for 60 s is ended by the server.
 */
export function servicePool(connectionString: string): pg.Pool {
  return new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 60_000,
    idle_in_transaction_session_timeout: 60_000,
  });
}

import { APIError } from "encore.dev/api";

// Every page read is a paid Claude call, so one user can have at most PAGES_PER_HOUR pages read in
// any rolling hour (a whole pre-alert counts its pages, a single document counts as one). Kept in
// this process's memory, like the pipeline sessions: one API instance is assumed.
export const PAGES_PER_HOUR = 400;
const WINDOW_MS = 60 * 60 * 1000;

const reads = new Map<string, { at: number; pages: number }[]>();

/** Records `pages` read for the user, or refuses when that would pass the hourly budget. */
export function chargeReading(userId: string, pages: number, now = Date.now()): void {
  const recent = (reads.get(userId) ?? []).filter((r) => now - r.at < WINDOW_MS);
  const used = recent.reduce((sum, r) => sum + r.pages, 0);
  if (used + pages > PAGES_PER_HOUR) {
    reads.set(userId, recent);
    throw APIError.resourceExhausted(`Reading limit reached: at most ${PAGES_PER_HOUR} pages an hour per user. Please try again later.`);
  }
  recent.push({ at: now, pages });
  reads.set(userId, recent);
}

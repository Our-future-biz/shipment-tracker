// How many of the pool's connections one answer may hold at once. Shipments → Managers asks some
// thirty statements per answer and the page asks every minute, of a pool of ten (lib/db/pool):
// sent all at once, one manager's page would take every connection and everybody else's request
// would wait for it. Through a limiter the same statements go a few at a time. Pure: no database,
// no Encore; tested in tests/readLimiter.test.ts.

/** Runs a statement when there is room for it. A reader that sends several is handed this and sends each one through it. */
export type Limit = <T>(read: () => Promise<T>) => Promise<T>;

/** No limit: every read runs at once. What a reader runs through when its caller hands it no limiter. */
export const unlimited: Limit = (read) => read();

/**
 * A limiter of `max` at once. Reads start in the order they were asked for. A read that fails
 * frees its room like any other. A read must be ONE statement: one that holds its room while it
 * waits for another read of the same limiter may wait for ever.
 */
export function readLimiter(max: number): Limit {
  let free = max;
  const waiting: (() => void)[] = [];
  return async <T>(read: () => Promise<T>): Promise<T> => {
    // No room: wait to be handed the room of a read that ends (it is passed on, never given back in between).
    if (free > 0) free -= 1;
    else await new Promise<void>((start) => waiting.push(start));
    try {
      return await read();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else free += 1;
    }
  };
}

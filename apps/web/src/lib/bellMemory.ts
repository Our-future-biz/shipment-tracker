// The bell's memory of the notices it has met while the page is open, so it announces only news. Keys are only ever
// added, never dropped: a poll that comes back empty or short (the server could not read a job's or a customer's
// facts this time) must not make the next poll announce every old notice again.

/**
 * The keys of `keys` never met before, and the memory with all of them added. The first answer (`seen` null) is the
 * backlog found on load: remembered, not announced.
 */
export function rememberNew(seen: ReadonlySet<string> | null, keys: readonly string[]): { seen: Set<string>; fresh: string[] } {
  const next = new Set(seen ?? []);
  const fresh: string[] = [];
  for (const key of keys) {
    if (next.has(key)) continue;
    next.add(key);
    if (seen) fresh.push(key);
  }
  return { seen: next, fresh };
}

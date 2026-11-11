import type { QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** The cache key of one of the signed-in user's preferences (the shipments service's user prefs). */
export const userPrefKey = (prefKey: string) => ["user-prefs", prefKey] as const;

/** Reads one of the user's preferences: its JSON text, null while nothing is saved. */
export const readUserPref = (prefKey: string) => api.shipments.userPrefGet(prefKey);

/**
 * Stores what `change` makes of one of the user's preferences as the server holds it now, read
 * again first: a change is never made to an older copy - one another tab saved over since - nor to
 * the empty one a page holds while its own read is on its way or failed, which would wipe what is
 * saved. The new value is shown once known; the read after the save brings back what the server
 * holds when the save was refused. Rejects, with nothing written, when the value could not be read.
 * Changes coming one right after another are made in turn (a mutation `scope`), each on the one before.
 */
export async function changeUserPref<T>(
  queryClient: QueryClient,
  prefKey: string,
  parse: (stored: string | null | undefined) => T,
  change: (current: T) => T,
): Promise<T> {
  const queryKey = userPrefKey(prefKey);
  const fresh = await queryClient.fetchQuery({ queryKey, queryFn: () => readUserPref(prefKey), staleTime: 0 });
  const next = change(parse(fresh?.value));
  const value = JSON.stringify(next);
  queryClient.setQueryData(queryKey, { value });
  try {
    await api.shipments.userPrefSet(prefKey, { value });
  } finally {
    void queryClient.invalidateQueries({ queryKey });
  }
  return next;
}

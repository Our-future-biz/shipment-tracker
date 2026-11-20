// The Shipments list's "My jobs" button (mock council S9-1): the jobs the signed-in user handles or
// covers - their e-mail in Handled By or in Holiday Cover - matched by the server over every job,
// not only among the rows loaded. It is the list's own control, kept in the address (?mine=1) like
// the Status, and remembered with it (rememberedFilters).

/** The address parameter "My jobs" is kept in. */
export const MY_JOBS_PARAM = "mine";

/** Whether the address asks for "My jobs". */
export const asksMyJobs = (params: Pick<URLSearchParams, "get">): boolean => params.get(MY_JOBS_PARAM) === "1";

/** What the list request is narrowed by for "My jobs": the user's e-mail, or nothing. */
export function myJobsOf(params: Pick<URLSearchParams, "get">, email: string | null | undefined): string | undefined {
  return asksMyJobs(params) ? email?.trim() || undefined : undefined;
}

/**
 * Whether the list waits before asking the server: "My jobs" is on and the signed-in user is not
 * loaded yet. Asked meanwhile, the list would load every job first (review of S9-1).
 */
export const myJobsWaiting = (params: Pick<URLSearchParams, "get">, email: string | null | undefined): boolean =>
  asksMyJobs(params) && myJobsOf(params, email) === undefined;

/** The address with "My jobs" turned on or off, everything else in it kept. */
export function withMyJobs(current: Pick<URLSearchParams, "toString">, on: boolean): URLSearchParams {
  const params = new URLSearchParams(current.toString());
  if (on) params.set(MY_JOBS_PARAM, "1");
  else params.delete(MY_JOBS_PARAM);
  return params;
}

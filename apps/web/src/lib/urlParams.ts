// Writes a page's own query parameters (a Finance page's ?tab, ?invoice…) at once, without a navigation: call it from
// an event handler in the browser only.

/**
 * Sets the parameters given a value and removes those given null, undefined or "", starting from the URL as it is
 * now. history.replaceState changes the URL at once and Next keeps useSearchParams in step with it.
 */
export function replaceSearchParams(pathname: string, patch: Record<string, string | null | undefined>): void {
  const p = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(patch)) {
    if (v) p.set(k, v);
    else p.delete(k);
  }
  const qs = p.toString();
  window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
}

// The main search finds a shipment by every field it has (its parties, references, transport,
// cargo, master job and containers), while the Shipments list's own search looks only in the
// columns shown. "Show all" on the main search's results leads to the list with this flag, so the
// list finds the same shipments, as many as the main search counted.
const ALL_FIELDS_PARAM = "fields";
const ALL_FIELDS = "all";

/** The Shipments list searched for `q` in every field, as the main search searches. */
export const allFieldsSearchHref = (q: string) => `/shipments?q=${encodeURIComponent(q)}&${ALL_FIELDS_PARAM}=${ALL_FIELDS}`;

/** Whether the list's address asks for its search to look in every field, not only the columns shown. */
export const searchesAllFields = (params: Pick<URLSearchParams, "get">) => !!params.get("q")?.trim() && params.get(ALL_FIELDS_PARAM) === ALL_FIELDS;

/** The columns the list's search looks in: the ones shown, or every field (none named) when the address asks for that. */
export const searchColumnsFor = (params: Pick<URLSearchParams, "get">, shown: string[] | undefined) => (searchesAllFields(params) ? undefined : shown);

/**
 * The list's address once its own search box says `value`. A search typed there is the list's
 * own again, in the columns shown; the flag belonged to the main search's text.
 */
export function typedSearchParams(current: URLSearchParams, value: string): URLSearchParams {
  const params = new URLSearchParams(current.toString());
  if (value) params.set("q", value);
  else params.delete("q");
  params.delete(ALL_FIELDS_PARAM);
  return params;
}

/** The list's address searching only the columns shown again, its text kept. */
export function shownColumnsParams(current: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams(current.toString());
  params.delete(ALL_FIELDS_PARAM);
  return params;
}

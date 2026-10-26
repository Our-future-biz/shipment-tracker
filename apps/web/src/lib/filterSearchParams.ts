// A list's "Filter by column" filters in the URL: ?f.<column>=<value>, one parameter per filter,
// so two filters on the same column (?f.city=Praha&f.city=Brno) both survive.

export type UrlFilter = { key: string; value: string };

/** The filters in the URL, in order; ones on columns the list doesn't know are dropped. */
export function filtersFromSearchParams(params: { forEach: URLSearchParams["forEach"] }, isKnown: (key: string) => boolean): UrlFilter[] {
  const out: UrlFilter[] = [];
  params.forEach((value, key) => {
    if (key.startsWith("f.") && isKnown(key.slice(2)) && value.trim()) out.push({ key: key.slice(2), value });
  });
  return out;
}

/** `params` with its ?f. part replaced by `filters` (each appended, never collapsed per column). */
export function writeFiltersToSearchParams(params: URLSearchParams, filters: readonly UrlFilter[]): URLSearchParams {
  Array.from(params.keys())
    .filter((k) => k.startsWith("f."))
    .forEach((k) => params.delete(k));
  filters.forEach((f) => params.append(`f.${f.key}`, f.value));
  return params;
}

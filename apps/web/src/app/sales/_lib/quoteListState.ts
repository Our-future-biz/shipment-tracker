import dayjs from "dayjs";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "@/components/DataTable";
import type { SalesQuoteFilter } from "@/hooks/salesQueryKeys";
import { addDays, businessToday } from "@/lib/date";
import { isUuid } from "@/lib/uuid";
import { INCOTERMS, OPEN_QUOTE_STATUSES, QUOTE_STATUSES } from "./types";

// What narrows the Quotes list. Saved views store this object as it is, so its shape stays: the
// server's filters are made from it (filtersToQuery), not the other way round.
export interface Filters {
  statuses: string[];
  serviceType?: string;
  direction?: string;
  dateFrom?: string;
  dateTo?: string;
  // The two below are relative to who is looking and when, so a view saved with them keeps
  // meaning "mine" and "this month" for every colleague and in every month.
  /** The sales owner is the logged-in user. */
  mineOnly?: boolean;
  /** Won or lost in the current calendar month. */
  decidedThisMonth?: boolean;
  /** Valid until today or within this many days after it. */
  validWithinDays?: number;
  /** Only the quotes whose follow-up is due. */
  followUpDue?: boolean;
  /** The quotes of one user, by their id - or "none": the quotes that belong to no user. */
  owner?: string;
  /** "Filter by column" rows: each keeps the quotes whose text in the column contains the value (QUOTE_FILTER_COLUMNS). */
  columns?: ColumnFilter[];
}

/** One "Filter by column" row: a column of QUOTE_FILTER_COLUMNS and the text looked for in it. */
export interface ColumnFilter {
  key: string;
  value: string;
}

/**
 * The columns the server filters by (quotes utils/quoteColumnFilters.utils), with the list's titles;
 * Incoterms is picked from its codes. Status, Sales owner, Freight mode, Trade direction and Created
 * have filters of their own above.
 */
export const QUOTE_FILTER_COLUMNS: { key: string; title: string; options?: readonly string[] }[] = [
  { key: "reference", title: "Reference" },
  { key: "customer", title: "Customer" },
  { key: "origin", title: "Origin" },
  { key: "destination", title: "Destination" },
  { key: "validity", title: "Valid until" },
  { key: "shipment", title: "Shipment (job no.)" },
  { key: "incoterm", title: "Incoterms", options: INCOTERMS },
  { key: "cargoReady", title: "Cargo ready" },
  { key: "commodity", title: "Cargo Description" },
  { key: "method", title: "Method" },
  { key: "shippingTerms", title: "Shipping terms" },
  { key: "sent", title: "Sent Date" },
];

const isFilterColumn = (key: unknown): key is string => typeof key === "string" && QUOTE_FILTER_COLUMNS.some((c) => c.key === key);

/** The most column filters, and the longest value, the server takes (quotes utils/quoteColumnFilters.utils). */
export const MAX_COLUMN_FILTERS = 10;
export const MAX_COLUMN_FILTER_VALUE = 100;

/**
 * The rows that narrow anything, trimmed: a known column and a value, at most as many and as long as
 * the server takes (an address or saved view with more must not make the whole list fail). Anything
 * else (a saved view of unknown age) is dropped.
 */
export function activeColumnFilters(rows: unknown): ColumnFilter[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .flatMap((row): ColumnFilter[] => {
      const { key, value } = (row ?? {}) as { key?: unknown; value?: unknown };
      const text = typeof value === "string" ? Array.from(value.trim()).slice(0, MAX_COLUMN_FILTER_VALUE).join("").trim() : "";
      return isFilterColumn(key) && text ? [{ key, value: text }] : [];
    })
    .slice(0, MAX_COLUMN_FILTERS);
}

// A column filter in the address: f.<column>=<value>, as the Shipments grid writes them.
const COLUMN_PARAM = "f.";

export interface SavedView {
  id: string;
  label: string;
  search: string;
  filters: Filters;
}

export const EMPTY_FILTERS: Filters = { statuses: [] };

export const NO_OWNER = "none";

// The question a set of filters asks the server. "Mine" is whoever is signed in, and the statuses
// are the ones shown - Expired finds the quotes whose validity has passed, Quoted no longer does.
// "This month" and "valid within N days" count from the company's day (Prague), as the server and
// the managers' tiles (Won / Lost this month, Valid until ≤ 7 days) do.
export function filtersToQuery(filters: Filters): SalesQuoteFilter {
  const today = businessToday();
  const month = dayjs(today);
  return {
    statuses: filters.statuses.join(",") || undefined,
    serviceType: filters.serviceType,
    direction: filters.direction,
    createdFrom: filters.dateFrom,
    createdTo: filters.dateTo,
    decidedFrom: filters.decidedThisMonth ? month.startOf("month").format("YYYY-MM-DD") : undefined,
    decidedTo: filters.decidedThisMonth ? month.endOf("month").format("YYYY-MM-DD") : undefined,
    owner: filters.mineOnly ? "me" : filters.owner,
    validFrom: filters.validWithinDays ? today : undefined,
    validTo: filters.validWithinDays ? addDays(today, filters.validWithinDays) : undefined,
    followUp: filters.followUpDue ? "due" : undefined,
    columnFilters: activeColumnFilters(filters.columns).length ? JSON.stringify(activeColumnFilters(filters.columns)) : undefined,
  };
}

// What the list shows - search, filters, sort, page and page size. All of it lives in the URL, so
// the list is the same after opening a quote and coming back, and can be bookmarked or sent on.
export interface ListState {
  search: string;
  filters: Filters;
  /** What the server sorts by (a `sortBy` of the list's columns), with a leading "-" for descending; empty for newest first. */
  sort: string;
  page: number;
  pageSize: number;
}

type FilterParam = "status" | "service" | "direction" | "from" | "to" | "owner" | "month" | "valid" | "followup";
// The longest "valid within N days" an address may ask for.
const MAX_VALID_WITHIN_DAYS = 90;
type ListParam = "q" | FilterParam | "sort" | "page" | "size";

// A day as the server takes it, or nothing.
const dayOrNone = (day: string | null) => (day && dayjs(day).isValid() && dayjs(day).format("YYYY-MM-DD") === day ? day : undefined);

// The list an address asks for. The address is typed by hand, bookmarked in another version or
// written from a saved view of unknown age, and the server refuses a whole request over one
// status it does not know or one day that does not exist - so what it would not understand is
// dropped here, and is then neither asked for nor shown as a filter that is on.
export function readList(params: URLSearchParams): ListState {
  const owner = params.get("owner") ?? "";
  const page = Number(params.get("page"));
  const pageSize = Number(params.get("size"));
  const validWithin = Number(params.get("valid"));
  return {
    search: params.get("q") ?? "",
    filters: {
      statuses: (params.get("status") ?? "").split(",").filter((status) => QUOTE_STATUSES.some((known) => known.key === status)),
      serviceType: params.get("service") || undefined,
      direction: params.get("direction") || undefined,
      dateFrom: dayOrNone(params.get("from")),
      dateTo: dayOrNone(params.get("to")),
      mineOnly: owner === "me" || undefined,
      decidedThisMonth: params.get("month") === "1" || undefined,
      owner: owner === NO_OWNER || isUuid(owner) ? owner : undefined,
      validWithinDays: Number.isInteger(validWithin) && validWithin > 0 && validWithin <= MAX_VALID_WITHIN_DAYS ? validWithin : undefined,
      followUpDue: params.get("followup") === "due" || undefined,
      columns: columnsOfParams(params),
    },
    sort: params.get("sort") ?? "",
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: PAGE_SIZE_OPTIONS.includes(pageSize) ? pageSize : DEFAULT_PAGE_SIZE,
  };
}

// The column filters an address carries, in its order; none is no list at all.
function columnsOfParams(params: URLSearchParams): ColumnFilter[] | undefined {
  const rows = activeColumnFilters(
    Array.from(params.entries()).flatMap(([name, value]) => (name.startsWith(COLUMN_PARAM) ? [{ key: name.slice(COLUMN_PARAM.length), value }] : [])),
  );
  return rows.length ? rows : undefined;
}

// The filters as the address writes them: a filter that is off is an empty text.
function filterParams(filters: Filters): Record<FilterParam, string> {
  return {
    status: filters.statuses.join(","),
    service: filters.serviceType ?? "",
    direction: filters.direction ?? "",
    from: filters.dateFrom ?? "",
    to: filters.dateTo ?? "",
    owner: filters.mineOnly ? "me" : (filters.owner ?? ""),
    month: filters.decidedThisMonth ? "1" : "",
    valid: filters.validWithinDays ? String(filters.validWithinDays) : "",
    followup: filters.followUpDue ? "due" : "",
  };
}

// The address of the list in a given state. What is at its default is left out of it; parameters
// that are not the list's stay as they are.
export function listHref(pathname: string, current: URLSearchParams, list: ListState): string {
  const own: Record<ListParam, string> = {
    q: list.search,
    ...filterParams(list.filters),
    sort: list.sort,
    page: list.page > 1 ? String(list.page) : "",
    size: list.pageSize === DEFAULT_PAGE_SIZE ? "" : String(list.pageSize),
  };
  const params = new URLSearchParams(current.toString());
  for (const [key, value] of Object.entries(own)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  for (const name of Array.from(params.keys())) if (name.startsWith(COLUMN_PARAM)) params.delete(name);
  for (const f of activeColumnFilters(list.filters.columns)) params.append(`${COLUMN_PARAM}${f.key}`, f.value);
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export const hasFilters = (filters: Filters) => Object.values(filterParams(filters)).some(Boolean) || activeColumnFilters(filters.columns).length > 0;

// The views every user has, beside the title. Each filters exactly what its name says.
export const BUILTIN_VIEWS: { id: string; label: string; apply: () => Filters }[] = [
  { id: "all", label: "All", apply: () => EMPTY_FILTERS },
  { id: "my_open", label: "My open quotes", apply: () => ({ statuses: [...OPEN_QUOTE_STATUSES], mineOnly: true }) },
  { id: "won_month", label: "Won this month", apply: () => ({ statuses: ["won"], decidedThisMonth: true }) },
  { id: "lost_month", label: "Lost this month", apply: () => ({ statuses: ["lost"], decidedThisMonth: true }) },
  { id: "drafts", label: "Drafts to finish", apply: () => ({ statuses: ["draft"] }) },
];

// Two sets of filters find the same quotes when the address would write them the same, in
// whatever order their statuses were ticked.
const filtersKey = (filters: Filters) =>
  JSON.stringify([filterParams({ ...filters, statuses: [...filters.statuses].sort() }), activeColumnFilters(filters.columns)]);

// The built-in view the filters are - exactly, with nothing added and nothing taken away - if
// they are one. With one more filter on, the list is no longer what the view's name says.
export function builtinViewOf(filters: Filters): string | undefined {
  const key = filtersKey(filters);
  return BUILTIN_VIEWS.find((view) => filtersKey(view.apply()) === key)?.id;
}

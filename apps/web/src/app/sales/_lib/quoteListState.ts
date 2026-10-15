import dayjs from "dayjs";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "@/components/DataTable";
import type { SalesQuoteFilter } from "@/hooks/salesQueryKeys";
import { isUuid } from "@/lib/uuid";
import { OPEN_QUOTE_STATUSES, QUOTE_STATUSES } from "./types";

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
  /** The quotes of one user, by their id - or "none": the quotes that belong to no user. */
  owner?: string;
}

export interface SavedView {
  id: string;
  label: string;
  search: string;
  filters: Filters;
}

export const EMPTY_FILTERS: Filters = { statuses: [] };

export const NO_OWNER = "none";

// The question a set of filters asks the server. "Mine" is whoever is signed in, "this month" is
// the month on the viewer's clock, and the statuses are the ones shown - Expired finds the quotes
// whose validity has passed, Quoted no longer does.
export function filtersToQuery(filters: Filters): SalesQuoteFilter {
  const month = dayjs();
  return {
    statuses: filters.statuses.join(",") || undefined,
    serviceType: filters.serviceType,
    direction: filters.direction,
    createdFrom: filters.dateFrom,
    createdTo: filters.dateTo,
    decidedFrom: filters.decidedThisMonth ? month.startOf("month").format("YYYY-MM-DD") : undefined,
    decidedTo: filters.decidedThisMonth ? month.endOf("month").format("YYYY-MM-DD") : undefined,
    owner: filters.mineOnly ? "me" : filters.owner,
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

type FilterParam = "status" | "service" | "direction" | "from" | "to" | "owner" | "month";
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
    },
    sort: params.get("sort") ?? "",
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: PAGE_SIZE_OPTIONS.includes(pageSize) ? pageSize : DEFAULT_PAGE_SIZE,
  };
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
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export const hasFilters = (filters: Filters) => Object.values(filterParams(filters)).some(Boolean);

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
const filtersKey = (filters: Filters) => JSON.stringify(filterParams({ ...filters, statuses: [...filters.statuses].sort() }));

// The built-in view the filters are - exactly, with nothing added and nothing taken away - if
// they are one. With one more filter on, the list is no longer what the view's name says.
export function builtinViewOf(filters: Filters): string | undefined {
  const key = filtersKey(filters);
  return BUILTIN_VIEWS.find((view) => filtersKey(view.apply()) === key)?.id;
}

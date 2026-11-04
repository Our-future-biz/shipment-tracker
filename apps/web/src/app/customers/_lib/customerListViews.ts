import type { interfaces } from "@/lib/api/client";
import type { CustomerListPrefKey } from "@/hooks/useCustomerListPref";
import { SUPPLIER_IN_USE, SUPPLIER_NOT_IN_USE } from "./supplierStatus";

// The three views of the Customer Database list (Council Outlay 7, step 3): Customers, the companies
// with the customer role; Suppliers, those with any other role; All. A company that is both is in
// Customers and in Suppliers. Pure rules, so each is covered by a test.

export const LIST_VIEWS = ["customers", "suppliers", "all"] as const;
export type ListView = (typeof LIST_VIEWS)[number];

export const SUPPLIER_ROLES = ["haulier", "rail_operator", "first_last_mile_haulier", "shipping_line", "co_loader"] as const satisfies readonly interfaces.CustomerRole[];

/** Whether a company is a supplier: it has a role other than customer (it may be a customer too). */
export const hasSupplierRole = (roles: readonly interfaces.CustomerRole[]): boolean =>
  roles.some((role) => (SUPPLIER_ROLES as readonly string[]).includes(role));

/** How each view names a company and its companies. */
export const VIEW_WORDS: Record<ListView, { pill: string; one: string; many: string }> = {
  customers: { pill: "Customers", one: "Customer", many: "customers" },
  suppliers: { pill: "Suppliers", one: "Supplier", many: "suppliers" },
  all: { pill: "All", one: "Company", many: "companies" },
};

/** What the server is asked for in each view. */
export const VIEW_KIND: Record<ListView, interfaces.CustomerListKind | undefined> = { customers: "customers", suppliers: "suppliers", all: undefined };

/** Where each view keeps the user's columns: the Customers view keeps the list's columns as they were before views. */
export const VIEW_COLUMNS_PREF: Record<ListView, CustomerListPrefKey> = { customers: "columns", suppliers: "columns-suppliers", all: "columns-all" };

/** The sort of a view when the address names none: Customers keep the newest first, as the list always had. */
export const VIEW_DEFAULT_SORT: Record<ListView, string> = { customers: "", suppliers: "-rating", all: "name" };

/**
 * The view the address asks for (?kind=). An address from before the views opens Customers, unless it
 * filtered on a supplier role (?role=haulier), which now is the Suppliers view of that type.
 */
export function listViewFrom(params: { get(name: string): string | null }): ListView {
  const kind = params.get("kind");
  if (LIST_VIEWS.some((view) => view === kind)) return kind as ListView;
  const role = params.get("role") ?? "";
  return (SUPPLIER_ROLES as readonly string[]).includes(role) ? "suppliers" : "customers";
}

/** The supplier types asked for (?types=haulier,shipping_line, or an old ?role=haulier), known ones only. */
export function supplierTypesFrom(params: { get(name: string): string | null }): interfaces.CustomerRole[] {
  const raw = params.get("types") ?? (params.get("kind") ? "" : (params.get("role") ?? ""));
  return SUPPLIER_ROLES.filter((role) => raw.split(",").includes(role));
}

/** Whether a company is one of the supplier types picked; no type picked keeps every supplier. */
export const matchesSupplierTypes = (roles: readonly interfaces.CustomerRole[], types: readonly interfaces.CustomerRole[]): boolean =>
  types.length === 0 || roles.some((role) => types.includes(role));

export const RATING_FILTERS = [
  { value: "4", label: "4 ★ and up" },
  { value: "3", label: "3 ★ and up" },
  { value: "low", label: "0–2 ★" },
  { value: "none", label: "Not rated" },
] as const;
export type RatingFilter = (typeof RATING_FILTERS)[number]["value"];

export const ratingFilterFrom = (value: string | null): RatingFilter | "" => RATING_FILTERS.find((f) => f.value === value)?.value ?? "";

/** Whether a rating (null = not rated) is one the rating filter keeps; no filter keeps all. */
export function matchesRatingFilter(rating: number | null, filter: RatingFilter | ""): boolean {
  if (!filter) return true;
  if (filter === "none") return rating === null;
  if (rating === null) return false;
  if (filter === "low") return rating <= 2;
  return rating >= Number(filter);
}

/**
 * The order of "best first" (Council Outlay 7, D14): 5 down to 1 star, then not rated, then 0 (known
 * to be the worst). A company that is no supplier has no rating at all and comes after every supplier.
 */
export function ratingRank(company: { roles: readonly interfaces.CustomerRole[]; supplierRating: number | null }): number {
  if (!hasSupplierRole(company.roles)) return -2;
  if (company.supplierRating === null) return 0.5;
  if (company.supplierRating === 0) return -1;
  return company.supplierRating;
}

// Status in its business order rather than alphabetically: a customer that buys, one that may, one that
// stopped; a supplier we use, then one we do not.
const STATUS_ORDER = ["Active", SUPPLIER_IN_USE, "Prospect", "Inactive", SUPPLIER_NOT_IN_USE];
export const statusRank = (shown: string): number => {
  const i = STATUS_ORDER.indexOf(shown);
  return i === -1 ? STATUS_ORDER.length : i;
};

export const OWNER_FILTERS = [
  { value: "mine", label: "Mine" },
  { value: "none", label: "No Sales Owner" },
] as const;
export type OwnerFilter = (typeof OWNER_FILTERS)[number]["value"];

export const ownerFilterFrom = (value: string | null): OwnerFilter | "" => OWNER_FILTERS.find((f) => f.value === value)?.value ?? "";

/** Whether a customer's owner is the one the owner filter keeps: the signed-in user, or nobody. */
export function matchesOwnerFilter(company: { salesOwnerUserId: string | null; salesOwner: string }, filter: OwnerFilter | "", myUserId: string | undefined): boolean {
  if (!filter) return true;
  if (filter === "none") return !company.salesOwnerUserId && !company.salesOwner.trim();
  return !!myUserId && company.salesOwnerUserId === myUserId;
}

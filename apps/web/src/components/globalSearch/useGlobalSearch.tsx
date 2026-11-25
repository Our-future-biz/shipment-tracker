"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthContext";
import { useSalesPermissions } from "@/hooks/useSalesPermissions";
import { visibleNavItems } from "@/components/AppSidebar";
import { StatusBadge } from "@/components/StatusBadge";
import { Pill } from "@/components/Pill";
import { formatDate } from "@/lib/date";
import { money } from "@/lib/money";
import { quoteHref } from "@/app/sales/_lib/quoteHref";
import { QuoteStatusPill } from "@/app/sales/_components/QuoteStatusPill";
import { allFieldsSearchHref } from "@/app/shipments/_lib/allFieldsSearch";
import { containerDetailsHref } from "@/app/shipments/_lib/containerLink";
import { WAREHOUSE_SECTIONS } from "@/app/warehouse/_components/warehouseRules";
import { warehouseRecordHref } from "@/app/warehouse/_lib/warehouseHref";
import type { QuoteStatus } from "@/app/sales/_lib/types";
import { searchKindAllowed } from "./searchAccess";
import { matchPages, menuPages } from "./searchPages";
import type { SearchGroup, SearchHit, SearchKind } from "./searchTypes";

/** The fewest characters the main search looks for. */
export const MIN_QUERY = 2;

/** The page of all results for a text. */
export const searchHref = (q: string) => `/search?q=${encodeURIComponent(q)}`;

const withQ = (path: string, q: string) => `${path}?q=${encodeURIComponent(q)}`;
const route = (from: string, to: string) => [from, to].filter(Boolean).join(" → ");
const line = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(" · ");

interface Found<T> {
  items: T[];
  total: number;
}

// What each kind is called, how it is fetched and how one of it reads as a row.
interface Source<T> {
  kind: Exclude<SearchKind, "pages">;
  label: string;
  fetch: (q: string, limit: number) => Promise<Found<T>>;
  hit: (item: T) => SearchHit;
  allHref?: (q: string) => string;
}

const shipments: Source<interfaces.SearchShipmentItem> = {
  kind: "shipments",
  label: "Shipments",
  fetch: (q, limit) => api.shipments.searchShipments({ q, limit }),
  hit: (s) => ({
    key: `shipment-${s.id}`,
    href: `/shipments/${s.id}`,
    title: s.jobNumber,
    isRef: true,
    subtitle: line(s.customer, route(s.pol, s.pod), s.eta && `ETA ${formatDate(s.eta)}`),
    mark: s.status ? <StatusBadge status={s.status} /> : undefined,
  }),
  // The list searched in every field, as here: its own search looks only in the columns shown, and
  // would list fewer than the count says.
  allHref: allFieldsSearchHref,
};

const masterJobs: Source<interfaces.SearchMasterJobItem> = {
  kind: "masterJobs",
  label: "Master Jobs",
  fetch: (q, limit) => api.shipments.searchMasterJobs({ q, limit }),
  hit: (m) => ({
    key: `master-job-${m.id}`,
    href: `/master-jobs?open=${m.id}`,
    title: m.mczNumber || m.masterBolNumber,
    isRef: true,
    subtitle: line(
      m.masterBolNumber && `MBL ${m.masterBolNumber}`,
      [m.vessel, m.voyage].filter(Boolean).join(" "),
      route(m.pol, m.pod),
      `${m.shipmentCount} ${m.shipmentCount === 1 ? "shipment" : "shipments"}`,
    ),
  }),
  // No "Show all" in Master Jobs: its grid searches the jobs' own columns, not the containers and
  // house job numbers this search also finds them by, so it would list fewer than the count says.
};

// Co-Loading Concept: its services and their sailings (Council Outlay 14, A10).
const coLoading: Source<interfaces.SearchCoLoadingItem> = {
  kind: "coLoading",
  label: "Co-Loading Concept",
  fetch: (q, limit) => api.shipments.searchCoLoading({ q, limit }),
  hit: (c) => ({
    key: `co-loading-${c.kind}-${c.id}`,
    href: c.kind === "sailing" ? `/co-loading/${c.serviceId}/sailings/${c.id}` : `/co-loading/${c.id}`,
    title: c.title,
    isRef: c.kind === "sailing",
    subtitle:
      c.kind === "sailing"
        ? line("Sailing", c.serviceLabel, route(c.pol, c.pod), c.cutoffDate && `cut-off ${formatDate(c.cutoffDate)}`, c.departureDate && `departure ${formatDate(c.departureDate)}`)
        : line("Service", c.serviceName, route(c.pol, c.pod)),
    mark: c.closed ? <Pill tone="slate">Closed</Pill> : undefined,
  }),
  // No "Show all": no one list holds services and sailings together.
};

// Saved loading plans, by their name or the job they are linked to (Council Outlay 14, A10).
const loadingPlans: Source<interfaces.LoadingPlanSummary> = {
  kind: "loadingPlans",
  label: "Loading Planner",
  fetch: (q, limit) => api.loadingPlanner.searchLoadingPlans({ q, limit }),
  hit: (p) => ({
    key: `loading-plan-${p.id}`,
    href: `/loading-planner/${p.id}`,
    title: p.name,
    subtitle: line(p.linkRef && `Linked to ${p.linkRef}`, `${p.colli} colli`, `saved ${formatDate(p.updatedAt)}`),
  }),
  // No "Show all": the planner's list has its own search box.
};

const containers: Source<interfaces.SearchContainerItem> = {
  kind: "containers",
  label: "Containers",
  fetch: (q, limit) => api.shipments.searchContainers({ q, limit }),
  hit: (c) => ({
    key: `container-${c.id}`,
    // The job's Container Details, on this container.
    href: containerDetailsHref(c.shipmentId, c.id),
    title: c.containerNumber,
    isRef: true,
    subtitle: line(c.type, c.jobNumber, c.mczNumber && `Master job ${c.mczNumber}`),
  }),
  // No "Show all": no list holds containers, so the results page says how many of them it shows.
};

const warehouse: Source<interfaces.SearchWarehouseItem> = {
  kind: "warehouse",
  label: "Warehouse",
  fetch: (q, limit) => api.warehouse.searchWarehouse({ q, limit }),
  hit: (w) => ({
    key: `warehouse-${w.id}`,
    // The record on the Warehouse page its shipment is on now.
    href: warehouseRecordHref(w.page, w.shipmentId),
    title: w.reference,
    isRef: true,
    subtitle: line(w.jobNumber, w.customer, WAREHOUSE_SECTIONS[w.page]),
  }),
  // No "Show all": the Warehouse pages list a shipment by where it is, not by its reference.
};

// Superadmins only, as the Warehouse Concept's pages are (the server refuses anyone else): searchAccess.ts.
const warehouseConcept: Source<interfaces.SearchGateRecordItem> = {
  kind: "warehouseConcept",
  label: "Warehouse Concept",
  fetch: (q, limit) => api.warehouseConcept.searchWarehouseConcept({ q, limit }),
  hit: (g) => ({
    key: `warehouse-concept-${g.id}`,
    // The record's Gate Log page.
    href: `/warehouse-concept/gate-log/${encodeURIComponent(g.id)}`,
    title: g.reference,
    isRef: true,
    subtitle: line(g.jobNumber, g.customer),
  }),
  // No "Show all": the Gate Log lists records by their day, not by their reference.
};

const customers: Source<interfaces.SearchCustomerItem> = {
  kind: "customers",
  label: "Customer Database",
  fetch: (q, limit) => api.customers.searchCustomers({ q, limit }),
  hit: (c) => ({
    key: `customer-${c.id}`,
    // Found through one of its people: the company opens on its Contacts.
    href: c.matchedContact ? `/customers/${c.id}?tab=contacts` : `/customers/${c.id}`,
    title: c.companyName,
    subtitle: c.matchedContact
      ? line(`Contact: ${c.matchedContact.name}`, c.matchedContact.email)
      : line(c.ico && `IČO ${c.ico}`, [c.city, c.country].filter(Boolean).join(", ")),
  }),
  // No "Show all" in the Customer Database: its list opens on customers only and searches the
  // companies' own fields, while this finds suppliers too and companies through their contacts.
};

const quotes: Source<interfaces.SearchQuoteItem> = {
  kind: "quotes",
  label: "Quotes",
  fetch: (q, limit) => api.quotes.searchQuotes({ q, limit }),
  hit: (x) => ({
    key: `quote-${x.id}`,
    href: quoteHref(x.quoteNumber),
    title: x.quoteNumber,
    isRef: true,
    subtitle: line(x.customerName, route(x.pol, x.pod), x.validUntil && `Valid until ${formatDate(x.validUntil)}`),
    // In the Sales colours and words ("Ready to Send", not ready_to_send), as in the Quotes list.
    mark: x.status ? <QuoteStatusPill status={x.status as QuoteStatus} /> : undefined,
  }),
  allHref: (q) => withQ("/sales/quotes", q),
};

const invoices: Source<interfaces.SearchInvoiceItem> = {
  kind: "invoices",
  label: "Invoices & Credit Notes",
  fetch: (q, limit) => api.invoicing.searchInvoices({ q, limit }),
  hit: (i) => ({
    key: `invoice-${i.id}`,
    // The job's invoices in Invoicing.
    href: `/invoicing?shipment=${i.shipmentId}&tab=documents`,
    title: i.number,
    isRef: true,
    subtitle: line(i.kind === "credit_note" ? "Credit note" : "Invoice", i.customerName, i.jobNumber, formatDate(i.issueDate), `${money(i.gross)} ${i.currency}`),
    mark: i.status === "credited" ? <Pill tone="amber">Credited</Pill> : i.status === "cancelled" ? <Pill tone="slate">Cancelled</Pill> : undefined,
  }),
};

const SOURCES = [shipments, masterJobs, coLoading, containers, warehouse, warehouseConcept, customers, quotes, loadingPlans, invoices] as const;

/** `allowed` false leaves a kind out for this user (it is not asked, and shows no group). */
function useSourceGroup<T>(source: Source<T>, q: string, limit: number, allowed = true): SearchGroup {
  const enabled = allowed && q.length >= MIN_QUERY;
  const query = useQuery({
    queryKey: ["global-search", source.kind, q, limit],
    queryFn: () => source.fetch(q, limit),
    enabled,
    staleTime: 30_000,
    // Keep the last answer while the next text is asked, so the list doesn't blink empty.
    placeholderData: (prev) => prev,
  });
  const data = enabled ? query.data : undefined;
  return {
    kind: source.kind,
    label: source.label,
    hits: (data?.items ?? []).map(source.hit),
    total: data?.total ?? 0,
    // Still asking: nothing yet, or only the answer for the text before.
    isLoading: enabled && (query.isPending || (query.isFetching && query.isPlaceholderData)),
    isError: enabled && query.isError,
    allHref: enabled && source.allHref ? source.allHref(q) : undefined,
  };
}

/**
 * Everything the main search finds for `q`, by kind and in a fixed order: the app's pages the
 * user's menu lists, then shipments, master jobs, Co-Loading services and sailings, containers, warehouse records,
 * companies, quotes, loading plans and invoices - at most
 * `limit` of each. Each kind is asked on its own, so one that answers first shows first.
 */
export function useGlobalSearch(q: string, limit: number): SearchGroup[] {
  const { user } = useAuth();
  const { canManageSales } = useSalesPermissions();
  const pageHits: SearchHit[] =
    q.length >= MIN_QUERY
      ? matchPages(menuPages(visibleNavItems(user), canManageSales), q, limit).map((p) => ({
          key: `page-${p.path}`,
          href: p.path,
          title: p.label,
          subtitle: p.description,
        }))
      : [];
  const pages: SearchGroup = { kind: "pages", label: "Pages", hits: pageHits, total: pageHits.length, isLoading: false, isError: false };

  // A fixed list of sources, so the hooks are called in the same order every time. Who may see a kind
  // is judged by the kind (searchKindAllowed), so a source added or moved in the list keeps its rule.
  const role = user?.role;
  const found = [
    useSourceGroup(SOURCES[0], q, limit, searchKindAllowed(SOURCES[0].kind, role)),
    useSourceGroup(SOURCES[1], q, limit, searchKindAllowed(SOURCES[1].kind, role)),
    useSourceGroup(SOURCES[2], q, limit, searchKindAllowed(SOURCES[2].kind, role)),
    useSourceGroup(SOURCES[3], q, limit, searchKindAllowed(SOURCES[3].kind, role)),
    useSourceGroup(SOURCES[4], q, limit, searchKindAllowed(SOURCES[4].kind, role)),
    useSourceGroup(SOURCES[5], q, limit, searchKindAllowed(SOURCES[5].kind, role)),
    useSourceGroup(SOURCES[6], q, limit, searchKindAllowed(SOURCES[6].kind, role)),
    useSourceGroup(SOURCES[7], q, limit, searchKindAllowed(SOURCES[7].kind, role)),
    useSourceGroup(SOURCES[8], q, limit, searchKindAllowed(SOURCES[8].kind, role)),
    useSourceGroup(SOURCES[9], q, limit, searchKindAllowed(SOURCES[9].kind, role)),
  ];
  return [pages, ...found];
}

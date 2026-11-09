"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import type { ChangeEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button, Dropdown, Input, Select, Tooltip } from "antd";
import type { TableProps } from "antd";
import { DownOutlined, DownloadOutlined, EditOutlined, LinkOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import type { ColumnsType } from "antd/es/table";
import { DataTable } from "@/components/DataTable";
import { ListCapNotice } from "@/components/ListCapNotice";
import { DraggableHeaderCell } from "@/components/DraggableHeaderCell";
import { PillTabs } from "@/components/SectionCard";
import { useCustomerViewCounts, useCustomers, type CustomerItem } from "@/hooks/useCustomers";
import { useCustomerListPref } from "@/hooks/useCustomerListPref";
import { useDebounced } from "@/hooks/useDebounced";
import { CUSTOMER_LABELS, CUSTOMER_ROLE_LABELS, CUSTOMER_STATUSES } from "../_lib/constants";
import {
  LIST_VIEWS,
  OWNER_FILTERS,
  RATING_FILTERS,
  SUPPLIER_ROLES,
  VIEW_COLUMNS_PREF,
  VIEW_DEFAULT_SORT,
  VIEW_KIND,
  VIEW_WORDS,
  hasSupplierRole,
  listViewFrom,
  ownerFilterFrom,
  ratingFilterFrom,
  ratingRank,
  statusRank,
  supplierTypesFrom,
  type ListView,
} from "../_lib/customerListViews";
import { shownStatus } from "../_lib/supplierStatus";
import { rememberCustomerListQuery } from "../_lib/customerListHref";
import { marginPct } from "../_lib/customerMoney";
import {
  CUSTOMER_COLUMN_MAP,
  CUSTOMER_LIST_COLUMNS,
  DEFAULT_VIEW_COLUMNS,
  NAME_COLUMN_KEY,
  SORT_KEYS,
  customerCellText,
  customerCsvRows,
  normalizeCustomerColumns,
  type SortKey,
} from "../_lib/customerListColumns";
import { AddCustomerModal } from "./AddCustomerModal";
import { RegistrationLinkModal } from "./RegistrationLinkModal";
import { AlsoChip } from "./AlsoChip";
import { CustomerColumnPicker, type ColumnTemplate } from "./CustomerColumnPicker";
import { CustomerFiltersPopover, type FilterTemplate, type StoredFilter } from "./CustomerFiltersPopover";
import { TOOLBAR_BUTTON_CLASS, matchesGridFilters, storedGridFilters, withFilterId, type GridFilter } from "@/components/gridFilters";
import { filtersFromSearchParams, writeFiltersToSearchParams } from "../_lib/customerListFilters";
import { useAuth } from "@/lib/auth/AuthContext";
import { canDeleteCustomerRecords } from "../_lib/customerPermissions";
import { DeletedCustomersPanel } from "./DeletedCustomersPanel";
import { apiFileUrl } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import { businessToday } from "@/lib/date";
import { BTN_PRIMARY, CARD, LINK, PAGE_TITLE } from "@/styles/ui";

// Superadmins also get the deleted companies, to restore one (?view=deleted).
const DELETED_PILL = { key: "deleted", label: "Deleted" };

// Inside the Customers view: the customer's status, as the list was filtered before it had views.
// A select like the toolbar's other filters (and the Shipments status filter), so the toolbar keeps to one row.
const STATUS_OPTIONS = CUSTOMER_STATUSES.map((status) => ({ value: status, label: status }));

const ACCOUNT_TYPE_OPTIONS = CUSTOMER_LABELS.map((label) => ({ value: label, label }));
// Every role, hauliers included for everyone (Council Outlay 7, D3): they are real suppliers.
const ROLE_OPTIONS = (Object.keys(CUSTOMER_ROLE_LABELS) as (keyof typeof CUSTOMER_ROLE_LABELS)[]).map((role) => ({ value: role, label: CUSTOMER_ROLE_LABELS[role] }));
const SUPPLIER_TYPE_OPTIONS = SUPPLIER_ROLES.map((role) => ({ value: role, label: CUSTOMER_ROLE_LABELS[role] }));

// The page used to be filtered by ?tab=. The old values are still read when neither ?status=
// nor ?type= is present, so a bookmark from that time opens the same list.
const LEGACY_TAB_FILTERS: Record<string, { status?: string; type?: string }> = {
  active: { status: "Active" },
  prospects: { status: "Prospect" },
  key: { type: "KEY ACCOUNT" },
  risk: { type: "RISK" },
};

type ListParam = "q" | "kind" | "status" | "type" | "owner" | "types" | "rating" | "role" | "sort" | "view";

// What a view's own filters write; a change of view clears them, so a filter never hides rows unseen.
const VIEW_FILTER_PARAMS: Partial<Record<ListParam, string>> = { status: "", type: "", owner: "", types: "", rating: "", role: "", sort: "" };

type SortDirection = "ascend" | "descend";

const COMPARE: Record<SortKey, (a: CustomerItem, b: CustomerItem) => number> = {
  // Names come from the Czech registry, so they are ordered the Czech way (Č after C, CH after H).
  name: (a, b) => a.companyName.localeCompare(b.companyName, "cs", { sensitivity: "base" }),
  // Rollup amounts are not converted, so they are only compared within a currency: grouped by it first.
  revenue: (a, b) => a.currency.localeCompare(b.currency) || a.totalRevenue - b.totalRevenue,
  margin: (a, b) =>
    marginPct(a.totalRevenue, a.totalProfit) - marginPct(b.totalRevenue, b.totalProfit),
  activity: (a, b) => (a.lastActivityDate || "").localeCompare(b.lastActivityDate || ""),
  status: (a, b) => statusRank(shownStatus(a)) - statusRank(shownStatus(b)),
  owner: (a, b) => a.salesOwner.localeCompare(b.salesOwner, "cs", { sensitivity: "base" }),
  rating: (a, b) => ratingRank(a) - ratingRank(b),
  lastContact: (a, b) => (a.lastContactAt || "").localeCompare(b.lastContactAt || ""),
  created: (a, b) => a.createdAt.localeCompare(b.createdAt),
};

// The columns a "Filter by column" row can be set on: every column of the list, with its values to pick where it has a fixed set.
const FILTER_COLUMNS = CUSTOMER_LIST_COLUMNS.map((c) => ({
  key: c.key,
  title: c.title,
  options: c.options,
}));

const isStringList = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((k) => typeof k === "string");
const isFilterList = (v: unknown): v is StoredFilter[] =>
  Array.isArray(v) &&
  v.every(
    (f) => !!f && typeof f === "object" && typeof f.key === "string" && typeof f.value === "string",
  );
const isFilterTemplates = (v: unknown): v is FilterTemplate[] =>
  Array.isArray(v) &&
  v.every(
    (t) => !!t && typeof t.id === "string" && typeof t.name === "string" && isFilterList(t.filters),
  );
const isColumnTemplates = (v: unknown): v is ColumnTemplate[] =>
  Array.isArray(v) &&
  v.every(
    (t) => !!t && typeof t.id === "string" && typeof t.name === "string" && isStringList(t.columns),
  );

const NO_FILTER_TEMPLATES: FilterTemplate[] = [];

const isKnownColumn = (key: string) => CUSTOMER_COLUMN_MAP.has(key);
const NO_COLUMN_TEMPLATES: ColumnTemplate[] = [];

// A template of the same name (any case) is replaced; otherwise the new one is added.
function upsertByName<T extends { id: string; name: string }>(list: T[], item: Omit<T, "id">): T[] {
  const existing = list.find((t) => t.name.toLowerCase() === item.name.toLowerCase());
  const next = { ...item, id: existing?.id ?? crypto.randomUUID() } as T;
  return existing ? list.map((t) => (t.id === existing.id ? next : t)) : [...list, next];
}

export function CustomersView() {
  const { user } = useAuth();
  const canSeeDeleted = canDeleteCustomerRecords(user);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [addOpen, setAddOpen] = useState(false);
  const [registrationLinkOpen, setRegistrationLinkOpen] = useState(false);
  // The menu behind the Add button's arrow.
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  // Search, both filters and the sort live in the URL, so the list is the same after opening
  // a customer and coming back.
  const urlQuery = searchParams.get("q") ?? "";
  const view: ListView = listViewFrom(searchParams);
  const words = VIEW_WORDS[view];
  const rawStatus = searchParams.get("status");
  const rawType = searchParams.get("type");
  const legacy =
    rawStatus === null && rawType === null
      ? LEGACY_TAB_FILTERS[searchParams.get("tab") ?? ""]
      : undefined;
  // Each view reads only its own filters: status, account type and owner are the Customers view's,
  // supplier types and rating the Suppliers view's, any role the All view's.
  const inCustomers = view === "customers";
  const status = inCustomers ? (CUSTOMER_STATUSES.find((s) => s === (rawStatus ?? legacy?.status)) ?? "") : "";
  const accountType = inCustomers ? (CUSTOMER_LABELS.find((l) => l === (rawType ?? legacy?.type)) ?? "") : "";
  const owner = inCustomers ? ownerFilterFrom(searchParams.get("owner")) : "";
  const supplierTypes = useMemo(() => (view === "suppliers" ? supplierTypesFrom(searchParams) : []), [view, searchParams]);
  const ratingFilter = view === "suppliers" ? ratingFilterFrom(searchParams.get("rating")) : "";
  const role = view === "all" ? (ROLE_OPTIONS.find((o) => o.value === searchParams.get("role"))?.value ?? "") : "";
  // A view's own order unless the address names one (?sort=, "none" for the newest first).
  const rawSort = searchParams.get("sort") ?? VIEW_DEFAULT_SORT[view];
  const showDeleted = canSeeDeleted && searchParams.get("view") === DELETED_PILL.key;
  const sortKey = SORT_KEYS.find((key) => key === rawSort.replace(/^-/, ""));
  const sortDirection: SortDirection = rawSort.startsWith("-") ? "descend" : "ascend";

  // Lets the detail page's back link return to this list with its search, filters and sort.
  useEffect(() => {
    rememberCustomerListQuery(searchParams.toString());
  }, [searchParams]);

  // The box shows each keystroke at once; the request waits until typing pauses.
  const [search, setSearch] = useState(urlQuery);
  // The last ?q= this box wrote. URL updates land after the keystrokes that caused them, so only a
  // change from elsewhere (Back, a link) may overwrite the box — never the echo of an older keystroke.
  const writtenQuery = useRef(urlQuery);
  useEffect(() => {
    if (urlQuery === writtenQuery.current) return;
    writtenQuery.current = urlQuery;
    setSearch(urlQuery);
  }, [urlQuery]);
  const debouncedSearch = useDebounced(urlQuery, 300).trim();

  // The views of the list: Customers (the default), Suppliers, All (?kind=), each with how many it holds (m28).
  // A company that is both is in Customers and in Suppliers, so the two add up to more than All.
  const viewCounts = useCustomerViewCounts();
  const viewPills = LIST_VIEWS.map((v) => ({
    key: v,
    label: viewCounts ? `${VIEW_WORDS[v].pill} (${viewCounts[v]})` : VIEW_WORDS[v].pill,
    title: v === "all" ? undefined : "A company that is both a customer and a supplier is counted in each",
  }));

  const { customers, total, isFetching, isError, createCustomer, createManualCustomer, isCreating } =
    useCustomers(
      {
        search: debouncedSearch,
        status: status || undefined,
        label: accountType || undefined,
        role: role || undefined,
        kind: VIEW_KIND[view],
        // The view's own filters are the server's too, so they cover every company, not only the newest 2000.
        owner: owner || undefined,
        types: supplierTypes,
        rating: ratingFilter || undefined,
      },
      // The Deleted view lists other rows; the live ones are read again when it is left.
      { enabled: !showDeleted },
    );

  // "Filter by column" filters. The rows live here as typed (so a space between two words survives the typing)
  // and are copied to the URL as ?f.<column>=<value>, like the rest of the list's state, so they are still there
  // after opening a customer and coming back. They narrow the customers the server returned.
  // Several filters may be set on the same column (?f.city=a&f.city=b), so every value is read.
  const urlFilters = useMemo(() => filtersFromSearchParams(searchParams, isKnownColumn), [searchParams]);
  const [shownFilters, setShownFilters] = useState<GridFilter[]>(() => urlFilters.map(withFilterId));
  // The ?f. part this list last wrote; only a change from elsewhere (Back, a link) replaces the rows.
  const writtenFilters = useRef(JSON.stringify(urlFilters));
  useEffect(() => {
    const fromUrl = JSON.stringify(urlFilters);
    if (fromUrl === writtenFilters.current) return;
    writtenFilters.current = fromUrl;
    setShownFilters(urlFilters.map(withFilterId));
  }, [urlFilters]);
  const activeFilters = useMemo(() => storedGridFilters(shownFilters), [shownFilters]);

  // The user's own set-up of this list, kept in the customers service (not shared with the shipment grids).
  // Each view keeps its own columns, so laying out the suppliers never changes a rep's customer columns.
  const columnPref = useCustomerListPref<string[]>(
    VIEW_COLUMNS_PREF[view],
    DEFAULT_VIEW_COLUMNS[view],
    isStringList,
  );
  const filterTemplates = useCustomerListPref(
    "filter-templates",
    NO_FILTER_TEMPLATES,
    isFilterTemplates,
  );
  const columnTemplates = useCustomerListPref(
    "column-templates",
    NO_COLUMN_TEMPLATES,
    isColumnTemplates,
  );
  const visibleColumns = useMemo(
    () => normalizeCustomerColumns(columnPref.value),
    [columnPref.value],
  );
  // A saved filter on a column the list no longer has is dropped, not left to empty the list.
  const knownFilterTemplates = useMemo(
    () => filterTemplates.value.map((t) => ({ ...t, filters: t.filters.filter((f) => isKnownColumn(f.key)) })),
    [filterTemplates.value],
  );

  // The table shows one page at a time, so sorting has to happen here, over all rows, and
  // not in the table's own column sorters (they would only reorder the visible page).
  const rows = useMemo(() => {
    // After a failed request the rows still in memory may be out of date; the error is shown instead.
    if (isError) return [];
    // The column filters narrow what the server returned.
    const kept = activeFilters.length ? customers.filter((c) => matchesGridFilters(c, activeFilters, customerCellText)) : customers;
    if (!sortKey) return kept;
    const direction = sortDirection === "ascend" ? 1 : -1;
    // Equal ones by name, whichever way the column is sorted.
    return [...kept].sort((a, b) => direction * COMPARE[sortKey](a, b) || COMPARE.name(a, b));
  }, [customers, isError, sortKey, sortDirection, activeFilters]);

  const hasFilters =
    !!debouncedSearch || !!status || !!accountType || !!owner || supplierTypes.length > 0 || !!ratingFilter || !!role || activeFilters.length > 0;
  let emptyText =
    view === "suppliers"
      ? "No suppliers yet. Add one, or give a company a supplier role in its CRM card."
      : `No ${words.many} yet — add one from the Czech ARES registry`;
  if (hasFilters) emptyText = `No ${words.many} match these filters.`;
  if (isFetching) emptyText = `Loading ${words.many}…`;
  if (isError) emptyText = `Could not load ${words.many}.`;

  const replaceParams = (patch: Partial<Record<ListParam, string>>, { dropColumnFilters = false }: { dropColumnFilters?: boolean } = {}) => {
    const next: Record<ListParam, string> = {
      q: search,
      // Customers is the view of a plain address.
      kind: view === "customers" ? "" : view,
      status,
      type: accountType,
      owner,
      types: supplierTypes.join(","),
      rating: ratingFilter,
      role,
      // The view's own order is not written; "none" keeps the newest first in a view that sorts by default.
      sort: rawSort === VIEW_DEFAULT_SORT[view] ? "" : sortKey ? rawSort : "none",
      view: showDeleted ? DELETED_PILL.key : "",
      ...patch,
    };
    let params = new URLSearchParams(searchParams.toString());
    // A legacy ?tab= is already part of status / type above, so it is replaced by them.
    params.delete("tab");
    // A change of view drops the column filters too: a filter on one view's values would empty another (m27).
    if (dropColumnFilters) {
      params = writeFiltersToSearchParams(params, []);
      writtenFilters.current = "[]";
      setShownFilters([]);
    }
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    writtenQuery.current = e.target.value;
    replaceParams({ q: e.target.value });
  };

  const handleViewChange = (key: string) =>
    key === DELETED_PILL.key
      ? replaceParams({ ...VIEW_FILTER_PARAMS, view: DELETED_PILL.key }, { dropColumnFilters: true })
      : replaceParams({ ...VIEW_FILTER_PARAMS, kind: key === "customers" ? "" : key, view: "" }, { dropColumnFilters: true });

  const handleStatusChange = (value?: string) => replaceParams({ status: value ?? "" });

  const handleAccountTypeChange = (value?: string) => replaceParams({ type: value ?? "" });

  const handleOwnerChange = (value?: string) => replaceParams({ owner: value ?? "" });

  const handleSupplierTypesChange = (values: string[]) => replaceParams({ types: values.join(",") });

  const handleRatingChange = (value?: string) => replaceParams({ rating: value ?? "" });

  const handleRoleChange = (value?: string) => replaceParams({ role: value ?? "" });

  const handleTableChange: NonNullable<TableProps<CustomerItem>["onChange"]> = (
    _pagination,
    _filters,
    sorter,
  ) => {
    const active = Array.isArray(sorter) ? sorter[0] : sorter;
    const key = SORT_KEYS.find((k) => k === active?.columnKey);
    const next = key && active?.order ? `${active.order === "descend" ? "-" : ""}${key}` : "";
    // Back to the view's own order is a plain address; off it, in a view that sorts by default, "none".
    replaceParams({ sort: next === VIEW_DEFAULT_SORT[view] ? "" : next || (VIEW_DEFAULT_SORT[view] ? "none" : "") });
  };

  // A change of the filter rows: shown at once, and the ones that filter copied to the URL.
  const handleFiltersChange = (next: GridFilter[]) => {
    setShownFilters(next);
    const active = storedGridFilters(next);
    writtenFilters.current = JSON.stringify(active);
    const params = writeFiltersToSearchParams(new URLSearchParams(searchParams.toString()), active);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // Templates are changed on the list as stored now (read again first), so one saved in another tab is kept.
  const handleSaveFilterTemplate = async (name: string, active: StoredFilter[]) => {
    await filterTemplates.update((list) => upsertByName(list, { name, filters: active }));
  };

  const handleDeleteFilterTemplate = (id: string) => {
    void filterTemplates.update((list) => list.filter((t) => t.id !== id));
  };

  // Nothing is saved before the user's stored layout is read: a layout built on the defaults would replace it.
  const handleColumnsChange = (keys: string[]) => {
    if (!columnPref.loaded) return;
    void columnPref.save(normalizeCustomerColumns(keys));
  };

  const handleSaveColumnTemplate = async (name: string) => {
    await columnTemplates.update((list) => upsertByName(list, { name, columns: visibleColumns }));
  };

  const handleDeleteColumnTemplate = (id: string) => {
    void columnTemplates.update((list) => list.filter((t) => t.id !== id));
  };

  // Reordering the columns: the pencil turns it on, and the column headers can then be dragged.
  const [reordering, setReordering] = useState(false);
  // A drag starts after a few pixels, so a plain click on a header still sorts.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = visibleColumns.indexOf(String(active.id));
    const to = visibleColumns.indexOf(String(over.id));
    // The customer's name stays first: nothing moves before it.
    if (from === -1 || to <= 0) return;
    handleColumnsChange(arrayMove(visibleColumns, from, to));
  };

  // Ticked rows (the checkbox column, as in Shipments). Kept as records, not keys: search and the view's
  // filters are the server's, so a ticked company they hide is gone from `customers`, yet it stays ticked
  // and is still exported. They belong to the view they were ticked in: another view starts with none.
  const [selectedRows, setSelectedRows] = useState<CustomerItem[]>([]);
  useEffect(() => {
    setSelectedRows((rows) => (rows.length ? [] : rows));
  }, [view, showDeleted]);

  // The ticked companies in the list's order and as the list has them now. One the search or the filters
  // hide now comes after them, as the server last returned it, or as it was when ticked.
  const handleExportSelected = () => {
    const ticked = new Set(selectedRows.map((c) => c.id));
    const shown = rows.filter((c) => ticked.has(c.id));
    const shownIds = new Set(shown.map((c) => c.id));
    const latest = new Map(customers.map((c) => [c.id, c]));
    const hidden = selectedRows.filter((c) => !shownIds.has(c.id)).map((c) => latest.get(c.id) ?? c);
    downloadCsv(`${words.many}-${businessToday()}.csv`, customerCsvRows([...shown, ...hidden], visibleColumns, words.one));
  };

  const handleAddOpen = () => setAddOpen(true);

  const handleAddClose = () => setAddOpen(false);

  const handleCreated = (customerId: string) => {
    setAddOpen(false);
    router.push(`/customers/${customerId}`);
  };

  // Sorting is done above, so the column only shows the arrows and reports the click.
  const sortColumn = (key: SortKey, firstClick: SortDirection) => {
    const sortDirections: SortDirection[] =
      firstClick === "ascend" ? ["ascend", "descend"] : ["descend", "ascend"];
    return { key, sorter: true, sortOrder: sortKey === key ? sortDirection : null, sortDirections };
  };

  // The name column keeps its logo and link; the others come from the column list, in the order the user chose.
  const nameColumn: ColumnsType<CustomerItem>[number] = {
    title: words.one,
    dataIndex: "companyName",
    fixed: "left",
    width: 230,
    ...sortColumn("name", "ascend"),
    render: (name: string, record) => (
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
          {record.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={apiFileUrl(record.logoUrl)} alt="" className="w-full h-full object-contain" />
          ) : (
            <span className="text-[11px] font-semibold text-slate-400">
              {name.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
        {/* The row opens the same page on click; without stopping the event here a
            Ctrl/Cmd-click would open a new tab and also navigate this one. */}
        <Link
          href={`/customers/${record.id}`}
          onClick={(e) => e.stopPropagation()}
          className={`font-medium ${LINK}`}
        >
          {name || record.ico}
        </Link>
        {/* A company that is both: said in the view that shows only one side of it. */}
        {view === "customers" && hasSupplierRole(record.roles) && <AlsoChip>also supplier</AlsoChip>}
        {view === "suppliers" && record.roles.includes("customer") && <AlsoChip>also customer</AlsoChip>}
      </div>
    ),
  };

  const columns: ColumnsType<CustomerItem> = visibleColumns.map((key) => {
    if (key === NAME_COLUMN_KEY) return nameColumn;
    const col = CUSTOMER_COLUMN_MAP.get(key)!;
    return {
      key,
      title: col.title,
      width: col.width,
      align: col.align,
      // While reordering, the header carries the column's id and can be dragged (DraggableHeaderCell).
      ...(reordering
        ? { onHeaderCell: () => ({ id: key }) as React.HTMLAttributes<HTMLTableCellElement> }
        : {}),
      ...(col.sort ? sortColumn(col.sort.key, col.sort.firstClick) : {}),
      render: (_: unknown, record: CustomerItem) => col.render(record),
    };
  });

  return (
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1400px] mx-auto flex flex-col gap-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className={PAGE_TITLE}>Customer Database</h1>
          <div role="group" aria-label="Customers or suppliers">
            <PillTabs
              tabs={canSeeDeleted ? [...viewPills, DELETED_PILL] : viewPills}
              active={showDeleted ? DELETED_PILL.key : view}
              onChange={handleViewChange}
            />
          </div>
        </div>

        {showDeleted ? (
          <DeletedCustomersPanel />
        ) : (
          <>
            <div className={`flex flex-wrap items-center justify-between gap-3 ${CARD} px-4 py-3`}>
              {/* One button with an arrow: Add, and behind the arrow the other way in, a link the company
                  registers itself by. Kept to one button so the toolbar fits on one row. */}
              <div className="flex items-center shrink-0">
                <button
                  type="button"
                  onClick={handleAddOpen}
                  className={`${BTN_PRIMARY} !rounded-r-none`}
                >
                  <PlusOutlined />
                  Add Customer / Supplier
                </button>
                {/* No tooltip over the open menu. */}
                <Tooltip title={addMenuOpen ? undefined : "More ways to add"}>
                  {/* The button is the menu's own child, so Esc or Tab out of the menu gives it the focus back. */}
                  <span className="inline-flex">
                    <Dropdown
                      trigger={["click"]}
                      placement="bottomRight"
                      open={addMenuOpen}
                      onOpenChange={setAddMenuOpen}
                      menu={{
                        items: [
                          {
                            key: "registration-link",
                            icon: <LinkOutlined />,
                            label: "Registration link",
                            onClick: () => setRegistrationLinkOpen(true),
                          },
                        ],
                      }}
                    >
                      <button
                        type="button"
                        aria-label="More ways to add"
                        aria-haspopup="menu"
                        aria-expanded={addMenuOpen}
                        className={`${BTN_PRIMARY} !w-8 !px-0 !rounded-l-none !border-l-indigo-400`}
                      >
                        <DownOutlined className="text-[10px]" />
                      </button>
                    </Dropdown>
                  </span>
                </Tooltip>
              </div>
              {/* Takes the rest of the row. It stays beside Add while it fits with the search at 180 px (the
                  search then grows to 240 px); past that the whole group goes below, and on a screen too
                  narrow even for that its own items wrap, so nothing sticks out of the card. */}
              <div className="flex flex-auto flex-wrap items-center justify-end gap-3">
                {/* antd's input is width: 100%, so it fills this box. */}
                <div className="w-[180px] grow shrink-0 max-w-[240px]">
                  <Input
                    placeholder={`Search ${words.many}...`}
                    aria-label={`Search ${words.many}`}
                    prefix={<SearchOutlined className="text-slate-400" />}
                    value={search}
                    onChange={handleSearchChange}
                    allowClear
                  />
                </div>
                <div className="w-px h-6 bg-slate-200 shrink-0" />
                {inCustomers && (
                  <>
                    <Select
                      value={status || undefined}
                      onChange={handleStatusChange}
                      options={STATUS_OPTIONS}
                      placeholder="All statuses"
                      aria-label="Status"
                      allowClear
                      className="w-32"
                    />
                    <Select
                      value={accountType || undefined}
                      onChange={handleAccountTypeChange}
                      options={ACCOUNT_TYPE_OPTIONS}
                      placeholder="All account types"
                      aria-label="Account type"
                      allowClear
                      className="w-44"
                    />
                    <Select
                      value={owner || undefined}
                      onChange={handleOwnerChange}
                      options={[...OWNER_FILTERS]}
                      placeholder="Any Sales Owner"
                      aria-label="Sales Owner"
                      allowClear
                      className="w-40"
                    />
                  </>
                )}
                {view === "suppliers" && (
                  <>
                    <Select
                      mode="multiple"
                      value={supplierTypes}
                      onChange={handleSupplierTypesChange}
                      options={SUPPLIER_TYPE_OPTIONS}
                      placeholder="All supplier types"
                      aria-label="Supplier type"
                      allowClear
                      maxTagCount="responsive"
                      // "First / last mile haulier" is longer than the box: the list shows it whole.
                      popupMatchSelectWidth={false}
                      className="w-52"
                    />
                    <Select
                      value={ratingFilter || undefined}
                      onChange={handleRatingChange}
                      options={[...RATING_FILTERS]}
                      placeholder="Any rating"
                      aria-label="Rating"
                      allowClear
                      className="w-36"
                    />
                  </>
                )}
                {view === "all" && (
                  <Select
                    value={role || undefined}
                    onChange={handleRoleChange}
                    options={ROLE_OPTIONS}
                    placeholder="All roles"
                    aria-label="Role"
                    allowClear
                    // "First / last mile haulier" is longer than the box: the list shows it whole.
                    popupMatchSelectWidth={false}
                    className="w-44"
                  />
                )}
                {/* The three icon buttons stay together when a narrow screen wraps the group. */}
                <div className="flex items-center gap-3">
                  <CustomerFiltersPopover
                    filters={shownFilters}
                    onChange={handleFiltersChange}
                    columns={FILTER_COLUMNS}
                    templates={knownFilterTemplates}
                    onSaveTemplate={handleSaveFilterTemplate}
                    onDeleteTemplate={handleDeleteFilterTemplate}
                    isSaving={filterTemplates.isSaving}
                    defaultColumn={NAME_COLUMN_KEY}
                  />
                  <CustomerColumnPicker
                    visible={visibleColumns}
                    onChange={handleColumnsChange}
                    templates={columnTemplates.value}
                    onSaveTemplate={handleSaveColumnTemplate}
                    onDeleteTemplate={handleDeleteColumnTemplate}
                    ready={columnPref.loaded}
                  />
                  <Tooltip title={reordering ? "Done reordering" : "Reorder columns"}>
                    <button
                      type="button"
                      aria-label="Reorder columns"
                      aria-pressed={reordering}
                      disabled={!columnPref.loaded}
                      onClick={() => setReordering((on) => !on)}
                      // On: the toolbar button in the app's active indigo ("!" over its own frame and fill).
                      className={
                        reordering
                          ? `${TOOLBAR_BUTTON_CLASS} !border-indigo-500 !bg-indigo-50 !text-indigo-600`
                          : TOOLBAR_BUTTON_CLASS
                      }
                    >
                      <EditOutlined />
                    </button>
                  </Tooltip>
                </div>
              </div>
            </div>

            {reordering && (
              <div className="-mt-2 rounded-lg bg-indigo-50 px-4 py-2 text-[13px] text-indigo-700">
                Drag the column headers to change their order. {words.one} stays first. Click the pencil
                again when you are done.
              </div>
            )}

            {/* Bulk action bar (shown when rows are ticked), as in Shipments. */}
            {selectedRows.length > 0 && (
              <div
                role="region"
                aria-label="Bulk actions"
                className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-2.5"
              >
                <span className="text-[13px] text-indigo-700 font-medium">{selectedRows.length} selected</span>
                <Button size="small" icon={<DownloadOutlined />} onClick={handleExportSelected}>
                  Export CSV
                </Button>
                <Button size="small" type="text" onClick={() => setSelectedRows([])}>
                  Clear
                </Button>
              </div>
            )}

            <ListCapNotice shown={customers.length} total={total} noun={words.many} />

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={visibleColumns} strategy={horizontalListSortingStrategy}>
                <DataTable<CustomerItem>
                  // Heads and cells stay on one line, as in Shipments: a column is always as wide as its
                  // widest head or cell (long free text is cut in customerListColumns).
                  className="[&_.ant-table-cell]:!whitespace-nowrap"
                  resizeKey="customers"
                  components={reordering ? { header: { cell: DraggableHeaderCell } } : undefined}
                  dataSource={rows}
                  columns={columns}
                  rowKey="id"
                  loading={isFetching}
                  rowSelection={{
                    selectedRowKeys: selectedRows.map((c) => c.id),
                    // Ticked rows on other pages come back from antd's own store of them.
                    onChange: (_keys, picked) => setSelectedRows(picked.filter(Boolean)),
                    preserveSelectedRowKeys: true,
                    fixed: true,
                    columnWidth: 44,
                  }}
                  scroll={{ x: "max-content" }}
                  resetKey={`${view}|${debouncedSearch}|${status}|${accountType}|${owner}|${supplierTypes.join(",")}|${ratingFilter}|${role}|${sortKey ?? ""}|${sortDirection}|${JSON.stringify(activeFilters)}`}
                  locale={{ emptyText }}
                  onChange={handleTableChange}
                  onRow={(record) => ({
                    // Ticking the row's checkbox must not open the row.
                    onClick: (e) => {
                      if ((e.target as HTMLElement).closest(".ant-table-selection-column")) return;
                      router.push(`/customers/${record.id}`);
                    },
                    className: "cursor-pointer",
                  })}
                />
              </SortableContext>
            </DndContext>
          </>
        )}

        <RegistrationLinkModal open={registrationLinkOpen} onClose={() => setRegistrationLinkOpen(false)} />
      <AddCustomerModal
          open={addOpen}
          onClose={handleAddClose}
          onCreated={handleCreated}
          createCustomer={createCustomer}
          createManualCustomer={createManualCustomer}
          isCreating={isCreating}
        />
      </div>
    </div>
  );
}

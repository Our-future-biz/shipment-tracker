"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import type { ChangeEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input, Select, Tooltip } from "antd";
import type { TableProps } from "antd";
import { EditOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
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
import { useCustomers, type CustomerItem } from "@/hooks/useCustomers";
import { useCustomerListPref } from "@/hooks/useCustomerListPref";
import { useDebounced } from "@/hooks/useDebounced";
import { CUSTOMER_LABELS, CUSTOMER_ROLES, CUSTOMER_STATUSES, customerRoleOptions } from "../_lib/constants";
import { CustomerHaulierBadge } from "./CustomerHaulierBadge";
import { rememberCustomerListQuery } from "../_lib/customerListHref";
import { marginPct } from "../_lib/customerMoney";
import {
  CUSTOMER_COLUMN_MAP,
  CUSTOMER_LIST_COLUMNS,
  DEFAULT_CUSTOMER_COLUMNS,
  NAME_COLUMN_KEY,
  SORT_KEYS,
  customerCellText,
  normalizeCustomerColumns,
  type SortKey,
} from "../_lib/customerListColumns";
import { AddCustomerModal } from "./AddCustomerModal";
import { CustomerColumnPicker, type ColumnTemplate } from "./CustomerColumnPicker";
import { CustomerFiltersPopover, type FilterTemplate, type StoredFilter } from "./CustomerFiltersPopover";
import { TOOLBAR_BUTTON_CLASS, matchesGridFilters, storedGridFilters, withFilterId, type GridFilter } from "@/components/gridFilters";
import { filtersFromSearchParams, writeFiltersToSearchParams } from "../_lib/customerListFilters";
import { useAuth, useCanSeeConcepts } from "@/lib/auth/AuthContext";
import { canDeleteCustomerRecords } from "../_lib/customerPermissions";
import { DeletedCustomersPanel } from "./DeletedCustomersPanel";
import { apiFileUrl } from "@/lib/api";

const STATUS_PILLS = [
  { key: "all", label: "All" },
  ...CUSTOMER_STATUSES.map((status) => ({ key: status, label: status })),
];

// Superadmins also get the deleted customers, to restore one (?view=deleted).
const DELETED_PILL = { key: "deleted", label: "Deleted" };
const PILLS_WITH_DELETED = [...STATUS_PILLS, DELETED_PILL];

const ACCOUNT_TYPE_OPTIONS = CUSTOMER_LABELS.map((label) => ({ value: label, label }));

// The page used to be filtered by ?tab=. The old values are still read when neither ?status=
// nor ?type= is present, so a bookmark from that time opens the same list.
const LEGACY_TAB_FILTERS: Record<string, { status?: string; type?: string }> = {
  active: { status: "Active" },
  prospects: { status: "Prospect" },
  key: { type: "KEY ACCOUNT" },
  risk: { type: "RISK" },
};

type ListParam = "q" | "status" | "type" | "role" | "sort" | "view";

type SortDirection = "ascend" | "descend";

const COMPARE: Record<SortKey, (a: CustomerItem, b: CustomerItem) => number> = {
  // Names come from the Czech registry, so they are ordered the Czech way (Č after C, CH after H).
  name: (a, b) => a.companyName.localeCompare(b.companyName, "cs", { sensitivity: "base" }),
  // Rollup amounts are not converted, so they are only compared within a currency: grouped by it first.
  revenue: (a, b) => a.currency.localeCompare(b.currency) || a.totalRevenue - b.totalRevenue,
  margin: (a, b) =>
    marginPct(a.totalRevenue, a.totalProfit) - marginPct(b.totalRevenue, b.totalProfit),
  activity: (a, b) => (a.lastActivityDate || "").localeCompare(b.lastActivityDate || ""),
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
  const canSeeConcepts = useCanSeeConcepts();
  const canSeeDeleted = canDeleteCustomerRecords(useAuth().user);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [addOpen, setAddOpen] = useState(false);

  // Search, both filters and the sort live in the URL, so the list is the same after opening
  // a customer and coming back.
  const urlQuery = searchParams.get("q") ?? "";
  const rawStatus = searchParams.get("status");
  const rawType = searchParams.get("type");
  const legacy =
    rawStatus === null && rawType === null
      ? LEGACY_TAB_FILTERS[searchParams.get("tab") ?? ""]
      : undefined;
  const status = CUSTOMER_STATUSES.find((s) => s === (rawStatus ?? legacy?.status)) ?? "";
  const accountType = CUSTOMER_LABELS.find((l) => l === (rawType ?? legacy?.type)) ?? "";
  const role = CUSTOMER_ROLES.find((r) => r === searchParams.get("role")) ?? "";
  const rawSort = searchParams.get("sort") ?? "";
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

  const { customers, total, isFetching, isError, createCustomer, createManualCustomer, isCreating } =
    useCustomers(
      {
        search: debouncedSearch,
        status: status || undefined,
        label: accountType || undefined,
        role: role || undefined,
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
  const columnPref = useCustomerListPref<string[]>(
    "columns",
    DEFAULT_CUSTOMER_COLUMNS,
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
    const kept = activeFilters.length
      ? customers.filter((c) => matchesGridFilters(c, activeFilters, customerCellText))
      : customers;
    if (!sortKey) return kept;
    const direction = sortDirection === "ascend" ? 1 : -1;
    return [...kept].sort((a, b) => direction * COMPARE[sortKey](a, b));
  }, [customers, isError, sortKey, sortDirection, activeFilters]);

  const hasFilters = !!debouncedSearch || !!status || !!accountType || !!role || activeFilters.length > 0;
  let emptyText = "No customers yet — add one from the Czech ARES registry";
  if (hasFilters) emptyText = "No customers match these filters.";
  if (isFetching) emptyText = "Loading customers…";
  if (isError) emptyText = "Could not load customers.";

  const replaceParams = (patch: Partial<Record<ListParam, string>>) => {
    const next: Record<ListParam, string> = {
      q: search,
      status,
      type: accountType,
      role,
      sort: sortKey ? rawSort : "",
      view: showDeleted ? DELETED_PILL.key : "",
      ...patch,
    };
    const params = new URLSearchParams(searchParams.toString());
    // A legacy ?tab= is already part of status / type above, so it is replaced by them.
    params.delete("tab");
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

  const handleStatusChange = (key: string) =>
    key === DELETED_PILL.key
      ? replaceParams({ status: "", view: DELETED_PILL.key })
      : replaceParams({ status: key === "all" ? "" : key, view: "" });

  const handleAccountTypeChange = (value?: string) => replaceParams({ type: value ?? "" });

  const handleRoleChange = (value?: string) => replaceParams({ role: value ?? "" });

  const handleTableChange: NonNullable<TableProps<CustomerItem>["onChange"]> = (
    _pagination,
    _filters,
    sorter,
  ) => {
    const active = Array.isArray(sorter) ? sorter[0] : sorter;
    const key = SORT_KEYS.find((k) => k === active?.columnKey);
    replaceParams({
      sort: key && active?.order ? `${active.order === "descend" ? "-" : ""}${key}` : "",
    });
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
    title: "Customer",
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
          className="font-medium text-indigo-600 hover:underline"
        >
          {name || record.ico}
        </Link>
        <CustomerHaulierBadge roles={record.roles} />
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
          <h1 className="text-2xl font-bold text-slate-900">Customer Database</h1>
          <div role="group" aria-label="Filter by status">
            <PillTabs
              tabs={canSeeDeleted ? PILLS_WITH_DELETED : STATUS_PILLS}
              active={showDeleted ? DELETED_PILL.key : status || "all"}
              onChange={handleStatusChange}
            />
          </div>
        </div>

        {showDeleted ? (
          <DeletedCustomersPanel />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={handleAddOpen}
                  className="flex items-center gap-1.5 shrink-0 rounded-lg bg-indigo-600 px-3 h-8 text-[13px] font-semibold text-white hover:bg-indigo-700 transition-colors cursor-pointer"
                >
                  <PlusOutlined />
                  Add Customer
                </button>
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-auto">
                {/* antd gives the input width: 100% outside Tailwind's cascade layers, where a plain
                    w-60 cannot override it — hence the important flag. */}
                <Input
                  placeholder="Search customers..."
                  aria-label="Search customers"
                  prefix={<SearchOutlined className="text-slate-400" />}
                  value={search}
                  onChange={handleSearchChange}
                  allowClear
                  className="!w-60"
                />
                <div className="w-px h-6 bg-slate-200 shrink-0" />
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
                  value={role || undefined}
                  onChange={handleRoleChange}
                  options={customerRoleOptions(canSeeConcepts)}
                  placeholder="All roles"
                  aria-label="Role"
                  allowClear
                  // "First / last mile haulier" is longer than the box: the list shows it whole.
                  popupMatchSelectWidth={false}
                  className="w-44"
                />
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
                    className={
                      reordering
                        ? "flex items-center justify-center shrink-0 rounded-lg border w-8 h-8 p-0 transition-colors cursor-pointer border-indigo-500 bg-indigo-50 text-indigo-600"
                        : `${TOOLBAR_BUTTON_CLASS} cursor-pointer disabled:cursor-not-allowed disabled:opacity-50`
                    }
                  >
                    <EditOutlined />
                  </button>
                </Tooltip>
              </div>
            </div>

            {reordering && (
              <div className="-mt-2 rounded-lg bg-indigo-50 px-4 py-2 text-[13px] text-indigo-700">
                Drag the column headers to change their order. Customer stays first. Click the pencil
                again when you are done.
              </div>
            )}

            <ListCapNotice shown={customers.length} total={total} noun="customers" />

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={visibleColumns} strategy={horizontalListSortingStrategy}>
                <DataTable<CustomerItem>
                  components={reordering ? { header: { cell: DraggableHeaderCell } } : undefined}
                  dataSource={rows}
                  columns={columns}
                  rowKey="id"
                  loading={isFetching}
                  scroll={{ x: "max-content" }}
                  resetKey={`${debouncedSearch}|${status}|${accountType}|${role}|${sortKey ?? ""}|${sortDirection}|${JSON.stringify(activeFilters)}`}
                  locale={{ emptyText }}
                  onChange={handleTableChange}
                  onRow={(record) => ({
                    onClick: () => router.push(`/customers/${record.id}`),
                    className: "cursor-pointer",
                  })}
                />
              </SortableContext>
            </DndContext>
          </>
        )}

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

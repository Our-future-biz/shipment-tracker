"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input, Select } from "antd";
import type { TableProps } from "antd";
import { PlusOutlined, SearchOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { DataTable } from "@/components/DataTable";
import { PillTabs } from "@/components/SectionCard";
import { useCustomers, type CustomerItem } from "@/hooks/useCustomers";
import { formatDate } from "@/lib/date";
import { useDebounced } from "@/hooks/useDebounced";
import { CUSTOMER_LABELS, CUSTOMER_STATUSES } from "../_lib/constants";
import { rememberCustomerListQuery } from "../_lib/customerListHref";
import { fmtMoney, marginPct } from "../_lib/customerMoney";
import { AddCustomerModal } from "./AddCustomerModal";
import { CustomerAccountTypeBadge } from "./CustomerAccountTypeBadge";
import { CustomerStatusDot } from "./CustomerStatusDot";
import { EMPTY_CELL } from "../_lib/customerTable";

const STATUS_PILLS = [{ key: "all", label: "All" }, ...CUSTOMER_STATUSES.map((status) => ({ key: status, label: status }))];

const ACCOUNT_TYPE_OPTIONS = CUSTOMER_LABELS.map((label) => ({ value: label, label }));

// The page used to be filtered by ?tab=. The old values are still read when neither ?status=
// nor ?type= is present, so a bookmark from that time opens the same list.
const LEGACY_TAB_FILTERS: Record<string, { status?: string; type?: string }> = {
  active: { status: "Active" },
  prospects: { status: "Prospect" },
  key: { type: "KEY ACCOUNT" },
  risk: { type: "RISK" },
};

type ListParam = "q" | "status" | "type" | "sort";

// ?sort= holds one of these keys, with a leading "-" for descending.
const SORT_KEYS = ["name", "revenue", "margin", "activity"] as const;
type SortKey = (typeof SORT_KEYS)[number];
type SortDirection = "ascend" | "descend";

const COMPARE: Record<SortKey, (a: CustomerItem, b: CustomerItem) => number> = {
  // Names come from the Czech registry, so they are ordered the Czech way (Č after C, CH after H).
  name: (a, b) => a.companyName.localeCompare(b.companyName, "cs", { sensitivity: "base" }),
  revenue: (a, b) => a.totalRevenue - b.totalRevenue,
  margin: (a, b) => marginPct(a.totalRevenue, a.totalProfit) - marginPct(b.totalRevenue, b.totalProfit),
  activity: (a, b) => (a.lastActivityDate || "").localeCompare(b.lastActivityDate || ""),
};

export function CustomersView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [addOpen, setAddOpen] = useState(false);

  // Search, both filters and the sort live in the URL, so the list is the same after opening
  // a customer and coming back.
  const urlQuery = searchParams.get("q") ?? "";
  const rawStatus = searchParams.get("status");
  const rawType = searchParams.get("type");
  const legacy = rawStatus === null && rawType === null ? LEGACY_TAB_FILTERS[searchParams.get("tab") ?? ""] : undefined;
  const status = CUSTOMER_STATUSES.find((s) => s === (rawStatus ?? legacy?.status)) ?? "";
  const accountType = CUSTOMER_LABELS.find((l) => l === (rawType ?? legacy?.type)) ?? "";
  const rawSort = searchParams.get("sort") ?? "";
  const sortKey = SORT_KEYS.find((key) => key === rawSort.replace(/^-/, ""));
  const sortDirection: SortDirection = rawSort.startsWith("-") ? "descend" : "ascend";

  // Lets the detail page's back link return to this list with its search, filters and sort.
  useEffect(() => {
    rememberCustomerListQuery(searchParams.toString());
  }, [searchParams]);

  // The box shows each keystroke at once; the request waits until typing pauses.
  const [search, setSearch] = useState(urlQuery);
  useEffect(() => {
    setSearch(urlQuery);
  }, [urlQuery]);
  const debouncedSearch = useDebounced(urlQuery, 300).trim();

  const { customers, isFetching, isError, createCustomer, isCreating } = useCustomers({
    search: debouncedSearch,
    status: status || undefined,
    label: accountType || undefined,
  });

  // The table shows one page at a time, so sorting has to happen here, over all rows, and
  // not in the table's own column sorters (they would only reorder the visible page).
  const rows = useMemo(() => {
    // After a failed request the rows still in memory may be out of date; the error is shown instead.
    if (isError) return [];
    if (!sortKey) return customers;
    const direction = sortDirection === "ascend" ? 1 : -1;
    return [...customers].sort((a, b) => direction * COMPARE[sortKey](a, b));
  }, [customers, isError, sortKey, sortDirection]);

  const hasFilters = !!debouncedSearch || !!status || !!accountType;
  let emptyText = "No customers yet — add one from the Czech ARES registry";
  if (hasFilters) emptyText = "No customers match these filters.";
  if (isFetching) emptyText = "Loading customers…";
  if (isError) emptyText = "Could not load customers.";

  const replaceParams = (patch: Partial<Record<ListParam, string>>) => {
    const next: Record<ListParam, string> = { q: search, status, type: accountType, sort: sortKey ? rawSort : "", ...patch };
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
    replaceParams({ q: e.target.value });
  };

  const handleStatusChange = (key: string) => replaceParams({ status: key === "all" ? "" : key });

  const handleAccountTypeChange = (value?: string) => replaceParams({ type: value ?? "" });

  const handleTableChange: NonNullable<TableProps<CustomerItem>["onChange"]> = (_pagination, _filters, sorter) => {
    const active = Array.isArray(sorter) ? sorter[0] : sorter;
    const key = SORT_KEYS.find((k) => k === active?.columnKey);
    replaceParams({ sort: key && active?.order ? `${active.order === "descend" ? "-" : ""}${key}` : "" });
  };

  const handleAddOpen = () => setAddOpen(true);

  const handleAddClose = () => setAddOpen(false);

  const handleCreated = (customerId: string) => {
    setAddOpen(false);
    router.push(`/customers/${customerId}`);
  };

  // Sorting is done above, so the column only shows the arrows and reports the click.
  const sortColumn = (key: SortKey, firstClick: SortDirection) => {
    const sortDirections: SortDirection[] = firstClick === "ascend" ? ["ascend", "descend"] : ["descend", "ascend"];
    return { key, sorter: true, sortOrder: sortKey === key ? sortDirection : null, sortDirections };
  };

  const columns: ColumnsType<CustomerItem> = [
    {
      title: "Customer",
      dataIndex: "companyName",
      fixed: "left",
      width: 230,
      ...sortColumn("name", "ascend"),
      render: (name: string, record) => (
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
            {record.logoData ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={record.logoData} alt="" className="w-full h-full object-contain" />
            ) : (
              <span className="text-[11px] font-semibold text-slate-400">{name.slice(0, 2).toUpperCase()}</span>
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
        </div>
      ),
    },
    { title: "IČO", dataIndex: "ico", width: 96, render: (v: string) => <span className="font-mono text-xs">{v}</span> },
    { title: "Country", dataIndex: "country", width: 78, render: (v: string) => v || EMPTY_CELL },
    { title: "Sales Owner", dataIndex: "salesOwner", width: 130, render: (v: string) => v || EMPTY_CELL },
    {
      title: "Account Type",
      dataIndex: "label",
      width: 146,
      render: (label: string) => <CustomerAccountTypeBadge label={label} />,
    },
    { title: "Status", dataIndex: "status", width: 100, render: (value: string) => <CustomerStatusDot status={value} /> },
    {
      title: "Revenue",
      dataIndex: "totalRevenue",
      width: 116,
      align: "right",
      ...sortColumn("revenue", "descend"),
      render: (v: number, record) => <span className="text-slate-600 tabular-nums">{fmtMoney(v, record.currency)}</span>,
    },
    {
      title: "Margin",
      width: 90,
      align: "right",
      ...sortColumn("margin", "descend"),
      render: (_: unknown, record) => (
        <span className="text-slate-600 tabular-nums">{marginPct(record.totalRevenue, record.totalProfit)}%</span>
      ),
    },
    {
      title: "Last activity",
      dataIndex: "lastActivityDate",
      width: 118,
      ...sortColumn("activity", "descend"),
      render: (v: string) => formatDate(v) || EMPTY_CELL,
    },
  ];

  return (
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1400px] mx-auto flex flex-col gap-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-2xl font-bold text-slate-900">Customer Database</h1>
          <div role="group" aria-label="Filter by status">
            <PillTabs tabs={STATUS_PILLS} active={status || "all"} onChange={handleStatusChange} />
          </div>
        </div>

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
          </div>
        </div>

        <DataTable<CustomerItem>
          dataSource={rows}
          columns={columns}
          rowKey="id"
          loading={isFetching}
          scroll={{ x: "max-content" }}
          resetKey={`${debouncedSearch}|${status}|${accountType}|${sortKey ?? ""}|${sortDirection}`}
          locale={{ emptyText }}
          onChange={handleTableChange}
          onRow={(record) => ({
            onClick: () => router.push(`/customers/${record.id}`),
            className: "cursor-pointer",
          })}
        />

        <AddCustomerModal
          open={addOpen}
          onClose={handleAddClose}
          onCreated={handleCreated}
          createCustomer={createCustomer}
          isCreating={isCreating}
        />
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input, Select } from "antd";
import { PlusOutlined, SearchOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { useCustomers, type CustomerItem } from "@/hooks/useCustomers";
import { CUSTOMER_LIST_TABS, labelStyle, statusDotColor, fmtMoney, marginPct } from "../_lib/constants";
import { AddCustomerModal } from "./AddCustomerModal";

type SortKey = "createdAt" | "revenue" | "margin" | "lastActivity";

export function CustomersView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { customers, isLoading } = useCustomers();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [countryFilter, setCountryFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<SortKey>("createdAt");
  const [addOpen, setAddOpen] = useState(false);

  const rawTab = searchParams.get("tab");
  const activeTab = CUSTOMER_LIST_TABS.some((t) => t.key === rawTab) ? (rawTab as string) : "all";

  const setActiveTab = (key: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (key === "all") params.delete("tab");
    else params.set("tab", key);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const countries = useMemo(
    () => Array.from(new Set(customers.map((c) => c.country).filter(Boolean))).sort(),
    [customers],
  );

  const filtered = useMemo(() => {
    let rows = [...customers];

    // Tab filter (from the POC's Customer-database sidebar)
    if (activeTab === "active") rows = rows.filter((c) => c.status === "Active");
    else if (activeTab === "prospects") rows = rows.filter((c) => c.status === "Prospect");
    else if (activeTab === "key") rows = rows.filter((c) => c.label === "KEY ACCOUNT");
    else if (activeTab === "risk") rows = rows.filter((c) => c.label === "RISK");

    if (statusFilter) rows = rows.filter((c) => c.status === statusFilter);
    if (countryFilter) rows = rows.filter((c) => c.country === countryFilter);

    if (search) {
      const s = search.toLowerCase();
      rows = rows.filter(
        (c) =>
          c.companyName.toLowerCase().includes(s) ||
          c.ico.toLowerCase().includes(s) ||
          c.dic.toLowerCase().includes(s),
      );
    }

    rows.sort((a, b) => {
      switch (sortBy) {
        case "revenue":
          return b.totalRevenue - a.totalRevenue;
        case "margin":
          return marginPct(b.totalRevenue, b.totalProfit) - marginPct(a.totalRevenue, a.totalProfit);
        case "lastActivity":
          return (b.lastActivityDate || "").localeCompare(a.lastActivityDate || "");
        default:
          return (b.createdAt || "").localeCompare(a.createdAt || "");
      }
    });

    return rows;
  }, [customers, activeTab, statusFilter, countryFilter, search, sortBy]);

  const columns: ColumnsType<CustomerItem> = [
    {
      title: "Customer",
      dataIndex: "companyName",
      fixed: "left",
      width: 280,
      render: (name: string, record) => (
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
            {record.logoData ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={record.logoData} alt="" className="w-full h-full object-contain" />
            ) : (
              <span className="text-[11px] font-semibold text-slate-400">
                {name.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <span className="font-medium text-slate-700">{name}</span>
        </div>
      ),
    },
    { title: "IČO", dataIndex: "ico", width: 110, render: (v: string) => <span className="font-mono text-xs">{v}</span> },
    { title: "Country", dataIndex: "country", width: 90 },
    { title: "Sales Owner", dataIndex: "salesOwner", width: 140, render: (v: string) => v || <span className="text-slate-300">—</span> },
    {
      title: "Account Type",
      dataIndex: "label",
      width: 150,
      render: (label: string) => {
        const s = labelStyle(label);
        return (
          <span className="rounded-xl text-[11px] font-medium px-2.5 py-0.5" style={{ backgroundColor: s.bg, color: s.text }}>
            {label}
          </span>
        );
      },
    },
    {
      title: "Status",
      dataIndex: "status",
      width: 120,
      render: (status: string) => (
        <span className="inline-flex items-center gap-1.5 text-[13px] text-slate-600">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: statusDotColor(status) }} />
          {status}
        </span>
      ),
    },
    {
      title: "Revenue",
      dataIndex: "totalRevenue",
      width: 130,
      align: "right",
      render: (v: number, record) => <span className="text-slate-600">{fmtMoney(v, record.currency)}</span>,
    },
  ];

  return (
    <div className="bg-slate-50 min-h-full p-6">
      <div className="max-w-[1600px] mx-auto">
        <PageHeader
          title="Customer Database"
          extra={
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
              Add Customer
            </Button>
          }
        />

        {/* Tab navigation (from the POC's customer sidebar) */}
        <div className="flex gap-0 mb-4 border-b border-slate-200">
          {CUSTOMER_LIST_TABS.map((tab) => (
            <div
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm cursor-pointer transition-all duration-150 border-b-2 ${
                activeTab === tab.key
                  ? "font-semibold text-indigo-500 border-indigo-500"
                  : "font-normal text-slate-400 border-transparent hover:text-slate-600"
              }`}
            >
              {tab.label}
            </div>
          ))}
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3 mb-4">
          <Input
            placeholder="Search name, IČO, DIČ…"
            prefix={<SearchOutlined className="text-slate-400" />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            className="w-64"
          />
          <Select
            value={statusFilter || undefined}
            onChange={(v) => setStatusFilter(v ?? "")}
            allowClear
            placeholder="All statuses"
            className="w-40"
            options={["Active", "Prospect", "Inactive"].map((s) => ({ value: s, label: s }))}
          />
          <Select
            value={countryFilter || undefined}
            onChange={(v) => setCountryFilter(v ?? "")}
            allowClear
            placeholder="All countries"
            className="w-40"
            options={countries.map((c) => ({ value: c, label: c }))}
          />
          <Select
            value={sortBy}
            onChange={setSortBy}
            className="w-48 ml-auto"
            options={[
              { value: "createdAt", label: "Recently added" },
              { value: "revenue", label: "Revenue ↓" },
              { value: "margin", label: "Margin % ↓" },
              { value: "lastActivity", label: "Last activity" },
            ]}
          />
        </div>

        <DataTable<CustomerItem>
          dataSource={filtered}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          scroll={{ x: "max-content" }}
          resetKey={`${activeTab}${search}${statusFilter}${countryFilter}`}
          locale={{ emptyText: "No customers yet — add one from the Czech ARES registry" }}
          onRow={(record) => ({
            onClick: () => router.push(`/customers/${record.id}`),
            className: "cursor-pointer",
          })}
        />

        <AddCustomerModal
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onCreated={(id) => {
            setAddOpen(false);
            router.push(`/customers/${id}`);
          }}
        />
      </div>
    </div>
  );
}

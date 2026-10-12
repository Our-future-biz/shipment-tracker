"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, DatePicker, Input, Select } from "antd";
import type { ColumnsType } from "antd/es/table";
import { PlusOutlined, SearchOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { DataTable } from "@/components/DataTable";
import { DROPDOWN_OPTIONS } from "@/lib/columnConfig";
import { formatDate } from "@/lib/date";
import type { MasterJobItem } from "@/hooks/useMasterJobs";

interface MasterJobsListProps {
  masterJobs: MasterJobItem[];
  isLoading: boolean;
  creating: boolean;
  onCreate: () => void;
}

// Filters live in the URL (?q=, ?load=, ?dir=, ?line=, ?etd=from,to) so a list
// left for a master job comes back exactly as it was.
type FilterKey = "q" | "load" | "dir" | "line" | "etd";

const byText = (a: string, b: string) => a.localeCompare(b);
const byDate = (a: string | null, b: string | null) => (a ?? "").localeCompare(b ?? "");

export function MasterJobsList({ masterJobs, isLoading, creating, onCreate }: MasterJobsListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const get = (key: FilterKey) => searchParams.get(key) ?? "";
  const q = get("q").trim().toLowerCase();
  const load = get("load");
  const dir = get("dir");
  const line = get("line");
  const [etdFrom, etdTo] = get("etd").split(",");

  const setFilter = (key: FilterKey, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const qs = params.toString();
    router.replace(qs ? `/master-jobs?${qs}` : "/master-jobs", { scroll: false });
  };

  const openHref = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("open", id);
    return `/master-jobs?${params.toString()}`;
  };

  const lines = useMemo(
    () => [...new Set(masterJobs.map((m) => m.shippingLine.trim()).filter(Boolean))].sort(byText),
    [masterJobs],
  );

  const rows = useMemo(
    () =>
      masterJobs.filter((m) => {
        if (q) {
          const haystack = [m.mczNumber, m.masterBolNumber, m.bookingNumber, m.vessel, m.voyage, m.shipper, m.consignee]
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        if (load && m.loadType !== load) return false;
        if (dir && m.tradeDirection !== dir) return false;
        if (line && m.shippingLine.trim() !== line) return false;
        if (etdFrom && (!m.estimatedDeparture || m.estimatedDeparture < etdFrom)) return false;
        if (etdTo && (!m.estimatedDeparture || m.estimatedDeparture > etdTo)) return false;
        return true;
      }),
    [masterJobs, q, load, dir, line, etdFrom, etdTo],
  );

  const columns: ColumnsType<MasterJobItem> = [
    {
      title: "Master Job",
      dataIndex: "mczNumber",
      width: 140,
      sorter: (a, b) => byText(a.mczNumber, b.mczNumber),
      render: (v: string, m) => (
        <Link href={openHref(m.id)} className="font-mono font-semibold text-indigo-600 hover:underline">
          {v}
        </Link>
      ),
    },
    { title: "Master BoL Number", dataIndex: "masterBolNumber", width: 160, sorter: (a, b) => byText(a.masterBolNumber, b.masterBolNumber) },
    { title: "Load Type", dataIndex: "loadType", width: 130 },
    { title: "Direction", dataIndex: "tradeDirection", width: 100 },
    { title: "Shipping line / Coloader", dataIndex: "shippingLine", width: 180, sorter: (a, b) => byText(a.shippingLine, b.shippingLine) },
    {
      title: "Vessel / Voyage",
      key: "vessel",
      width: 180,
      render: (_, m) => [m.vessel, m.voyage].filter(Boolean).join(" / "),
    },
    { title: "POL", dataIndex: "pol", width: 100 },
    { title: "POD", dataIndex: "pod", width: 100 },
    {
      title: "ETD",
      dataIndex: "estimatedDeparture",
      width: 110,
      sorter: (a, b) => byDate(a.estimatedDeparture, b.estimatedDeparture),
      render: (v: string | null) => formatDate(v ?? ""),
    },
    {
      title: "ETA",
      dataIndex: "estimatedArrival",
      width: 110,
      sorter: (a, b) => byDate(a.estimatedArrival, b.estimatedArrival),
      render: (v: string | null) => formatDate(v ?? ""),
    },
    {
      title: "Shipments",
      dataIndex: "shipmentCount",
      width: 100,
      align: "right",
      sorter: (a, b) => a.shipmentCount - b.shipmentCount,
    },
  ];

  const filtered = !!(q || load || dir || line || etdFrom || etdTo);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Master Jobs</h1>
        <Button type="primary" icon={<PlusOutlined />} loading={creating} onClick={onCreate}>
          New master job
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          allowClear
          className="w-[300px]"
          prefix={<SearchOutlined className="text-slate-400" />}
          placeholder="Search MCZ, MBL, booking, vessel…"
          defaultValue={get("q")}
          onChange={(e) => setFilter("q", e.target.value)}
        />
        <Select
          allowClear
          className="w-[170px]"
          placeholder="Load Type"
          value={load || undefined}
          options={(DROPDOWN_OPTIONS["Load Type"] ?? []).map((v) => ({ value: v, label: v }))}
          onChange={(v) => setFilter("load", v ?? "")}
        />
        <Select
          allowClear
          className="w-[140px]"
          placeholder="Direction"
          value={dir || undefined}
          options={(DROPDOWN_OPTIONS["Trade Direction"] ?? []).map((v) => ({ value: v, label: v }))}
          onChange={(v) => setFilter("dir", v ?? "")}
        />
        <Select
          allowClear
          showSearch
          className="w-[200px]"
          placeholder="Shipping line / Coloader"
          value={line || undefined}
          options={lines.map((v) => ({ value: v, label: v }))}
          onChange={(v) => setFilter("line", v ?? "")}
        />
        <DatePicker.RangePicker
          placeholder={["ETD from", "ETD to"]}
          format="DD.MM.YYYY"
          value={etdFrom || etdTo ? [etdFrom ? dayjs(etdFrom) : null, etdTo ? dayjs(etdTo) : null] : null}
          onChange={(range) =>
            setFilter(
              "etd",
              range && (range[0] || range[1])
                ? `${range[0]?.format("YYYY-MM-DD") ?? ""},${range[1]?.format("YYYY-MM-DD") ?? ""}`
                : "",
            )
          }
        />
        {filtered && (
          <Button type="link" onClick={() => router.replace("/master-jobs", { scroll: false })}>
            Clear filters
          </Button>
        )}
      </div>

      <DataTable<MasterJobItem>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={rows}
        resetKey={searchParams.toString()}
        scroll={{ x: "max-content" }}
        locale={{ emptyText: filtered ? "No master jobs match the filters." : "No master jobs yet." }}
      />
    </div>
  );
}

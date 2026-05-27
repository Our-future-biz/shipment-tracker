"use client";

import { useMemo, useState } from "react";
import { Table, Input, Select } from "antd";
import { SearchOutlined, PlusOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useRouter } from "next/navigation";
import type { ShipmentItem } from "@/hooks/useShipments";

// --- Props ---

interface ShipmentsTableProps {
  shipments: ShipmentItem[];
  isLoading: boolean;
  onCreateClick: () => void;
  onDelete: (shipment: ShipmentItem) => void;
}

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "active", label: "Active" },
  { value: "in-transit", label: "In Transit" },
  { value: "customs", label: "Customs" },
  { value: "delivered", label: "Delivered" },
];

const PAGE_SIZE_OPTIONS = [
  { value: 10, label: "10" },
  { value: 25, label: "25" },
  { value: 50, label: "50" },
];

export const ShipmentsTable = ({
  shipments,
  isLoading,
  onCreateClick,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onDelete,
}: ShipmentsTableProps) => {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pageSize, setPageSize] = useState(25);

  // Filter by status + search
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return shipments.filter((s) => {
      // Status filter
      if (statusFilter !== "all") {
        const status = (s.status || "").toLowerCase();
        if (statusFilter === "active" && !status.includes("active") && !status.includes("pending") && !status.includes("new")) return false;
        if (statusFilter === "in-transit" && !status.includes("transport") && !status.includes("shipped") && !status.includes("pre-alert") && !status.includes("loaded")) return false;
        if (statusFilter === "customs" && !status.includes("customs")) return false;
        if (statusFilter === "delivered" && !status.includes("billed") && !status.includes("billing") && !status.includes("delivered")) return false;
      }
      // Search filter
      if (q) {
        const haystack = [s.jobNumber, s.customer, s.personInCharge]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [shipments, statusFilter, search]);

  // Columns
  const columns: ColumnsType<ShipmentItem> = useMemo(
    () => [
      {
        key: "jobNumber",
        title: "Internal Reference",
        width: 160,
        render: (_: unknown, record: ShipmentItem) => (
          <span className="font-mono font-bold text-indigo-500 hover:underline cursor-pointer">
            {record.jobNumber || "\u2014"}
          </span>
        ),
      },
      {
        key: "masterJobMczNumber",
        title: "Master Job",
        width: 140,
        render: (_: unknown, record: ShipmentItem) =>
          record.masterJobMczNumber ? (
            <span className="text-slate-400">#{record.masterJobMczNumber}</span>
          ) : (
            <span className="text-slate-300">{"\u2014"}</span>
          ),
      },
      {
        key: "shipmentsDate",
        title: "Shipments Date",
        width: 130,
        render: (_: unknown, record: ShipmentItem) =>
          record.shipmentsDate || <span className="text-slate-300">{"\u2014"}</span>,
      },
      {
        key: "department",
        title: "Department",
        width: 130,
        render: (_: unknown, record: ShipmentItem) =>
          record.department || <span className="text-slate-300">{"\u2014"}</span>,
      },
      {
        key: "personInCharge",
        title: "Person in Charge",
        width: 150,
        render: (_: unknown, record: ShipmentItem) =>
          record.personInCharge || <span className="text-slate-300">{"\u2014"}</span>,
      },
      {
        key: "holidayCover",
        title: "Holiday Cover",
        width: 140,
        render: (_: unknown, record: ShipmentItem) =>
          record.holidayCover ? (
            <span className="text-slate-400">{record.holidayCover}</span>
          ) : (
            <span className="text-slate-300">{"\u2014"}</span>
          ),
      },
      {
        key: "customer",
        title: "Customer",
        width: 180,
        ellipsis: true,
        render: (_: unknown, record: ShipmentItem) =>
          record.customer || <span className="text-slate-300">{"\u2014"}</span>,
      },
      {
        key: "customerPic",
        title: "Customer's PIC",
        width: 150,
        render: (_: unknown, record: ShipmentItem) =>
          record.customerPic || <span className="text-slate-300">{"\u2014"}</span>,
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Shipments</h1>
          <p className="text-sm text-slate-500">Manage and track all shipments</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onCreateClick}
            className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
          >
            <PlusOutlined />
            New Shipment
          </button>
          <button className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
            Add to Master Job
          </button>
        </div>
      </div>

      {/* Filters Row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Input
            placeholder="Search shipments..."
            prefix={<SearchOutlined className="text-slate-400" />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            className="w-64"
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            options={STATUS_OPTIONS}
            className="w-40"
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span>Rows per page</span>
          <Select
            value={pageSize}
            onChange={setPageSize}
            options={PAGE_SIZE_OPTIONS}
            className="w-16"
            size="small"
          />
          <span>{filtered.length} / {shipments.length} entries</span>
        </div>
      </div>

      {/* Table */}
      <Table<ShipmentItem>
        dataSource={filtered}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        size="small"
        pagination={{
          pageSize,
          showSizeChanger: false,
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} entries`,
        }}
        scroll={{ x: "max-content" }}
        onRow={(record) => ({
          onClick: () => router.push(`/shipments/${record.id}`),
          className: "cursor-pointer",
        })}
        locale={{ emptyText: "No shipments found" }}
      />
    </div>
  );
};

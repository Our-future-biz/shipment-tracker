"use client";

import { useMemo, useState } from "react";
import { Table, Input, Dropdown, Button } from "antd";
import { SearchOutlined, EllipsisOutlined, ExportOutlined, PlusOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/StatusBadge";
import { PageHeader } from "@/components/PageHeader";
import { isActiveStatus } from "@/lib/enums";
import { parseDateMMDDYY } from "@/lib/columnConfig";
import type { ShipmentItem } from "@/hooks/useShipments";

// ─── Status tab definitions ─────────────────────────────────────────

type TabKey = "all" | "active" | "in-transit" | "customs" | "delivered";

const STATUS_TABS: { key: TabKey; label: string; filter: (s: ShipmentItem) => boolean }[] = [
  { key: "all", label: "All", filter: () => true },
  { key: "active", label: "Active", filter: (s) => isActiveStatus(s.status) },
  {
    key: "in-transit",
    label: "In Transit",
    filter: (s) =>
      s.status.includes("Booked For Further Transport") ||
      s.status.includes("All Done - Waiting To Be Shipped") ||
      s.status.includes("Pre-Alert Sent") ||
      s.status.includes("Loaded - Customs Clearance"),
  },
  {
    key: "customs",
    label: "Customs",
    filter: (s) =>
      s.status.includes("Customs Clearance Pending") ||
      s.status.includes("Loaded - Customs Clearance"),
  },
  {
    key: "delivered",
    label: "Delivered",
    filter: (s) => s.status.includes("Billed [") || s.status.includes("Billing ["),
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────

function isOverdue(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const d = parseDateMMDDYY(dateStr);
  if (!d) return false;
  return d.getTime() < Date.now();
}

// ─── Props ───────────────────────────────────────────────────────────

interface ShipmentsTableProps {
  shipments: ShipmentItem[];
  isLoading: boolean;
  onCreateClick: () => void;
  onDelete: (shipment: ShipmentItem) => void;
}

export const ShipmentsTable = ({
  shipments,
  isLoading,
  onCreateClick,
  onDelete,
}: ShipmentsTableProps) => {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("all");

  // Filter by tab + search
  const filtered = useMemo(() => {
    const tabFilter = STATUS_TABS.find((t) => t.key === activeTab)?.filter ?? (() => true);
    const q = search.toLowerCase().trim();
    return shipments.filter((s) => {
      if (!tabFilter(s)) return false;
      if (q) {
        const haystack = [s.jobNumber, s.customer, s.pol, s.pod].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [shipments, activeTab, search]);

  // Tab counts
  const tabCounts = useMemo(() => {
    const counts: Record<TabKey, number> = { all: 0, active: 0, "in-transit": 0, customs: 0, delivered: 0 };
    for (const s of shipments) {
      for (const tab of STATUS_TABS) {
        if (tab.filter(s)) counts[tab.key]++;
      }
    }
    return counts;
  }, [shipments]);

  // Columns
  const columns: ColumnsType<ShipmentItem> = useMemo(
    () => [
      {
        key: "jobNumber",
        title: "Job #",
        width: 140,
        render: (_: unknown, record: ShipmentItem) => (
          <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#4f46e5", cursor: "pointer" }}>
            {record.jobNumber || "\u2014"}
          </span>
        ),
      },
      {
        key: "status",
        title: "Status",
        width: 200,
        render: (_: unknown, record: ShipmentItem) =>
          record.status ? <StatusBadge status={record.status} /> : <span style={{ color: "#cbd5e1" }}>{"\u2014"}</span>,
      },
      {
        key: "customer",
        title: "Customer",
        width: 180,
        ellipsis: true,
        render: (_: unknown, record: ShipmentItem) => record.customer || <span style={{ color: "#cbd5e1" }}>{"\u2014"}</span>,
      },
      {
        key: "route",
        title: "Route",
        width: 200,
        render: (_: unknown, record: ShipmentItem) => {
          const pol = record.pol;
          const pod = record.pod;
          if (!pol && !pod) return <span style={{ color: "#cbd5e1" }}>{"\u2014"}</span>;
          return (
            <span>
              {pol || "?"} <span style={{ color: "#94a3b8" }}>{"\u2192"}</span> {pod || "?"}
            </span>
          );
        },
      },
      {
        key: "freightMode",
        title: "Mode",
        width: 120,
        ellipsis: true,
        render: (_: unknown, record: ShipmentItem) => record.freightMode || <span style={{ color: "#cbd5e1" }}>{"\u2014"}</span>,
      },
      {
        key: "eta",
        title: "ETA",
        width: 120,
        render: (_: unknown, record: ShipmentItem) => {
          const val = record.estimatedArrival;
          if (!val) return <span style={{ color: "#cbd5e1" }}>{"\u2014"}</span>;
          const overdue = isOverdue(val);
          return <span style={overdue ? { color: "#ef4444", fontWeight: 600 } : undefined}>{val}</span>;
        },
      },
      {
        key: "_actions",
        title: "",
        width: 48,
        render: (_: unknown, record: ShipmentItem) => (
          <Dropdown
            trigger={["click"]}
            menu={{
              items: [
                {
                  key: "view",
                  label: "View",
                  onClick: () => router.push(`/shipments/${record.id}`),
                },
                {
                  key: "delete",
                  label: "Delete",
                  danger: true,
                  onClick: () => onDelete(record),
                },
              ],
            }}
          >
            <Button type="text" size="small" icon={<EllipsisOutlined />} onClick={(e) => e.stopPropagation()} />
          </Dropdown>
        ),
      },
    ],
    [router, onDelete],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <PageHeader
        title="Shipments"
        extra={
          <>
            <Button icon={<ExportOutlined />}>Export</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={onCreateClick}>
              New Shipment
            </Button>
          </>
        }
      />

      {/* Status tabs + search */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {STATUS_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 6,
                  border: "1px solid",
                  borderColor: isActive ? "#4f46e5" : "#e2e8f0",
                  background: isActive ? "#eef2ff" : "#fff",
                  color: isActive ? "#4f46e5" : "#64748b",
                  fontWeight: isActive ? 600 : 400,
                  fontSize: 13,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {tab.label}
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 11,
                    color: isActive ? "#4f46e5" : "#94a3b8",
                    fontWeight: 500,
                  }}
                >
                  {tabCounts[tab.key]}
                </span>
              </button>
            );
          })}
        </div>
        <Input
          placeholder="Search job #, customer, POL, POD..."
          prefix={<SearchOutlined style={{ color: "#94a3b8" }} />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          style={{ width: 280 }}
        />
      </div>

      {/* Table */}
      <Table<ShipmentItem>
        dataSource={filtered}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        size="small"
        pagination={{ pageSize: 20, showSizeChanger: false, showTotal: (total) => `${total} shipments` }}
        scroll={{ x: "max-content" }}
        onRow={(record) => ({
          onClick: () => router.push(`/shipments/${record.id}`),
          style: { cursor: "pointer" },
        })}
        locale={{ emptyText: "No shipments found" }}
      />
    </div>
  );
};

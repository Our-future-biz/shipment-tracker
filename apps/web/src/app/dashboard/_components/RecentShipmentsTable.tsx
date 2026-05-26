"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { AppCard } from "@/components/AppCard";
import { StatusBadge } from "@/components/StatusBadge";
import type { ShipmentItem } from "@/hooks/useShipments";

interface RecentShipmentsTableProps {
  shipments: ShipmentItem[];
}

export function RecentShipmentsTable({ shipments }: RecentShipmentsTableProps) {
  const router = useRouter();

  const recent = useMemo(() => [...shipments].slice(0, 5), [shipments]);

  const columns: ColumnsType<ShipmentItem> = [
    {
      title: "Job #",
      dataIndex: "jobNumber",
      key: "jobNumber",
      render: (val: string) => (
        <span style={{ color: "#4f46e5", fontWeight: 600, cursor: "pointer" }}>{val}</span>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (val: string) => <StatusBadge status={val} />,
    },
    {
      title: "Customer",
      dataIndex: "customer",
      key: "customer",
      ellipsis: true,
    },
    {
      title: "Route",
      key: "route",
      render: (_: unknown, record: ShipmentItem) => (
        <span style={{ color: "#64748b", fontSize: 12 }}>
          {record.pol || "—"} → {record.pod || "—"}
        </span>
      ),
    },
    {
      title: "Mode",
      dataIndex: "freightMode",
      key: "freightMode",
    },
    {
      title: "ETA",
      dataIndex: "estimatedArrival",
      key: "estimatedArrival",
      render: (val: string | null) => val || "—",
    },
  ];

  return (
    <AppCard
      title="Recent Shipments"
      extra={
        <span
          style={{ fontSize: 12, color: "#4f46e5", cursor: "pointer", fontWeight: 500 }}
          onClick={() => router.push("/shipments")}
        >
          View all →
        </span>
      }
    >
      <Table<ShipmentItem>
        dataSource={recent}
        columns={columns}
        rowKey="id"
        pagination={false}
        size="small"
        onRow={(record) => ({
          onClick: () => router.push(`/shipments/${record.id}`),
          style: { cursor: "pointer" },
        })}
      />
    </AppCard>
  );
}

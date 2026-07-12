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
        <span className="text-indigo-600 font-semibold cursor-pointer">{val}</span>
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
        <span className="text-slate-500 text-xs">
          {record.pol || "\u2014"} → {record.pod || "\u2014"}
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
      render: (val: string | null) => val || "\u2014",
    },
  ];

  return (
    <AppCard
      title="Recent Shipments"
      extra={
        <span
          className="text-xs text-indigo-600 cursor-pointer font-medium"
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

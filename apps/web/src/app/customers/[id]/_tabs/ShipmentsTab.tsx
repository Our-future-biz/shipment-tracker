"use client";

import { useState } from "react";
import { Table, Button, Tag } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useCustomerShipments, type ShipmentItem } from "@/hooks/useCustomerShipments";
import { useCustomer } from "@/hooks/useCustomers";
import { useToast } from "@/lib/toast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { fmtMoney } from "../../_lib/constants";

const MODE_COLOR: Record<string, string> = { AIR: "blue", SEA: "cyan", ROAD: "orange", RAIL: "purple" };

const num = (v: string | null | undefined) => {
  const n = parseFloat(v ?? "");
  return Number.isNaN(n) ? 0 : n;
};

export function ShipmentsTab({ customerId }: { customerId: string }) {
  const { shipments, isLoading, deleteShipment } = useCustomerShipments(customerId);
  const { customer } = useCustomer(customerId);
  const toast = useToast();
  const [deleteTarget, setDeleteTarget] = useState<ShipmentItem | null>(null);
  const columns: ColumnsType<ShipmentItem> = [
    { title: "Job", dataIndex: "jobNumber", width: 130, render: (v: string) => <span className="font-mono text-xs text-indigo-500">{v}</span> },
    {
      title: "Mode",
      dataIndex: "freightMode",
      width: 90,
      render: (v: string) => {
        if (!v) return <span className="text-slate-300">—</span>;
        const color = MODE_COLOR[v.toUpperCase()] ?? "default";
        return <Tag color={color}>{v}</Tag>;
      },
    },
    { title: "Direction", dataIndex: "tradeDirection", width: 100, render: (v: string) => v || <span className="text-slate-300">—</span> },
    {
      title: "Route",
      key: "route",
      width: 160,
      render: (_: unknown, r) => (
        <span className="text-slate-600">
          {r.pol || "—"} <span className="text-slate-300">→</span> {r.pod || "—"}
        </span>
      ),
    },
    { title: "Status", dataIndex: "status", width: 120 },
    { title: "ETD", dataIndex: "estimatedDeparture", width: 110, render: (v: string | null) => v || <span className="text-slate-300">—</span> },
    { title: "ETA", dataIndex: "estimatedArrival", width: 110, render: (v: string | null) => v || <span className="text-slate-300">—</span> },
    { title: "Revenue", key: "rev", width: 120, align: "right", render: (_: unknown, r) => fmtMoney(num(r.selling), customer?.currency) },
    {
      title: "Profit",
      key: "profit",
      width: 120,
      align: "right",
      render: (_: unknown, r) => {
        const p = num(r.selling) - num(r.buying);
        return <span className={p >= 0 ? "text-green-600" : "text-red-600"}>{fmtMoney(p, customer?.currency)}</span>;
      },
    },
    {
      title: "",
      key: "actions",
      width: 50,
      render: (_: unknown, r) => (
        <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => setDeleteTarget(r)} />
      ),
    },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="mb-3 text-sm font-semibold text-slate-800">Shipments</div>

      <Table<ShipmentItem>
        size="small"
        rowKey="id"
        loading={isLoading}
        dataSource={shipments}
        columns={columns}
        pagination={false}
        scroll={{ x: "max-content" }}
        locale={{ emptyText: "No shipments for this customer yet" }}
      />

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) await deleteShipment(deleteTarget.id);
          setDeleteTarget(null);
          toast.success("Shipment removed");
        }}
        title="Remove shipment"
        description={`Remove job ${deleteTarget?.jobNumber}?`}
        confirmLabel="Remove"
        danger
      />
    </div>
  );
}

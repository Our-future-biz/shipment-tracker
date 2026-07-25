"use client";

import { useEffect, useState } from "react";
import { Table, Button, Modal, Form, Input, InputNumber, Select, Tag } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useCustomerShipments, type ShipmentItem } from "@/hooks/useCustomerShipments";
import { useCustomer } from "@/hooks/useCustomers";
import { useToast } from "@/lib/toast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { TRANSPORT_MODES, SHIPMENT_DIRECTIONS, fmtMoney } from "../../_lib/constants";

const MODE_COLOR: Record<string, string> = { AIR: "blue", SEA: "cyan", ROAD: "orange", RAIL: "purple" };

const num = (v: string | null | undefined) => {
  const n = parseFloat(v ?? "");
  return Number.isNaN(n) ? 0 : n;
};

export function ShipmentsTab({ customerId }: { customerId: string }) {
  const { shipments, isLoading, createShipment, deleteShipment } = useCustomerShipments(customerId);
  const { customer, updateCustomer } = useCustomer(customerId);
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ShipmentItem | null>(null);
  const [form] = Form.useForm();

  // Keep the customer's stored rollups (used by the list view) in sync with its shipments.
  useEffect(() => {
    if (!customer) return;
    const totalRevenue = shipments.reduce((sum, s) => sum + num(s.selling), 0);
    const totalProfit = shipments.reduce((sum, s) => sum + (num(s.selling) - num(s.buying)), 0);
    const totalShipments = shipments.length;
    const lastActivityDate = shipments
      .map((s) => s.estimatedArrival || s.createdAt?.slice(0, 10) || "")
      .filter(Boolean)
      .sort()
      .pop() ?? "";
    if (
      customer.totalRevenue !== totalRevenue ||
      customer.totalProfit !== totalProfit ||
      customer.totalShipments !== totalShipments ||
      customer.lastActivityDate !== lastActivityDate
    ) {
      updateCustomer({ totalRevenue, totalProfit, totalShipments, lastActivityDate }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipments, customer?.id]);

  const submit = async () => {
    const v = await form.validateFields();
    try {
      await createShipment({
        jobNumber: v.jobNumber,
        customerId,
        customer: customer?.companyName ?? "",
        freightMode: v.freightMode,
        tradeDirection: v.tradeDirection,
        status: v.status || "In Progress",
        pol: v.pol ?? "",
        pod: v.pod ?? "",
        estimatedDeparture: v.estimatedDeparture || undefined,
        estimatedArrival: v.estimatedArrival || undefined,
        selling: v.selling != null ? String(v.selling) : "",
        buying: v.buying != null ? String(v.buying) : "",
      });
      toast.success("Shipment added");
      form.resetFields();
      setAddOpen(false);
    } catch {
      toast.error("Failed to add shipment (job number must be unique)");
    }
  };

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
    { title: "Revenue", key: "rev", width: 120, align: "right", render: (_: unknown, r) => fmtMoney(num(r.selling)) },
    {
      title: "Profit",
      key: "profit",
      width: 120,
      align: "right",
      render: (_: unknown, r) => {
        const p = num(r.selling) - num(r.buying);
        return <span className={p >= 0 ? "text-green-600" : "text-red-600"}>{fmtMoney(p)}</span>;
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
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-slate-800">Shipments</span>
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
          Add Shipment
        </Button>
      </div>

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

      <Modal open={addOpen} onCancel={() => setAddOpen(false)} onOk={submit} title="Add Shipment" okText="Add" width={560} destroyOnHidden>
        <Form
          form={form}
          layout="vertical"
          initialValues={{ freightMode: "SEA", tradeDirection: "IMPORT", status: "In Progress" }}
          className="pt-2 grid grid-cols-2 gap-x-4"
        >
          <Form.Item name="jobNumber" label="Job number" rules={[{ required: true, message: "Job number is required" }]}>
            <Input className="font-mono" />
          </Form.Item>
          <Form.Item name="status" label="Status">
            <Input />
          </Form.Item>
          <Form.Item name="freightMode" label="Mode">
            <Select options={TRANSPORT_MODES.map((m) => ({ value: m, label: m }))} />
          </Form.Item>
          <Form.Item name="tradeDirection" label="Direction">
            <Select options={SHIPMENT_DIRECTIONS.map((d) => ({ value: d, label: d }))} />
          </Form.Item>
          <Form.Item name="pol" label="POL (origin)">
            <Input />
          </Form.Item>
          <Form.Item name="pod" label="POD (destination)">
            <Input />
          </Form.Item>
          <Form.Item name="estimatedDeparture" label="ETD">
            <Input placeholder="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item name="estimatedArrival" label="ETA">
            <Input placeholder="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item name="selling" label="Revenue">
            <InputNumber className="w-full" min={0} />
          </Form.Item>
          <Form.Item name="buying" label="Cost">
            <InputNumber className="w-full" min={0} />
          </Form.Item>
        </Form>
      </Modal>

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

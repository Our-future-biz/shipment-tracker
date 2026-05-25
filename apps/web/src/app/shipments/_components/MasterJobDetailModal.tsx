"use client";

import { useState, useMemo } from "react";
import { Modal, Table, Tag, Button, Popconfirm, Tabs, Input, Select, Space, Alert } from "antd";
import { DisconnectOutlined } from "@ant-design/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getFieldValue, buildRowData, type ShipmentItem } from "@/hooks/useShipments";
import { computeDimensionTotals } from "@/lib/columnConfig";

interface MasterJobDetailModalProps {
  mczNumber: string;
  open: boolean;
  onClose: () => void;
  shipments: ShipmentItem[];
  onUnlink: (shipment: ShipmentItem) => void;
}

const CURRENCIES = ["CZK", "USD", "EUR", "GBP", "CNY"];
const COST_CATEGORIES = [
  { value: "freight", label: "Freight" },
  { value: "collection", label: "Collection/Delivery" },
  { value: "locals", label: "Locals" },
  { value: "others", label: "Others" },
  { value: "insurance", label: "Insurance" },
  { value: "customs", label: "Customs clearance" },
];

export const MasterJobDetailModal = ({ mczNumber, open, onClose, shipments, onUnlink }: MasterJobDetailModalProps) => {
  const members = useMemo(
    () => shipments.filter((s) => s.masterJobMczNumber === mczNumber),
    [shipments, mczNumber],
  );

  // Compute freight tons per member
  const memberRows = useMemo(() => {
    return members.map((s) => {
      const rowData = buildRowData(s);
      const dims = computeDimensionTotals(rowData["dimensions"] || "");
      const weightTons = dims.weightKg > 0 ? dims.weightKg / 1000 : parseFloat(s.totalWeightTons || "0") || 0;
      const cbm = dims.volumeCbm > 0 ? dims.volumeCbm : parseFloat(s.totalVolumeCbm || "0") || 0;
      const freightTon = Math.max(weightTons, cbm);
      return { ...s, weightTons, cbm, freightTon };
    });
  }, [members]);

  const totalFreightTons = memberRows.reduce((sum, r) => sum + r.freightTon, 0);
  const totalWeight = memberRows.reduce((sum, r) => sum + r.weightTons, 0);
  const totalCbm = memberRows.reduce((sum, r) => sum + r.cbm, 0);

  const shipmentColumns = [
    {
      title: "Job Number", dataIndex: "jobNumber", key: "jobNumber", width: 120,
      render: (val: string) => <span style={{ fontFamily: "monospace", color: "#0d9488", fontWeight: 500 }}>{val}</span>,
    },
    { title: "Shipper", dataIndex: "shipper", key: "shipper", ellipsis: true },
    { title: "Weight (t)", key: "weight", width: 90, align: "right" as const, render: (_: unknown, r: typeof memberRows[0]) => r.weightTons > 0 ? r.weightTons.toFixed(3) : "—" },
    { title: "CBM", key: "cbm", width: 80, align: "right" as const, render: (_: unknown, r: typeof memberRows[0]) => r.cbm > 0 ? r.cbm.toFixed(3) : "—" },
    { title: "Freight Ton", key: "ft", width: 90, align: "right" as const, render: (_: unknown, r: typeof memberRows[0]) => r.freightTon > 0 ? r.freightTon.toFixed(3) : "—" },
    { title: "Status", dataIndex: "status", key: "status", width: 120, render: (val: string) => val ? <Tag>{val}</Tag> : "—" },
    {
      title: "", key: "actions", width: 40,
      render: (_: unknown, record: ShipmentItem) => (
        <Popconfirm title={`Remove from ${mczNumber}?`} onConfirm={() => onUnlink(record)} okType="danger">
          <Button type="text" size="small" danger icon={<DisconnectOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <Modal
      title={<span>Master Job <strong style={{ fontFamily: "monospace", color: "#f59e0b" }}>{mczNumber}</strong> — {members.length} shipment{members.length !== 1 ? "s" : ""}</span>}
      open={open}
      onCancel={onClose}
      footer={<Button onClick={onClose}>Close</Button>}
      width={850}
      destroyOnClose
    >
      <Tabs
        size="small"
        items={[
          {
            key: "shipments",
            label: "Shipments",
            children: (
              <div>
                <Table
                  dataSource={memberRows}
                  columns={shipmentColumns}
                  rowKey="id"
                  size="small"
                  pagination={false}
                  summary={() => (
                    <Table.Summary fixed>
                      <Table.Summary.Row style={{ fontWeight: 700 }}>
                        <Table.Summary.Cell index={0}>Total</Table.Summary.Cell>
                        <Table.Summary.Cell index={1} />
                        <Table.Summary.Cell index={2} align="right">{totalWeight > 0 ? totalWeight.toFixed(3) : "—"}</Table.Summary.Cell>
                        <Table.Summary.Cell index={3} align="right">{totalCbm > 0 ? totalCbm.toFixed(3) : "—"}</Table.Summary.Cell>
                        <Table.Summary.Cell index={4} align="right">{totalFreightTons > 0 ? totalFreightTons.toFixed(3) : "—"}</Table.Summary.Cell>
                        <Table.Summary.Cell index={5} />
                        <Table.Summary.Cell index={6} />
                      </Table.Summary.Row>
                    </Table.Summary>
                  )}
                />
              </div>
            ),
          },
          {
            key: "machine",
            label: "Machine Processing",
            children: <MachineProcessingTab members={memberRows} totalFreightTons={totalFreightTons} mczNumber={mczNumber} />,
          },
        ]}
      />
    </Modal>
  );
};

// ─── Machine Processing (Cost Distribution) ───────────────────────

interface MemberWithTons extends ShipmentItem {
  weightTons: number;
  cbm: number;
  freightTon: number;
}

function MachineProcessingTab({ members, totalFreightTons, mczNumber }: { members: MemberWithTons[]; totalFreightTons: number; mczNumber: string }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"input" | "review">("input");
  const [invoiceValue, setInvoiceValue] = useState("");
  const [currency, setCurrency] = useState("CZK");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [category, setCategory] = useState("freight");
  const [submitting, setSubmitting] = useState(false);
  const [submitDone, setSubmitDone] = useState(false);

  const invValueNum = parseFloat(invoiceValue) || 0;
  const inputsValid = invValueNum > 0 && totalFreightTons > 0;

  // Calculate per-shipment allocation
  const allocations = useMemo(() => {
    if (!inputsValid) return [];
    return members.map((m) => {
      const share = totalFreightTons > 0 ? m.freightTon / totalFreightTons : 0;
      const amount = invValueNum * share;
      return { shipment: m, share, amount };
    });
  }, [members, invValueNum, totalFreightTons, inputsValid]);

  const zeroFreightShipments = members.filter((m) => m.freightTon === 0);

  const handleProceed = async () => {
    if (submitting || !inputsValid) return;
    setSubmitting(true);
    try {
      for (const alloc of allocations) {
        if (alloc.amount > 0) {
          await api.invoicing.invoicingUpsertCost(alloc.shipment.id, {
            category,
            realAmount: alloc.amount.toFixed(2),
            realCurrency: currency,
            invoiceNumber,
          });
        }
      }
      queryClient.invalidateQueries({ queryKey: ["invoicing"] });
      setSubmitDone(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitDone) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <Alert type="success" message={`Costs distributed to ${allocations.filter((a) => a.amount > 0).length} shipments`} style={{ marginBottom: 16 }} />
        <Button onClick={() => { setSubmitDone(false); setStep("input"); setInvoiceValue(""); }}>
          Distribute Another
        </Button>
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      {step === "input" && (
        <div>
          <p style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>
            Distribute an invoice total across shipments proportionally by Freight Tons.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4 }}>Invoice Total</label>
              <Input value={invoiceValue} onChange={(e) => setInvoiceValue(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4 }}>Currency</label>
              <Select value={currency} onChange={setCurrency} style={{ width: "100%" }} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4 }}>Invoice Number</label>
              <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="INV-001" />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4 }}>Cost Category</label>
              <Select value={category} onChange={setCategory} style={{ width: "100%" }} options={COST_CATEGORIES} />
            </div>
          </div>

          {/* Summary */}
          <div style={{ padding: 12, background: "#f8fafc", borderRadius: 6, marginBottom: 16, fontSize: 12 }}>
            <p><strong>Master Job:</strong> {mczNumber} · <strong>Shipments:</strong> {members.length} · <strong>Total Freight Tons:</strong> {totalFreightTons.toFixed(3)}</p>
            {invValueNum > 0 && totalFreightTons > 0 && (
              <p style={{ marginTop: 4 }}><strong>Rate per FT:</strong> {(invValueNum / totalFreightTons).toFixed(4)} {currency}</p>
            )}
          </div>

          {zeroFreightShipments.length > 0 && (
            <Alert type="warning" style={{ marginBottom: 12 }}
              message={`${zeroFreightShipments.length} shipment(s) have 0 Freight Tons and won't receive any allocation. Add dimensions first.`}
            />
          )}

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button type="primary" disabled={!inputsValid} onClick={() => setStep("review")}>
              Review Allocation
            </Button>
          </div>
        </div>
      )}

      {step === "review" && (
        <div>
          <p style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
            Review the allocation before pushing to each shipment&apos;s invoicing:
          </p>

          <Table
            dataSource={allocations}
            rowKey={(r) => r.shipment.id}
            size="small"
            pagination={false}
            columns={[
              { title: "Job Number", key: "job", render: (_, r) => <span style={{ fontFamily: "monospace", color: "#0d9488" }}>{r.shipment.jobNumber}</span> },
              { title: "Freight Ton", key: "ft", align: "right", render: (_, r) => r.shipment.freightTon.toFixed(3) },
              { title: "Share %", key: "share", align: "right", render: (_, r) => `${(r.share * 100).toFixed(1)}%` },
              { title: `Amount (${currency})`, key: "amount", align: "right", render: (_, r) => <strong>{r.amount.toFixed(2)}</strong> },
            ]}
            style={{ marginBottom: 16 }}
          />

          <Space>
            <Button onClick={() => setStep("input")}>Back</Button>
            <Button type="primary" loading={submitting} onClick={handleProceed}>
              Push Costs to {allocations.filter((a) => a.amount > 0).length} Shipments
            </Button>
          </Space>
        </div>
      )}
    </div>
  );
}

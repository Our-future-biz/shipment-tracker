"use client";

import { useState } from "react";
import { Modal, Tabs, Button, Checkbox, Upload, message, Steps, Descriptions, Tag, Input, Select, Space } from "antd";
import {
  ExpandOutlined,
  ShrinkOutlined,
  DeleteOutlined,
  FileOutlined,
  InboxOutlined,
} from "@ant-design/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { buildRowData, type ShipmentItem } from "@/hooks/useShipments";
import { useAuth } from "@/lib/auth/AuthContext";

// ─── Task definitions ─────────────────────────────────────────────

const IMPORT_TASKS = [
  { key: "imp_booking_to_agent", label: "Booking to agent" },
  { key: "imp_booking_confirmed", label: "Booking confirmed" },
  { key: "imp_cargo_readiness", label: "Cargo readiness confirmed" },
  { key: "imp_cargo_shipped", label: "Cargo shipped" },
  { key: "imp_pre_alert", label: "Pre-Alert received" },
  { key: "imp_arrival_notice", label: "Arrival notice sent" },
  { key: "imp_paperwork_received", label: "Paperwork received" },
  { key: "imp_paperwork_customs", label: "Paperwork provided to customs" },
  { key: "imp_cargo_released", label: "Cargo released for further transport" },
  { key: "imp_booked_transport", label: "Booked for further transport" },
  { key: "imp_departed_port", label: "Cargo departed from port" },
  { key: "imp_arrived_hub", label: "Cargo arrived to HUB" },
  { key: "imp_customs_cleared", label: "Cargo customs cleared" },
  { key: "imp_delivered", label: "Delivered" },
  { key: "imp_billed", label: "Billed" },
];

const EXPORT_TASKS = [
  { key: "exp_cargo_readiness", label: "Cargo readiness checked with customer" },
  { key: "exp_booked_line", label: "Booked with shipping line" },
  { key: "exp_booking_received", label: "Booking received" },
  { key: "exp_pre_carriage", label: "Pre-carriage booked" },
  { key: "exp_paperwork_customer", label: "Paperwork received from customer" },
  { key: "exp_draft_sent", label: "Draft sent to customer" },
  { key: "exp_vgm_filed", label: "VGM filed" },
  { key: "exp_si_filed", label: "Shipping Instructions filed" },
  { key: "exp_ams_filed", label: "AMS filed (only for US related cargo)" },
  { key: "exp_zapp_issued", label: "Zapp issued" },
  { key: "exp_zapp_released", label: "Zapp released" },
  { key: "exp_billed", label: "Billed" },
  { key: "exp_bl_provided", label: "Bill Of Lading provided to customer" },
];

const MILESTONE_STEPS = [
  "Booking confirmed",
  "Cargo ready",
  "In transit",
  "Arrived at POD",
  "Customs clearance",
  "Delivered",
];

const COST_CATEGORIES = [
  { key: "freight", label: "Freight" },
  { key: "collection", label: "Collection/Delivery" },
  { key: "locals", label: "Locals" },
  { key: "others", label: "Others" },
  { key: "insurance", label: "Insurance" },
  { key: "customs", label: "Customs clearance" },
];

const CURRENCIES = ["CZK", "USD", "EUR", "GBP", "CNY"];

// ─── Types ────────────────────────────────────────────────────────

interface TaskState {
  taskKey: string;
  completed: boolean;
  completedAt: string | null;
  completedById: string | null;
}

interface AttachmentFile {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  createdAt: string;
}

interface ShipmentDetailModalProps {
  shipment: ShipmentItem;
  open: boolean;
  onClose: () => void;
}

// ─── Main Modal ────────────────────────────────────────────────────

export const ShipmentDetailModal = ({ shipment, open, onClose }: ShipmentDetailModalProps) => {
  const [maximized, setMaximized] = useState(false);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch tasks
  const tasksQuery = useQuery({
    queryKey: ["shipment-tasks", shipment.id],
    queryFn: () => api.shipments.taskList(shipment.id),
    enabled: open,
  });

  const taskUpsert = useMutation({
    mutationFn: (params: { taskKey: string; completed: boolean }) =>
      api.shipments.taskUpsert(shipment.id, {
        taskKey: params.taskKey,
        completed: params.completed,
        completedById: user?.id,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shipment-tasks", shipment.id] }),
  });

  // Fetch attachments
  const attachmentsQuery = useQuery({
    queryKey: ["shipment-attachments", shipment.id],
    queryFn: () => api.shipments.attachmentList(shipment.id),
    enabled: open,
  });

  const deleteAttachment = useMutation({
    mutationFn: (attachmentId: string) => api.shipments.attachmentDelete(shipment.id, attachmentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shipment-attachments", shipment.id] }),
  });

  const tasks: TaskState[] = tasksQuery.data?.tasks ?? [];
  const attachments: AttachmentFile[] = (attachmentsQuery.data?.attachments ?? []) as AttachmentFile[];
  const rowData = buildRowData(shipment);
  const tradeDirection = shipment.tradeDirection || "Import";
  const taskList = tradeDirection === "Export" ? EXPORT_TASKS : IMPORT_TASKS;

  const isTaskCompleted = (key: string) => tasks.find((t) => t.taskKey === key)?.completed ?? false;
  const getTaskCompletedAt = (key: string) => tasks.find((t) => t.taskKey === key)?.completedAt;

  const handleTaskToggle = (key: string) => {
    if (isTaskCompleted(key)) return;
    taskUpsert.mutate({ taskKey: key, completed: true });
  };

  const completedTaskCount = taskList.filter((t) => isTaskCompleted(t.key)).length;
  const milestoneStep = Math.min(Math.floor((completedTaskCount / taskList.length) * MILESTONE_STEPS.length), MILESTONE_STEPS.length - 1);

  const contentHeight = maximized ? "calc(95vh - 130px)" : 560;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={maximized ? "95vw" : 960}
      title={null}
      closable={false}
      destroyOnClose
      centered={!maximized}
      style={maximized ? { top: 20, paddingBottom: 0 } : undefined}
      styles={{ body: { padding: 0 }, header: { display: "none" } }}
    >
      {/* Custom header */}
      <div style={{ display: "flex", alignItems: "center", padding: "12px 20px", borderBottom: "1px solid #f0f0f0" }}>
        <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#0d9488", fontSize: 15 }}>{shipment.jobNumber}</span>
        <span style={{ margin: "0 10px", color: "#d1d5db" }}>—</span>
        <span style={{ fontSize: 13, color: "#6b7280" }}>{shipment.shipper || "—"}</span>
        {shipment.tradeDirection && <Tag style={{ marginLeft: 8 }}>{shipment.tradeDirection}</Tag>}
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          <Button
            type="text"
            size="small"
            icon={maximized ? <ShrinkOutlined /> : <ExpandOutlined />}
            onClick={() => setMaximized(!maximized)}
          />
          <Button type="text" size="small" onClick={onClose}>✕</Button>
        </div>
      </div>

      <Tabs
        defaultActiveKey="details"
        tabBarStyle={{ paddingLeft: 20, marginBottom: 0 }}
        items={[
          {
            key: "details",
            label: "Details",
            children: (
              <div style={{ height: contentHeight, overflow: "auto", padding: 20 }}>
                <Steps
                  size="small"
                  current={milestoneStep}
                  items={MILESTONE_STEPS.map((step) => ({ title: step }))}
                  style={{ marginBottom: 24 }}
                />

                <Descriptions size="small" column={3} bordered style={{ marginBottom: 20 }} items={[
                  { key: "customer", label: "Customer", children: rowData["customer"] || "—" },
                  { key: "shipper", label: "Shipper", children: shipment.shipper || "—" },
                  { key: "consignee", label: "Consignee", children: shipment.consignee || "—" },
                  { key: "incotermOrigin", label: "Incoterm Origin", children: shipment.incotermOrigin || "—" },
                  { key: "incotermDest", label: "Incoterm Dest.", children: shipment.incotermDestination || "—" },
                  { key: "container", label: "Container #", children: shipment.containerNumber || "—" },
                  { key: "shippingLine", label: "Shipping Line", children: shipment.shippingLine || "—" },
                  { key: "masterBol", label: "Master BoL", children: shipment.masterBolNumber || "—" },
                  { key: "tradeDir", label: "Trade Direction", children: shipment.tradeDirection || "—" },
                  { key: "pickup", label: "Pickup Address", span: 2, children: rowData["pickupAddress"] || "—" },
                  { key: "delivery", label: "Delivery Address", children: rowData["deliveryAddress"] || "—" },
                ]} />

                <div style={{ marginBottom: 8 }}>
                  <strong style={{ fontSize: 13 }}>{tradeDirection} Tasks ({completedTaskCount}/{taskList.length})</strong>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 24px" }}>
                  {taskList.map((task) => {
                    const completed = isTaskCompleted(task.key);
                    const completedAt = getTaskCompletedAt(task.key);
                    return (
                      <div key={task.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
                        <Checkbox checked={completed} onChange={() => handleTaskToggle(task.key)} disabled={completed} />
                        <span style={{ fontSize: 12, color: completed ? "#9ca3af" : undefined, textDecoration: completed ? "line-through" : undefined, flex: 1 }}>
                          {task.label}
                        </span>
                        {completedAt && <span style={{ fontSize: 10, color: "#9ca3af" }}>{new Date(completedAt).toLocaleDateString()}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ),
          },
          {
            key: "costs",
            label: "Costs",
            children: (
              <div style={{ height: contentHeight, overflow: "auto" }}>
                <CostsTab shipment={shipment} />
              </div>
            ),
          },
          {
            key: "documents",
            label: `Documents (${attachments.length})`,
            children: (
              <div style={{ height: contentHeight, overflow: "auto", padding: 20 }}>
                <Upload.Dragger
                  name="file"
                  multiple
                  action={`/api/shipments/${shipment.id}/attachments`}
                  onChange={(info) => {
                    if (info.file.status === "done") {
                      queryClient.invalidateQueries({ queryKey: ["shipment-attachments", shipment.id] });
                      message.success(`${info.file.name} uploaded`);
                    }
                  }}
                  showUploadList={false}
                  style={{ marginBottom: 16 }}
                >
                  <p><InboxOutlined style={{ fontSize: 28, color: "#0d9488" }} /></p>
                  <p style={{ fontSize: 13, marginTop: 8 }}>Drag files here or click to browse</p>
                </Upload.Dragger>

                {attachments.length === 0 ? (
                  <p style={{ textAlign: "center", color: "#94a3b8", fontSize: 13, padding: 32 }}>No documents yet</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {attachments.map((file) => (
                      <div key={file.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", border: "1px solid #f0f0f0", borderRadius: 6 }}>
                        <FileOutlined style={{ color: "#94a3b8" }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 500 }}>{file.fileName}</div>
                          <div style={{ fontSize: 11, color: "#94a3b8" }}>{formatFileSize(file.fileSize)} · {file.fileType}</div>
                        </div>
                        <span style={{ fontSize: 11, color: "#94a3b8" }}>{new Date(file.createdAt).toLocaleDateString()}</span>
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => deleteAttachment.mutate(file.id)} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ),
          },
          {
            key: "warehouse",
            label: "Warehouse",
            children: (
              <div style={{ height: contentHeight, overflow: "auto" }}>
                <WarehouseTab shipment={shipment} />
              </div>
            ),
          },
          {
            key: "tracking",
            label: "Tracking",
            children: (
              <div style={{ height: contentHeight, overflow: "auto", padding: 20 }}>
                <TrackingTimeline tasks={tasks} taskList={taskList} />
              </div>
            ),
          },
        ]}
      />
    </Modal>
  );
};

// ─── Helpers ──────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Costs Tab (Editable) ─────────────────────────────────────────

interface CostRow {
  key: string;
  label: string;
  estAmount: string;
  estCurrency: string;
  realAmount: string;
  realCurrency: string;
  invoiceNumber: string;
  vendor: string;
}

function CostsTab({ shipment }: { shipment: ShipmentItem }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["invoicing", shipment.id],
    queryFn: () => api.invoicing.invoicingGet(shipment.id),
  });

  const upsertCost = useMutation({
    mutationFn: (params: { category: string; estAmount?: string; estCurrency?: string; realAmount?: string; realCurrency?: string; invoiceNumber?: string; vendor?: string }) =>
      api.invoicing.invoicingUpsertCost(shipment.id, params),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoicing", shipment.id] }),
  });

  const upsertBilling = useMutation({
    mutationFn: (params: { billingCurrency?: string; roe?: string }) =>
      api.invoicing.invoicingUpsertBillingSettings(shipment.id, params),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoicing", shipment.id] }),
  });

  const upsertOverride = useMutation({
    mutationFn: (params: { rowKey: string; billingAmount: string }) =>
      api.invoicing.invoicingUpsertBillingOverride(shipment.id, params),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoicing", shipment.id] }),
  });

  if (isLoading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 128, color: "#94a3b8" }}>Loading costs...</div>;

  const costs = data?.costs ?? [];
  const billing = data?.billingSettings;
  const overrides = data?.billingOverrides ?? [];
  const overrideMap: Record<string, string> = {};
  for (const ov of overrides) if (ov.billingAmount) overrideMap[ov.rowKey] = ov.billingAmount;

  const parseCostNum = (v: string | null | undefined) => { const n = parseFloat(v || ""); return isNaN(n) ? 0 : n; };
  const fmtNum = (n: number) => n.toLocaleString("en", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  const costRows: CostRow[] = COST_CATEGORIES.map((cat) => {
    const row = costs.find((c) => c.category === cat.key);
    return {
      key: cat.key,
      label: cat.label,
      estAmount: row?.estAmount || "",
      estCurrency: row?.estCurrency || "CZK",
      realAmount: row?.realAmount || "",
      realCurrency: row?.realCurrency || "CZK",
      invoiceNumber: row?.invoiceNumber || "",
      vendor: row?.vendor || "",
    };
  });

  const subtotalEst = costRows.reduce((s, c) => s + parseCostNum(c.estAmount), 0);
  const subtotalReal = costRows.reduce((s, c) => s + parseCostNum(c.realAmount), 0);
  const subtotalBilling = costRows.reduce((s, c) => s + parseCostNum(overrideMap[c.key] || c.realAmount), 0);
  const profit = subtotalBilling - subtotalReal;

  const handleCostBlur = (category: string, field: string, value: string) => {
    const existing = costRows.find((r) => r.key === category);
    if (!existing) return;
    upsertCost.mutate({ category, [field]: value });
  };

  return (
    <div style={{ padding: 20 }}>
      {/* Billing settings */}
      <Space style={{ marginBottom: 16 }}>
        <span style={{ fontSize: 12 }}>Billing Currency:</span>
        <Select
          size="small"
          value={billing?.billingCurrency || "CZK"}
          onChange={(v) => upsertBilling.mutate({ billingCurrency: v })}
          options={CURRENCIES.map((c) => ({ value: c, label: c }))}
          style={{ width: 80 }}
        />
        <span style={{ fontSize: 12, marginLeft: 8 }}>ROE:</span>
        <Input
          size="small"
          style={{ width: 80 }}
          defaultValue={billing?.roe || "1"}
          onBlur={(e) => upsertBilling.mutate({ roe: e.target.value })}
        />
      </Space>

      {/* Editable costs table */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
            <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: "#64748b" }}>Category</th>
            <th style={{ textAlign: "right", padding: "8px 12px", fontWeight: 600, color: "#64748b" }}>Est. Amount</th>
            <th style={{ textAlign: "center", padding: "8px 6px", fontWeight: 600, color: "#64748b" }}>Cur</th>
            <th style={{ textAlign: "right", padding: "8px 12px", fontWeight: 600, color: "#64748b" }}>Real Cost</th>
            <th style={{ textAlign: "center", padding: "8px 6px", fontWeight: 600, color: "#64748b" }}>Cur</th>
            <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: "#64748b" }}>Invoice #</th>
            <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: "#64748b" }}>Vendor</th>
            <th style={{ textAlign: "right", padding: "8px 12px", fontWeight: 600, color: "#64748b" }}>Billing</th>
          </tr>
        </thead>
        <tbody>
          {costRows.map((row) => (
            <tr key={row.key} style={{ borderBottom: "1px solid #f1f5f9" }}>
              <td style={{ padding: "6px 12px", color: "#374151" }}>{row.label}</td>
              <td style={{ padding: "4px 4px", textAlign: "right" }}>
                <Input size="small" defaultValue={row.estAmount} placeholder="—" style={{ width: 80, textAlign: "right" }}
                  onBlur={(e) => handleCostBlur(row.key, "estAmount", e.target.value)} />
              </td>
              <td style={{ padding: "4px 2px", textAlign: "center" }}>
                <Select size="small" defaultValue={row.estCurrency} style={{ width: 64 }}
                  options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                  onChange={(v) => handleCostBlur(row.key, "estCurrency", v)} />
              </td>
              <td style={{ padding: "4px 4px", textAlign: "right" }}>
                <Input size="small" defaultValue={row.realAmount} placeholder="—" style={{ width: 80, textAlign: "right" }}
                  onBlur={(e) => handleCostBlur(row.key, "realAmount", e.target.value)} />
              </td>
              <td style={{ padding: "4px 2px", textAlign: "center" }}>
                <Select size="small" defaultValue={row.realCurrency} style={{ width: 64 }}
                  options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                  onChange={(v) => handleCostBlur(row.key, "realCurrency", v)} />
              </td>
              <td style={{ padding: "4px 4px" }}>
                <Input size="small" defaultValue={row.invoiceNumber} placeholder="—" style={{ width: 90 }}
                  onBlur={(e) => handleCostBlur(row.key, "invoiceNumber", e.target.value)} />
              </td>
              <td style={{ padding: "4px 4px" }}>
                <Input size="small" defaultValue={row.vendor} placeholder="—" style={{ width: 90 }}
                  onBlur={(e) => handleCostBlur(row.key, "vendor", e.target.value)} />
              </td>
              <td style={{ padding: "4px 4px", textAlign: "right" }}>
                <Input size="small" defaultValue={overrideMap[row.key] || row.realAmount} placeholder="—" style={{ width: 80, textAlign: "right", fontWeight: 600 }}
                  onBlur={(e) => upsertOverride.mutate({ rowKey: row.key, billingAmount: e.target.value })} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: "2px solid #e2e8f0", fontWeight: 700 }}>
            <td style={{ padding: "8px 12px" }}>Total</td>
            <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmtNum(subtotalEst)}</td>
            <td />
            <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmtNum(subtotalReal)}</td>
            <td />
            <td colSpan={2} />
            <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmtNum(subtotalBilling)}</td>
          </tr>
          <tr style={{ fontWeight: 700 }}>
            <td style={{ padding: "8px 12px" }}>Profit</td>
            <td colSpan={6} />
            <td style={{ padding: "8px 12px", textAlign: "right", color: profit >= 0 ? "#16a34a" : "#dc2626" }}>
              {profit >= 0 ? "+" : ""}{fmtNum(profit)} {billing?.billingCurrency || "CZK"}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── Warehouse Tab ────────────────────────────────────────────────

function WarehouseTab({ shipment }: { shipment: ShipmentItem }) {
  const [subTab, setSubTab] = useState<string>("details");
  const rowData = buildRowData(shipment);

  return (
    <div style={{ padding: "12px 20px" }}>
      <Tabs
        size="small"
        activeKey={subTab}
        onChange={setSubTab}
        items={[
          {
            key: "details",
            label: "Shipment Details",
            children: (
              <div>
                <Descriptions size="small" column={3} bordered style={{ marginBottom: 16 }} items={[
                  { key: "container", label: "Container #", children: shipment.containerNumber || "—" },
                  { key: "colli", label: "Colli / PCS", children: shipment.pcs || "—" },
                  { key: "loadType", label: "Load Type", children: shipment.loadType || "—" },
                  { key: "weight", label: "Weight (tons)", children: shipment.totalWeightTons || "—" },
                  { key: "volume", label: "Volume (CBM)", children: shipment.totalVolumeCbm || "—" },
                  { key: "customs", label: "Customs Procedure", children: rowData["customsProcedure"] || "—" },
                ]} />
                <DimensionsEditor shipment={shipment} />
              </div>
            ),
          },
          {
            key: "customs",
            label: "Customs",
            children: (
              <div>
                <div style={{ padding: 12, background: "#eff6ff", borderRadius: 6, marginBottom: 12, fontSize: 12 }}>
                  <p><strong>Colli:</strong> {shipment.pcs || "—"} | <strong>Weight:</strong> {shipment.totalWeightTons || "—"} tons</p>
                  <p><strong>Invoice Value:</strong> {shipment.commercialInvoiceValue || "—"} | <strong>HS Code:</strong> {shipment.hsCode || "—"}</p>
                  <p><strong>Description:</strong> {shipment.cargoDescription || "—"}</p>
                </div>
                <p style={{ fontSize: 12, color: "#94a3b8" }}>
                  Customs detail spreadsheet to be managed via warehouse service.
                </p>
              </div>
            ),
          },
          {
            key: "pickup",
            label: "Pick-up",
            children: <PickupSubTab />,
          },
          {
            key: "invoicing",
            label: "Invoicing",
            children: (
              <p style={{ fontSize: 12, color: "#94a3b8", padding: 20 }}>
                Invoice records managed through the Invoicing module.
              </p>
            ),
          },
        ]}
      />
    </div>
  );
}

function PickupSubTab() {
  const [pin, setPin] = useState<string | null>(null);

  const generatePin = () => {
    setPin(String(Math.floor(1000 + Math.random() * 9000)));
  };

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748b", fontWeight: 600, marginBottom: 8 }}>PIN</div>
        <Space align="center">
          <span style={{ fontFamily: "monospace", fontSize: 32, letterSpacing: "0.3em", color: "#1f2937" }}>
            {pin ? pin.split("").join(" ") : "– – – –"}
          </span>
          {!pin && <Button type="primary" size="small" onClick={generatePin}>Generate PIN</Button>}
          {pin && <Tag color="green">Locked</Tag>}
        </Space>
      </div>
      <p style={{ fontSize: 12, color: "#94a3b8" }}>
        Pickup scheduling managed through warehouse service.
      </p>
    </div>
  );
}

// ─── Dimensions Editor (inline in Warehouse tab) ──────────────────

interface DimensionRow {
  colli: string;
  length: string;
  width: string;
  height: string;
  weightPerPiece: string;
}

const EMPTY_DIM: DimensionRow = { colli: "", length: "", width: "", height: "", weightPerPiece: "" };

function DimensionsEditor({ shipment }: { shipment: ShipmentItem }) {
  const queryClient = useQueryClient();
  const raw = shipment.extra?.["dimensions"] || "";
  const initial: DimensionRow[] = (() => {
    if (!raw) return [{ ...EMPTY_DIM }];
    try { const p = JSON.parse(raw); return p.length > 0 ? p : [{ ...EMPTY_DIM }]; } catch { return [{ ...EMPTY_DIM }]; }
  })();

  const [rows, setRows] = useState<DimensionRow[]>(initial);
  const [dirty, setDirty] = useState(false);

  const updateRow = (idx: number, field: keyof DimensionRow, value: string) => {
    setRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
    setDirty(true);
  };

  const addRow = () => { setRows((prev) => [...prev, { ...EMPTY_DIM }]); setDirty(true); };
  const deleteRow = (idx: number) => { setRows((prev) => prev.filter((_, i) => i !== idx)); setDirty(true); };

  const save = async () => {
    const filtered = rows.filter((r) => r.colli || r.length || r.width || r.height || r.weightPerPiece);
    const json = filtered.length > 0 ? JSON.stringify(filtered) : "";
    await api.shipments.shipmentUpdate(shipment.id, { extra: { dimensions: json } });
    queryClient.invalidateQueries({ queryKey: ["shipments"] });
    setDirty(false);
  };

  // Totals
  let totalColli = 0, totalWeightKg = 0, totalVolumeCbm = 0;
  for (const r of rows) {
    const c = parseFloat(r.colli) || 0;
    const L = parseFloat(r.length) || 0;
    const W = parseFloat(r.width) || 0;
    const H = parseFloat(r.height) || 0;
    const w = parseFloat(r.weightPerPiece) || 0;
    totalColli += c;
    totalWeightKg += c * w;
    totalVolumeCbm += c * (L * W * H) / 1_000_000;
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <strong style={{ fontSize: 13 }}>Dimensions / Remeasurement</strong>
        <Space size="small">
          <Button size="small" onClick={addRow}>+ Row</Button>
          {dirty && <Button size="small" type="primary" onClick={save}>Save</Button>}
        </Space>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
            <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 600, color: "#64748b" }}>Qty</th>
            <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 600, color: "#64748b" }}>L (cm)</th>
            <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 600, color: "#64748b" }}>W (cm)</th>
            <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 600, color: "#64748b" }}>H (cm)</th>
            <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 600, color: "#64748b" }}>Weight/pc (kg)</th>
            <th style={{ width: 30 }} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
              {(["colli", "length", "width", "height", "weightPerPiece"] as const).map((field) => (
                <td key={field} style={{ padding: "3px 4px" }}>
                  <Input size="small" value={row[field]} placeholder="0" onChange={(e) => updateRow(idx, field, e.target.value)} style={{ width: "100%" }} />
                </td>
              ))}
              <td style={{ padding: "3px 4px" }}>
                {rows.length > 1 && (
                  <Button type="text" size="small" danger icon={<DeleteOutlined style={{ fontSize: 11 }} />} onClick={() => deleteRow(idx)} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div style={{ display: "flex", gap: 24, marginTop: 12, padding: "8px 0", borderTop: "1px solid #e2e8f0" }}>
        <div><span style={{ fontSize: 10, textTransform: "uppercase", color: "#64748b" }}>Total Colli</span><div style={{ fontSize: 14, fontWeight: 600 }}>{totalColli || "—"}</div></div>
        <div><span style={{ fontSize: 10, textTransform: "uppercase", color: "#64748b" }}>Total Weight</span><div style={{ fontSize: 14, fontWeight: 600 }}>{totalWeightKg > 0 ? `${totalWeightKg.toFixed(1)} kg` : "—"}</div></div>
        <div><span style={{ fontSize: 10, textTransform: "uppercase", color: "#64748b" }}>Total Volume</span><div style={{ fontSize: 14, fontWeight: 600 }}>{totalVolumeCbm > 0 ? `${totalVolumeCbm.toFixed(3)} CBM` : "—"}</div></div>
      </div>
    </div>
  );
}

// ─── Tracking Timeline ────────────────────────────────────────────

function TrackingTimeline({ tasks, taskList }: { tasks: TaskState[]; taskList: { key: string; label: string }[] }) {
  const completedTasks = tasks
    .filter((t) => t.completed && t.completedAt)
    .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime());

  if (completedTasks.length === 0) {
    return <p style={{ textAlign: "center", color: "#94a3b8", fontSize: 13, padding: 32 }}>No tracking events yet</p>;
  }

  return (
    <div style={{ position: "relative", paddingLeft: 24 }}>
      <div style={{ position: "absolute", left: 7, top: 8, bottom: 8, width: 2, background: "#e2e8f0", borderRadius: 1 }} />
      {completedTasks.map((task, i) => {
        const def = taskList.find((t) => t.key === task.taskKey);
        return (
          <div key={task.taskKey} style={{ position: "relative", marginBottom: 16 }}>
            <div style={{
              position: "absolute", left: -18, top: 4, width: 12, height: 12, borderRadius: "50%",
              border: "2px solid", borderColor: i === 0 ? "#0d9488" : "#cbd5e1",
              background: i === 0 ? "#0d9488" : "#ffffff",
            }} />
            <div>
              <p style={{ fontSize: 13, fontWeight: 500, color: i === 0 ? "#0d9488" : "#374151" }}>
                {def?.label || task.taskKey}
              </p>
              <p style={{ fontSize: 11, color: "#9ca3af" }}>
                {new Date(task.completedAt!).toLocaleString()}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

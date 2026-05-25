"use client";

import { useState, useEffect } from "react";
import { Modal, Tabs, Button, Checkbox, Upload, message, Steps, Descriptions, Tag, Input, Select, Space, Spin, Card } from "antd";
import {
  ExpandOutlined,
  ShrinkOutlined,
  DeleteOutlined,
  FileOutlined,
  InboxOutlined,
  SplitCellsOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
} from "@ant-design/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { buildRowData, getFieldValue, type ShipmentItem } from "@/hooks/useShipments";
import { useWarehouseSection } from "@/hooks/useWarehouseSection";
import { useAuth } from "@/lib/auth/AuthContext";
import { COLUMNS } from "@/lib/columnConfig";

type MessageApi = ReturnType<typeof message.useMessage>[0];

// Section data shapes
interface RowsSectionData { rows?: string }
interface PickupSectionData { pin?: string; rows?: string }
interface JobSectionData { vgm_sent?: string; survey_sent?: string; remeasurement_sent?: string; [key: string]: string | undefined }

function asRowsSection(data: unknown): RowsSectionData {
  if (data && typeof data === "object") return data as RowsSectionData;
  return {};
}
function asPickupSection(data: unknown): PickupSectionData {
  if (data && typeof data === "object") return data as PickupSectionData;
  return {};
}
function asJobSection(data: unknown): JobSectionData {
  if (data && typeof data === "object") return data as JobSectionData;
  return {};
}

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
  const [popoutOpen, setPopoutOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
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

  const modalContent = (
    <>
      {/* Custom header */}
      <div style={{ display: "flex", alignItems: "center", padding: "12px 20px", borderBottom: "1px solid #f0f0f0", gap: 8 }}>
        <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#0d9488", fontSize: 15 }}>{shipment.jobNumber}</span>
        <span style={{ color: "#d1d5db" }}>—</span>
        <span style={{ fontSize: 13, color: "#6b7280" }}>{shipment.shipper || "—"}</span>
        {shipment.tradeDirection && <Tag color={shipment.tradeDirection === "Import" ? "blue" : "orange"} style={{ marginLeft: 4, cursor: "default" }}>{shipment.tradeDirection}</Tag>}
        {/* Route */}
        {(shipment.pol || shipment.pod || shipment.destination) && (
          <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 8 }}>
            {shipment.pol || "—"} → {shipment.pod || "—"}{shipment.destination ? ` → ${shipment.destination}` : ""}
          </span>
        )}
        {/* ETD/ETA */}
        {(shipment.estimatedDeparture || shipment.estimatedArrival) && (
          <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 8 }}>
            {shipment.estimatedDeparture && <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>ETD {shipment.estimatedDeparture}</Tag>}
            {shipment.estimatedArrival && <Tag color="green" style={{ fontSize: 10, margin: "0 0 0 4px" }}>ETA {shipment.estimatedArrival}</Tag>}
          </span>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {shipment.salesNumber && (
            <Button
              type="text"
              size="small"
              icon={<SplitCellsOutlined />}
              onClick={() => setSplitOpen(!splitOpen)}
              title="Linked Quote"
            />
          )}
          <Button
            type="text"
            size="small"
            icon={<FullscreenOutlined />}
            onClick={() => setPopoutOpen(true)}
            title="Popout View"
          />
          <Button
            type="text"
            size="small"
            icon={maximized ? <ShrinkOutlined /> : <ExpandOutlined />}
            onClick={() => setMaximized(!maximized)}
          />
          <Button type="text" size="small" onClick={onClose}>✕</Button>
        </div>
      </div>

      <div style={{ display: "flex" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
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
        </div>

        {/* Split View - Linked Quote Panel */}
        {splitOpen && shipment.salesNumber && (
          <div style={{ width: 400, borderLeft: "1px solid #f0f0f0", overflow: "auto", height: contentHeight }}>
            <LinkedQuotePanel shipment={shipment} onClose={() => setSplitOpen(false)} />
          </div>
        )}
      </div>

      {/* Popout View Modal */}
      <PopoutViewModal shipment={shipment} open={popoutOpen} onClose={() => setPopoutOpen(false)} />
    </>
  );

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={maximized ? "95vw" : (splitOpen ? 1360 : 960)}
      title={null}
      closable={false}
      destroyOnClose
      centered={!maximized}
      style={maximized ? { top: 20, paddingBottom: 0 } : undefined}
      styles={{ body: { padding: 0 }, header: { display: "none" } }}
    >
      {modalContent}
    </Modal>
  );
};

// ─── Helpers ──────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Popout View Modal ───────────────────────────────────────────

function PopoutViewModal({ shipment, open, onClose }: { shipment: ShipmentItem; open: boolean; onClose: () => void }) {
  if (!open) return null;

  // Build all field items from COLUMNS config
  const items = COLUMNS.map((col) => ({
    key: col.key,
    label: col.title,
    children: getFieldValue(shipment, col.key) || "—",
  }));

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width="100vw"
      title={null}
      closable={false}
      destroyOnClose
      style={{ top: 0, maxWidth: "100vw", paddingBottom: 0 }}
      styles={{ body: { padding: 0, height: "100vh", overflow: "auto" }, header: { display: "none" } }}
      zIndex={1001}
    >
      <div style={{ display: "flex", alignItems: "center", padding: "12px 20px", borderBottom: "1px solid #f0f0f0", gap: 8 }}>
        <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#0d9488", fontSize: 15 }}>{shipment.jobNumber}</span>
        <span style={{ color: "#d1d5db" }}>—</span>
        <span style={{ fontSize: 13, color: "#6b7280" }}>All Fields View</span>
        <div style={{ marginLeft: "auto" }}>
          <Button type="text" size="small" icon={<FullscreenExitOutlined />} onClick={onClose}>Close</Button>
        </div>
      </div>
      <div style={{ padding: 24 }}>
        <Descriptions size="small" column={3} bordered items={items} />
      </div>
    </Modal>
  );
}

// ─── Linked Quote Panel ──────────────────────────────────────────

function LinkedQuotePanel({ shipment, onClose }: { shipment: ShipmentItem; onClose: () => void }) {
  const salesNumber = shipment.salesNumber;

  const quoteQuery = useQuery({
    queryKey: ["quote", salesNumber],
    queryFn: () => api.quotes.quoteGet(salesNumber),
    enabled: !!salesNumber,
  });

  const invoicingQuery = useQuery({
    queryKey: ["invoicing", shipment.id],
    queryFn: () => api.invoicing.invoicingGet(shipment.id),
    enabled: !!shipment.id,
  });

  const quoteData = quoteQuery.data;
  const invoicingData = invoicingQuery.data;

  const isLoading = quoteQuery.isLoading || invoicingQuery.isLoading;

  // Compute cost breakdown from invoicing
  const costs = (invoicingData?.costs ?? []) as Array<{ category: string; realAmount?: string; realCurrency?: string }>;
  const overrides = (invoicingData?.billingOverrides ?? []) as Array<{ rowKey: string; billingAmount?: string }>;
  const overrideMap: Record<string, string> = {};
  for (const ov of overrides) if (ov.billingAmount) overrideMap[ov.rowKey] = ov.billingAmount;

  const parseCostNum = (v: string | null | undefined) => { const n = parseFloat(v || ""); return isNaN(n) ? 0 : n; };
  const fmtNum = (n: number) => n.toLocaleString("en", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  let totalSuppliers = 0;
  let totalBilling = 0;
  const costBreakdown = COST_CATEGORIES.map((cat) => {
    const row = costs.find((c) => c.category === cat.key);
    const supplierAmount = parseCostNum(row?.realAmount);
    const billingAmount = parseCostNum(overrideMap[cat.key] || row?.realAmount);
    totalSuppliers += supplierAmount;
    totalBilling += billingAmount;
    return { label: cat.label, suppliers: supplierAmount, billing: billingAmount };
  });

  const profit = totalBilling - totalSuppliers;

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <strong style={{ fontSize: 13 }}>Linked Quote: {salesNumber}</strong>
        <Button type="text" size="small" onClick={onClose}>✕</Button>
      </div>

      {isLoading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Spin /></div>
      ) : (
        <>
          {quoteData?.quote && (() => {
            const qd = quoteData.quote.data || {};
            return (
              <Descriptions size="small" column={1} bordered style={{ marginBottom: 16 }} items={[
                { key: "shipper", label: "Shipper", children: String(qd.Shipper || "—") },
                { key: "consignee", label: "Consignee", children: String(qd.Consignee || "—") },
                { key: "pol", label: "POL", children: String(qd.POL || "—") },
                { key: "pod", label: "POD", children: String(qd.POD || "—") },
                { key: "freightMode", label: "Freight Mode", children: String(qd["Freight Mode"] || "—") },
                { key: "incoterm", label: "Incoterm", children: String(qd["Incoterm Origin"] || "—") },
              ]} />
            );
          })()}

          {/* Cost Breakdown */}
          <strong style={{ fontSize: 12, display: "block", marginBottom: 8 }}>Cost Breakdown</strong>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, marginBottom: 12 }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 600, color: "#64748b" }}>Category</th>
                <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600, color: "#64748b" }}>Suppliers</th>
                <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600, color: "#64748b" }}>Billing</th>
              </tr>
            </thead>
            <tbody>
              {costBreakdown.map((row) => (
                <tr key={row.label} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "4px 8px" }}>{row.label}</td>
                  <td style={{ padding: "4px 8px", textAlign: "right" }}>{fmtNum(row.suppliers)}</td>
                  <td style={{ padding: "4px 8px", textAlign: "right" }}>{fmtNum(row.billing)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid #e2e8f0", fontWeight: 700 }}>
                <td style={{ padding: "6px 8px" }}>Total</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{fmtNum(totalSuppliers)}</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{fmtNum(totalBilling)}</td>
              </tr>
            </tfoot>
          </table>

          {/* Profit */}
          <div style={{ padding: "8px 12px", background: "#f8fafc", borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>Profit</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: profit >= 0 ? "#16a34a" : "#dc2626" }}>
              {profit >= 0 ? "+" : ""}{fmtNum(profit)}
            </span>
          </div>
        </>
      )}
    </div>
  );
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
  const [quoteInput, setQuoteInput] = useState("");
  const [quoteStatus, setQuoteStatus] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

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

  const addCharge = useMutation({
    mutationFn: (params: { description?: string; estAmount?: string; estCurrency?: string; realAmount?: string; realCurrency?: string }) =>
      api.invoicing.invoicingAddCharge(shipment.id, params),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoicing", shipment.id] }),
  });

  const updateCharge = useMutation({
    mutationFn: ({ chargeId, ...params }: { chargeId: string; description?: string; estAmount?: string; estCurrency?: string; realAmount?: string; realCurrency?: string; invoiceNumber?: string; vendor?: string }) =>
      api.invoicing.invoicingUpdateCharge(shipment.id, chargeId, params),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoicing", shipment.id] }),
  });

  const deleteCharge = useMutation({
    mutationFn: (chargeId: string) => api.invoicing.invoicingDeleteCharge(shipment.id, chargeId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoicing", shipment.id] }),
  });

  // Quote import: fetch costs from another shipment/quote and copy as estimated
  const importQuoteCosts = async () => {
    if (!quoteInput.trim()) return;
    setQuoteLoading(true);
    setQuoteStatus(null);
    const qn = quoteInput.trim().replace(/-\d+$/, ""); // Strip invoice suffix
    try {
      const quoteData = await api.invoicing.invoicingGet(qn);
      const quoteCosts = quoteData.costs ?? [];
      if (quoteCosts.length === 0) {
        setQuoteStatus("No costs found for this quote");
        setQuoteLoading(false);
        return;
      }
      let imported = 0;
      for (const c of quoteCosts) {
        if (c.realAmount) {
          await api.invoicing.invoicingUpsertCost(shipment.id, {
            category: c.category,
            estAmount: c.realAmount,
            estCurrency: c.realCurrency || "CZK",
          });
          imported++;
        }
      }
      queryClient.invalidateQueries({ queryKey: ["invoicing", shipment.id] });
      setQuoteStatus(`Imported ${imported} cost(s) from ${qn}`);
    } catch {
      setQuoteStatus("Quote not found or error");
    }
    setQuoteLoading(false);
  };

  if (isLoading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 128, color: "#94a3b8" }}>Loading costs...</div>;

  const costs = data?.costs ?? [];
  const charges = data?.additionalCharges ?? [];
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
  const chargesReal = charges.reduce((s, c) => s + parseCostNum(c.realAmount), 0);
  const subtotalBilling = costRows.reduce((s, c) => s + parseCostNum(overrideMap[c.key] || c.realAmount), 0);
  const profit = subtotalBilling - (subtotalReal + chargesReal);

  const handleCostBlur = (category: string, field: string, value: string) => {
    upsertCost.mutate({ category, [field]: value });
  };

  return (
    <div style={{ padding: 20 }}>
      {/* Billing settings bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, padding: "8px 12px", background: "#f8fafc", borderRadius: 6, border: "1px solid #e5e7eb", flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Billing</span>
        <Select
          size="small"
          value={billing?.billingCurrency || "CZK"}
          onChange={(v) => upsertBilling.mutate({ billingCurrency: v })}
          options={CURRENCIES.map((c) => ({ value: c, label: c }))}
          style={{ width: 75 }}
        />
        <span style={{ fontSize: 11, color: "#64748b" }}>ROE:</span>
        <Input
          size="small"
          style={{ width: 60 }}
          defaultValue={billing?.roe || "1"}
          onBlur={(e) => upsertBilling.mutate({ roe: e.target.value })}
        />
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <Input
            size="small"
            placeholder="CZQ00000001"
            value={quoteInput}
            onChange={(e) => { setQuoteInput(e.target.value); setQuoteStatus(null); }}
            onPressEnter={importQuoteCosts}
            style={{ width: 130 }}
          />
          <Button size="small" type="primary" onClick={importQuoteCosts} loading={quoteLoading} disabled={!quoteInput.trim()}>
            Import
          </Button>
          {quoteStatus && <span style={{ fontSize: 11, color: quoteStatus.startsWith("Imported") ? "#16a34a" : "#f59e0b" }}>{quoteStatus}</span>}
        </div>
      </div>

      {/* Editable costs table */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 16 }}>
        <thead>
          <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
            <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: "#64748b" }}>Category</th>
            <th style={{ textAlign: "right", padding: "8px 8px", fontWeight: 600, color: "#64748b" }}>Est. Amount</th>
            <th style={{ textAlign: "center", padding: "8px 4px", fontWeight: 600, color: "#64748b" }}>Cur</th>
            <th style={{ textAlign: "right", padding: "8px 8px", fontWeight: 600, color: "#64748b" }}>Real Cost</th>
            <th style={{ textAlign: "center", padding: "8px 4px", fontWeight: 600, color: "#64748b" }}>Cur</th>
            <th style={{ textAlign: "left", padding: "8px 8px", fontWeight: 600, color: "#64748b" }}>Invoice #</th>
            <th style={{ textAlign: "left", padding: "8px 8px", fontWeight: 600, color: "#64748b" }}>Vendor</th>
            <th style={{ textAlign: "right", padding: "8px 8px", fontWeight: 600, color: "#64748b" }}>Billing</th>
          </tr>
        </thead>
        <tbody>
          {costRows.map((row) => (
            <tr key={row.key} style={{ borderBottom: "1px solid #f1f5f9" }}>
              <td style={{ padding: "6px 12px", color: "#374151" }}>{row.label}</td>
              <td style={{ padding: "4px 4px", textAlign: "right" }}>
                <Input size="small" defaultValue={row.estAmount} placeholder="—" style={{ width: 76, textAlign: "right" }}
                  onBlur={(e) => handleCostBlur(row.key, "estAmount", e.target.value)} />
              </td>
              <td style={{ padding: "4px 2px", textAlign: "center" }}>
                <Select size="small" defaultValue={row.estCurrency} style={{ width: 62 }}
                  options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                  onChange={(v) => handleCostBlur(row.key, "estCurrency", v)} />
              </td>
              <td style={{ padding: "4px 4px", textAlign: "right" }}>
                <Input size="small" defaultValue={row.realAmount} placeholder="—" style={{ width: 76, textAlign: "right" }}
                  onBlur={(e) => handleCostBlur(row.key, "realAmount", e.target.value)} />
              </td>
              <td style={{ padding: "4px 2px", textAlign: "center" }}>
                <Select size="small" defaultValue={row.realCurrency} style={{ width: 62 }}
                  options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                  onChange={(v) => handleCostBlur(row.key, "realCurrency", v)} />
              </td>
              <td style={{ padding: "4px 4px" }}>
                <Input size="small" defaultValue={row.invoiceNumber} placeholder="—" style={{ width: 85 }}
                  onBlur={(e) => handleCostBlur(row.key, "invoiceNumber", e.target.value)} />
              </td>
              <td style={{ padding: "4px 4px" }}>
                <Input size="small" defaultValue={row.vendor} placeholder="—" style={{ width: 85 }}
                  onBlur={(e) => handleCostBlur(row.key, "vendor", e.target.value)} />
              </td>
              <td style={{ padding: "4px 4px", textAlign: "right" }}>
                <Input size="small" defaultValue={overrideMap[row.key] || row.realAmount} placeholder="—" style={{ width: 76, textAlign: "right", fontWeight: 600 }}
                  onBlur={(e) => upsertOverride.mutate({ rowKey: row.key, billingAmount: e.target.value })} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: "2px solid #e2e8f0", fontWeight: 700 }}>
            <td style={{ padding: "8px 12px" }}>Subtotal</td>
            <td style={{ padding: "8px 8px", textAlign: "right" }}>{fmtNum(subtotalEst)}</td>
            <td />
            <td style={{ padding: "8px 8px", textAlign: "right" }}>{fmtNum(subtotalReal)}</td>
            <td />
            <td colSpan={2} />
            <td style={{ padding: "8px 8px", textAlign: "right" }}>{fmtNum(subtotalBilling)}</td>
          </tr>
        </tfoot>
      </table>

      {/* Additional Charges */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <strong style={{ fontSize: 12 }}>Additional Charges</strong>
        <Button size="small" onClick={() => addCharge.mutate({})}>+ Add</Button>
      </div>

      {charges.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 12 }}>
          <thead>
            <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
              <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 600, color: "#64748b" }}>Description</th>
              <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600, color: "#64748b" }}>Est.</th>
              <th style={{ textAlign: "center", padding: "6px 4px", fontWeight: 600, color: "#64748b" }}>Cur</th>
              <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600, color: "#64748b" }}>Real</th>
              <th style={{ textAlign: "center", padding: "6px 4px", fontWeight: 600, color: "#64748b" }}>Cur</th>
              <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 600, color: "#64748b" }}>Invoice</th>
              <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 600, color: "#64748b" }}>Vendor</th>
              <th style={{ width: 30 }} />
            </tr>
          </thead>
          <tbody>
            {charges.map((ac) => (
              <tr key={ac.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "4px 4px" }}>
                  <Input size="small" defaultValue={ac.description} placeholder="Description"
                    onBlur={(e) => updateCharge.mutate({ chargeId: ac.id, description: e.target.value })} />
                </td>
                <td style={{ padding: "4px 4px", textAlign: "right" }}>
                  <Input size="small" defaultValue={ac.estAmount || ""} placeholder="—" style={{ width: 70, textAlign: "right" }}
                    onBlur={(e) => updateCharge.mutate({ chargeId: ac.id, estAmount: e.target.value })} />
                </td>
                <td style={{ padding: "4px 2px" }}>
                  <Select size="small" defaultValue={ac.estCurrency || "CZK"} style={{ width: 60 }}
                    options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                    onChange={(v) => updateCharge.mutate({ chargeId: ac.id, estCurrency: v })} />
                </td>
                <td style={{ padding: "4px 4px", textAlign: "right" }}>
                  <Input size="small" defaultValue={ac.realAmount || ""} placeholder="—" style={{ width: 70, textAlign: "right" }}
                    onBlur={(e) => updateCharge.mutate({ chargeId: ac.id, realAmount: e.target.value })} />
                </td>
                <td style={{ padding: "4px 2px" }}>
                  <Select size="small" defaultValue={ac.realCurrency || "CZK"} style={{ width: 60 }}
                    options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                    onChange={(v) => updateCharge.mutate({ chargeId: ac.id, realCurrency: v })} />
                </td>
                <td style={{ padding: "4px 4px" }}>
                  <Input size="small" defaultValue={ac.invoiceNumber} placeholder="—" style={{ width: 80 }}
                    onBlur={(e) => updateCharge.mutate({ chargeId: ac.id, invoiceNumber: e.target.value })} />
                </td>
                <td style={{ padding: "4px 4px" }}>
                  <Input size="small" defaultValue={ac.vendor} placeholder="—" style={{ width: 80 }}
                    onBlur={(e) => updateCharge.mutate({ chargeId: ac.id, vendor: e.target.value })} />
                </td>
                <td style={{ padding: "4px 2px" }}>
                  <Button type="text" size="small" danger icon={<DeleteOutlined style={{ fontSize: 11 }} />}
                    onClick={() => deleteCharge.mutate(ac.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {charges.length === 0 && (
        <div style={{ padding: 16, textAlign: "center", border: "1px dashed #e2e8f0", borderRadius: 6, color: "#94a3b8", fontSize: 12 }}>
          No additional charges. Click + Add to create one.
        </div>
      )}

      {/* Profit summary */}
      <div style={{ marginTop: 12, padding: "10px 12px", background: "#f8fafc", borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>Profit</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: profit >= 0 ? "#16a34a" : "#dc2626" }}>
          {profit >= 0 ? "+" : ""}{fmtNum(profit)} {billing?.billingCurrency || "CZK"}
        </span>
      </div>
    </div>
  );
}

// ─── Warehouse Tab ────────────────────────────────────────────────

function WarehouseTab({ shipment }: { shipment: ShipmentItem }) {
  const [subTab, setSubTab] = useState<string>("details");
  const [messageApi, contextHolder] = message.useMessage();
  const rowData = buildRowData(shipment);

  return (
    <div style={{ padding: "12px 20px" }}>
      {contextHolder}
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
                {/* Stackability Badge */}
                <StackabilityBadge shipment={shipment} />

                <Descriptions size="small" column={3} bordered style={{ marginBottom: 16 }} items={[
                  { key: "container", label: "Container #", children: shipment.containerNumber || "—" },
                  { key: "colli", label: "Colli / PCS", children: shipment.pcs || "—" },
                  { key: "loadType", label: "Load Type", children: shipment.loadType || "—" },
                  { key: "weight", label: "Weight (tons)", children: shipment.totalWeightTons || "—" },
                  { key: "volume", label: "Volume (CBM)", children: shipment.totalVolumeCbm || "—" },
                  { key: "customs", label: "Customs Procedure", children: rowData["customsProcedure"] || "—" },
                ]} />
                <DimensionsEditor shipment={shipment} messageApi={messageApi} />
                <ActionPushButtons shipment={shipment} messageApi={messageApi} />
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
                <CustomsSpreadsheet shipment={shipment} messageApi={messageApi} />
              </div>
            ),
          },
          {
            key: "pickup",
            label: "Pick-up",
            children: <PickupSubTab shipment={shipment} messageApi={messageApi} />,
          },
          {
            key: "invoicing",
            label: "Invoicing",
            children: <InvoicingSpreadsheet shipment={shipment} messageApi={messageApi} />,
          },
        ]}
      />
    </div>
  );
}

// ─── Stackability Badge ──────────────────────────────────────────

function StackabilityBadge({ shipment }: { shipment: ShipmentItem }) {
  const raw = shipment.dimensions ? String(shipment.dimensions) : undefined;
  let stackability: "stackable" | "not_stackable" | "unknown" = "unknown";

  if (raw) {
    try {
      const rows = JSON.parse(raw as string) as Array<Record<string, unknown>>;
      const hasStackable = rows.some((r) => r.stackable === true || r.stackable === "true");
      const hasNotStackable = rows.some((r) => r.stackable === false || r.stackable === "false");
      if (hasNotStackable) stackability = "not_stackable";
      else if (hasStackable) stackability = "stackable";
    } catch { /* ignore */ }
  }

  return (
    <div style={{ marginBottom: 12 }}>
      {stackability === "stackable" && <Tag color="green">Stackable</Tag>}
      {stackability === "not_stackable" && <Tag color="red">Not Stackable</Tag>}
      {stackability === "unknown" && <Tag>Unknown Stackability</Tag>}
    </div>
  );
}

// ─── Customs sub-tab spreadsheet ──────────────────────────────────

function CustomsSpreadsheet({ shipment, messageApi }: { shipment: ShipmentItem; messageApi: MessageApi }) {
  const { data: sectionData, save, isSaving } = useWarehouseSection(shipment.id, "customs");
  const rawRows = asRowsSection(sectionData).rows;
  const initial = (() => { try { const r: Record<string, string>[] = JSON.parse(rawRows || "[]"); return r; } catch { return []; } })();
  const [rows, setRows] = useState<Record<string, string>[]>(initial.length > 0 ? initial : [{ colli: "", packing: "", weight: "", value: "", currency: "CZK", commodity: "", hsCode: "" }]);
  const [dirty, setDirty] = useState(false);

  // Sync from server when sectionData changes
  useEffect(() => {
    const parsed = (() => { try { const r: Record<string, string>[] = JSON.parse(rawRows || "[]"); return r; } catch { return []; } })();
    if (parsed.length > 0) { setRows(parsed); setDirty(false); }
  }, [rawRows]);

  const update = (idx: number, field: string, value: string) => { setRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r)); setDirty(true); };
  const addRow = () => { setRows((prev) => [...prev, { colli: "", packing: "", weight: "", value: "", currency: "CZK", commodity: "", hsCode: "" }]); setDirty(true); };
  const deleteRow = (idx: number) => { setRows((prev) => prev.filter((_, i) => i !== idx)); setDirty(true); };
  const handleSave = async () => {
    try {
      await save({ rows: JSON.stringify(rows) });
      setDirty(false);
      messageApi.success("Saved");
    } catch {
      messageApi.error("Failed to save");
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <strong style={{ fontSize: 12 }}>Customs Details</strong>
        <Space size="small">
          <Button size="small" onClick={addRow}>+ Row</Button>
          {dirty && <Button size="small" type="primary" onClick={handleSave} loading={isSaving}>Save</Button>}
        </Space>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
          {["Colli", "Packing", "Weight (kg)", "Value", "Currency", "Commodity", "HS Code", ""].map((h) => (
            <th key={h} style={{ textAlign: "left", padding: "6px 6px", fontWeight: 600, color: "#64748b" }}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
              {["colli", "packing", "weight", "value", "currency", "commodity", "hsCode"].map((f) => (
                <td key={f} style={{ padding: "3px 3px" }}>
                  {f === "currency" ? (
                    <Select size="small" value={row[f] || "CZK"} onChange={(v) => update(idx, f, v)} style={{ width: "100%" }}
                      options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
                  ) : (
                    <Input size="small" value={row[f] || ""} onChange={(e) => update(idx, f, e.target.value)} />
                  )}
                </td>
              ))}
              <td style={{ padding: "3px" }}>
                {rows.length > 1 && <Button type="text" size="small" danger icon={<DeleteOutlined style={{ fontSize: 11 }} />} onClick={() => deleteRow(idx)} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Pickup sub-tab ───────────────────────────────────────────────

function PickupSubTab({ shipment, messageApi }: { shipment: ShipmentItem; messageApi: MessageApi }) {
  const { data: sectionData, save, isSaving } = useWarehouseSection(shipment.id, "pickup");
  const section = asPickupSection(sectionData);
  const existingPin = section.pin || "";
  const rawRows = section.rows || "";
  const [pin, setPin] = useState<string | null>(existingPin || null);

  const initial: Record<string, string>[] = (() => { try { return JSON.parse(rawRows || "[]"); } catch { return []; } })();
  const [rows, setRows] = useState<Record<string, string>[]>(initial.length > 0 ? initial : [{ haulier: "", licensePlate: "", driver: "" }]);
  const [dirty, setDirty] = useState(false);

  // Sync from server
  useEffect(() => {
    const sec = asPickupSection(sectionData);
    if (sec.pin) setPin(sec.pin);
    const parsed: Record<string, string>[] = (() => { try { return JSON.parse(sec.rows || "[]"); } catch { return []; } })();
    if (parsed.length > 0) { setRows(parsed); setDirty(false); }
  }, [sectionData]);

  const generatePin = async () => {
    const newPin = String(Math.floor(1000 + Math.random() * 9000));
    setPin(newPin);
    try {
      await save({ pin: newPin, rows: rawRows || "[]" });
      messageApi.success("Saved");
    } catch {
      messageApi.error("Failed to save");
    }
  };

  const update = (idx: number, field: string, value: string) => { setRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r)); setDirty(true); };
  const addRow = () => { setRows((prev) => [...prev, { haulier: "", licensePlate: "", driver: "" }]); setDirty(true); };
  const deleteRow = (idx: number) => { setRows((prev) => prev.filter((_, i) => i !== idx)); setDirty(true); };
  const handleSave = async () => {
    try {
      await save({ pin: pin || "", rows: JSON.stringify(rows) });
      setDirty(false);
      messageApi.success("Saved");
    } catch {
      messageApi.error("Failed to save");
    }
  };

  return (
    <div>
      {/* PIN */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748b", fontWeight: 600, marginBottom: 8 }}>PIN</div>
        <Space align="center">
          <span style={{ fontFamily: "monospace", fontSize: 32, letterSpacing: "0.3em", color: "#1f2937" }}>
            {pin ? pin.split("").join(" ") : "– – – –"}
          </span>
          {!pin && <Button type="primary" size="small" onClick={generatePin} loading={isSaving}>Generate PIN</Button>}
          {pin && <Tag color="green">Locked</Tag>}
        </Space>
      </div>

      {/* Pickup table */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <strong style={{ fontSize: 12 }}>Pickup Details</strong>
        <Space size="small">
          <Button size="small" onClick={addRow}>+ Row</Button>
          {dirty && <Button size="small" type="primary" onClick={handleSave} loading={isSaving}>Save</Button>}
        </Space>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
          {["PIN", "Haulier", "License Plate", "Driver", ""].map((h) => (
            <th key={h} style={{ textAlign: "left", padding: "6px 6px", fontWeight: 600, color: "#64748b" }}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
              <td style={{ padding: "3px 6px", fontFamily: "monospace", color: "#0d9488" }}>{idx === 0 && pin ? pin : ""}</td>
              {["haulier", "licensePlate", "driver"].map((f) => (
                <td key={f} style={{ padding: "3px 3px" }}>
                  <Input size="small" value={row[f] || ""} onChange={(e) => update(idx, f, e.target.value)} />
                </td>
              ))}
              <td style={{ padding: "3px" }}>
                {rows.length > 1 && <Button type="text" size="small" danger icon={<DeleteOutlined style={{ fontSize: 11 }} />} onClick={() => deleteRow(idx)} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Invoicing sub-tab spreadsheet ────────────────────────────────

function InvoicingSpreadsheet({ shipment, messageApi }: { shipment: ShipmentItem; messageApi: MessageApi }) {
  const { data: sectionData, save, isSaving } = useWarehouseSection(shipment.id, "invoicing");
  const rawRows = asRowsSection(sectionData).rows;
  const initial = (() => { try { const r: Record<string, string>[] = JSON.parse(rawRows || "[]"); return r; } catch { return []; } })();
  const [rows, setRows] = useState<Record<string, string>[]>(initial.length > 0 ? initial : [{ invoiceNo: "", date: "", amount: "", currency: "CZK", status: "", notes: "" }]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const parsed = (() => { try { const r: Record<string, string>[] = JSON.parse(rawRows || "[]"); return r; } catch { return []; } })();
    if (parsed.length > 0) { setRows(parsed); setDirty(false); }
  }, [rawRows]);

  const update = (idx: number, field: string, value: string) => { setRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r)); setDirty(true); };
  const addRow = () => { setRows((prev) => [...prev, { invoiceNo: "", date: "", amount: "", currency: "CZK", status: "", notes: "" }]); setDirty(true); };
  const deleteRow = (idx: number) => { setRows((prev) => prev.filter((_, i) => i !== idx)); setDirty(true); };
  const handleSave = async () => {
    try {
      await save({ rows: JSON.stringify(rows) });
      setDirty(false);
      messageApi.success("Saved");
    } catch {
      messageApi.error("Failed to save");
    }
  };

  return (
    <div style={{ padding: "12px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <strong style={{ fontSize: 12 }}>Invoice Records</strong>
        <Space size="small">
          <Button size="small" onClick={addRow}>+ Row</Button>
          {dirty && <Button size="small" type="primary" onClick={handleSave} loading={isSaving}>Save</Button>}
        </Space>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
          {["Invoice #", "Date", "Amount", "Currency", "Status", "Notes", ""].map((h) => (
            <th key={h} style={{ textAlign: "left", padding: "6px 6px", fontWeight: 600, color: "#64748b" }}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
              {["invoiceNo", "date", "amount", "currency", "status", "notes"].map((f) => (
                <td key={f} style={{ padding: "3px 3px" }}>
                  {f === "currency" ? (
                    <Select size="small" value={row[f] || "CZK"} onChange={(v) => update(idx, f, v)} style={{ width: "100%" }}
                      options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
                  ) : (
                    <Input size="small" value={row[f] || ""} onChange={(e) => update(idx, f, e.target.value)} />
                  )}
                </td>
              ))}
              <td style={{ padding: "3px" }}>
                {rows.length > 1 && <Button type="text" size="small" danger icon={<DeleteOutlined style={{ fontSize: 11 }} />} onClick={() => deleteRow(idx)} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Action Push Buttons (VGM, Survey, Remeasurement) ─────────────

interface ActionModalState {
  actionKey: string;
  label: string;
  note: string;
  fileList: unknown[];
}

function ActionPushButtons({ shipment, messageApi }: { shipment: ShipmentItem; messageApi: MessageApi }) {
  const { data: sectionData, save, isSaving } = useWarehouseSection(shipment.id, "job");
  const section = asJobSection(sectionData);
  const [modalState, setModalState] = useState<ActionModalState | null>(null);

  const vgmSent = section.vgm_sent;
  const surveySent = section.survey_sent;
  const remeasSent = section.remeasurement_sent;

  const actions = [
    { key: "vgm_sent", label: "VGM", sent: vgmSent },
    { key: "survey_sent", label: "Survey", sent: surveySent },
    { key: "remeasurement_sent", label: "Remeasurement", sent: remeasSent },
  ];

  const openModal = (actionKey: string, label: string) => {
    setModalState({ actionKey, label, note: "", fileList: [] });
  };

  const handleSend = async () => {
    if (!modalState) return;
    const now = new Date().toISOString();
    try {
      await save({
        ...section,
        [modalState.actionKey]: JSON.stringify({ timestamp: now, note: modalState.note }),
      });
      setModalState(null);
      messageApi.success("Saved");
    } catch {
      messageApi.error("Failed to save");
    }
  };

  const parseActionData = (val: string | undefined): { timestamp: string; note?: string } | null => {
    if (!val) return null;
    try { return JSON.parse(val); } catch { return { timestamp: val }; }
  };

  return (
    <div style={{ marginTop: 16 }}>
      <strong style={{ fontSize: 12, display: "block", marginBottom: 8 }}>Push to Suppliers</strong>
      <Space>
        {actions.map((action) => {
          const data = parseActionData(action.sent);
          return (
            <div key={action.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              {data ? (
                <Tag color="green" style={{ fontSize: 11 }}>
                  {action.label} — {new Date(data.timestamp).toLocaleDateString()}
                  {data.note && <span style={{ display: "block", fontSize: 10, color: "#6b7280" }}>{data.note}</span>}
                </Tag>
              ) : (
                <Button size="small" onClick={() => openModal(action.key, action.label)}>
                  Send {action.label}
                </Button>
              )}
            </div>
          );
        })}
      </Space>

      {/* Action Modal */}
      <Modal
        open={!!modalState}
        title={`Send ${modalState?.label || ""}`}
        onCancel={() => setModalState(null)}
        footer={[
          <Button key="cancel" onClick={() => setModalState(null)}>Cancel</Button>,
          <Button key="send" type="primary" onClick={handleSend} loading={isSaving}>Send</Button>,
        ]}
        destroyOnClose
      >
        <div style={{ marginBottom: 16 }}>
          <Upload.Dragger
            name="file"
            multiple
            beforeUpload={() => false}
            onChange={(info) => {
              if (modalState) setModalState({ ...modalState, fileList: info.fileList });
            }}
          >
            <p><InboxOutlined style={{ fontSize: 28, color: "#0d9488" }} /></p>
            <p style={{ fontSize: 13, marginTop: 8 }}>Attach files (optional)</p>
          </Upload.Dragger>
        </div>
        <Input.TextArea
          placeholder="Add a note..."
          rows={3}
          value={modalState?.note || ""}
          onChange={(e) => {
            if (modalState) setModalState({ ...modalState, note: e.target.value });
          }}
        />
      </Modal>
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
  stackable?: boolean;
}

const EMPTY_DIM: DimensionRow = { colli: "", length: "", width: "", height: "", weightPerPiece: "" };

function DimensionsEditor({ shipment, messageApi }: { shipment: ShipmentItem; messageApi: MessageApi }) {
  const queryClient = useQueryClient();
  const initial: DimensionRow[] = (() => {
    const dims = shipment.dimensions;
    if (!dims) return [{ ...EMPTY_DIM }];
    // dimensions is jsonb — comes as parsed array from the API
    const arr = Array.isArray(dims) ? dims : (() => { try { return JSON.parse(String(dims)); } catch { return []; } })();
    return arr.length > 0 ? arr : [{ ...EMPTY_DIM }];
  })();

  const [rows, setRows] = useState<DimensionRow[]>(initial);
  const [dirty, setDirty] = useState(false);

  const updateRow = (idx: number, field: keyof DimensionRow, value: string | boolean) => {
    setRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
    setDirty(true);
  };

  const addRow = () => { setRows((prev) => [...prev, { ...EMPTY_DIM }]); setDirty(true); };
  const deleteRow = (idx: number) => { setRows((prev) => prev.filter((_, i) => i !== idx)); setDirty(true); };

  const save = async () => {
    const filtered = rows.filter((r) => r.colli || r.length || r.width || r.height || r.weightPerPiece);
    const dimData = filtered.length > 0 ? filtered : null;
    try {
      await api.shipments.shipmentUpdate(shipment.id, { dimensions: dimData });
      queryClient.invalidateQueries({ queryKey: ["shipments"] });
      setDirty(false);
      messageApi.success("Saved");
    } catch {
      messageApi.error("Failed to save");
    }
  };

  // Compute per-row CBM and totals
  const rowCbms: number[] = [];
  let totalColli = 0, totalWeightKg = 0, totalVolumeCbm = 0;
  for (const r of rows) {
    const c = parseFloat(r.colli) || 0;
    const L = parseFloat(r.length) || 0;
    const W = parseFloat(r.width) || 0;
    const H = parseFloat(r.height) || 0;
    const w = parseFloat(r.weightPerPiece) || 0;
    const cbm = c * (L * W * H) / 1_000_000;
    rowCbms.push(cbm);
    totalColli += c;
    totalWeightKg += c * w;
    totalVolumeCbm += cbm;
  }

  // Parse shipment-level dimension totals for comparison
  const shipmentDims = (() => {
    const dims = shipment.dimensions;
    if (!dims) return { colli: 0, weightKg: 0, volumeCbm: 0 };
    try {
      const parsed: DimensionRow[] = Array.isArray(dims) ? dims : JSON.parse(String(dims));
      let sColli = 0, sWeight = 0, sVolume = 0;
      for (const r of parsed) {
        const c = parseFloat(r.colli) || 0;
        const L = parseFloat(r.length) || 0;
        const W = parseFloat(r.width) || 0;
        const H = parseFloat(r.height) || 0;
        const w = parseFloat(r.weightPerPiece) || 0;
        sColli += c;
        sWeight += c * w;
        sVolume += c * (L * W * H) / 1_000_000;
      }
      return { colli: sColli, weightKg: sWeight, volumeCbm: sVolume };
    } catch { return { colli: 0, weightKg: 0, volumeCbm: 0 }; }
  })();

  const mismatchStyle = (a: number, b: number): React.CSSProperties =>
    a !== b && a > 0 && b > 0 ? { backgroundColor: "rgba(245, 158, 11, 0.15)", padding: "2px 6px", borderRadius: 4 } : {};

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
            <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600, color: "#64748b" }}>Vol (CBM)</th>
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
              <td style={{ padding: "3px 4px", textAlign: "right", fontSize: 11, color: "#64748b" }}>
                {(rowCbms[idx] ?? 0) > 0 ? rowCbms[idx]!.toFixed(4) : "—"}
              </td>
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

      {/* Comparison Cards */}
      <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
        <Card size="small" title="Shipment Values" style={{ flex: 1 }}>
          <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
            <div>
              <div style={{ fontSize: 10, textTransform: "uppercase", color: "#64748b" }}>Colli</div>
              <div style={{ fontWeight: 600, ...mismatchStyle(shipmentDims.colli, totalColli) }}>{shipmentDims.colli || "—"}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, textTransform: "uppercase", color: "#64748b" }}>Weight (kg)</div>
              <div style={{ fontWeight: 600, ...mismatchStyle(shipmentDims.weightKg, totalWeightKg) }}>{shipmentDims.weightKg > 0 ? shipmentDims.weightKg.toFixed(1) : "—"}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, textTransform: "uppercase", color: "#64748b" }}>Volume (CBM)</div>
              <div style={{ fontWeight: 600, ...mismatchStyle(shipmentDims.volumeCbm, totalVolumeCbm) }}>{shipmentDims.volumeCbm > 0 ? shipmentDims.volumeCbm.toFixed(3) : "—"}</div>
            </div>
          </div>
        </Card>
        <Card size="small" title="Remeasured Values" style={{ flex: 1 }}>
          <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
            <div>
              <div style={{ fontSize: 10, textTransform: "uppercase", color: "#64748b" }}>Colli</div>
              <div style={{ fontWeight: 600, ...mismatchStyle(totalColli, shipmentDims.colli) }}>{totalColli || "—"}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, textTransform: "uppercase", color: "#64748b" }}>Weight (kg)</div>
              <div style={{ fontWeight: 600, ...mismatchStyle(totalWeightKg, shipmentDims.weightKg) }}>{totalWeightKg > 0 ? totalWeightKg.toFixed(1) : "—"}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, textTransform: "uppercase", color: "#64748b" }}>Volume (CBM)</div>
              <div style={{ fontWeight: 600, ...mismatchStyle(totalVolumeCbm, shipmentDims.volumeCbm) }}>{totalVolumeCbm > 0 ? totalVolumeCbm.toFixed(3) : "—"}</div>
            </div>
          </div>
        </Card>
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

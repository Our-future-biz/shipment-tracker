"use client";

import { useState, useEffect, useMemo } from "react";
import { Tabs, Descriptions, Tag, Input, Select, Button, Space, Card, Upload, Modal, message } from "antd";
import { DeleteOutlined, InboxOutlined } from "@ant-design/icons";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { buildRowData, type ShipmentItem } from "@/hooks/useShipments";
import { useWarehouseSection } from "@/hooks/useWarehouseSection";

type MessageApi = ReturnType<typeof message.useMessage>[0];

const CURRENCIES = ["CZK", "USD", "EUR", "GBP", "CNY"];

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

// ─── Main WarehouseTab ──────────────────────────────────────────

export function WarehouseTab({ shipment }: { shipment: ShipmentItem }) {
  const [subTab, setSubTab] = useState<string>("details");
  const [messageApi, contextHolder] = message.useMessage();
  const rowData = buildRowData(shipment);

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3 px-5">
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
                <StackabilityBadge shipment={shipment} />
                <Descriptions size="small" column={3} bordered className="mb-4" items={[
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
                <div className="p-3 bg-blue-50 rounded-md mb-3 text-xs">
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

// ─── Stackability Badge ─────────────────────────────────────────

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
    <div className="mb-3">
      {stackability === "stackable" && <Tag color="green">Stackable</Tag>}
      {stackability === "not_stackable" && <Tag color="red">Not Stackable</Tag>}
      {stackability === "unknown" && <Tag>Unknown Stackability</Tag>}
    </div>
  );
}

// ─── Dimensions Editor ──────────────────────────────────────────

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

  const shipmentDims = useMemo(() => {
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
  }, [shipment.dimensions]);

  const mismatchCls = (a: number, b: number) =>
    a !== b && a > 0 && b > 0 ? "bg-amber-500/15 px-1.5 py-0.5 rounded" : "";

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <strong className="text-sm">Dimensions / Remeasurement</strong>
        <Space size="small">
          <Button size="small" onClick={addRow}>+ Row</Button>
          {dirty && <Button size="small" type="primary" onClick={save}>Save</Button>}
        </Space>
      </div>

      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="text-left p-1.5 px-2 font-semibold text-slate-500">Qty</th>
            <th className="text-left p-1.5 px-2 font-semibold text-slate-500">L (cm)</th>
            <th className="text-left p-1.5 px-2 font-semibold text-slate-500">W (cm)</th>
            <th className="text-left p-1.5 px-2 font-semibold text-slate-500">H (cm)</th>
            <th className="text-left p-1.5 px-2 font-semibold text-slate-500">Weight/pc (kg)</th>
            <th className="text-right p-1.5 px-2 font-semibold text-slate-500">Vol (CBM)</th>
            <th className="w-[30px]" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-b border-slate-100">
              {(["colli", "length", "width", "height", "weightPerPiece"] as const).map((field) => (
                <td key={field} className="p-0.5 px-1">
                  <Input size="small" value={row[field]} placeholder="0" onChange={(e) => updateRow(idx, field, e.target.value)} className="w-full" />
                </td>
              ))}
              <td className="p-0.5 px-1 text-right text-[11px] text-slate-500">
                {(rowCbms[idx] ?? 0) > 0 ? rowCbms[idx]!.toFixed(4) : "—"}
              </td>
              <td className="p-0.5 px-1">
                {rows.length > 1 && (
                  <Button type="text" size="small" danger icon={<DeleteOutlined className="text-[11px]" />} onClick={() => deleteRow(idx)} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex gap-6 mt-3 py-2 border-t border-slate-200">
        <div><span className="text-[10px] uppercase text-slate-500">Total Colli</span><div className="text-sm font-semibold">{totalColli || "—"}</div></div>
        <div><span className="text-[10px] uppercase text-slate-500">Total Weight</span><div className="text-sm font-semibold">{totalWeightKg > 0 ? `${totalWeightKg.toFixed(1)} kg` : "—"}</div></div>
        <div><span className="text-[10px] uppercase text-slate-500">Total Volume</span><div className="text-sm font-semibold">{totalVolumeCbm > 0 ? `${totalVolumeCbm.toFixed(3)} CBM` : "—"}</div></div>
      </div>

      {/* Comparison Cards */}
      <div className="flex gap-4 mt-4">
        <Card size="small" title="Shipment Values" className="flex-1">
          <div className="flex gap-4 text-xs">
            <div>
              <div className="text-[10px] uppercase text-slate-500">Colli</div>
              <div className={`font-semibold ${mismatchCls(shipmentDims.colli, totalColli)}`}>{shipmentDims.colli || "—"}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-500">Weight (kg)</div>
              <div className={`font-semibold ${mismatchCls(shipmentDims.weightKg, totalWeightKg)}`}>{shipmentDims.weightKg > 0 ? shipmentDims.weightKg.toFixed(1) : "—"}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-500">Volume (CBM)</div>
              <div className={`font-semibold ${mismatchCls(shipmentDims.volumeCbm, totalVolumeCbm)}`}>{shipmentDims.volumeCbm > 0 ? shipmentDims.volumeCbm.toFixed(3) : "—"}</div>
            </div>
          </div>
        </Card>
        <Card size="small" title="Remeasured Values" className="flex-1">
          <div className="flex gap-4 text-xs">
            <div>
              <div className="text-[10px] uppercase text-slate-500">Colli</div>
              <div className={`font-semibold ${mismatchCls(totalColli, shipmentDims.colli)}`}>{totalColli || "—"}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-500">Weight (kg)</div>
              <div className={`font-semibold ${mismatchCls(totalWeightKg, shipmentDims.weightKg)}`}>{totalWeightKg > 0 ? totalWeightKg.toFixed(1) : "—"}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-500">Volume (CBM)</div>
              <div className={`font-semibold ${mismatchCls(totalVolumeCbm, shipmentDims.volumeCbm)}`}>{totalVolumeCbm > 0 ? totalVolumeCbm.toFixed(3) : "—"}</div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── Action Push Buttons (VGM, Survey, Remeasurement) ───────────

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
    <div className="mt-4">
      <strong className="text-xs block mb-2">Push to Suppliers</strong>
      <Space>
        {actions.map((action) => {
          const data = parseActionData(action.sent);
          return (
            <div key={action.key} className="flex flex-col items-center gap-1">
              {data ? (
                <Tag color="green" className="text-[11px]">
                  {action.label} — {new Date(data.timestamp).toLocaleDateString()}
                  {data.note && <span className="block text-[10px] text-slate-500">{data.note}</span>}
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
        <div className="mb-4">
          <Upload.Dragger
            name="file"
            multiple
            beforeUpload={() => false}
            onChange={(info) => {
              if (modalState) setModalState({ ...modalState, fileList: info.fileList });
            }}
          >
            <p><InboxOutlined className="text-[28px] text-indigo-500" /></p>
            <p className="text-sm mt-2">Attach files (optional)</p>
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

// ─── Customs Spreadsheet ────────────────────────────────────────

function CustomsSpreadsheet({ shipment, messageApi }: { shipment: ShipmentItem; messageApi: MessageApi }) {
  const { data: sectionData, save, isSaving } = useWarehouseSection(shipment.id, "customs");
  const rawRows = asRowsSection(sectionData).rows;
  const initial = (() => { try { const r: Record<string, string>[] = JSON.parse(rawRows || "[]"); return r; } catch { return []; } })();
  const [rows, setRows] = useState<Record<string, string>[]>(initial.length > 0 ? initial : [{ colli: "", packing: "", weight: "", value: "", currency: "CZK", commodity: "", hsCode: "" }]);
  const [dirty, setDirty] = useState(false);

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
      <div className="flex justify-between mb-2">
        <strong className="text-xs">Customs Details</strong>
        <Space size="small">
          <Button size="small" onClick={addRow}>+ Row</Button>
          {dirty && <Button size="small" type="primary" onClick={handleSave} loading={isSaving}>Save</Button>}
        </Space>
      </div>
      <table className="w-full border-collapse text-xs">
        <thead><tr className="bg-slate-50 border-b border-slate-200">
          {["Colli", "Packing", "Weight (kg)", "Value", "Currency", "Commodity", "HS Code", ""].map((h) => (
            <th key={h} className="text-left p-1.5 font-semibold text-slate-500">{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-b border-slate-100">
              {["colli", "packing", "weight", "value", "currency", "commodity", "hsCode"].map((f) => (
                <td key={f} className="p-0.5">
                  {f === "currency" ? (
                    <Select size="small" value={row[f] || "CZK"} onChange={(v) => update(idx, f, v)} className="w-full"
                      options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
                  ) : (
                    <Input size="small" value={row[f] || ""} onChange={(e) => update(idx, f, e.target.value)} />
                  )}
                </td>
              ))}
              <td className="p-0.5">
                {rows.length > 1 && <Button type="text" size="small" danger icon={<DeleteOutlined className="text-[11px]" />} onClick={() => deleteRow(idx)} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Pickup Sub-Tab ─────────────────────────────────────────────

function PickupSubTab({ shipment, messageApi }: { shipment: ShipmentItem; messageApi: MessageApi }) {
  const { data: sectionData, save, isSaving } = useWarehouseSection(shipment.id, "pickup");
  const section = asPickupSection(sectionData);
  const existingPin = section.pin || "";
  const rawRows = section.rows || "";
  const [pin, setPin] = useState<string | null>(existingPin || null);

  const initial: Record<string, string>[] = (() => { try { return JSON.parse(rawRows || "[]"); } catch { return []; } })();
  const [rows, setRows] = useState<Record<string, string>[]>(initial.length > 0 ? initial : [{ haulier: "", licensePlate: "", driver: "" }]);
  const [dirty, setDirty] = useState(false);

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
      <div className="mb-5">
        <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2">PIN</div>
        <Space align="center">
          <span className="font-mono text-[32px] tracking-[0.3em] text-slate-800">
            {pin ? pin.split("").join(" ") : "– – – –"}
          </span>
          {!pin && <Button type="primary" size="small" onClick={generatePin} loading={isSaving}>Generate PIN</Button>}
          {pin && <Tag color="green">Locked</Tag>}
        </Space>
      </div>

      {/* Pickup table */}
      <div className="flex justify-between mb-2">
        <strong className="text-xs">Pickup Details</strong>
        <Space size="small">
          <Button size="small" onClick={addRow}>+ Row</Button>
          {dirty && <Button size="small" type="primary" onClick={handleSave} loading={isSaving}>Save</Button>}
        </Space>
      </div>
      <table className="w-full border-collapse text-xs">
        <thead><tr className="bg-slate-50 border-b border-slate-200">
          {["PIN", "Haulier", "License Plate", "Driver", ""].map((h) => (
            <th key={h} className="text-left p-1.5 font-semibold text-slate-500">{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-b border-slate-100">
              <td className="p-0.5 px-1.5 font-mono text-indigo-500">{idx === 0 && pin ? pin : ""}</td>
              {["haulier", "licensePlate", "driver"].map((f) => (
                <td key={f} className="p-0.5">
                  <Input size="small" value={row[f] || ""} onChange={(e) => update(idx, f, e.target.value)} />
                </td>
              ))}
              <td className="p-0.5">
                {rows.length > 1 && <Button type="text" size="small" danger icon={<DeleteOutlined className="text-[11px]" />} onClick={() => deleteRow(idx)} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Invoicing Spreadsheet ──────────────────────────────────────

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
    <div className="py-3">
      <div className="flex justify-between mb-2">
        <strong className="text-xs">Invoice Records</strong>
        <Space size="small">
          <Button size="small" onClick={addRow}>+ Row</Button>
          {dirty && <Button size="small" type="primary" onClick={handleSave} loading={isSaving}>Save</Button>}
        </Space>
      </div>
      <table className="w-full border-collapse text-xs">
        <thead><tr className="bg-slate-50 border-b border-slate-200">
          {["Invoice #", "Date", "Amount", "Currency", "Status", "Notes", ""].map((h) => (
            <th key={h} className="text-left p-1.5 font-semibold text-slate-500">{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-b border-slate-100">
              {["invoiceNo", "date", "amount", "currency", "status", "notes"].map((f) => (
                <td key={f} className="p-0.5">
                  {f === "currency" ? (
                    <Select size="small" value={row[f] || "CZK"} onChange={(v) => update(idx, f, v)} className="w-full"
                      options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
                  ) : (
                    <Input size="small" value={row[f] || ""} onChange={(e) => update(idx, f, e.target.value)} />
                  )}
                </td>
              ))}
              <td className="p-0.5">
                {rows.length > 1 && <Button type="text" size="small" danger icon={<DeleteOutlined className="text-[11px]" />} onClick={() => deleteRow(idx)} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

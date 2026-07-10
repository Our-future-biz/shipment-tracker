"use client";

import { useState, useMemo } from "react";
import { Tabs, Descriptions, Tag, Input, Button, Space, Card, message } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import type { MessageInstance } from "antd/es/message/interface";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { buildRowData, type ShipmentItem } from "@/hooks/useShipments";
import { useWarehouseSection } from "@/hooks/useWarehouseSection";
import { SpreadsheetSection, CUSTOMS_COLUMNS, INVOICING_COLUMNS } from "@/app/warehouse/_components/sections/SpreadsheetSection";
import { PickupSection } from "@/app/warehouse/_components/sections/PickupSection";
import { JobNotes, ActionPushButtons } from "@/app/warehouse/_components/sections/JobExtras";

interface JobSectionData {
  inform_operations_sent?: string;
  [key: string]: string | undefined;
}
function asJobSection(data: unknown): JobSectionData {
  return data && typeof data === "object" ? (data as JobSectionData) : {};
}

// W/M (weight or measure) = the greater of weight in tons vs volume in CBM
function computeWM(weightTons?: string | null, volumeCbm?: string | null): string {
  const w = parseFloat(String(weightTons ?? "")) || 0;
  const v = parseFloat(String(volumeCbm ?? "")) || 0;
  if (w === 0 && v === 0) return "—";
  return Math.max(w, v).toFixed(3);
}

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
                  { key: "wm", label: "W/M", children: computeWM(shipment.totalWeightTons, shipment.totalVolumeCbm) },
                  { key: "customs", label: "Customs Procedure", children: rowData["customsProcedure"] || "—" },
                ]} />
                <JobNotes ownerId={shipment.id} messageApi={messageApi} />
                <DimensionsEditor shipment={shipment} messageApi={messageApi} />
                <ActionPushButtons ownerId={shipment.id} messageApi={messageApi} />
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
                <SpreadsheetSection ownerId={shipment.id} section="customs" title="Customs Details" columns={CUSTOMS_COLUMNS} messageApi={messageApi} />
              </div>
            ),
          },
          {
            key: "pickup",
            label: "Pick-up",
            children: <PickupSection ownerId={shipment.id} messageApi={messageApi} />,
          },
          {
            key: "invoicing",
            label: "Invoicing",
            children: <div className="py-3"><SpreadsheetSection ownerId={shipment.id} section="invoicing" title="Invoice Records" columns={INVOICING_COLUMNS} messageApi={messageApi} /></div>,
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
      const rows = JSON.parse(raw) as Array<Record<string, unknown>>;
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

// ─── Dimensions / Remeasurement Editor (shipment-specific) ──────

interface DimensionRow {
  colli: string;
  length: string;
  width: string;
  height: string;
  weightPerPiece: string;
  stackable?: boolean;
}

const EMPTY_DIM: DimensionRow = { colli: "", length: "", width: "", height: "", weightPerPiece: "" };

function DimensionsEditor({ shipment, messageApi }: { shipment: ShipmentItem; messageApi: MessageInstance }) {
  const queryClient = useQueryClient();
  const { data: jobSectionData, save: saveJobSection, isSaving: isInforming } = useWarehouseSection(shipment.id, "job");
  const jobSection = asJobSection(jobSectionData);
  const informedAt = jobSection.inform_operations_sent;

  const initial: DimensionRow[] = (() => {
    const dims = shipment.dimensions;
    if (!dims) return [{ ...EMPTY_DIM }];
    const arr = Array.isArray(dims) ? dims : (() => { try { return JSON.parse(String(dims)); } catch { return []; } })();
    return arr.length > 0 ? arr : [{ ...EMPTY_DIM }];
  })();

  const [rows, setRows] = useState<DimensionRow[]>(initial);
  const [dirty, setDirty] = useState(false);

  const updateRow = (idx: number, field: keyof DimensionRow, value: string | boolean) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
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
    const cbm = (c * (L * W * H)) / 1_000_000;
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
        sVolume += (c * (L * W * H)) / 1_000_000;
      }
      return { colli: sColli, weightKg: sWeight, volumeCbm: sVolume };
    } catch { return { colli: 0, weightKg: 0, volumeCbm: 0 }; }
  }, [shipment.dimensions]);

  const mismatchCls = (a: number, b: number) => (a !== b && a > 0 && b > 0 ? "bg-amber-500/15 px-1.5 py-0.5 rounded" : "");
  const differs = (a: number, b: number) => a > 0 && b > 0 && Math.abs(a - b) > 0.001;
  const hasMismatch = differs(shipmentDims.colli, totalColli) || differs(shipmentDims.weightKg, totalWeightKg) || differs(shipmentDims.volumeCbm, totalVolumeCbm);
  const hasData = totalColli > 0 || totalWeightKg > 0 || totalVolumeCbm > 0;

  const informOperations = async () => {
    try {
      await saveJobSection({ ...jobSection, inform_operations_sent: new Date().toISOString() });
      messageApi.success("Operations informed");
    } catch {
      messageApi.error("Failed to inform Operations");
    }
  };

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
                {rows.length > 1 && <Button type="text" size="small" danger icon={<DeleteOutlined className="text-[11px]" />} onClick={() => deleteRow(idx)} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex gap-6 mt-3 py-2 border-t border-slate-200">
        <div><span className="text-[10px] uppercase text-slate-500">Total Colli</span><div className="text-sm font-semibold">{totalColli || "—"}</div></div>
        <div><span className="text-[10px] uppercase text-slate-500">Total Weight</span><div className="text-sm font-semibold">{totalWeightKg > 0 ? `${totalWeightKg.toFixed(1)} kg` : "—"}</div></div>
        <div><span className="text-[10px] uppercase text-slate-500">Total Volume</span><div className="text-sm font-semibold">{totalVolumeCbm > 0 ? `${totalVolumeCbm.toFixed(3)} CBM` : "—"}</div></div>
      </div>

      <div className="flex gap-4 mt-4">
        <Card size="small" title="Shipment Values" className="flex-1">
          <div className="flex gap-4 text-xs">
            <div><div className="text-[10px] uppercase text-slate-500">Colli</div><div className={`font-semibold ${mismatchCls(shipmentDims.colli, totalColli)}`}>{shipmentDims.colli || "—"}</div></div>
            <div><div className="text-[10px] uppercase text-slate-500">Weight (kg)</div><div className={`font-semibold ${mismatchCls(shipmentDims.weightKg, totalWeightKg)}`}>{shipmentDims.weightKg > 0 ? shipmentDims.weightKg.toFixed(1) : "—"}</div></div>
            <div><div className="text-[10px] uppercase text-slate-500">Volume (CBM)</div><div className={`font-semibold ${mismatchCls(shipmentDims.volumeCbm, totalVolumeCbm)}`}>{shipmentDims.volumeCbm > 0 ? shipmentDims.volumeCbm.toFixed(3) : "—"}</div></div>
          </div>
        </Card>
        <Card size="small" title="Remeasured Values" className="flex-1">
          <div className="flex gap-4 text-xs">
            <div><div className="text-[10px] uppercase text-slate-500">Colli</div><div className={`font-semibold ${mismatchCls(totalColli, shipmentDims.colli)}`}>{totalColli || "—"}</div></div>
            <div><div className="text-[10px] uppercase text-slate-500">Weight (kg)</div><div className={`font-semibold ${mismatchCls(totalWeightKg, shipmentDims.weightKg)}`}>{totalWeightKg > 0 ? totalWeightKg.toFixed(1) : "—"}</div></div>
            <div><div className="text-[10px] uppercase text-slate-500">Volume (CBM)</div><div className={`font-semibold ${mismatchCls(totalVolumeCbm, shipmentDims.volumeCbm)}`}>{totalVolumeCbm > 0 ? totalVolumeCbm.toFixed(3) : "—"}</div></div>
          </div>
        </Card>
      </div>

      {hasData && hasMismatch && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5">
          <span className="text-xs text-red-600">
            Remeasured values differ from the shipment values.
            {informedAt && <span className="block text-[11px] text-red-400">Operations informed on {new Date(informedAt).toLocaleString()}</span>}
          </span>
          <Button danger size="small" onClick={informOperations} loading={isInforming}>{informedAt ? "Inform Again" : "Inform Operations"}</Button>
        </div>
      )}
      {hasData && !hasMismatch && (
        <div className="mt-4 rounded-md border border-green-200 bg-green-50 px-3.5 py-2.5 text-xs text-green-700">✓ All values match</div>
      )}
    </div>
  );
}

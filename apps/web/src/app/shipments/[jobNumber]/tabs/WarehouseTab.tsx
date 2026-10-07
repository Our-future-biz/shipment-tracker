"use client";

import { useState, useMemo } from "react";
import { Input, Button, message } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import type { MessageInstance } from "antd/es/message/interface";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { buildRowData, type ShipmentItem } from "@/hooks/useShipments";
import type { interfaces } from "@/lib/api/client";
import { formatDateTime } from "@/lib/date";
import { useWarehouseSection } from "@/hooks/useWarehouseSection";
import { SectionCard as Card, PillTabs } from "@/components/SectionCard";
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

// Label/value row, the same shape the detail cards use.
function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex gap-2.5 py-1.5 text-xs border-b border-slate-100 last:border-b-0">
      <span className="w-[160px] shrink-0 text-[11px] font-bold text-slate-500 uppercase tracking-wide">{label}</span>
      <span className={`flex-1 min-w-0 font-medium ${value ? "text-slate-900" : "text-slate-300"}`}>{value || "—"}</span>
    </div>
  );
}

const SUB_TABS = [
  { key: "details", label: "Shipment Details" },
  { key: "pickup", label: "Pick-up" },
];

export function WarehouseTab({ shipment }: { shipment: ShipmentItem }) {
  const [subTab, setSubTab] = useState<string>("details");
  const [messageApi, contextHolder] = message.useMessage();
  const rowData = buildRowData(shipment);

  return (
    <div className="flex flex-col gap-5">
      {contextHolder}

      <PillTabs tabs={SUB_TABS} active={subTab} onChange={setSubTab} />

      {subTab === "details" && (
        <>
          <Card title="Shipment details" extra={<StackabilityBadge shipment={shipment} />}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
              <div>
                <Row label="Container #" value={shipment.containerNumber} />
                <Row label="Colli / PCS" value={shipment.pcs} />
                <Row label="Load type" value={shipment.loadType} />
                <Row label="Customs procedure" value={rowData["customsProcedure"]} />
              </div>
              <div>
                <Row label="Weight (tons)" value={shipment.totalWeightTons} />
                <Row label="Volume (CBM)" value={shipment.totalVolumeCbm} />
                <Row label="W/M" value={computeWM(shipment.totalWeightTons, shipment.totalVolumeCbm)} />
              </div>
            </div>
          </Card>

          <JobNotes ownerId={shipment.id} messageApi={messageApi} />
          <DimensionsEditor shipment={shipment} messageApi={messageApi} />
          <ActionPushButtons ownerId={shipment.id} messageApi={messageApi} />
        </>
      )}

      {subTab === "pickup" && (
        <Card title="Pick-up">
          <PickupSection ownerId={shipment.id} messageApi={messageApi} />
        </Card>
      )}
    </div>
  );
}

// ─── Stackability Badge ─────────────────────────────────────────

function StackabilityBadge({ shipment }: { shipment: ShipmentItem }) {
  const rows = shipment.cargoDimensions ?? [];
  let stackability: "stackable" | "not_stackable" | "unknown" = "unknown";
  const hasStackable = rows.some((r) => r.stackable === "Stackable" || r.stackable === "Overstowable");
  const hasNotStackable = rows.some((r) => r.stackable === "Non-stackable" || r.stackable === "Non-overstowable");
  if (hasNotStackable) stackability = "not_stackable";
  else if (hasStackable) stackability = "stackable";
  const tone =
    stackability === "stackable"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : stackability === "not_stackable"
        ? "bg-red-50 text-red-600 border-red-200"
        : "bg-slate-50 text-slate-500 border-slate-200";
  const label = stackability === "stackable" ? "Stackable" : stackability === "not_stackable" ? "Not stackable" : "Unknown stackability";
  return <span className={`inline-flex items-center h-6 px-2 rounded-md border text-[11px] font-semibold ${tone}`}>{label}</span>;
}

// ─── Dimensions / Remeasurement Editor (shipment-specific) ──────
// Edits the shipment's cargo_dimension rows (the same rows the Cargo Details
// tab manages per container). Rows keep their containerId when remeasured here;
// rows added here belong to the shipment directly (containerId null).

type DimensionRow = interfaces.CargoDimensionLine;

const EMPTY_DIM: DimensionRow = { containerId: null, pieces: "", lengthCm: "", widthCm: "", heightCm: "", weightPerPcKg: "", packageType: "", stackable: "" };

function DimensionsEditor({ shipment, messageApi }: { shipment: ShipmentItem; messageApi: MessageInstance }) {
  const queryClient = useQueryClient();
  const { data: jobSectionData, save: saveJobSection, isSaving: isInforming } = useWarehouseSection(shipment.id, "job");
  const jobSection = asJobSection(jobSectionData);
  const informedAt = jobSection.inform_operations_sent;

  const initial: DimensionRow[] = (() => {
    const arr = shipment.cargoDimensions ?? [];
    return arr.length > 0 ? arr : [{ ...EMPTY_DIM }];
  })();

  const [rows, setRows] = useState<DimensionRow[]>(initial);
  const [dirty, setDirty] = useState(false);

  const updateRow = (idx: number, field: keyof DimensionRow, value: string) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
    setDirty(true);
  };
  const addRow = () => { setRows((prev) => [...prev, { ...EMPTY_DIM }]); setDirty(true); };
  const deleteRow = (idx: number) => { setRows((prev) => prev.filter((_, i) => i !== idx)); setDirty(true); };

  const save = async () => {
    const filtered = rows.filter((r) => r.pieces || r.lengthCm || r.widthCm || r.heightCm || r.weightPerPcKg);
    try {
      await api.shipments.shipmentUpdate(shipment.id, { cargoDimensions: filtered });
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
    const c = parseFloat(r.pieces) || 0;
    const L = parseFloat(r.lengthCm) || 0;
    const W = parseFloat(r.widthCm) || 0;
    const H = parseFloat(r.heightCm) || 0;
    const w = parseFloat(r.weightPerPcKg) || 0;
    const cbm = (c * (L * W * H)) / 1_000_000;
    rowCbms.push(cbm);
    totalColli += c;
    totalWeightKg += c * w;
    totalVolumeCbm += cbm;
  }

  const shipmentDims = useMemo(() => {
    let sColli = 0, sWeight = 0, sVolume = 0;
    for (const r of shipment.cargoDimensions ?? []) {
      const c = parseFloat(r.pieces) || 0;
      const L = parseFloat(r.lengthCm) || 0;
      const W = parseFloat(r.widthCm) || 0;
      const H = parseFloat(r.heightCm) || 0;
      const w = parseFloat(r.weightPerPcKg) || 0;
      sColli += c;
      sWeight += c * w;
      sVolume += (c * (L * W * H)) / 1_000_000;
    }
    return { colli: sColli, weightKg: sWeight, volumeCbm: sVolume };
  }, [shipment.cargoDimensions]);

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
    <Card
      title="Dimensions / Remeasurement"
      extra={
        <>
          <Button size="small" icon={<PlusOutlined />} onClick={addRow}>
            Row
          </Button>
          {dirty && (
            <Button size="small" type="primary" onClick={save}>
              Save
            </Button>
          )}
        </>
      }
    >
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            {["Qty", "L (cm)", "W (cm)", "H (cm)", "Weight/pc (kg)"].map((h) => (
              <th key={h} className="text-left px-2 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                {h}
              </th>
            ))}
            <th className="text-right px-2 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Vol (CBM)</th>
            <th className="w-[36px]" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-b border-slate-100">
              {(["pieces", "lengthCm", "widthCm", "heightCm", "weightPerPcKg"] as const).map((field) => (
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

      <div className="flex flex-wrap gap-8 mt-3 pt-3 border-t border-slate-200">
        {[
          ["Total colli", totalColli ? String(totalColli) : "—"],
          ["Total weight", totalWeightKg > 0 ? `${totalWeightKg.toFixed(1)} kg` : "—"],
          ["Total volume", totalVolumeCbm > 0 ? `${totalVolumeCbm.toFixed(3)} CBM` : "—"],
        ].map(([k, v]) => (
          <div key={k}>
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{k}</div>
            <div className="text-[15px] font-bold text-slate-900 mt-0.5">{v}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div className="border border-slate-200 rounded-xl px-4 py-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">Shipment values</div>
          <div className="flex gap-4 text-xs">
            <div><div className="text-[10px] uppercase text-slate-500">Colli</div><div className={`font-semibold ${mismatchCls(shipmentDims.colli, totalColli)}`}>{shipmentDims.colli || "—"}</div></div>
            <div><div className="text-[10px] uppercase text-slate-500">Weight (kg)</div><div className={`font-semibold ${mismatchCls(shipmentDims.weightKg, totalWeightKg)}`}>{shipmentDims.weightKg > 0 ? shipmentDims.weightKg.toFixed(1) : "—"}</div></div>
            <div><div className="text-[10px] uppercase text-slate-500">Volume (CBM)</div><div className={`font-semibold ${mismatchCls(shipmentDims.volumeCbm, totalVolumeCbm)}`}>{shipmentDims.volumeCbm > 0 ? shipmentDims.volumeCbm.toFixed(3) : "—"}</div></div>
          </div>
        </div>
        <div className="border border-slate-200 rounded-xl px-4 py-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">Remeasured values</div>
          <div className="flex gap-4 text-xs">
            <div><div className="text-[10px] uppercase text-slate-500">Colli</div><div className={`font-semibold ${mismatchCls(totalColli, shipmentDims.colli)}`}>{totalColli || "—"}</div></div>
            <div><div className="text-[10px] uppercase text-slate-500">Weight (kg)</div><div className={`font-semibold ${mismatchCls(totalWeightKg, shipmentDims.weightKg)}`}>{totalWeightKg > 0 ? totalWeightKg.toFixed(1) : "—"}</div></div>
            <div><div className="text-[10px] uppercase text-slate-500">Volume (CBM)</div><div className={`font-semibold ${mismatchCls(totalVolumeCbm, shipmentDims.volumeCbm)}`}>{totalVolumeCbm > 0 ? totalVolumeCbm.toFixed(3) : "—"}</div></div>
          </div>
        </div>
      </div>

      {hasData && hasMismatch && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5">
          <span className="text-xs text-red-600">
            Remeasured values differ from the shipment values.
            {informedAt && <span className="block text-[11px] text-red-400">Operations informed on {formatDateTime(informedAt)}</span>}
          </span>
          <Button danger size="small" onClick={informOperations} loading={isInforming}>{informedAt ? "Inform Again" : "Inform Operations"}</Button>
        </div>
      )}
      {hasData && !hasMismatch && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-700">✓ All values match</div>
      )}
    </Card>
  );
}

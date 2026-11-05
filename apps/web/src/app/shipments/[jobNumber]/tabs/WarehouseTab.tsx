"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { Input, Button, Tooltip, message } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import type { MessageInstance } from "antd/es/message/interface";
import { buildRowData, getFieldValue, type ShipmentItem } from "@/hooks/useShipments";
import type { interfaces } from "@/lib/api/client";
import { formatDateTime } from "@/lib/date";
import { loadTypeLabel } from "@/lib/enums";
import { NOT_STACKABLE, STACKABLE, dimensionLineVolume, dimensionTotals, numberInput, shipmentStackability } from "@/lib/cargo";
import { SectionChangedError, useWarehouseSection } from "@/hooks/useWarehouseSection";
import { apiErrorMessage } from "@/lib/api";
import { informedText } from "@/lib/informOperations";
import { SectionCard as Card, PillTabs } from "@/components/SectionCard";
import { Pill } from "@/components/Pill";
import { LABEL_TEXT, TH } from "@/styles/ui";
import { EMPTY, LABEL, ROW, VALUE } from "../_components/detailStyles";
import { PickupSection } from "./warehouse/PickupSection";
import { JobNotes, ActionPushButtons } from "./warehouse/JobExtras";

interface JobSectionData {
  inform_operations_sent?: string;
  // The warehouse's own remeasured lines (JSON of DimensionRow[]), kept apart from the
  // shipment's cargo dimensions.
  remeasure_rows?: string;
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

// Label/value row, the same shape the detail cards use (detailStyles).
function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className={ROW}>
      <span className={LABEL}>{label}</span>
      <span className={value ? VALUE : `flex-1 min-w-0 ${EMPTY}`}>{value || "—"}</span>
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
                <Row label="Load type" value={loadTypeLabel(shipment.loadType, shipment.freightMode)} />
                <Row label="Customs procedure" value={rowData["customsProcedure"]} />
              </div>
              <div>
                <Row label="Weight (tons)" value={shipment.totalWeightTons} />
                <Row label="Volume (CBM)" value={shipment.totalVolumeCbm} />
                <Row label="W/M" value={computeWM(shipment.totalWeightTons, shipment.totalVolumeCbm)} />
                <Row label="Plate number" value={shipment.plateNumber} />
                <Row label="Dimensions" value={getFieldValue(shipment, "dimensionsSummary")} />
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
  const value = shipmentStackability(shipment.cargoDimensions ?? []);
  const stackability = value === STACKABLE ? "stackable" : value === NOT_STACKABLE ? "not_stackable" : "unknown";
  const tone = stackability === "stackable" ? "green" : stackability === "not_stackable" ? "red" : "slate";
  const label = stackability === "stackable" ? "Stackable" : stackability === "not_stackable" ? "Not stackable" : "Unknown stackability";
  return <Pill tone={tone}>{label}</Pill>;
}

// ─── Dimensions / Remeasurement Editor (shipment-specific) ──────
// The warehouse's own remeasured lines, kept in its job section (remeasure_rows, the same
// JSON as in Warehouse Concept) and compared with the shipment's cargo dimensions, which
// stay as Cargo Details holds them: the difference is what the customer is told about.

const DIM_FIELDS = ["pieces", "lengthCm", "widthCm", "heightCm", "weightPerPcKg"] as const;
type DimensionRow = Record<(typeof DIM_FIELDS)[number], string>;

const EMPTY_DIM: DimensionRow = { pieces: "", lengthCm: "", widthCm: "", heightCm: "", weightPerPcKg: "" };

function parseRemeasure(json: string | undefined): DimensionRow[] {
  try {
    const arr: unknown = JSON.parse(json || "[]");
    return Array.isArray(arr) ? arr.map((r) => ({ ...EMPTY_DIM, ...(r as Partial<DimensionRow>) })) : [];
  } catch {
    return [];
  }
}

// The lines as stored: only the filled ones, each field as typed.
const serializeRows = (rows: DimensionRow[]) =>
  JSON.stringify(rows.filter((r) => DIM_FIELDS.some((f) => r[f].trim())).map((r) => Object.fromEntries(DIM_FIELDS.map((f) => [f, r[f].trim()]))));

// A remeasured line counted as a cargo dimension line (lib/cargo): its volume from its sizes.
const asLine = (r: DimensionRow): interfaces.CargoDimensionLine => ({ containerId: null, packageType: "", stackable: "", volumePerPcM3: "", ...r });

function DimensionsEditor({ shipment, messageApi }: { shipment: ShipmentItem; messageApi: MessageInstance }) {
  const { data: jobSectionData, saveKeys, isSaving, informOperations: inform, isInforming } = useWarehouseSection(shipment.id, "job");
  const jobSection = asJobSection(jobSectionData);
  const informedAt = jobSection.inform_operations_sent;
  const saved = jobSection.remeasure_rows;

  const [rows, setRows] = useState<DimensionRow[]>([{ ...EMPTY_DIM }]);
  const [dirty, setDirty] = useState(false);
  // The saved lines the edit started from: a save replaces exactly those, or is refused.
  const [base, setBase] = useState(saved ?? "");
  // The saved lines fill the table while it holds no unsaved edit.
  useEffect(() => {
    if (dirty) return;
    const parsed = parseRemeasure(saved);
    setRows(parsed.length > 0 ? parsed : [{ ...EMPTY_DIM }]);
    setBase(saved ?? "");
  }, [saved, dirty]);

  const updateRow = (idx: number, field: keyof DimensionRow, value: string) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
    setDirty(true);
  };
  const addRow = () => { setRows((prev) => [...prev, { ...EMPTY_DIM }]); setDirty(true); };
  const deleteRow = (idx: number) => { setRows((prev) => prev.filter((_, i) => i !== idx)); setDirty(true); };

  // Only the lines of the warehouse's job section are written (notes saved meanwhile stay); the
  // shipment's cargo dimensions are not touched.
  const save = async () => {
    try {
      await saveKeys([{ key: "remeasure_rows", value: serializeRows(rows), expected: base }]);
      setDirty(false);
      messageApi.success("Saved");
    } catch (e) {
      if (e instanceof SectionChangedError) {
        // Someone else saved the lines meanwhile: theirs show, as a note saved meanwhile does.
        setDirty(false);
        messageApi.warning("Someone else saved the remeasured lines meanwhile — theirs are shown; enter your changes again");
      } else messageApi.error(`Failed to save: ${apiErrorMessage(e)}`);
    }
  };

  const lines = rows.map(asLine);
  const rowCbms = lines.map(dimensionLineVolume);
  const { pcs: totalColli, kg: totalWeightKg, m3: totalVolumeCbm } = dimensionTotals(lines);

  const shipmentDims = useMemo(() => {
    const t = dimensionTotals(shipment.cargoDimensions ?? []);
    return { colli: t.pcs, weightKg: t.kg, volumeCbm: t.m3 };
  }, [shipment.cargoDimensions]);

  const mismatchCls = (a: number, b: number) => (a !== b && a > 0 && b > 0 ? "bg-amber-500/15 px-1.5 py-0.5 rounded" : "");
  const differs = (a: number, b: number) => a > 0 && b > 0 && Math.abs(a - b) > 0.001;
  const hasMismatch = differs(shipmentDims.colli, totalColli) || differs(shipmentDims.weightKg, totalWeightKg) || differs(shipmentDims.volumeCbm, totalVolumeCbm);
  const hasData = totalColli > 0 || totalWeightKg > 0 || totalVolumeCbm > 0;

  // Inform Operations: one request records when and posts "Cargo has been remeasured by the
  // warehouse" with the SAVED lines' figures to the shipment's chat, tagging its Person in Charge and
  // Holiday Cover (the server finds them) - both, or neither. Only with the lines saved, so what is
  // told is what is on screen; a second click while it runs is ignored.
  const informingRef = useRef(false);
  const informBlocked = dirty ? "Save the lines first — Operations are told the saved figures" : null;
  const informOperations = async () => {
    if (informingRef.current || informBlocked) return;
    informingRef.current = true;
    try {
      const { tagged } = await inform(informedAt ?? "");
      const told = informedText(tagged);
      messageApi[told.level](told.text);
    } catch (e) {
      messageApi.error(e instanceof SectionChangedError ? e.message : `Operations not informed: ${apiErrorMessage(e)}`);
    } finally {
      informingRef.current = false;
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
            <Button size="small" type="primary" onClick={save} loading={isSaving}>
              Save
            </Button>
          )}
        </>
      }
    >
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            {["Qty", "L (cm)", "W (cm)", "H (cm)", "Weight/pc (kg)"].map((h) => (
              <th key={h} className={TH}>
                {h}
              </th>
            ))}
            <th className={`${TH} text-right`}>Vol (CBM)</th>
            <th className={`${TH} w-[36px]`} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-b border-slate-100">
              {(["pieces", "lengthCm", "widthCm", "heightCm", "weightPerPcKg"] as const).map((field) => (
                <td key={field} className="p-0.5 px-1">
                  {/* Numbers only, like Cargo Details: Qty whole, the rest may take a decimal point; at most 4 digits (weight 5). */}
                  <Input
                    size="small"
                    value={row[field]}
                    placeholder="0"
                    inputMode={field === "pieces" ? "numeric" : "decimal"}
                    onChange={(e) => updateRow(idx, field, numberInput(e.target.value, field !== "pieces", field === "weightPerPcKg" ? 5 : 4))}
                    className="w-full"
                  />
                </td>
              ))}
              {/* Worked out from the sizes, so text. */}
              <td className="p-0.5 px-1 text-right text-[13px] text-slate-700 tabular-nums">
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
            <div className={LABEL_TEXT}>{k}</div>
            <div className="text-[14px] font-bold text-slate-900 mt-0.5">{v}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div className="border border-slate-200 rounded-xl px-4 py-3">
          <div className={`${LABEL_TEXT} mb-2`}>Shipment values</div>
          <div className="flex gap-4 text-[13px] text-slate-900">
            <div><div className={LABEL_TEXT}>Colli</div><div className={`font-semibold ${mismatchCls(shipmentDims.colli, totalColli)}`}>{shipmentDims.colli || "—"}</div></div>
            <div><div className={LABEL_TEXT}>Weight (kg)</div><div className={`font-semibold ${mismatchCls(shipmentDims.weightKg, totalWeightKg)}`}>{shipmentDims.weightKg > 0 ? shipmentDims.weightKg.toFixed(1) : "—"}</div></div>
            <div><div className={LABEL_TEXT}>Volume (CBM)</div><div className={`font-semibold ${mismatchCls(shipmentDims.volumeCbm, totalVolumeCbm)}`}>{shipmentDims.volumeCbm > 0 ? shipmentDims.volumeCbm.toFixed(3) : "—"}</div></div>
          </div>
        </div>
        <div className="border border-slate-200 rounded-xl px-4 py-3">
          <div className={`${LABEL_TEXT} mb-2`}>Remeasured values</div>
          <div className="flex gap-4 text-[13px] text-slate-900">
            <div><div className={LABEL_TEXT}>Colli</div><div className={`font-semibold ${mismatchCls(totalColli, shipmentDims.colli)}`}>{totalColli || "—"}</div></div>
            <div><div className={LABEL_TEXT}>Weight (kg)</div><div className={`font-semibold ${mismatchCls(totalWeightKg, shipmentDims.weightKg)}`}>{totalWeightKg > 0 ? totalWeightKg.toFixed(1) : "—"}</div></div>
            <div><div className={LABEL_TEXT}>Volume (CBM)</div><div className={`font-semibold ${mismatchCls(totalVolumeCbm, shipmentDims.volumeCbm)}`}>{totalVolumeCbm > 0 ? totalVolumeCbm.toFixed(3) : "—"}</div></div>
          </div>
        </div>
      </div>

      {hasData && hasMismatch && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5">
          <span className="text-xs text-red-600">Remeasured values differ from the shipment values.</span>
          <Tooltip title={informBlocked ?? undefined}>
            <span className="inline-flex">
              <Button danger size="small" onClick={informOperations} loading={isInforming} disabled={!!informBlocked}>
                {informedAt ? "Inform Again" : "Inform Operations"}
              </Button>
            </span>
          </Tooltip>
        </div>
      )}
      {hasData && !hasMismatch && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-700">✓ All values match</div>
      )}
      {/* Shown whatever the lines say now, e.g. for a shipment informed before its lines changed. */}
      {informedAt && <div className="mt-2 text-[11px] text-slate-500">Operations informed on {formatDateTime(informedAt)}</div>}
    </Card>
  );
}

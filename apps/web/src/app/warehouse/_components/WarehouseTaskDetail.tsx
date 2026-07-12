"use client";

import { useEffect, useState } from "react";
import { Input, Select, Button, Space } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import type { MessageInstance } from "antd/es/message/interface";
import { useWarehouse } from "@/hooks/useWarehouse";
import { useWarehouseSection } from "@/hooks/useWarehouseSection";
import type { controllers, interfaces } from "@/lib/api/client";

export const WAREHOUSE_TYPES = ["Import", "Export", "Customs"];
export const WAREHOUSE_PRIORITIES = ["Low", "Medium", "High"];
export const WAREHOUSE_STATUSES = ["Pending", "In Progress", "Completed"];

// ─── Standalone dimensions / remeasurement (stored in job section) ──
interface DimRow { colli: string; length: string; width: string; height: string; weightPerPiece: string }
const EMPTY: DimRow = { colli: "", length: "", width: "", height: "", weightPerPiece: "" };

export function StandaloneDimensions({ ownerId, messageApi }: { ownerId: string; messageApi: MessageInstance }) {
  const { data, save, isSaving } = useWarehouseSection(ownerId, "job");
  const section = (data && typeof data === "object" ? data : {}) as Record<string, string | undefined>;
  const [rows, setRows] = useState<DimRow[]>([{ ...EMPTY }]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    try {
      const parsed: DimRow[] = JSON.parse(section.remeasure_rows || "[]");
      if (parsed.length > 0) { setRows(parsed); setDirty(false); }
    } catch { /* ignore */ }
  }, [section.remeasure_rows]);

  const updateRow = (idx: number, field: keyof DimRow, value: string) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
    setDirty(true);
  };
  const addRow = () => { setRows((prev) => [...prev, { ...EMPTY }]); setDirty(true); };
  const deleteRow = (idx: number) => { setRows((prev) => prev.filter((_, i) => i !== idx)); setDirty(true); };
  const handleSave = async () => {
    try {
      await save({ ...section, remeasure_rows: JSON.stringify(rows) });
      setDirty(false);
      messageApi.success("Saved");
    } catch {
      messageApi.error("Failed to save");
    }
  };

  const rowCbms: number[] = [];
  let totalColli = 0, totalWeightKg = 0, totalVolumeCbm = 0;
  for (const r of rows) {
    const c = parseFloat(r.colli) || 0, L = parseFloat(r.length) || 0, W = parseFloat(r.width) || 0, H = parseFloat(r.height) || 0, w = parseFloat(r.weightPerPiece) || 0;
    const cbm = (c * (L * W * H)) / 1_000_000;
    rowCbms.push(cbm);
    totalColli += c; totalWeightKg += c * w; totalVolumeCbm += cbm;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <strong className="text-sm">Dimensions / Remeasurement</strong>
        <Space size="small">
          <Button size="small" onClick={addRow}>+ Row</Button>
          {dirty && <Button size="small" type="primary" onClick={handleSave} loading={isSaving}>Save</Button>}
        </Space>
      </div>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            {["Qty", "L (cm)", "W (cm)", "H (cm)", "Weight/pc (kg)"].map((h) => (
              <th key={h} className="text-left p-1.5 px-2 font-semibold text-slate-500">{h}</th>
            ))}
            <th className="text-right p-1.5 px-2 font-semibold text-slate-500">Vol (CBM)</th>
            <th className="w-[30px]" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-b border-slate-100">
              {(["colli", "length", "width", "height", "weightPerPiece"] as const).map((field) => (
                <td key={field} className="p-0.5 px-1">
                  <Input size="small" value={row[field]} placeholder="0" onChange={(e) => updateRow(idx, field, e.target.value)} />
                </td>
              ))}
              <td className="p-0.5 px-1 text-right text-[11px] text-slate-500">{(rowCbms[idx] ?? 0) > 0 ? rowCbms[idx]!.toFixed(4) : "—"}</td>
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
    </div>
  );
}

// ─── Task meta editor ────────────────────────────────────────────
function MetaField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[90px_1fr] items-center gap-2">
      <span className="text-[11px] text-slate-500">{label}</span>
      {children}
    </div>
  );
}

export function TaskMeta({ task }: { task: interfaces.WarehouseTaskItem }) {
  const { updateTask } = useWarehouse();
  const set = (field: string, value: string) =>
    updateTask({ id: task.id, data: { [field]: value } as controllers.WarehouseUpdateRequest });

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
      <MetaField label="Type">
        <Select size="small" defaultValue={task.type} className="w-full" options={WAREHOUSE_TYPES.map((o) => ({ value: o, label: o }))} onChange={(v) => set("type", v)} />
      </MetaField>
      <MetaField label="Priority">
        <Select size="small" defaultValue={task.priority} className="w-full" options={WAREHOUSE_PRIORITIES.map((o) => ({ value: o, label: o }))} onChange={(v) => set("priority", v)} />
      </MetaField>
      <MetaField label="Status">
        <Select size="small" defaultValue={task.status} className="w-full" options={WAREHOUSE_STATUSES.map((o) => ({ value: o, label: o }))} onChange={(v) => set("status", v)} />
      </MetaField>
      <MetaField label="Assignee">
        <Input size="small" defaultValue={task.assignee} onBlur={(e) => e.target.value !== task.assignee && set("assignee", e.target.value)} />
      </MetaField>
      <MetaField label="Due date">
        <Input size="small" defaultValue={task.dueDate} placeholder="DD.MM.YYYY" onBlur={(e) => e.target.value !== task.dueDate && set("dueDate", e.target.value)} />
      </MetaField>
      <MetaField label="Cargo">
        <Input size="small" defaultValue={task.cargo} onBlur={(e) => e.target.value !== task.cargo && set("cargo", e.target.value)} />
      </MetaField>
      <MetaField label="Weight">
        <Input size="small" defaultValue={task.weight} onBlur={(e) => e.target.value !== task.weight && set("weight", e.target.value)} />
      </MetaField>
    </div>
  );
}


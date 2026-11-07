"use client";

import { useEffect, useState } from "react";
import { Input, Button, Tooltip } from "antd";
import { DeleteOutlined, LockOutlined, PlusOutlined } from "@ant-design/icons";
import type { MessageInstance } from "antd/es/message/interface";
import { useWarehouseSection } from "@/hooks/useWarehouseSection";
import { KPI_VALUE, LABEL_TEXT, REF } from "@/styles/ui";
import { BAR_BTN, BAR_BTN_PRIMARY, ROW_DELETE, TD_CELL, TH_CELL, rowLine } from "./warehouseUi";

interface PickupSectionData {
  pin?: string;
  rows?: string;
}

const emptyRow = () => ({ haulier: "", licensePlate: "", driver: "" });

export function PickupSection({ ownerId, messageApi }: { ownerId: string; messageApi: MessageInstance }) {
  const { data: sectionData, save, isSaving } = useWarehouseSection(ownerId, "pickup");
  const section = (sectionData && typeof sectionData === "object" ? sectionData : {}) as PickupSectionData;
  const [pin, setPin] = useState<string | null>(section.pin || null);
  const [rows, setRows] = useState<Record<string, string>[]>([emptyRow()]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const sec = (sectionData && typeof sectionData === "object" ? sectionData : {}) as PickupSectionData;
    if (sec.pin) setPin(sec.pin);
    try {
      const parsed: Record<string, string>[] = JSON.parse(sec.rows || "[]");
      if (parsed.length > 0) {
        setRows(parsed);
        setDirty(false);
      }
    } catch {
      /* ignore */
    }
  }, [sectionData]);

  const generatePin = async () => {
    const newPin = String(Math.floor(1000 + Math.random() * 9000));
    setPin(newPin);
    try {
      await save({ pin: newPin, rows: section.rows || "[]" });
      messageApi.success("PIN generated");
    } catch {
      messageApi.error("Failed to save");
    }
  };

  const update = (idx: number, field: string, value: string) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
    setDirty(true);
  };
  const addRow = () => {
    setRows((prev) => [...prev, emptyRow()]);
    setDirty(true);
  };
  const deleteRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  };
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
    <div className="flex flex-col gap-5">
      {/* The pick-up's PIN: generated once, then locked */}
      <div className="flex items-center gap-4 flex-wrap rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
        <div>
          <div className={LABEL_TEXT}>PIN</div>
          <div className={`${KPI_VALUE} ${REF} tracking-[0.3em] mt-0.5`}>{pin ? pin.split("").join(" ") : "– – – –"}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {pin ? (
            <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-emerald-700">
              <LockOutlined /> Locked
            </span>
          ) : (
            <Button size="small" type="primary" onClick={generatePin} loading={isSaving} className={BAR_BTN_PRIMARY}>
              Generate PIN
            </Button>
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className={LABEL_TEXT}>Pick-up details</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={addRow} className={BAR_BTN}>
              <PlusOutlined /> Add row
            </button>
            {dirty && (
              <Button size="small" type="primary" onClick={handleSave} loading={isSaving} className={BAR_BTN_PRIMARY}>
                Save
              </Button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse table-fixed text-[13px]">
            <thead>
              <tr>
                <th className={`${TH_CELL} text-left w-[110px]`}>PIN</th>
                <th className={`${TH_CELL} text-left`}>Haulier</th>
                <th className={`${TH_CELL} text-left`}>License plate</th>
                <th className={`${TH_CELL} text-left`}>Driver</th>
                <th className={`${TH_CELL} w-[44px]`} />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx} className={rowLine(idx, rows.length)}>
                  {/* The PIN belongs to the pick-up, so every row carries it. */}
                  <td className={`${TD_CELL} ${REF} text-slate-900`}>{pin ?? <span className="text-slate-400">—</span>}</td>
                  {["haulier", "licensePlate", "driver"].map((f) => (
                    <td key={f} className={TD_CELL}>
                      <Input
                        size="small"
                        value={row[f] || ""}
                        onChange={(e) => update(idx, f, e.target.value)}
                        aria-label={`${f === "haulier" ? "Haulier" : f === "licensePlate" ? "License plate" : "Driver"} of row ${idx + 1}`}
                      />
                    </td>
                  ))}
                  <td className={`${TD_CELL} text-center`}>
                    {rows.length > 1 && (
                      <Tooltip title="Delete row">
                        <button type="button" onClick={() => deleteRow(idx)} aria-label={`Delete row ${idx + 1}`} className={ROW_DELETE}>
                          <DeleteOutlined />
                        </button>
                      </Tooltip>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

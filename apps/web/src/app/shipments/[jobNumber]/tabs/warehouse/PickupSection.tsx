"use client";

import { useEffect, useState } from "react";
import { Input, Button, Space } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import type { MessageInstance } from "antd/es/message/interface";
import { useWarehouseSection } from "@/hooks/useWarehouseSection";
import { Pill } from "@/components/Pill";
import { KPI_VALUE, LABEL_TEXT, REF, TH } from "@/styles/ui";

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
    <div>
      <div className="mb-5">
        <div className={`${LABEL_TEXT} mb-2`}>PIN</div>
        <Space align="center">
          <span className={`${KPI_VALUE} tracking-[0.3em]`}>
            {pin ? pin.split("").join(" ") : "– – – –"}
          </span>
          {!pin && <Button type="primary" size="small" onClick={generatePin} loading={isSaving}>Generate PIN</Button>}
          {pin && <Pill tone="green">Locked</Pill>}
        </Space>
      </div>

      <div className="flex justify-between mb-2">
        <strong className={LABEL_TEXT}>Pickup Details</strong>
        <Space size="small">
          <Button size="small" onClick={addRow}>+ Row</Button>
          {dirty && <Button size="small" type="primary" onClick={handleSave} loading={isSaving}>Save</Button>}
        </Space>
      </div>
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            {["PIN", "Haulier", "License Plate", "Driver", ""].map((h) => (
              <th key={h} className={TH}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-b border-slate-100">
              {/* The PIN belongs to the pick-up, so every row carries it. */}
              <td className={`p-0.5 px-1.5 ${REF} text-slate-900`}>{pin ?? ""}</td>
              {["haulier", "licensePlate", "driver"].map((f) => (
                <td key={f} className="p-0.5">
                  <Input size="small" value={row[f] || ""} onChange={(e) => update(idx, f, e.target.value)} />
                </td>
              ))}
              <td className="p-0.5">
                {rows.length > 1 && (
                  <Button type="text" size="small" danger icon={<DeleteOutlined className="text-[11px]" />} onClick={() => deleteRow(idx)} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

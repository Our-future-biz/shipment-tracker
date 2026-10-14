"use client";

import { useEffect, useState } from "react";
import { Input, Button, Popconfirm, Space, Tag } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import type { MessageInstance } from "antd/es/message/interface";
import { useGeneratePickupPin, useWarehouseSection } from "@/hooks/useWarehouseSection";
import { APIError } from "@/lib/api/client";
import { formatDateTime } from "@/lib/date";
import { SaveStatus } from "./JobExtras";

// The PIN and its fields are written by the server only; this page sends the rows.
interface PickupSectionData {
  pin?: string;
  pinTries?: number;
  pinCreatedAt?: string;
  pinCreatedBy?: string;
  rows?: string;
}

// Same as the server: the PIN locks after this many wrong tries at the warehouse gate.
const MAX_PIN_TRIES = 3;

const emptyRow = () => ({ haulier: "", licensePlate: "", driver: "" });

export function PickupSection({ ownerId, messageApi, readOnly = false }: { ownerId: string; messageApi: MessageInstance; readOnly?: boolean }) {
  const { data: sectionData, save, isSaving } = useWarehouseSection(ownerId, "pickup");
  const generate = useGeneratePickupPin(ownerId);
  const section = (sectionData && typeof sectionData === "object" ? sectionData : {}) as PickupSectionData;
  const pin = section.pin || null;
  const locked = !!pin && (section.pinTries ?? 0) >= MAX_PIN_TRIES;
  const [rows, setRows] = useState<Record<string, string>[]>([emptyRow()]);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    const sec = (sectionData && typeof sectionData === "object" ? sectionData : {}) as PickupSectionData;
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

  // The server makes the PIN (six digits). A new one only once the old one is locked at the gate.
  const generatePin = async () => {
    try {
      await generate.mutateAsync();
      messageApi.success(locked ? "New PIN generated — give it to the haulier" : "PIN generated");
    } catch (e) {
      messageApi.error(e instanceof APIError ? e.message : "Failed to generate the PIN");
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
      await save({ rows: JSON.stringify(rows) });
      setDirty(false);
      setSavedAt(new Date());
      messageApi.success("Saved");
    } catch {
      messageApi.error("Failed to save");
    }
  };

  return (
    <div>
      <div className="mb-5">
        <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2">PIN</div>
        <Space align="center" wrap>
          <span className="font-mono text-[32px] tracking-[0.3em] text-slate-800">
            {pin ? pin.split("").join(" ") : "– – – – – –"}
          </span>
          {!pin && !readOnly && (
            <Button type="primary" size="small" onClick={generatePin} loading={generate.isPending}>
              Generate PIN
            </Button>
          )}
          {locked && <Tag color="red">Locked — 3 wrong tries at the gate</Tag>}
          {locked && !readOnly && (
            <Popconfirm
              title="Generate a new PIN?"
              description="The old PIN stops working. Give the new PIN to the haulier."
              okText="New PIN"
              onConfirm={generatePin}
            >
              <Button size="small" danger loading={generate.isPending}>
                New PIN
              </Button>
            </Popconfirm>
          )}
          {pin && !locked && <Tag color="green">Set</Tag>}
        </Space>
        {pin && section.pinCreatedAt && (
          <div className="text-[11px] text-slate-500 mt-1">
            generated {formatDateTime(section.pinCreatedAt)}
            {section.pinCreatedBy ? ` · ${section.pinCreatedBy}` : ""}
          </div>
        )}
      </div>

      <div className="flex justify-between mb-2">
        <strong className="text-xs">Pickup Details</strong>
        {!readOnly && (
          <Space size="small">
            <SaveStatus dirty={dirty} savedAt={savedAt} />
            <Button size="small" onClick={addRow}>+ Row</Button>
            {dirty && <Button size="small" type="primary" onClick={handleSave} loading={isSaving}>Save</Button>}
          </Space>
        )}
      </div>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            {["PIN", "Haulier", "License Plate", "Driver", ""].map((h) => (
              <th key={h} className="text-left p-1.5 font-semibold text-slate-500">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-b border-slate-100">
              {/* The PIN belongs to the pick-up, so every row carries it. */}
              <td className="p-0.5 px-1.5 font-mono text-indigo-500">{pin ?? ""}</td>
              {["haulier", "licensePlate", "driver"].map((f) => (
                <td key={f} className="p-0.5">
                  {readOnly ? (
                    <span className={`block px-1.5 py-1 ${row[f] ? "text-slate-900" : "text-slate-300"}`}>{row[f] || "—"}</span>
                  ) : (
                    <Input size="small" value={row[f] || ""} onChange={(e) => update(idx, f, e.target.value)} />
                  )}
                </td>
              ))}
              <td className="p-0.5">
                {!readOnly && rows.length > 1 && (
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

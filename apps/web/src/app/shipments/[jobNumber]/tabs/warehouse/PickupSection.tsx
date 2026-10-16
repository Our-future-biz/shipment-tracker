"use client";

import { useMemo, useState } from "react";
import { Input, Button, Popconfirm, Space, Tag } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import type { MessageInstance } from "antd/es/message/interface";
import { useGeneratePickupPin, useWarehouseSection } from "@/hooks/useWarehouseSection";
import { APIError } from "@/lib/api/client";
import { formatDateTime } from "@/lib/date";
import { splitPickupRows, type PickupRowData } from "@/lib/tripSource";
import { TripMarker } from "@/components/TripMarker";
import { useListKeys } from "@/hooks/useListKeys";
import { SaveStatus } from "./JobExtras";

// The PIN and its fields are written by the server only; this page sends the rows. The server
// keeps the PIN hidden: it is shown once, in the answer to "Generate PIN", and afterwards only
// that a PIN is set (`pinCreatedAt`).
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

/** The stored rows split into the ones a Trucking trip filled and the ones people typed. */
function storedRows(sectionData: unknown): { tripRows: PickupRowData[]; ownRows: Record<string, string>[] } {
  const sec = (sectionData && typeof sectionData === "object" ? sectionData : {}) as PickupSectionData;
  try {
    const parsed: PickupRowData[] = JSON.parse(sec.rows || "[]");
    const split = splitPickupRows(Array.isArray(parsed) ? parsed : []);
    const ownRows = split.ownRows as Record<string, string>[];
    return { tripRows: split.tripRows, ownRows: ownRows.length > 0 || split.tripRows.length > 0 ? ownRows : [emptyRow()] };
  } catch {
    return { tripRows: [], ownRows: [emptyRow()] };
  }
}

export function PickupSection({ ownerId, messageApi, readOnly = false }: { ownerId: string; messageApi: MessageInstance; readOnly?: boolean }) {
  const { data: sectionData, save, isSaving } = useWarehouseSection(ownerId, "pickup");
  const generate = useGeneratePickupPin(ownerId);
  const section = (sectionData && typeof sectionData === "object" ? sectionData : {}) as PickupSectionData;
  // Shown only right after generating it here (the server hides it otherwise).
  const [shownPin, setShownPin] = useState<string | null>(null);
  const pinSet = !!(section.pin || section.pinCreatedAt || shownPin);
  const pin = shownPin ?? section.pin ?? null;
  const locked = pinSet && (section.pinTries ?? 0) >= MAX_PIN_TRIES;
  // Rows a Trucking trip filled ("From trip LCZ…") are read-only here and never sent back: the
  // server keeps them as stored. `rows` are the ones people type.
  // What is stored, read fresh on every refetch (Trucking fills trip rows meanwhile). The user's
  // edit is a draft over it: a refetch never overwrites rows being typed.
  const stored = useMemo(() => storedRows(sectionData), [sectionData]);
  const tripRows = stored.tripRows;
  const [draft, setDraft] = useState<Record<string, string>[] | null>(null);
  const rows = draft ?? stored.ownRows;
  const dirty = draft !== null;
  const rowKeys = useListKeys(rows.length);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const editRows = (change: (prev: Record<string, string>[]) => Record<string, string>[]) => setDraft((d) => change(d ?? stored.ownRows));

  // The server makes the PIN (six digits). A new one only once the old one is locked at the gate.
  const generatePin = async () => {
    try {
      const res = await generate.mutateAsync();
      setShownPin(res.pin || null);
      messageApi.success(locked ? "New PIN generated — give it to the haulier now (it is not shown again)" : "PIN generated — give it to the haulier now (it is not shown again)");
    } catch (e) {
      messageApi.error(e instanceof APIError ? e.message : "Failed to generate the PIN");
    }
  };

  const update = (idx: number, field: string, value: string) => editRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  const addRow = () => editRows((prev) => [...prev, emptyRow()]);
  const deleteRow = (idx: number) => {
    rowKeys.remove(idx);
    editRows((prev) => prev.filter((_, i) => i !== idx));
  };
  const handleSave = async () => {
    try {
      await save({ rows: JSON.stringify(rows) });
      setDraft(null);
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
            {pin ? pin.split("").join(" ") : pinSet ? "• • • • • •" : "– – – – – –"}
          </span>
          {!pinSet && !readOnly && (
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
          {pinSet && !locked && <Tag color="green">{pin ? "Set" : "Set — hidden"}</Tag>}
        </Space>
        {pinSet && section.pinCreatedAt && (
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
          {tripRows.map((row, idx) => (
            <tr key={`trip-${idx}`} className="border-b border-slate-100 bg-sky-50/40">
              <td className="p-0.5 px-1.5 font-mono text-indigo-500">{pin ?? ""}</td>
              {["haulier", "licensePlate", "driver"].map((f) => {
                const v = typeof row[f] === "string" ? (row[f] as string) : "";
                return (
                  <td key={f} className="p-0.5">
                    <span className={`block px-1.5 py-1 ${v ? "text-slate-900" : "text-slate-300"}`}>{v || "—"}</span>
                  </td>
                );
              })}
              <td className="p-0.5 px-1.5">
                <TripMarker x={row} />
              </td>
            </tr>
          ))}
          {rows.map((row, idx) => (
            <tr key={rowKeys.keys[idx]} className="border-b border-slate-100">
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
                {!readOnly && (rows.length > 1 || tripRows.length > 0) && (
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

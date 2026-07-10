"use client";

import { useEffect, useState } from "react";
import { Input, Select, Button, Space } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import type { MessageInstance } from "antd/es/message/interface";
import { useWarehouseSection } from "@/hooks/useWarehouseSection";

export const WAREHOUSE_CURRENCIES = ["CZK", "USD", "EUR", "GBP", "CNY"];

export interface SpreadsheetColumn {
  key: string;
  label: string;
  type?: "text" | "select";
  options?: string[];
}

function parseRows(raw: string | undefined): Record<string, string>[] {
  try {
    const r = JSON.parse(raw || "[]");
    return Array.isArray(r) ? r : [];
  } catch {
    return [];
  }
}

interface SpreadsheetSectionProps {
  ownerId: string;
  section: string;
  title: string;
  columns: SpreadsheetColumn[];
  messageApi: MessageInstance;
}

// A warehouse section stored as { rows: JSON-string[] } keyed by ownerId+section.
// Used for Customs and Invoicing (shipment- or standalone-task-owned).
export function SpreadsheetSection({ ownerId, section, title, columns, messageApi }: SpreadsheetSectionProps) {
  const { data: sectionData, save, isSaving } = useWarehouseSection(ownerId, section);
  const rawRows = (sectionData && typeof sectionData === "object" ? (sectionData as { rows?: string }).rows : "") ?? "";
  const emptyRow = () => Object.fromEntries(columns.map((c) => [c.key, c.type === "select" ? (c.options?.[0] ?? "") : ""]));

  const [rows, setRows] = useState<Record<string, string>[]>([emptyRow()]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const parsed = parseRows(rawRows);
    if (parsed.length > 0) {
      setRows(parsed);
      setDirty(false);
    }
  }, [rawRows]);

  const update = (idx: number, key: string, value: string) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));
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
      messageApi.success("Saved");
    } catch {
      messageApi.error("Failed to save");
    }
  };

  return (
    <div>
      <div className="flex justify-between mb-2">
        <strong className="text-xs">{title}</strong>
        <Space size="small">
          <Button size="small" onClick={addRow}>+ Row</Button>
          {dirty && <Button size="small" type="primary" onClick={handleSave} loading={isSaving}>Save</Button>}
        </Space>
      </div>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            {columns.map((c) => (
              <th key={c.key} className="text-left p-1.5 font-semibold text-slate-500">{c.label}</th>
            ))}
            <th className="w-[30px]" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-b border-slate-100">
              {columns.map((c) => (
                <td key={c.key} className="p-0.5">
                  {c.type === "select" ? (
                    <Select
                      size="small"
                      value={row[c.key] || c.options?.[0]}
                      onChange={(v) => update(idx, c.key, v)}
                      className="w-full"
                      options={(c.options ?? []).map((o) => ({ value: o, label: o }))}
                    />
                  ) : (
                    <Input size="small" value={row[c.key] || ""} onChange={(e) => update(idx, c.key, e.target.value)} />
                  )}
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

export const CUSTOMS_COLUMNS: SpreadsheetColumn[] = [
  { key: "colli", label: "Colli" },
  { key: "packing", label: "Packing" },
  { key: "weight", label: "Weight (kg)" },
  { key: "value", label: "Value" },
  { key: "currency", label: "Currency", type: "select", options: WAREHOUSE_CURRENCIES },
  { key: "commodity", label: "Commodity" },
  { key: "hsCode", label: "HS Code" },
];

export const INVOICING_COLUMNS: SpreadsheetColumn[] = [
  { key: "invoiceNo", label: "Invoice #" },
  { key: "date", label: "Date" },
  { key: "amount", label: "Amount" },
  { key: "currency", label: "Currency", type: "select", options: WAREHOUSE_CURRENCIES },
  { key: "status", label: "Status" },
  { key: "notes", label: "Notes" },
];

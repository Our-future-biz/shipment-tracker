"use client";

import { useState } from "react";
import { Alert, Button, Spin, Table, Upload } from "antd";
import { useToast } from "@/lib/toast";
import { CloseOutlined, InboxOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { api } from "@/lib/api";
import { usePublicHolidays } from "@/hooks/usePublicHolidays";
import { fileToBase64 } from "@/lib/files";
import type { HolidayRow } from "../_lib/holidays";
import { dateCell, textCell } from "./holidayCells";

const ACCEPT = ".xlsx,.xlsm,.csv,.pdf,.png,.jpg,.jpeg,.gif,.webp";
const MAX_MB = 20;

interface PreviewRow extends HolidayRow {
  key: string;
  source: string;
}

interface FileNote {
  name: string;
  count: number;
  method: string;
  warning?: string;
  error?: string;
}

interface HolidaysUploadTabProps {
  onSaved: () => void;
}

// The holiday columns of a preview row, without its table key and file name.
const holidayFields = (r: PreviewRow): HolidayRow => ({
  country: r.country,
  countryCode: r.countryCode,
  nationalHoliday: r.nationalHoliday,
  nationalStart: r.nationalStart,
  nationalEnd: r.nationalEnd,
  regionalHoliday: r.regionalHoliday,
  regionalStart: r.regionalStart,
  regionalEnd: r.regionalEnd,
  regions: r.regions,
});

// Drop holiday lists in any form (Excel, CSV, PDF, screenshot). A spreadsheet with the
// World Holidays columns is read as-is; anything else is read by the AI. The rows are
// shown for checking first and saved only on "Save".
export function HolidaysUploadTab({ onSaved }: HolidaysUploadTabProps) {
  const toast = useToast();
  const { importHolidays } = usePublicHolidays();
  const [reading, setReading] = useState<{ id: string; name: string }[]>([]);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [notes, setNotes] = useState<FileNote[]>([]);
  const [saving, setSaving] = useState(false);

  const handleFileRead = async (file: File) => {
    if (file.size > MAX_MB * 1024 * 1024) {
      setNotes((n) => [...n, { name: file.name, count: 0, method: "", error: `Larger than ${MAX_MB} MB.` }]);
      return;
    }
    // Tracked by id, not name: two files can share a name.
    const id = `${file.name}-${Date.now()}-${Math.random()}`;
    setReading((r) => [...r, { id, name: file.name }]);
    try {
      const res = await api.holidays.holidayRead({ fileBase64: await fileToBase64(file), fileName: file.name });
      const stamp = Date.now();
      setRows((prev) => [...prev, ...res.rows.map((r, i) => ({ ...r, key: `${file.name}-${stamp}-${i}`, source: file.name }))]);
      setNotes((n) => [...n, { name: file.name, count: res.rows.length, method: res.method, warning: res.warning }]);
    } catch (e) {
      setNotes((n) => [...n, { name: file.name, count: 0, method: "", error: e instanceof Error ? e.message : "Could not read the file." }]);
    } finally {
      setReading((r) => r.filter((f) => f.id !== id));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const bySource = new Map<string, HolidayRow[]>();
      for (const r of rows) bySource.set(r.source, [...(bySource.get(r.source) ?? []), holidayFields(r)]);
      const { added, skipped } = await importHolidays([...bySource].map(([source, list]) => ({ rows: list, source })));
      toast.success(`${added} holidays added${skipped ? `, ${skipped} skipped (already in the list or incomplete)` : ""}.`);
      setRows([]);
      setNotes([]);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the holidays");
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<PreviewRow> = [
    { title: "Country", dataIndex: "country", width: 150, render: textCell },
    { title: "Country code", dataIndex: "countryCode", width: 100, render: textCell },
    { title: "National holiday", dataIndex: "nationalHoliday", width: 200, render: textCell },
    { title: "National start date", dataIndex: "nationalStart", width: 130, render: dateCell },
    { title: "National end date", dataIndex: "nationalEnd", width: 130, render: dateCell },
    { title: "Regional holiday", dataIndex: "regionalHoliday", width: 200, render: textCell },
    { title: "Regional start date", dataIndex: "regionalStart", width: 130, render: dateCell },
    { title: "Regional end date", dataIndex: "regionalEnd", width: 130, render: dateCell },
    { title: "Region(s) / subdivision(s)", dataIndex: "regions", width: 220, render: textCell },
    { title: "File", dataIndex: "source", width: 180, render: (v: string) => <span className="text-slate-400 text-xs">{v}</span> },
    {
      title: "",
      key: "remove",
      width: 48,
      fixed: "right",
      render: (_: unknown, r: PreviewRow) => (
        <Button
          type="text"
          size="small"
          icon={<CloseOutlined />}
          aria-label="Leave this row out"
          onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
          className="text-slate-400 hover:!text-red-500"
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <Upload.Dragger
          accept={ACCEPT}
          multiple
          showUploadList={false}
          beforeUpload={(file) => {
            void handleFileRead(file);
            return false;
          }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">Drop holiday lists here, or click to choose files</p>
          <p className="ant-upload-hint">
            Excel (.xlsx), CSV, PDF, screenshots and photos (PNG, JPG). Up to {MAX_MB} MB each. A spreadsheet with the World
            Holidays columns is read directly; anything else is read by AI. You check the rows before they are saved.
          </p>
        </Upload.Dragger>

        {reading.length > 0 && (
          <div className="flex items-center gap-3 mt-4 text-[13px] text-slate-600">
            <Spin size="small" /> Reading {reading.map((f) => f.name).join(", ")}… (the AI can take up to a minute)
          </div>
        )}
        {notes.length > 0 && (
          <div className="flex flex-col gap-2 mt-4">
            {notes.map((n, i) => (
              <Alert
                key={`${n.name}-${i}`}
                showIcon
                type={n.error ? "error" : n.warning || n.count === 0 ? "warning" : "success"}
                message={
                  n.error
                    ? `${n.name}: ${n.error}`
                    : `${n.name}: ${n.count} holidays found${n.method === "spreadsheet" ? " (read from the spreadsheet columns)" : " (read by AI)"}${
                        n.warning ? ` — ${n.warning}` : n.count === 0 ? " — nothing to add." : ""
                      }`
                }
              />
            ))}
          </div>
        )}
      </div>

      {rows.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="flex flex-wrap items-center gap-3 p-4 border-b border-slate-100">
            <span className="text-sm font-bold text-slate-700 uppercase tracking-wide">Check before saving</span>
            <span className="text-[13px] text-slate-500">{rows.length} holidays — remove any row that is wrong.</span>
            <div className="flex-1" />
            <Button
              onClick={() => {
                setRows([]);
                setNotes([]);
              }}
              disabled={saving}
            >
              Discard
            </Button>
            <Button type="primary" onClick={handleSave} loading={saving} disabled={reading.length > 0}>
              Save {rows.length} holidays
            </Button>
          </div>
          <Table<PreviewRow>
            size="small"
            rowKey="key"
            dataSource={rows}
            columns={columns}
            scroll={{ x: 1700 }}
            pagination={{ defaultPageSize: 50, showSizeChanger: true }}
          />
        </div>
      )}
    </div>
  );
}

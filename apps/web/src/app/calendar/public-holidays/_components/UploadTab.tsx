"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Spin, Table, Upload, message } from "antd";
import { CloseOutlined, InboxOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { fileToBase64 } from "@/lib/files";
import type { HolidayRow } from "../_lib/holidays";

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

const dash = <span className="text-slate-300">—</span>;
const text = (v: string) => v || dash;
const date = (v: string) => (v ? <span className="tabular-nums">{formatDate(v)}</span> : dash);

// Drop holiday lists in any form (Excel, CSV, PDF, screenshot). A spreadsheet with the
// World Holidays columns is read as-is; anything else is read by the AI. The rows are
// shown for checking first and saved only on "Save".
export function UploadTab({ onSaved }: { onSaved: () => void }) {
  const queryClient = useQueryClient();
  const [reading, setReading] = useState<string[]>([]);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [notes, setNotes] = useState<FileNote[]>([]);
  const [saving, setSaving] = useState(false);

  const readFile = async (file: File) => {
    if (file.size > MAX_MB * 1024 * 1024) {
      setNotes((n) => [...n, { name: file.name, count: 0, method: "", error: `Larger than ${MAX_MB} MB.` }]);
      return;
    }
    setReading((r) => [...r, file.name]);
    try {
      const res = await api.holidays.holidayRead({ fileBase64: await fileToBase64(file), fileName: file.name });
      const stamp = Date.now();
      setRows((prev) => [...prev, ...res.rows.map((r, i) => ({ ...r, key: `${file.name}-${stamp}-${i}`, source: file.name }))]);
      setNotes((n) => [...n, { name: file.name, count: res.rows.length, method: res.method, warning: res.warning }]);
    } catch (e) {
      setNotes((n) => [...n, { name: file.name, count: 0, method: "", error: e instanceof Error ? e.message : "Could not read the file." }]);
    } finally {
      setReading((r) => r.filter((n) => n !== file.name));
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      let added = 0;
      let skipped = 0;
      const bySource = new Map<string, HolidayRow[]>();
      for (const r of rows) {
        const { key, source, ...row } = r;
        void key;
        bySource.set(source, [...(bySource.get(source) ?? []), row]);
      }
      for (const [source, list] of bySource) {
        const res = await api.holidays.holidayImport({ rows: list, source });
        added += res.added;
        skipped += res.skipped;
      }
      await queryClient.invalidateQueries({ queryKey: ["public-holidays"] });
      message.success(`${added} holidays added${skipped ? `, ${skipped} skipped (already in the list or incomplete)` : ""}.`);
      setRows([]);
      setNotes([]);
      onSaved();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Could not save the holidays");
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<PreviewRow> = [
    { title: "Country", dataIndex: "country", width: 150, render: text },
    { title: "Country code", dataIndex: "countryCode", width: 100, render: text },
    { title: "National holiday", dataIndex: "nationalHoliday", width: 200, render: text },
    { title: "National start date", dataIndex: "nationalStart", width: 130, render: date },
    { title: "National end date", dataIndex: "nationalEnd", width: 130, render: date },
    { title: "Regional holiday", dataIndex: "regionalHoliday", width: 200, render: text },
    { title: "Regional start date", dataIndex: "regionalStart", width: 130, render: date },
    { title: "Regional end date", dataIndex: "regionalEnd", width: 130, render: date },
    { title: "Region(s) / subdivision(s)", dataIndex: "regions", width: 220, render: text },
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
            void readFile(file);
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
            <Spin size="small" /> Reading {reading.join(", ")}… (the AI can take up to a minute)
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
            <Button type="primary" onClick={save} loading={saving} disabled={reading.length > 0}>
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

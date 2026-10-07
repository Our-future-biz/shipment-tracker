"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Checkbox, Input, Pagination, Popover, Select, Table, Tooltip } from "antd";
import { CloseOutlined, DownloadOutlined, FilterOutlined, PlusOutlined, SearchOutlined, SettingOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";

// The grid of a warehouse section (In / Out / Stock). Same shape and toolbar as the
// Shipments grid — search, status, column filters, column picker and CSV export — but it
// lists warehouse positions, which carry their own reference (WHCZ…). No rows yet.

/** A row is free-form: each section decides which columns it shows. */
export type WarehouseRow = { id: string; reference?: string } & Record<string, string | undefined>;

export interface WarehouseColumn {
  key: string;
  title: string;
  width: number;
  /** Shown in red (e.g. a date that has already passed). */
  warn?: (row: WarehouseRow) => boolean;
}

const DEFAULT_COLUMNS: WarehouseColumn[] = [
  { key: "reference", title: "Internal Reference", width: 170 },
  { key: "date", title: "Date", width: 140 },
  { key: "department", title: "Department", width: 190 },
  { key: "personInCharge", title: "Person In Charge", width: 180 },
  { key: "holidayCover", title: "Holiday Cover", width: 160 },
  { key: "customer", title: "Customer", width: 200 },
  { key: "status", title: "Status", width: 180 },
];

const DEFAULT_STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "expected", label: "Expected" },
  { value: "in-warehouse", label: "In Warehouse" },
  { value: "released", label: "Released" },
];

const PAGE_SIZE_OPTIONS = [50, 100, 150, 200];

type ColFilter = { key: string; value: string };

function exportCsv(rows: WarehouseRow[], cols: WarehouseColumn[], filePrefix: string) {
  const csv = [cols.map((c) => c.title), ...rows.map((r) => cols.map((c) => r[c.key] ?? ""))]
    .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  // BOM so Excel reads the UTF-8 diacritics correctly.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filePrefix}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function WarehouseSectionGrid({
  title,
  subtitle,
  storageKey,
  rows = [],
  columns: columnDefs = DEFAULT_COLUMNS,
  statusOptions = DEFAULT_STATUS_OPTIONS,
  loading,
  emptyText = "No positions yet.",
}: {
  title: string;
  /** One line under the title, e.g. what the section lists. */
  subtitle?: string;
  /** localStorage namespace for the chosen columns. */
  storageKey: string;
  rows?: WarehouseRow[];
  columns?: WarehouseColumn[];
  statusOptions?: { value: string; label: string }[];
  loading?: boolean;
  emptyText?: string;
}) {
  const COLUMNS = columnDefs;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [filters, setFilters] = useState<ColFilter[]>([]);
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<React.Key[]>([]);
  const [visible, setVisible] = useState<string[]>(() => columnDefs.map((c) => c.key));

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`${storageKey}:columns`) ?? "null");
      if (Array.isArray(saved) && saved.length) setVisible(saved.filter((k: string) => COLUMNS.some((c) => c.key === k)));
    } catch {
      // Storage unavailable — show every column.
    }
  }, [storageKey, COLUMNS]);

  const setColumns = (keys: string[]) => {
    setVisible(keys);
    try {
      localStorage.setItem(`${storageKey}:columns`, JSON.stringify(keys));
    } catch {
      // Storage unavailable — the choice lasts until reload.
    }
  };

  const activeFilters = useMemo(() => filters.filter((f) => f.key && f.value.trim()), [filters]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !COLUMNS.some((c) => String(r[c.key] ?? "").toLowerCase().includes(q))) return false;
      if (status !== "all" && (r.status ?? "").toLowerCase().replace(/\s+/g, "-") !== status) return false;
      return activeFilters.every((f) => String(r[f.key] ?? "").toLowerCase().includes(f.value.toLowerCase().trim()));
    });
  }, [rows, COLUMNS, search, status, activeFilters]);

  useEffect(() => {
    setPage(1);
  }, [search, status, activeFilters, pageSize]);

  const columns: ColumnsType<WarehouseRow> = COLUMNS.filter((c) => visible.includes(c.key)).map((c) => ({
    key: c.key,
    title: c.title,
    width: c.width,
    ellipsis: true,
    render: (_: unknown, row: WarehouseRow) =>
      c.key === "reference" ? (
        <span className="font-mono font-bold text-indigo-500">{row.reference}</span>
      ) : row[c.key] ? (
        <span className={c.warn?.(row) ? "text-red-600 font-medium" : "text-slate-600"}>{row[c.key]}</span>
      ) : (
        <span className="text-slate-300">—</span>
      ),
  }));

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const updateFilter = (i: number, patch: Partial<ColFilter>) => setFilters((f) => f.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1400px] mx-auto flex flex-col gap-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 m-0">{title}</h1>
          {subtitle && <p className="text-[13px] text-slate-500 mt-1 mb-0">{subtitle}</p>}
        </div>

        {/* Toolbar */}
        {/* No "New Position" button yet: positions cannot be created until these sections hold data. */}
        <div className="flex items-center justify-end gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3">
          <div className="flex items-center gap-3 shrink-0">
            <Input
              placeholder="Search positions..."
              prefix={<SearchOutlined className="text-slate-400" />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              allowClear
              className="w-60"
            />
            <div className="w-px h-6 bg-slate-200 shrink-0" />
            <Select value={status} onChange={setStatus} options={statusOptions} className="w-44" />

            <Popover
              trigger="click"
              placement="bottomRight"
              content={
                <div className="w-[430px] -m-1">
                  <div className="flex items-center justify-between px-1 pb-2.5 mb-2.5 border-b border-slate-100">
                    <span className="text-[13px] font-semibold text-slate-800">Filter by column</span>
                    {filters.length > 0 && (
                      <button onClick={() => setFilters([])} className="text-xs font-medium text-slate-400 hover:text-red-500 bg-transparent border-none cursor-pointer p-0">
                        Clear all
                      </button>
                    )}
                  </div>
                  {filters.length === 0 ? (
                    <div className="text-xs text-slate-400 text-center py-4 bg-slate-50 rounded-lg">No filters yet — add one to narrow the list.</div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {filters.map((f, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <Select
                            showSearch
                            placeholder="Column"
                            value={f.key || undefined}
                            onChange={(val) => updateFilter(i, { key: val, value: "" })}
                            options={COLUMNS.map((c) => ({ value: c.key, label: c.title }))}
                            optionFilterProp="label"
                            size="small"
                            className="w-[150px] shrink-0"
                          />
                          <Input placeholder="Enter value" value={f.value} onChange={(e) => updateFilter(i, { value: e.target.value })} size="small" allowClear />
                          <button
                            onClick={() => setFilters((list) => list.filter((_, j) => j !== i))}
                            aria-label="Remove filter"
                            className="shrink-0 flex items-center justify-center w-6 h-6 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 bg-transparent border-none cursor-pointer transition-colors"
                          >
                            <CloseOutlined className="text-[11px]" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => setFilters((list) => [...list, { key: "", value: "" }])}
                    className="mt-2.5 w-full flex items-center justify-center gap-1.5 h-8 rounded-lg border border-dashed border-slate-300 text-xs font-medium text-slate-500 hover:border-indigo-400 hover:text-indigo-500 hover:bg-indigo-50/40 bg-transparent cursor-pointer transition-colors"
                  >
                    <PlusOutlined className="text-[10px]" /> Add filter
                  </button>
                </div>
              }
            >
              <Tooltip title="Filters">
                <Badge count={activeFilters.length} size="small" color="#4f46e5" offset={[-4, 4]}>
                  <button
                    aria-label="Filters"
                    className="flex items-center justify-center shrink-0 rounded-lg border border-slate-300 bg-white w-8 h-8 p-0 text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <FilterOutlined />
                  </button>
                </Badge>
              </Tooltip>
            </Popover>

            <Popover
              trigger="click"
              placement="bottomRight"
              content={
                <div className="w-[240px] -m-1 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between px-1 pb-2 mb-1 border-b border-slate-100">
                    <span className="text-[13px] font-semibold text-slate-800">Columns</span>
                    <button onClick={() => setColumns(COLUMNS.map((c) => c.key))} className="text-xs font-medium text-slate-400 hover:text-indigo-500 bg-transparent border-none cursor-pointer p-0">
                      Reset
                    </button>
                  </div>
                  {COLUMNS.map((c) => (
                    <Checkbox
                      key={c.key}
                      checked={visible.includes(c.key)}
                      onChange={(e) => setColumns(e.target.checked ? [...visible, c.key] : visible.filter((k) => k !== c.key))}
                    >
                      <span className="text-[13px]">{c.title}</span>
                    </Checkbox>
                  ))}
                </div>
              }
            >
              <Tooltip title="Columns">
                <button
                  aria-label="Columns"
                  className="flex items-center justify-center shrink-0 rounded-lg border border-slate-300 bg-white w-8 h-8 p-0 text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <SettingOutlined />
                </button>
              </Tooltip>
            </Popover>

            <button
              onClick={() => exportCsv(filtered, COLUMNS.filter((c) => visible.includes(c.key)), storageKey.replace(/[:.]/g, "-"))}
              title="Export the filtered positions (visible columns) to CSV"
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 h-8 text-[13px] font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <DownloadOutlined />
              Export
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="shipments-table bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <Table<WarehouseRow>
            dataSource={paged}
            columns={columns}
            rowKey="id"
            loading={loading}
            size="small"
            pagination={false}
            rowSelection={{ selectedRowKeys: selected, onChange: setSelected, preserveSelectedRowKeys: true, fixed: true, columnWidth: 44 }}
            scroll={{ x: "max-content" }}
            locale={{ emptyText }}
          />

          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-100">
            <div className="flex items-center gap-2 text-[13px] text-slate-500">
              <span>Rows per page</span>
              <Select value={pageSize} onChange={setPageSize} options={PAGE_SIZE_OPTIONS.map((n) => ({ value: n, label: String(n) }))} className="w-20" size="small" />
            </div>
            <Pagination
              size="small"
              current={safePage}
              pageSize={pageSize}
              total={filtered.length}
              showSizeChanger={false}
              onChange={setPage}
              showTotal={(total, range) => `${range[0]}-${range[1]} of ${total} entries`}
            />
          </div>
        </div>

        {selected.length > 0 && (
          <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-2.5">
            <span className="text-sm text-indigo-700 font-medium">{selected.length} selected</span>
            <Button size="small" type="text" onClick={() => setSelected([])}>
              Clear
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

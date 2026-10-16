"use client";

import { Input, Select } from "antd";
import { CloseOutlined, PlusOutlined } from "@ant-design/icons";
import { newFilterId, type GridFilter, type GridFilterColumn } from "./gridFilters";

interface ColumnFilterRowsProps {
  rows: GridFilter[];
  columns: GridFilterColumn[];
  onChange: (next: GridFilter[]) => void;
  /** Focus the first value box (a row offered ready to type into). */
  autoFocusFirst?: boolean;
}

// The rows of a "Filter by column" panel (column + value, remove) and the "Add filter" button,
// shared by AppGrid and the Customer Database list.
export function ColumnFilterRows({ rows, columns, onChange, autoFocusFirst }: ColumnFilterRowsProps) {
  const columnByKey = new Map(columns.map((c) => [c.key, c]));
  const columnOptions = columns.map((c) => ({ value: c.key, label: c.title }));
  const update = (id: string, patch: Partial<GridFilter>) => onChange(rows.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  return (
    <>
      {rows.length === 0 ? (
        <div className="text-xs text-slate-400 text-center py-4 bg-slate-50 rounded-lg">No filters yet — add one to narrow the list.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((f, i) => {
            const options = columnByKey.get(f.key)?.options;
            return (
              <div key={f.id} className="flex items-center gap-1.5">
                <Select
                  showSearch
                  placeholder="Column"
                  value={f.key || undefined}
                  onChange={(val: string) => update(f.id, { key: val, value: "" })}
                  options={columnOptions}
                  optionFilterProp="label"
                  size="small"
                  className="w-[150px] shrink-0"
                />
                <div className="flex-1 min-w-0">
                  {options ? (
                    <Select
                      showSearch
                      allowClear
                      placeholder="Select value"
                      value={f.value || undefined}
                      onChange={(val?: string) => update(f.id, { value: val ?? "" })}
                      options={options.map((o) => ({ value: o, label: o }))}
                      optionFilterProp="label"
                      size="small"
                      className="w-full"
                    />
                  ) : (
                    <Input
                      autoFocus={autoFocusFirst && i === 0}
                      placeholder="Enter value"
                      value={f.value}
                      onChange={(e) => update(f.id, { value: e.target.value })}
                      size="small"
                      allowClear
                    />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onChange(rows.filter((x) => x.id !== f.id))}
                  aria-label="Remove filter"
                  className="shrink-0 flex items-center justify-center w-6 h-6 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 bg-transparent border-none cursor-pointer transition-colors"
                >
                  <CloseOutlined className="text-[11px]" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <button
        type="button"
        onClick={() => onChange([...rows, { id: newFilterId(), key: "", value: "" }])}
        className="mt-2.5 w-full flex items-center justify-center gap-1.5 h-8 rounded-lg border border-dashed border-slate-300 text-xs font-medium text-slate-500 hover:border-indigo-400 hover:text-indigo-500 hover:bg-indigo-50/40 bg-transparent cursor-pointer transition-colors"
      >
        <PlusOutlined className="text-[10px]" /> Add filter
      </button>
    </>
  );
}

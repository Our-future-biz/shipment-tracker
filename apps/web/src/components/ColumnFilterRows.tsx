"use client";

import { Input, Select } from "antd";
import { CloseOutlined, PlusOutlined } from "@ant-design/icons";
import { newFilterId, type GridFilter, type GridFilterColumn } from "./gridFilters";
import { HINT, ICON_BTN_GHOST } from "@/styles/ui";

interface ColumnFilterRowsProps {
  rows: GridFilter[];
  columns: GridFilterColumn[];
  onChange: (next: GridFilter[]) => void;
  /** Focus the first value box (a row offered ready to type into). */
  autoFocusFirst?: boolean;
  /** The most rows the list takes (its server's limit): "Add filter" is off at it. */
  maxRows?: number;
  /** The longest value the list takes. */
  maxLength?: number;
}

// The rows of a "Filter by column" panel (column + value, remove) and the "Add filter" button,
// shared by AppGrid and the Customer Database list.
export function ColumnFilterRows({ rows, columns, onChange, autoFocusFirst, maxRows, maxLength }: ColumnFilterRowsProps) {
  const full = maxRows !== undefined && rows.length >= maxRows;
  const columnByKey = new Map(columns.map((c) => [c.key, c]));
  const columnOptions = columns.map((c) => ({ value: c.key, label: c.title }));
  const update = (id: string, patch: Partial<GridFilter>) => onChange(rows.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  return (
    <>
      {rows.length === 0 ? (
        <div className={`${HINT} text-center py-4 bg-slate-50 rounded-lg`}>No filters yet — add one to narrow the list.</div>
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
                      maxLength={maxLength}
                      size="small"
                      allowClear
                    />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onChange(rows.filter((x) => x.id !== f.id))}
                  aria-label="Remove filter"
                  className={`${ICON_BTN_GHOST} hover:!text-red-600 hover:!bg-red-50`}
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
        disabled={full}
        title={full ? `At most ${maxRows} filters` : undefined}
        className="mt-2.5 w-full flex items-center justify-center gap-1.5 h-8 rounded-lg border border-dashed border-slate-300 text-[12px] font-medium text-slate-500 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/40 bg-transparent cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-300 disabled:hover:text-slate-500 disabled:hover:bg-transparent"
      >
        <PlusOutlined className="text-[10px]" /> Add filter
      </button>
    </>
  );
}

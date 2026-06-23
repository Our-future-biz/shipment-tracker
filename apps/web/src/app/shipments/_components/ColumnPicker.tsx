"use client";

import { useMemo, useState } from "react";
import { Popover, Input, Button, Checkbox } from "antd";
import { SettingOutlined } from "@ant-design/icons";
import { COLUMNS } from "@/lib/columnConfig";

// All pickable columns (exclude the dimensions popup, which has no flat value).
const PICKABLE = COLUMNS.filter((c) => c.type !== "popup");

export function ColumnPicker({
  visible,
  onChange,
  onReset,
}: {
  visible: string[];
  onChange: (keys: string[]) => void;
  onReset: () => void;
}) {
  const [search, setSearch] = useState("");
  const visibleSet = useMemo(() => new Set(visible), [visible]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return PICKABLE;
    return PICKABLE.filter((c) => c.title.toLowerCase().includes(q));
  }, [search]);

  const toggle = (key: string, checked: boolean) => {
    if (checked) onChange([...visible, key]);
    else onChange(visible.filter((k) => k !== key));
  };

  const content = (
    <div className="w-[280px]">
      <Input
        size="small"
        placeholder="Find a column…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        allowClear
        className="mb-2"
      />
      <div className="max-h-[320px] overflow-y-auto pr-1 flex flex-col gap-1">
        {filtered.length === 0 && <div className="text-xs text-slate-400 py-2">No columns found.</div>}
        {filtered.map((col) => (
          <label key={col.key} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer py-0.5">
            <Checkbox
              checked={visibleSet.has(col.key)}
              onChange={(e) => toggle(col.key, e.target.checked)}
            />
            {col.title}
          </label>
        ))}
      </div>
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
        <span className="text-[11px] text-slate-400">{visible.length} shown</span>
        <Button size="small" type="link" onClick={onReset} className="px-0">
          Reset to default
        </Button>
      </div>
    </div>
  );

  return (
    <Popover content={content} trigger="click" placement="bottomRight">
      <button className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50 transition-colors">
        <SettingOutlined />
        Columns
      </button>
    </Popover>
  );
}

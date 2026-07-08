"use client";

import { useMemo, useState } from "react";
import { Popover, Input, Button, Checkbox, Tooltip } from "antd";
import { SettingOutlined, DeleteOutlined, CheckOutlined } from "@ant-design/icons";
import { COLUMNS } from "@/lib/columnConfig";
import type { ColumnTemplate } from "@/hooks/useColumnTemplates";

// All pickable columns (exclude the dimensions popup, which has no flat value).
const PICKABLE = COLUMNS.filter((c) => c.type !== "popup");
const ALL_KEYS = PICKABLE.map((c) => c.key);

export function ColumnPicker({
  visible,
  onChange,
  onReset,
  templates,
  activeTemplateId,
  onApplyTemplate,
  onDeactivate,
  onSaveTemplate,
  onDeleteTemplate,
}: {
  visible: string[];
  onChange: (keys: string[]) => void;
  onReset: () => void;
  templates: ColumnTemplate[];
  activeTemplateId: string | null;
  onApplyTemplate: (id: string) => void;
  onDeactivate: () => void;
  onSaveTemplate: (name: string) => void;
  onDeleteTemplate: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [templateName, setTemplateName] = useState("");
  const visibleSet = useMemo(() => new Set(visible), [visible]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return PICKABLE;
    return PICKABLE.filter((c) => c.title.toLowerCase().includes(q));
  }, [search]);

  const activeTemplate = templates.find((t) => t.id === activeTemplateId) ?? null;

  const toggle = (key: string, checked: boolean) => {
    if (checked) onChange([...visible, key]);
    else onChange(visible.filter((k) => k !== key));
  };

  const handleSaveTemplate = () => {
    const name = templateName.trim();
    if (!name) return;
    onSaveTemplate(name);
    setTemplateName("");
  };

  const content = (
    <div className="w-[300px]">
      {/* Templates */}
      {templates.length > 0 && (
        <div className="mb-2 pb-2 border-b border-slate-100">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Templates</span>
            {activeTemplate && (
              <button
                onClick={onDeactivate}
                className="text-[11px] text-slate-400 hover:underline bg-transparent border-none p-0 cursor-pointer"
              >
                Use default view
              </button>
            )}
          </div>
          <div className="flex flex-col gap-0.5 max-h-[104px] overflow-y-auto">
            {templates.map((t) => {
              const isActive = t.id === activeTemplateId;
              return (
                <div key={t.id} className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => onApplyTemplate(t.id)}
                    className={`flex-1 min-w-0 flex items-center gap-1 text-left text-xs truncate bg-transparent border-none p-0 cursor-pointer ${
                      isActive ? "text-indigo-600 font-semibold" : "text-slate-600 hover:text-indigo-600"
                    }`}
                  >
                    {isActive && <CheckOutlined className="text-[10px] shrink-0" />}
                    <span className="truncate">
                      {t.name} <span className="text-slate-400 font-normal">({t.columns.length})</span>
                    </span>
                  </button>
                  <Tooltip title="Delete template">
                    <button
                      onClick={() => onDeleteTemplate(t.id)}
                      className="text-slate-300 hover:text-red-500 bg-transparent border-none p-0 cursor-pointer shrink-0"
                    >
                      <DeleteOutlined />
                    </button>
                  </Tooltip>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Save current selection as a new template */}
      <div className="flex items-center gap-1 mb-2">
        <Input
          size="small"
          placeholder="Save current as…"
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
          onPressEnter={handleSaveTemplate}
        />
        <Button size="small" onClick={handleSaveTemplate} disabled={!templateName.trim()}>
          Save
        </Button>
      </div>

      {activeTemplate && (
        <div className="mb-2 text-[11px] text-slate-400">
          Editing <span className="text-indigo-500 font-medium">{activeTemplate.name}</span> — changes save to this template.
        </div>
      )}

      <Input
        size="small"
        placeholder="Find a column…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        allowClear
        className="mb-2"
      />

      {/* Bulk actions */}
      <div className="flex items-center gap-3 mb-1.5">
        <button
          onClick={() => onChange(ALL_KEYS)}
          className="text-[11px] text-indigo-500 hover:underline bg-transparent border-none p-0 cursor-pointer"
        >
          Select all
        </button>
        <button
          onClick={() => onChange([])}
          className="text-[11px] text-slate-400 hover:underline bg-transparent border-none p-0 cursor-pointer"
        >
          Clear
        </button>
      </div>

      <div className="max-h-[320px] overflow-y-auto pr-1 flex flex-col gap-1">
        {filtered.length === 0 && <div className="text-xs text-slate-400 py-2">No columns found.</div>}
        {filtered.map((col) => (
          <label key={col.key} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer py-0.5">
            <Checkbox checked={visibleSet.has(col.key)} onChange={(e) => toggle(col.key, e.target.checked)} />
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

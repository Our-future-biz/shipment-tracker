"use client";

import { useMemo, useState } from "react";
import { Popover, Input, Checkbox, Tooltip, Select, Modal } from "antd";
import { SettingOutlined, CloseOutlined } from "@ant-design/icons";
import { COLUMNS, FIXED_COLUMN_KEYS, isFixedColumn } from "@/lib/columnConfig";
import type { ColumnTemplate } from "@/hooks/useColumnTemplates";

// All pickable columns (exclude the dimensions popup, which has no flat value).
const PICKABLE = COLUMNS.filter((c) => c.type !== "popup");
const ALL_KEYS = PICKABLE.map((c) => c.key);

export function ColumnPicker({
  visible,
  onChange,
  templates,
  activeTemplateId,
  isDirty,
  onApplyTemplate,
  onDeactivate,
  onSaveTemplate,
  onDeleteTemplate,
}: {
  visible: string[];
  onChange: (keys: string[]) => void;
  templates: ColumnTemplate[];
  activeTemplateId: string | null;
  isDirty: boolean;
  onApplyTemplate: (id: string) => void;
  onDeactivate: () => void;
  /** Saves the current columns under a name; an existing template of that name is overwritten. */
  onSaveTemplate: (name: string) => void;
  onDeleteTemplate: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [open, setOpen] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  // Template waiting for the user to confirm its deletion.
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);
  const visibleSet = useMemo(() => new Set(visible), [visible]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return PICKABLE;
    return PICKABLE.filter((c) => c.title.toLowerCase().includes(q));
  }, [search]);

  const activeTemplate = templates.find((t) => t.id === activeTemplateId) ?? null;

  const toggle = (key: string, checked: boolean) => {
    if (isFixedColumn(key)) return; // Internal Reference is always shown.
    if (checked) onChange([...visible, key]);
    else onChange(visible.filter((k) => k !== key));
  };

  // Same flow as the filter templates: Save asks for a name. It starts as the active
  // template's name, so confirming it unchanged updates that template.
  const openName = () => {
    setTemplateName(activeTemplate?.name ?? "");
    setNameOpen(true);
  };
  const handleSaveTemplate = () => {
    const name = templateName.trim();
    if (!name) return;
    onSaveTemplate(name);
    setNameOpen(false);
  };

  const content = (
    <div className="w-[340px]">
      <div className="flex items-center gap-3 pb-2.5 mb-2.5 border-b border-slate-100">
        <span className="text-[13px] font-semibold text-slate-800 shrink-0">Columns</span>
        <Select
          size="small"
          placeholder="Templates"
          aria-label="Column templates"
          className="flex-1 min-w-0"
          allowClear
          value={activeTemplate?.id}
          onChange={(id) => (id ? onApplyTemplate(id) : onDeactivate())}
          options={templates.map((t) => ({ value: t.id, label: t.name }))}
          notFoundContent={<span className="text-xs text-slate-400">No templates yet — pick columns and press Save.</span>}
          optionRender={(option) => (
            <span className="flex items-center justify-between gap-2">
              <span className="truncate">{option.label}</span>
              <button
                type="button"
                aria-label={`Delete template ${String(option.label)}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setToDelete({ id: String(option.value), name: String(option.label) });
                }}
                className="shrink-0 flex items-center justify-center w-5 h-5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 bg-transparent border-none cursor-pointer"
              >
                <CloseOutlined className="text-[10px]" />
              </button>
            </span>
          )}
        />
        <button
          onClick={openName}
          className="shrink-0 text-xs font-medium text-indigo-600 hover:text-indigo-700 bg-transparent border-none cursor-pointer p-0"
        >
          Save
        </button>
      </div>

      {activeTemplate && isDirty && (
        <p className="mt-0 mb-2 text-[11px] text-amber-600">
          Unsaved changes in <span className="font-medium">{activeTemplate.name}</span> — press Save to keep them.
        </p>
      )}

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
        {filtered.map((col) => {
          const fixed = isFixedColumn(col.key);
          return (
            <label
              key={col.key}
              className={`flex items-center gap-2 text-xs py-0.5 ${fixed ? "text-slate-500 cursor-default" : "text-slate-700 cursor-pointer"}`}
            >
              <Checkbox
                checked={fixed || visibleSet.has(col.key)}
                disabled={fixed}
                onChange={(e) => toggle(col.key, e.target.checked)}
              />
              {col.title}
              {fixed && <span className="text-[10px] text-slate-400">· always shown</span>}
            </label>
          );
        })}
      </div>

      <div className="flex items-center gap-3 mt-2 pt-2 border-t border-slate-100">
        <button
          onClick={() => onChange(ALL_KEYS)}
          className="text-[11px] text-indigo-500 hover:underline bg-transparent border-none p-0 cursor-pointer"
        >
          Select all
        </button>
        <button
          onClick={() => onChange([...FIXED_COLUMN_KEYS])}
          className="text-[11px] text-slate-400 hover:underline bg-transparent border-none p-0 cursor-pointer"
        >
          Clear
        </button>
        <span className="ml-auto text-[11px] text-slate-400">{visible.length} shown</span>
      </div>
    </div>
  );

  return (
    <>
      <Popover
        content={content}
        trigger="click"
        placement="bottomRight"
        open={open}
        // The name and delete dialogs live outside the popover; clicking in them must not close the picker.
        onOpenChange={(next) => {
          if (!nameOpen && !toDelete) setOpen(next);
        }}
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

      <Modal
        open={nameOpen}
        title="Save column template"
        okText="Save"
        cancelText="Cancel"
        width={380}
        centered
        // Opened from inside the columns popover, so it has to sit above it.
        zIndex={1100}
        destroyOnHidden
        okButtonProps={{ disabled: !templateName.trim() }}
        onOk={handleSaveTemplate}
        onCancel={() => setNameOpen(false)}
      >
        <Input
          autoFocus
          placeholder="Template name"
          maxLength={60}
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
          onPressEnter={handleSaveTemplate}
        />
        {templates.some((t) => t.name.toLowerCase() === templateName.trim().toLowerCase()) && (
          <p className="mt-2 mb-0 text-xs text-amber-600">A template with this name exists — saving will overwrite it.</p>
        )}
      </Modal>
      <Modal
        open={!!toDelete}
        title="Delete template"
        okText="Delete"
        cancelText="Cancel"
        okButtonProps={{ danger: true }}
        width={380}
        centered
        zIndex={1100}
        onOk={() => {
          if (toDelete) onDeleteTemplate(toDelete.id);
          setToDelete(null);
        }}
        onCancel={() => setToDelete(null)}
      >
        Do you really want to delete the column template <strong>{toDelete?.name}</strong>? This cannot be undone.
      </Modal>
    </>
  );
}

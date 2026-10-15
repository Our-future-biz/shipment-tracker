"use client";

import { useState } from "react";
import { Badge, Input, Modal, Popover, Select, Tooltip } from "antd";
import { CloseOutlined, FilterOutlined, PlusOutlined } from "@ant-design/icons";
import { useToast } from "@/lib/toast";

/** One "Filter by column" row: the rows whose cell in `key` contains `value` (any case) are kept. */
export type ColFilter = { key: string; value: string };

/** A column a filter can be set on; with `options` its value is picked from them instead of typed. */
export interface FilterColumn {
  key: string;
  title: string;
  options?: readonly string[];
}

/** A named set of filters a user saved. */
export interface FilterTemplate {
  id: string;
  name: string;
  filters: ColFilter[];
}

/** The filters that narrow anything: a column chosen and a value typed. */
export const activeColumnFilters = (filters: ColFilter[]) =>
  filters.filter((f) => f.key && f.value.trim());

/** Whether a row passes every active filter; `cellText` gives the row's text in a column. */
export function matchesColumnFilters<T>(
  row: T,
  filters: ColFilter[],
  cellText: (row: T, key: string) => string,
): boolean {
  return activeColumnFilters(filters).every((f) =>
    cellText(row, f.key).toLowerCase().includes(f.value.toLowerCase().trim()),
  );
}

interface CustomerFiltersPopoverProps {
  filters: ColFilter[];
  onChange: (next: ColFilter[]) => void;
  columns: FilterColumn[];
  templates: FilterTemplate[];
  /** Stores the active filters under a name; a template of that name is overwritten. */
  onSaveTemplate: (name: string, filters: ColFilter[]) => Promise<void>;
  onDeleteTemplate: (id: string) => void;
  isSaving: boolean;
}

// The "Filters" button of the Customer Database list and its "Filter by column" panel: rows of column + value,
// and named templates of them, which the list keeps per user. The list itself applies the filters.
export function CustomerFiltersPopover({
  filters,
  onChange,
  columns,
  templates,
  onSaveTemplate,
  onDeleteTemplate,
  isSaving,
}: CustomerFiltersPopoverProps) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  // Template waiting for the user to confirm its deletion.
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);

  const active = activeColumnFilters(filters);
  const columnByKey = new Map(columns.map((c) => [c.key, c]));
  const columnOptions = columns.map((c) => ({ value: c.key, label: c.title }));

  // The template whose filters are exactly the ones applied now, if any.
  const signature = (list: ColFilter[]) =>
    JSON.stringify(activeColumnFilters(list).map((f) => [f.key, f.value.trim()]));
  const activeTemplate = templates.find(
    (t) => t.filters.length > 0 && signature(t.filters) === signature(filters),
  );

  const update = (i: number, patch: Partial<ColFilter>) =>
    onChange(filters.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const remove = (i: number) => onChange(filters.filter((_, idx) => idx !== i));

  const openTemplateName = () => {
    setTemplateName(activeTemplate?.name ?? "");
    setNameOpen(true);
  };

  const submitTemplateName = async () => {
    const name = templateName.trim();
    if (!name || isSaving) return;
    try {
      await onSaveTemplate(name, active);
      toast.success(`Template "${name}" saved`);
      setNameOpen(false);
    } catch {
      toast.error("Could not save the template");
    }
  };

  return (
    <>
      <Popover
        trigger="click"
        placement="bottomRight"
        open={open}
        // The name and delete dialogs live outside the popover; clicking in them must not close the filters.
        onOpenChange={(next) => {
          if (!nameOpen && !toDelete) setOpen(next);
        }}
        content={
          <div className="w-[430px] -m-1">
            <div className="flex items-center gap-3 px-1 pb-2.5 mb-2.5 border-b border-slate-100">
              <span className="text-[13px] font-semibold text-slate-800 shrink-0">
                Filter by column
              </span>
              <Select
                size="small"
                placeholder="Templates"
                aria-label="Filter templates"
                className="flex-1 min-w-0"
                value={activeTemplate?.id}
                onChange={(id) => {
                  const t = templates.find((x) => x.id === id);
                  if (t) onChange(t.filters);
                }}
                options={templates.map((t) => ({ value: t.id, label: t.name }))}
                notFoundContent={
                  <span className="text-xs text-slate-400">
                    No templates yet — set filters and press Save.
                  </span>
                }
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
                onClick={openTemplateName}
                disabled={active.length === 0}
                className="shrink-0 text-xs font-medium text-indigo-600 hover:text-indigo-700 disabled:text-slate-300 disabled:cursor-not-allowed bg-transparent border-none cursor-pointer p-0"
              >
                Save
              </button>
              <button
                onClick={() => onChange([])}
                disabled={filters.length === 0}
                className="shrink-0 text-xs font-medium text-slate-400 hover:text-red-500 disabled:text-slate-300 disabled:cursor-not-allowed bg-transparent border-none cursor-pointer p-0"
              >
                Clear all
              </button>
            </div>
            {filters.length === 0 ? (
              <div className="text-xs text-slate-400 text-center py-4 bg-slate-50 rounded-lg">
                No filters yet — add one to narrow the list.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {filters.map((f, i) => {
                  const options = columnByKey.get(f.key)?.options;
                  return (
                    <div key={i} className="flex items-center gap-1.5">
                      <Select
                        showSearch
                        placeholder="Column"
                        value={f.key || undefined}
                        onChange={(val) => update(i, { key: val, value: "" })}
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
                            onChange={(val) => update(i, { value: val ?? "" })}
                            options={options.map((o) => ({ value: o, label: o }))}
                            optionFilterProp="label"
                            size="small"
                            className="w-full"
                          />
                        ) : (
                          <Input
                            placeholder="Enter value"
                            value={f.value}
                            onChange={(e) => update(i, { value: e.target.value })}
                            size="small"
                            allowClear
                          />
                        )}
                      </div>
                      <button
                        onClick={() => remove(i)}
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
              onClick={() => onChange([...filters, { key: "", value: "" }])}
              className="mt-2.5 w-full flex items-center justify-center gap-1.5 h-8 rounded-lg border border-dashed border-slate-300 text-xs font-medium text-slate-500 hover:border-indigo-400 hover:text-indigo-500 hover:bg-indigo-50/40 bg-transparent cursor-pointer transition-colors"
            >
              <PlusOutlined className="text-[10px]" /> Add filter
            </button>
          </div>
        }
      >
        <Tooltip title="Filters">
          <Badge count={active.length} size="small" color="#4f46e5" offset={[-4, 4]}>
            <button
              aria-label="Filters"
              className="flex items-center justify-center shrink-0 rounded-lg border border-slate-300 bg-white w-8 h-8 p-0 text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <FilterOutlined />
            </button>
          </Badge>
        </Tooltip>
      </Popover>

      <Modal
        open={nameOpen}
        title="Save filter template"
        okText="Save"
        cancelText="Cancel"
        width={380}
        centered
        // Opened from inside the filters popover, so it has to sit above it.
        zIndex={1100}
        destroyOnHidden
        confirmLoading={isSaving}
        okButtonProps={{ disabled: !templateName.trim() }}
        onOk={submitTemplateName}
        onCancel={() => setNameOpen(false)}
      >
        <Input
          autoFocus
          placeholder="Template name"
          maxLength={60}
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
          onPressEnter={submitTemplateName}
        />
        {templates.some((t) => t.name.toLowerCase() === templateName.trim().toLowerCase()) && (
          <p className="mt-2 mb-0 text-xs text-amber-600">
            A template with this name exists — saving will overwrite it.
          </p>
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
        Do you really want to delete the filter template <strong>{toDelete?.name}</strong>? This
        cannot be undone.
      </Modal>
    </>
  );
}

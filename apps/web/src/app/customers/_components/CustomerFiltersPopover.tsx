"use client";

import { useState } from "react";
import { Badge, Input, Modal, Popover, Select, Tooltip } from "antd";
import { CloseOutlined, FilterOutlined } from "@ant-design/icons";
import { useToast } from "@/lib/toast";
import { ColumnFilterRows } from "@/components/ColumnFilterRows";
import {
  TOOLBAR_BUTTON_CLASS,
  newFilterId,
  storedGridFilters,
  withFilterId,
  type GridFilter,
  type GridFilterColumn,
} from "@/components/gridFilters";

/** A filter as stored in a template and in the URL: column and value (rows on screen add an id). */
export type StoredFilter = { key: string; value: string };

/** A named set of filters a user saved. */
export interface FilterTemplate {
  id: string;
  name: string;
  filters: StoredFilter[];
}

interface CustomerFiltersPopoverProps {
  filters: GridFilter[];
  onChange: (next: GridFilter[]) => void;
  columns: GridFilterColumn[];
  templates: FilterTemplate[];
  /** Stores the active filters under a name; a template of that name is overwritten. */
  onSaveTemplate: (name: string, filters: StoredFilter[]) => Promise<void>;
  onDeleteTemplate: (id: string) => void;
  isSaving: boolean;
  /** With no filters set, the panel offers one row on this column, ready for a value. */
  defaultColumn?: string;
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
  defaultColumn,
}: CustomerFiltersPopoverProps) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  // Template waiting for the user to confirm its deletion.
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);

  const active = storedGridFilters(filters);

  // The template whose filters are exactly the ones applied now, if any.
  const signature = (list: StoredFilter[]) => JSON.stringify(storedGridFilters(list).map((f) => [f.key, f.value]));
  const activeTemplate = templates.find((t) => t.filters.length > 0 && signature(t.filters) === signature(filters));

  // The rows shown: the filters, or with none the one row on the default column, which becomes a filter once edited.
  // Its id is kept for the panel's lifetime, so typing into it doesn't remount the input.
  const [defaultRowId] = useState(newFilterId);
  const rows: GridFilter[] = filters.length === 0 && defaultColumn ? [{ id: defaultRowId, key: defaultColumn, value: "" }] : filters;

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
                  if (t) onChange(t.filters.map(withFilterId));
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
            <ColumnFilterRows rows={rows} columns={columns} onChange={onChange} autoFocusFirst={filters.length === 0} />
          </div>
        }
      >
        <Tooltip title="Filters">
          <Badge count={active.length} size="small" offset={[-4, 4]} className="[&_.ant-badge-count]:!bg-indigo-600">
            <button aria-label="Filters" className={TOOLBAR_BUTTON_CLASS}>
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

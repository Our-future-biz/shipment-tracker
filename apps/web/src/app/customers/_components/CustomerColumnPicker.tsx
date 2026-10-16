"use client";

import { useState } from "react";
import { Input, Modal, Popover, Select, Tooltip } from "antd";
import { CloseOutlined, SettingOutlined } from "@ant-design/icons";
import { useToast } from "@/lib/toast";
import { ColumnChecklist } from "@/components/ColumnChecklist";
import { TOOLBAR_BUTTON_CLASS } from "@/components/gridFilters";
import { CUSTOMER_LIST_COLUMNS, NAME_COLUMN_KEY } from "../_lib/customerListColumns";

/** A named set of columns a user saved. */
export interface ColumnTemplate {
  id: string;
  name: string;
  columns: string[];
}

const ALL_KEYS = CUSTOMER_LIST_COLUMNS.map((c) => c.key);

interface CustomerColumnPickerProps {
  /** The columns shown, in order; the customer's name is always among them. */
  visible: string[];
  onChange: (keys: string[]) => void;
  templates: ColumnTemplate[];
  /** Stores the shown columns under a name; a template of that name is overwritten. */
  onSaveTemplate: (name: string) => Promise<void>;
  onDeleteTemplate: (id: string) => void;
  /** False until the user's stored layout is read; changes are not offered before that. */
  ready: boolean;
}

// The "Columns" button of the Customer Database list: which columns are shown, and named templates of them.
// A template counts as chosen while the shown columns are exactly its own; picking one shows its columns.
export function CustomerColumnPicker({
  visible,
  onChange,
  templates,
  onSaveTemplate,
  onDeleteTemplate,
  ready,
}: CustomerColumnPickerProps) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [saving, setSaving] = useState(false);
  // Template waiting for the user to confirm its deletion.
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);

  const activeTemplate = templates.find((t) => t.columns.join("|") === visible.join("|")) ?? null;

  // Save asks for a name; it starts as the chosen template's, so confirming it unchanged updates that template.
  const openName = () => {
    setTemplateName(activeTemplate?.name ?? "");
    setNameOpen(true);
  };

  // The dialog stays open when saving fails, so the name is not lost.
  const handleSaveTemplate = async () => {
    const name = templateName.trim();
    if (!name || saving) return;
    setSaving(true);
    try {
      await onSaveTemplate(name);
      toast.success(`Template "${name}" saved`);
      setNameOpen(false);
    } catch {
      toast.error("Could not save the template");
    } finally {
      setSaving(false);
    }
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
          value={activeTemplate?.id}
          disabled={!ready}
          onChange={(id) => {
            const t = templates.find((x) => x.id === id);
            if (t) onChange(t.columns);
          }}
          options={templates.map((t) => ({ value: t.id, label: t.name }))}
          notFoundContent={
            <span className="text-xs text-slate-400">
              No templates yet — pick columns and press Save.
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
          onClick={openName}
          className="shrink-0 text-xs font-medium text-indigo-600 hover:text-indigo-700 bg-transparent border-none cursor-pointer p-0"
        >
          Save
        </button>
      </div>

      <ColumnChecklist
        columns={CUSTOMER_LIST_COLUMNS}
        visible={visible}
        onChange={onChange}
        fixedKeys={[NAME_COLUMN_KEY]}
        allKeys={ALL_KEYS}
        disabled={!ready}
      />
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
          <button aria-label="Columns" className={TOOLBAR_BUTTON_CLASS}>
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
        confirmLoading={saving}
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
        Do you really want to delete the column template <strong>{toDelete?.name}</strong>? This
        cannot be undone.
      </Modal>
    </>
  );
}

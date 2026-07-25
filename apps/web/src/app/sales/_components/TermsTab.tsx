"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Input, Modal, Spin } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import { useTermsConditions, type TermsConditionItem } from "@/hooks/useTermsConditions";
import { useToast } from "@/lib/toast";
import { ConfirmModal } from "@/components/ConfirmModal";

export function TermsTab() {
  const { terms, isLoading, createTerms, updateTerms, deleteTerms } = useTermsConditions();
  const toast = useToast();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [name, setName] = useState("");
  const [includes, setIncludes] = useState("");
  const [excludes, setExcludes] = useState("");

  const selected = useMemo<TermsConditionItem | null>(
    () => terms.find((t) => t.id === selectedId) ?? null,
    [terms, selectedId],
  );

  // Default selection to first template once terms load and nothing is selected.
  useEffect(() => {
    const first = terms[0];
    if (!selectedId && first) {
      setSelectedId(first.id);
    }
  }, [terms, selectedId]);

  // Keep the editor's local state synced with the selected template.
  useEffect(() => {
    setName(selected?.name ?? "");
    setIncludes(selected?.includes ?? "");
    setExcludes(selected?.excludes ?? "");
  }, [selected]);

  const openCreate = () => {
    setNewName("");
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    try {
      const created = await createTerms(trimmed);
      toast.success("Template created");
      setCreateOpen(false);
      setNewName("");
      if (created?.terms?.id) setSelectedId(created.terms.id);
    } catch {
      toast.error("Failed to create template");
    }
  };

  const handleSave = async () => {
    if (!selectedId) return;
    try {
      await updateTerms({ id: selectedId, params: { name, includes, excludes } });
      toast.success("Saved");
    } catch {
      toast.error("Failed to save");
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    try {
      await deleteTerms(selectedId);
      toast.success("Template deleted");
      setSelectedId(null);
    } catch {
      toast.error("Failed to delete template");
    }
    setDeleteOpen(false);
  };

  return (
    <div className="flex gap-4 items-start">
      <div className="w-72 shrink-0 bg-white border border-slate-200 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-slate-800">Templates</span>
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openCreate}>
            New
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Spin />
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {terms.length === 0 ? (
              <div className="text-sm text-slate-400 py-2 px-3">No templates yet</div>
            ) : (
              terms.map((t) => (
                <div
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={`px-3 py-2 rounded-lg cursor-pointer text-sm ${
                    t.id === selectedId
                      ? "bg-indigo-50 text-indigo-600 font-medium"
                      : "hover:bg-slate-50 text-slate-600"
                  }`}
                >
                  {t.name}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div className="flex-1 bg-white border border-slate-200 rounded-2xl p-4">
        {!selected ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-400">
            Select a template
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Template name"
                className="flex-1"
              />
              <Button danger icon={<DeleteOutlined />} onClick={() => setDeleteOpen(true)}>
                Delete
              </Button>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Rate offer includes
              </label>
              <Input.TextArea
                rows={6}
                value={includes}
                onChange={(e) => setIncludes(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Rate offer excludes
              </label>
              <Input.TextArea
                rows={6}
                value={excludes}
                onChange={(e) => setExcludes(e.target.value)}
              />
            </div>

            <div className="flex justify-end">
              <Button type="primary" onClick={handleSave}>
                Save
              </Button>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={submitCreate}
        title="New Template"
        okText="Create"
        destroyOnHidden
      >
        <div className="pt-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onPressEnter={submitCreate}
            placeholder="Template name"
          />
        </div>
      </Modal>

      <ConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete template"
        description={`Delete ${selected?.name ?? "this template"}?`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}

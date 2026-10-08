"use client";

import { useMemo, useState } from "react";
import { Button, Spin, Tag } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { ConfirmModal } from "@/components/ConfirmModal";
import { PillTabs, SectionCard } from "@/components/SectionCard";
import { useCustomerNotes } from "@/hooks/useCustomerNotes";
import type { NoteItem } from "@/hooks/useCustomerNotes";
import { formatDateTime } from "@/lib/date";
import { useToast } from "@/lib/toast";
import { NOTE_TYPES, NOTE_TYPE_COLORS } from "../../_lib/constants";
import { CustomerCountChip } from "../_components/CustomerCountChip";
import { CustomerNoteDialog } from "../_components/CustomerNoteDialog";
import type { CustomerNoteFormValues } from "../_components/CustomerNoteDialog";

const ALL_TYPES = "all";

export function CommunicationTab({ customerId }: { customerId: string }) {
  const { notes, isLoading, createNote, deleteNote } = useCustomerNotes(customerId);
  const toast = useToast();
  const [typeFilter, setTypeFilter] = useState<string>(ALL_TYPES);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<NoteItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const countByType = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const note of notes) counts[note.type] = (counts[note.type] ?? 0) + 1;
    return counts;
  }, [notes]);

  const filterTabs = [
    { key: ALL_TYPES, label: `All (${notes.length})` },
    ...NOTE_TYPES.map((type) => ({ key: type, label: `${type} (${countByType[type] ?? 0})` })),
  ];

  const visibleNotes = typeFilter === ALL_TYPES ? notes : notes.filter((note) => note.type === typeFilter);

  const handleOpenAdd = () => setAddOpen(true);

  const handleCloseAdd = () => setAddOpen(false);

  const handleAdd = async (values: CustomerNoteFormValues) => {
    setSaving(true);
    try {
      await createNote(values);
      toast.success("Entry added");
      setAddOpen(false);
      // A filter on another type would hide the entry that was just added.
      if (typeFilter !== ALL_TYPES && typeFilter !== values.type) setTypeFilter(ALL_TYPES);
    } catch {
      toast.error("Failed to add entry");
    } finally {
      setSaving(false);
    }
  };

  const handleCloseDelete = () => setDeleteTarget(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteNote(deleteTarget.id);
      toast.success("Entry deleted");
      setDeleteTarget(null);
    } catch {
      toast.error("Failed to delete entry");
    } finally {
      setDeleting(false);
    }
  };

  const renderFeed = () => {
    if (isLoading) {
      return (
        <div className="flex justify-center py-10">
          <Spin />
        </div>
      );
    }

    if (visibleNotes.length === 0) {
      return (
        <div className="py-8 text-center text-[13px] text-slate-400">{notes.length === 0 ? "No activity yet" : "No entries of this type"}</div>
      );
    }

    return (
      <ul aria-label="Communication entries" className="list-none m-0 p-0 space-y-2">
        {visibleNotes.map((note) => {
          const createdAt = formatDateTime(note.createdAt);
          return (
            <li key={note.id} className="border border-slate-200 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2">
                <Tag color={NOTE_TYPE_COLORS[note.type] ?? "default"} className="!m-0">
                  {note.type}
                </Tag>
                {note.author ? (
                  <span className="min-w-0 truncate text-xs font-medium text-slate-600">{note.author}</span>
                ) : (
                  <span className="text-slate-300">—</span>
                )}
                <span className="ml-auto shrink-0 text-xs text-slate-400 tabular-nums">{createdAt}</span>
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  aria-label={`Delete ${note.type} entry from ${createdAt}`}
                  onClick={() => setDeleteTarget(note)}
                />
              </div>
              <div className="mt-1 text-[13px] text-slate-700 whitespace-pre-wrap [overflow-wrap:anywhere]">{note.content}</div>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="space-y-5">
      <SectionCard
        title="Communication"
        extra={
          <>
            <CustomerCountChip count={notes.length} />
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleOpenAdd}>
              Add Entry
            </Button>
          </>
        }
      >
        <div className="pb-3">
          <PillTabs tabs={filterTabs} active={typeFilter} onChange={setTypeFilter} />
        </div>
        {renderFeed()}
      </SectionCard>

      <CustomerNoteDialog open={addOpen} saving={saving} onCancel={handleCloseAdd} onSubmit={handleAdd} />

      <ConfirmModal
        open={!!deleteTarget}
        onClose={handleCloseDelete}
        onConfirm={handleDelete}
        title="Delete entry"
        description="Delete this entry from the customer's communication history?"
        confirmLabel="Delete"
        danger
        loading={deleting}
      />
    </div>
  );
}

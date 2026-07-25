"use client";

import { useState } from "react";
import { Button, Modal, Form, Input, Select, Tag, Spin } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import { useCustomerNotes, type NoteItem } from "@/hooks/useCustomerNotes";
import { useToast } from "@/lib/toast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { NOTE_TYPES } from "../../_lib/constants";

function typeColor(type: string): string {
  switch (type) {
    case "Email":
      return "blue";
    case "Call":
      return "green";
    case "Follow-up":
      return "gold";
    case "Visit":
      return "purple";
    default:
      return "default";
  }
}

export function CommunicationTab({ customerId }: { customerId: string }) {
  const { notes, isLoading, createNote, deleteNote } = useCustomerNotes(customerId);
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<NoteItem | null>(null);
  const [form] = Form.useForm();

  const submit = async () => {
    const values = await form.validateFields();
    try {
      await createNote(values);
      toast.success("Entry added");
      form.resetFields();
      setAddOpen(false);
    } catch {
      toast.error("Failed to add entry");
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-slate-800">Communication</span>
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
          Add Entry
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spin />
        </div>
      ) : notes.length === 0 ? (
        <div className="text-slate-400 text-sm text-center py-8">No activity yet</div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div key={note.id} className="border border-slate-100 rounded-xl p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Tag color={typeColor(note.type)} className="m-0">
                    {note.type}
                  </Tag>
                  <span className="text-xs text-slate-500">{note.author || "—"}</span>
                  <span className="text-xs text-slate-400">
                    {new Date(note.createdAt).toLocaleString("en-GB")}
                  </span>
                </div>
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => setDeleteTarget(note)}
                />
              </div>
              <div className="text-sm text-slate-700 mt-1.5 whitespace-pre-wrap">{note.content}</div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={submit}
        title="Add Entry"
        okText="Add"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" initialValues={{ type: "Note" }} className="pt-2">
          <Form.Item name="type" label="Type">
            <Select options={NOTE_TYPES.map((t) => ({ value: t, label: t }))} />
          </Form.Item>
          <Form.Item name="author" label="Author">
            <Input />
          </Form.Item>
          <Form.Item
            name="content"
            label="Content"
            rules={[{ required: true, message: "Content is required" }]}
          >
            <Input.TextArea rows={4} />
          </Form.Item>
        </Form>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) await deleteNote(deleteTarget.id);
          setDeleteTarget(null);
          toast.success("Entry removed");
        }}
        title="Delete entry"
        description="Delete this entry?"
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}

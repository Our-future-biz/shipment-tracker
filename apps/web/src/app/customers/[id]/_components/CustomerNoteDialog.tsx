"use client";

import { Form, Input, Modal, Select } from "antd";
import type { interfaces } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthContext";
import { NOTE_TYPES } from "../../_lib/constants";

export interface CustomerNoteFormValues {
  type: interfaces.NoteType;
  content: string;
}

interface CustomerNoteDialogProps {
  open: boolean;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (values: CustomerNoteFormValues) => void;
}

const TYPE_OPTIONS = NOTE_TYPES.map((type) => ({ value: type, label: type }));

// Dialog that adds an entry to the customer's communication feed.
export function CustomerNoteDialog({ open, saving, onCancel, onSubmit }: CustomerNoteDialogProps) {
  const { user } = useAuth();
  const [form] = Form.useForm<CustomerNoteFormValues>();

  const handleSubmit = () => form.submit();

  const handleFinish = (values: CustomerNoteFormValues) => {
    if (saving) return;
    onSubmit({ type: values.type, content: values.content.trim() });
  };

  return (
    <Modal open={open} onCancel={onCancel} onOk={handleSubmit} confirmLoading={saving} title="Add Entry" okText="Add" destroyOnHidden>
      <Form
        form={form}
        layout="vertical"
        className="pt-2"
        preserve={false}
        initialValues={{ type: "Note", content: "" }}
        onFinish={handleFinish}
      >
        <Form.Item name="type" label="Type">
          <Select options={TYPE_OPTIONS} />
        </Form.Item>
        {/* Always the signed-in user: the API records the author from the login, so it is not editable. */}
        <Form.Item label="Author">
          <Input value={user?.displayName || user?.email || ""} disabled aria-label="Author" />
        </Form.Item>
        <Form.Item name="content" label="Content" rules={[{ required: true, whitespace: true, message: "Content is required" }]}>
          <Input.TextArea rows={4} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

"use client";

import { Form, Input, Modal, Select } from "antd";
import type { interfaces } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthContext";
import { useUsers } from "@/hooks/useUsers";
import { sortedUsers } from "@/lib/people";
import { matchesUserOption, UserOptionLabel } from "@/app/sales/_lib/userOptions";
import { NOTE_TYPES } from "../../_lib/constants";

export interface CustomerNoteFormValues {
  type: interfaces.NoteType;
  content: string;
  /** The colleagues who took part with the author, by e-mail. */
  colleagues: string[];
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
  const { users, isLoading: usersLoading } = useUsers();
  const [form] = Form.useForm<CustomerNoteFormValues>();
  // Only a visit names colleagues: for another type the field is gone, and with it what was picked (preserve={false}).
  const isVisit = Form.useWatch("type", form) === "Visit";
  // Everyone else in the company, by e-mail as a picked person is stored; the author is already on the entry.
  const me = user?.email.toLowerCase();
  const colleagueOptions = sortedUsers(users)
    .filter((u) => u.email.toLowerCase() !== me)
    .map((u) => ({ value: u.email, label: u.email, name: u.displayName }));

  const handleSubmit = () => form.submit();

  const handleFinish = (values: CustomerNoteFormValues) => {
    if (saving) return;
    onSubmit({ type: values.type, content: values.content.trim(), colleagues: values.type === "Visit" ? (values.colleagues ?? []) : [] });
  };

  return (
    <Modal open={open} onCancel={onCancel} onOk={handleSubmit} confirmLoading={saving} title="Add Entry" okText="Add" destroyOnHidden>
      <Form
        form={form}
        layout="vertical"
        className="pt-2"
        preserve={false}
        initialValues={{ type: "Note", content: "", colleagues: [] }}
        onFinish={handleFinish}
      >
        <Form.Item name="type" label="Type">
          <Select options={TYPE_OPTIONS} />
        </Form.Item>
        {/* Always the signed-in user, by e-mail as a person is recorded: the API takes the author from the login, so it is not editable. */}
        <Form.Item label="Author">
          <Input value={user?.email ?? ""} disabled aria-label="Author" />
        </Form.Item>
        {/* When more than one went to the customer: typing a name or an e-mail finds them. */}
        {isVisit && (
          <Form.Item name="colleagues" label="Colleagues" extra="Who else from the company went on the visit">
            <Select
              mode="multiple"
              allowClear
              showSearch
              placeholder="Select colleagues"
              aria-label="Colleagues"
              loading={usersLoading}
              filterOption={matchesUserOption}
              options={colleagueOptions}
              optionRender={(option) => <UserOptionLabel label={option.label} name={option.data.name} />}
            />
          </Form.Item>
        )}
        <Form.Item name="content" label="Content" rules={[{ required: true, whitespace: true, message: "Content is required" }]}>
          <Input.TextArea rows={4} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

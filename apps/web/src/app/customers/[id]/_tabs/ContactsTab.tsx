"use client";

import { useState } from "react";
import { Table, Button, Modal, Form, Input, Select, Checkbox } from "antd";
import { PlusOutlined, DeleteOutlined, StarFilled } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useCustomerContacts, type ContactItem } from "@/hooks/useCustomerContacts";
import { useToast } from "@/lib/toast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { CONTACT_ROLES } from "../../_lib/constants";

export function ContactsTab({ customerId }: { customerId: string }) {
  const { contacts, isLoading, createContact, deleteContact } = useCustomerContacts(customerId);
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ContactItem | null>(null);
  const [form] = Form.useForm();

  const submit = async () => {
    const values = await form.validateFields();
    try {
      await createContact(values);
      toast.success("Contact added");
      form.resetFields();
      setAddOpen(false);
    } catch {
      toast.error("Failed to add contact");
    }
  };

  const columns: ColumnsType<ContactItem> = [
    {
      title: "Name",
      dataIndex: "name",
      render: (v: string, r) => (
        <span className="font-medium text-slate-700">
          {v} {r.isMain && <StarFilled className="text-amber-400 text-xs ml-1" />}
        </span>
      ),
    },
    { title: "Email", dataIndex: "email", render: (v: string) => v || <span className="text-slate-300">—</span> },
    { title: "Phone", dataIndex: "phone", render: (v: string) => v || <span className="text-slate-300">—</span> },
    { title: "Role", dataIndex: "role", width: 130 },
    {
      title: "",
      key: "actions",
      width: 50,
      render: (_: unknown, r) => (
        <Button
          type="text"
          size="small"
          danger
          icon={<DeleteOutlined />}
          onClick={() => setDeleteTarget(r)}
        />
      ),
    },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-slate-800">Contacts</span>
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
          Add Contact
        </Button>
      </div>

      <Table<ContactItem>
        size="small"
        rowKey="id"
        loading={isLoading}
        dataSource={contacts}
        columns={columns}
        pagination={false}
        locale={{ emptyText: "No contacts yet" }}
      />

      <Modal
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={submit}
        title="Add Contact"
        okText="Add"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" initialValues={{ role: "Operations", isMain: false }} className="pt-2">
          <Form.Item name="name" label="Name" rules={[{ required: true, message: "Name is required" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email">
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="Phone">
            <Input />
          </Form.Item>
          <Form.Item name="role" label="Role">
            <Select options={CONTACT_ROLES.map((r) => ({ value: r, label: r }))} />
          </Form.Item>
          <Form.Item name="isMain" valuePropName="checked">
            <Checkbox>Main contact</Checkbox>
          </Form.Item>
        </Form>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) await deleteContact(deleteTarget.id);
          setDeleteTarget(null);
          toast.success("Contact removed");
        }}
        title="Remove contact"
        description={`Remove ${deleteTarget?.name}?`}
        confirmLabel="Remove"
        danger
      />
    </div>
  );
}

"use client";

import { useState } from "react";
import { Table, Button, Modal, Form, Input, Select, Tag } from "antd";
import { PlusOutlined, EditOutlined, StopOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useToast } from "@/lib/toast";
import { ConfirmModal } from "@/components/ConfirmModal";
import type { ManagedUser, NewUserInput, UpdateUserInput } from "@/hooks/useUserAdmin";

const ROLE_COLOR: Record<string, string> = { superadmin: "magenta", admin: "geekblue", manager: "gold", user: "default" };

export function UsersManager({
  users,
  isLoading,
  allowedRoles,
  currentUserId,
  createUser,
  updateUser,
  deleteUser,
}: {
  users: ManagedUser[];
  isLoading: boolean;
  allowedRoles: string[]; // roles this actor may assign
  currentUserId: string;
  createUser: (input: NewUserInput) => Promise<unknown>;
  updateUser: (args: { id: string; input: UpdateUserInput }) => Promise<unknown>;
  deleteUser: (id: string) => Promise<unknown>;
}) {
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ManagedUser | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<ManagedUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [addForm] = Form.useForm();
  const [editForm] = Form.useForm();

  const roleOptions = allowedRoles.map((r) => ({ value: r, label: r }));

  const submitAdd = async () => {
    const v = await addForm.validateFields();
    setSaving(true);
    try {
      await createUser({ email: v.email, password: v.password, displayName: v.displayName ?? "", role: v.role });
      toast.success("User created");
      addForm.resetFields();
      setAddOpen(false);
    } catch {
      toast.error("Failed to create user (email may already be in use)");
    } finally {
      setSaving(false);
    }
  };

  const submitEdit = async () => {
    if (!editTarget) return;
    const v = await editForm.validateFields();
    setSaving(true);
    try {
      const input: UpdateUserInput = { displayName: v.displayName, role: v.role };
      if (v.password) input.password = v.password;
      await updateUser({ id: editTarget.id, input });
      toast.success("User updated");
      setEditTarget(null);
    } catch {
      toast.error("Failed to update user");
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<ManagedUser> = [
    { title: "Name", dataIndex: "displayName", render: (v: string) => v || <span className="text-slate-300">—</span> },
    { title: "Email", dataIndex: "email", render: (v: string) => <span className="font-mono text-xs">{v}</span> },
    { title: "Role", dataIndex: "role", width: 130, render: (v: string) => <Tag color={ROLE_COLOR[v] ?? "default"}>{v}</Tag> },
    {
      title: "",
      key: "actions",
      width: 110,
      render: (_: unknown, r) => (
        <div className="flex justify-end gap-1">
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setEditTarget(r);
              editForm.setFieldsValue({ displayName: r.displayName, role: r.role, password: "" });
            }}
          />
          <Button
            type="text"
            size="small"
            danger
            icon={<StopOutlined />}
            disabled={r.id === currentUserId}
            title={r.id === currentUserId ? "You can't deactivate yourself" : "Deactivate"}
            onClick={() => setDeactivateTarget(r)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-slate-800">Users ({users.length})</span>
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
          Add User
        </Button>
      </div>

      <Table<ManagedUser>
        size="small"
        rowKey="id"
        loading={isLoading}
        dataSource={users}
        columns={columns}
        pagination={false}
        locale={{ emptyText: "No users yet" }}
      />

      <Modal open={addOpen} onCancel={() => setAddOpen(false)} onOk={submitAdd} confirmLoading={saving} title="Add User" okText="Create" destroyOnHidden>
        <Form form={addForm} layout="vertical" initialValues={{ role: "user" }} className="pt-2">
          <Form.Item name="displayName" label="Name">
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: "email", message: "Valid email required" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true, min: 8, message: "At least 8 characters" }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="role" label="Role">
            <Select options={roleOptions} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal open={!!editTarget} onCancel={() => setEditTarget(null)} onOk={submitEdit} confirmLoading={saving} title={`Edit ${editTarget?.email ?? ""}`} okText="Save" destroyOnHidden>
        <Form form={editForm} layout="vertical" className="pt-2">
          <Form.Item name="displayName" label="Name">
            <Input />
          </Form.Item>
          <Form.Item name="role" label="Role">
            <Select options={roleOptions} disabled={editTarget?.id === currentUserId} />
          </Form.Item>
          <Form.Item name="password" label="New password (leave blank to keep)" rules={[{ min: 8, message: "At least 8 characters" }]}>
            <Input.Password placeholder="••••••••" />
          </Form.Item>
        </Form>
      </Modal>

      <ConfirmModal
        open={!!deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={async () => {
          if (deactivateTarget) await deleteUser(deactivateTarget.id);
          setDeactivateTarget(null);
          toast.success("User deactivated");
        }}
        title="Deactivate user"
        description={`Deactivate ${deactivateTarget?.email}? They will no longer be able to log in.`}
        confirmLabel="Deactivate"
        danger
      />
    </div>
  );
}
